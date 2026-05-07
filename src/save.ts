import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getPaths,
  timestampedCardName,
  uniqueCardPath,
  ensureDir,
  CURRENT_FILE,
  DEFAULT_TASK,
  isValidTaskName,
  normalizeTaskName,
  taskPointerPath,
  listActiveTasks,
} from "./paths.js";
import { HANDOVER_TEMPLATE } from "./templates.js";
import {
  readStdinSync,
  openInEditor,
  ok,
  err,
  hint,
  info,
  color,
  trimToFirstHeading,
} from "./utils.js";

interface SaveOptions {
  stdin?: boolean;
  file?: string;
  note?: string;
  noEditor?: boolean;
  message?: string;
  task?: string;
}

function fillTemplate(now: Date): string {
  const stamp = now.toISOString().replace("T", " ").slice(0, 16);
  return HANDOVER_TEMPLATE.replace("{{TIMESTAMP}}", stamp);
}

function noteOnlyCard(now: Date, note: string): string {
  const stamp = now.toISOString().replace("T", " ").slice(0, 16);
  return `# Handover · ${stamp}

## Goal

${note}

## Done ✅

<!-- (none recorded) -->

## In Progress 🚧

<!-- (none recorded) -->

## Next

<!-- (none recorded) -->
`;
}

export async function cmdSave(opts: SaveOptions = {}): Promise<number> {
  const paths = getPaths();
  const task = normalizeTaskName(opts.task);

  if (!isValidTaskName(task)) {
    err(`invalid task name: "${task}"`);
    hint("task names must match /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/");
    return 2;
  }

  if (!fs.existsSync(paths.batonDir)) {
    err(`no .baton/ found at ${paths.root}`);
    hint(`run ${color("cyan", "aibaton init")} first`);
    return 2;
  }

  const now = new Date();
  const cardName = timestampedCardName(now, task);
  const cardPath = uniqueCardPath(paths.batonDir, cardName);

  let content: string | null = null;

  if (opts.stdin) {
    const data = readStdinSync();
    if (!data.trim()) {
      err("no content received on stdin");
      return 2;
    }
    content = data;
  } else if (opts.file) {
    if (!fs.existsSync(opts.file)) {
      err(`file not found: ${opts.file}`);
      return 2;
    }
    content = fs.readFileSync(opts.file, "utf8");
  } else if (opts.message) {
    content = opts.message;
  } else if (opts.note) {
    content = noteOnlyCard(now, opts.note);
  } else {
    const tmp = path.join(
      os.tmpdir(),
      `aibaton-save-${process.pid}-${Date.now()}.md`
    );
    fs.writeFileSync(tmp, fillTemplate(now), "utf8");
    if (opts.noEditor) {
      info(`template prepared at ${tmp}`);
      hint(`edit and pipe back: cat ${tmp} | aibaton save --stdin`);
      return 0;
    }
    const okEdit = openInEditor(tmp);
    if (!okEdit) {
      err("editor exited with error; nothing saved");
      try {
        fs.unlinkSync(tmp);
      } catch {}
      return 2;
    }
    content = fs.readFileSync(tmp, "utf8");
    try {
      fs.unlinkSync(tmp);
    } catch {}
    if (!content.trim()) {
      err("empty handover; nothing saved");
      return 2;
    }
    if (content === fillTemplate(now)) {
      err("template unchanged; nothing saved");
      hint("fill in at least the Goal and Next sections");
      return 2;
    }
  }

  if (!content) {
    err("no content to save");
    return 2;
  }

  ensureDir(paths.batonDir);
  ensureDir(paths.currentDir);
  fs.writeFileSync(cardPath, content, "utf8");

  // Per-task pointer (always written)
  const taskPtr = taskPointerPath(paths.batonDir, task);
  fs.writeFileSync(taskPtr, content, "utf8");

  // Global CURRENT.md mirror (back-compat: latest save across any task)
  const currentPath = path.join(paths.batonDir, CURRENT_FILE);
  try {
    if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath);
  } catch {}
  fs.writeFileSync(currentPath, content, "utf8");

  const taskTag = task === DEFAULT_TASK ? "" : ` ${color("magenta", `[${task}]`)}`;
  ok(
    `saved handover${taskTag} → ${color(
      "bold",
      path.relative(process.cwd(), cardPath)
    )}`
  );
  const goal = trimToFirstHeading(content);
  if (goal) hint(goal);

  // Surface other active tasks so users notice parallel work
  const others = listActiveTasks(paths.batonDir).filter((t) => t.task !== task);
  if (others.length > 0) {
    console.log();
    info(
      `${others.length} other active task${others.length === 1 ? "" : "s"}: ${others
        .map((t) => color("magenta", t.task))
        .join(", ")}`
    );
    hint(`switch with: ${color("cyan", "aibaton resume --task <name>")}`);
  }

  console.log();
  hint(`next session: ${color("cyan", "aibaton resume" + (task === DEFAULT_TASK ? "" : ` --task ${task}`))}`);
  return 0;
}
