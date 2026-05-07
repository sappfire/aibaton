import fs from "node:fs";
import path from "node:path";
import {
  getPaths,
  listCards,
  CURRENT_FILE,
  DEFAULT_TASK,
  isValidTaskName,
  normalizeTaskName,
  taskPointerPath,
  listActiveTasks,
} from "./paths.js";
import {
  copyToClipboard,
  err,
  hint,
  info,
  ok,
  color,
} from "./utils.js";

interface ResumeOptions {
  copy?: boolean;
  withPrefix?: boolean;
  index?: number;
  raw?: boolean;
  printPath?: boolean;
  task?: string;
  listTasks?: boolean;
}

const RESUME_PREFIX = `> Resuming from a previous AI coding session.
> The handover card below is the structured state from the last session.
> Read it, acknowledge briefly ("Resuming from <Goal>. Last left off at <first item under Next>."),
> then continue.

`;

interface PickedCard {
  file: string;
  content: string;
  taskHint?: string | null;
}

function pickCard(opts: ResumeOptions): PickedCard | null {
  const paths = getPaths();
  if (!fs.existsSync(paths.batonDir)) return null;

  // Explicit --task → read per-task pointer
  if (opts.task) {
    const task = normalizeTaskName(opts.task);
    if (!isValidTaskName(task)) return null;
    const ptr = taskPointerPath(paths.batonDir, task);
    if (fs.existsSync(ptr)) {
      return {
        file: ptr,
        content: fs.readFileSync(ptr, "utf8"),
        taskHint: task,
      };
    }
    return null;
  }

  // Default behavior (back-compat): CURRENT.md
  if (opts.index === undefined || opts.index === 0) {
    if (fs.existsSync(paths.current)) {
      return {
        file: paths.current,
        content: fs.readFileSync(paths.current, "utf8"),
        taskHint: null,
      };
    }
  }

  const cards = listCards(paths.batonDir);
  if (cards.length === 0) return null;
  const idx = Math.max(0, opts.index ?? 0);
  if (idx >= cards.length) return null;
  const file = path.join(paths.batonDir, cards[idx]!);
  const content = fs.readFileSync(file, "utf8");
  return { file, content, taskHint: null };
}

function buildMultiTaskNotice(
  paths: ReturnType<typeof getPaths>,
  currentTask: string | null
): string {
  const active = listActiveTasks(paths.batonDir);
  if (active.length === 0) return "";

  // If currentTask is unknown (default resume), assume CURRENT.md mirrors the
  // most-recently-modified active task — exclude it from "others".
  const baseTask = currentTask ?? active[0]!.task;
  const others = active.filter((t) => t.task !== baseTask);
  if (others.length === 0) return "";
  const names = others.map((t) => `\`${t.task}\``).join(", ");
  const list = others.length === 1 ? "1 other task" : `${others.length} other tasks`;
  return `\n---\n\n> Note: ${list} active: ${names}.\n> Use \`aibaton resume --task <name>\` to switch, or \`aibaton list --tasks\` to inspect.\n`;
}

function printActiveTasks(): number {
  const paths = getPaths();
  const active = listActiveTasks(paths.batonDir);
  if (active.length === 0) {
    console.log(color("dim", "  (no active tasks)"));
    hint(`save one with ${color("cyan", "aibaton save --task <name>")}`);
    return 0;
  }
  console.log();
  for (const t of active) {
    let goal = "";
    try {
      const c = fs.readFileSync(t.pointerPath, "utf8");
      const goalMatch = c.match(/##\s+Goal\s*\n+([^\n#<][^\n]*)/);
      if (goalMatch) goal = goalMatch[1]!.trim();
      else {
        const head = c.match(/^#\s+(.+)$/m);
        if (head) goal = head[1]!.trim();
      }
    } catch {}
    const stamp = t.mtime.toISOString().replace("T", " ").slice(0, 16);
    console.log(`  ${color("magenta", t.task.padEnd(20))}  ${color("dim", stamp)}`);
    if (goal) console.log(`    ${color("dim", "→")} ${goal}`);
  }
  console.log();
  return 0;
}

export async function cmdResume(opts: ResumeOptions = {}): Promise<number> {
  if (opts.listTasks) {
    return printActiveTasks();
  }

  const paths = getPaths();
  const picked = pickCard(opts);
  if (!picked) {
    if (opts.task) {
      err(`no handover for task: ${opts.task}`);
      hint(`run ${color("cyan", "aibaton list --tasks")} to see active tasks`);
      hint(
        `or save one: ${color(
          "cyan",
          `aibaton save --task ${opts.task}`
        )}`
      );
      return 2;
    }
    err("no handover cards found");
    hint(
      `run ${color("cyan", "aibaton init")} then save one with ${color(
        "cyan",
        "aibaton save"
      )}`
    );
    return 2;
  }

  if (opts.printPath) {
    console.log(picked.file);
    return 0;
  }

  // For multi-task notice: if explicit --task, the "current" task is that one;
  // otherwise we don't know (could be any). Use null in that case so the
  // notice lists everything (so user is reminded that other tasks exist).
  const noticeBaseTask = opts.task ? normalizeTaskName(opts.task) : null;
  const notice = buildMultiTaskNotice(paths, noticeBaseTask);

  const body = opts.raw ? picked.content : RESUME_PREFIX + picked.content;
  const out = body + notice;

  if (opts.copy) {
    const copied = copyToClipboard(out);
    if (copied) {
      ok(
        `copied handover to clipboard (${path.basename(picked.file)})`
      );
      hint("paste it as the first message of your next AI session");
      return 0;
    }
    err("clipboard copy failed; printing to stdout instead");
  }

  process.stdout.write(out);
  if (!out.endsWith("\n")) process.stdout.write("\n");
  return 0;
}
