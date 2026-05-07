import fs from "node:fs";
import path from "node:path";
import {
  getPaths,
  listCards,
  listActiveTasks,
  parseTaskFromCardName,
  DEFAULT_TASK,
} from "./paths.js";
import { trimToFirstHeading, color, hint, err } from "./utils.js";

interface ListOptions {
  json?: boolean;
  limit?: number;
  tasks?: boolean;
}

interface CardSummary {
  file: string;
  path: string;
  size: number;
  mtime: string;
  goal: string;
  task: string;
}

function summarize(file: string, batonDir: string): CardSummary {
  const fullPath = path.join(batonDir, file);
  const st = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, "utf8");
  const heading = trimToFirstHeading(content);
  const goalMatch = content.match(/##\s+Goal\s*\n+([^\n#<][^\n]*)/);
  const goal = goalMatch
    ? goalMatch[1]!.trim()
    : (heading || "(no goal)");
  return {
    file,
    path: fullPath,
    size: st.size,
    mtime: st.mtime.toISOString(),
    goal,
    task: parseTaskFromCardName(file),
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}K`;
}

function fmtDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function listTasks(jsonOut: boolean): number {
  const paths = getPaths();
  if (!fs.existsSync(paths.batonDir)) {
    err(`no .baton/ found at ${paths.root}`);
    hint(`run ${color("cyan", "aibaton init")} first`);
    return 2;
  }
  const active = listActiveTasks(paths.batonDir);
  if (jsonOut) {
    const items = active.map((t) => {
      let goal = "";
      try {
        const c = fs.readFileSync(t.pointerPath, "utf8");
        const m = c.match(/##\s+Goal\s*\n+([^\n#<][^\n]*)/);
        if (m) goal = m[1]!.trim();
      } catch {}
      return {
        task: t.task,
        path: t.pointerPath,
        mtime: t.mtime.toISOString(),
        goal,
      };
    });
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return 0;
  }

  if (active.length === 0) {
    console.log(color("dim", "  (no active tasks)"));
    hint(`save one: ${color("cyan", "aibaton save --task <name>")}`);
    return 0;
  }
  console.log();
  for (const t of active) {
    let goal = "";
    try {
      const c = fs.readFileSync(t.pointerPath, "utf8");
      const m = c.match(/##\s+Goal\s*\n+([^\n#<][^\n]*)/);
      if (m) goal = m[1]!.trim();
    } catch {}
    const stamp = t.mtime.toISOString().replace("T", " ").slice(0, 16);
    console.log(
      `  ${color("magenta", t.task.padEnd(20))}  ${color("dim", stamp)}`
    );
    if (goal) console.log(`    ${color("dim", "→")} ${goal}`);
  }
  console.log();
  hint(`resume one: ${color("cyan", "aibaton resume --task <name>")}`);
  hint(`archive one: ${color("cyan", "aibaton done --task <name>")}`);
  return 0;
}

export async function cmdList(opts: ListOptions = {}): Promise<number> {
  if (opts.tasks) {
    return listTasks(!!opts.json);
  }

  const paths = getPaths();
  if (!fs.existsSync(paths.batonDir)) {
    err(`no .baton/ found at ${paths.root}`);
    hint(`run ${color("cyan", "aibaton init")} first`);
    return 2;
  }

  const all = listCards(paths.batonDir);
  const limit = opts.limit ?? 20;
  const cards = all.slice(0, limit);

  if (cards.length === 0) {
    console.log(color("dim", "  (no handovers yet)"));
    hint(`save one: ${color("cyan", "aibaton save")}`);
    return 0;
  }

  if (opts.json) {
    const items = cards.map((c) => summarize(c, paths.batonDir));
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return 0;
  }

  console.log();
  for (const c of cards) {
    const s = summarize(c, paths.batonDir);
    const stamp = c.replace(/\.md$/, "");
    const taskBadge =
      s.task !== DEFAULT_TASK ? `  ${color("magenta", `[${s.task}]`)}` : "";
    console.log(
      `  ${color("bold", stamp)}  ${color("dim", fmtSize(s.size).padStart(5))}${taskBadge}`
    );
    if (s.goal) {
      console.log(`    ${color("dim", "→")} ${s.goal}`);
    }
  }
  console.log();
  if (all.length > cards.length) {
    console.log(color("dim", `  ... ${all.length - cards.length} older not shown`));
  }
  return 0;
}
