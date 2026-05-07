import fs from "node:fs";
import path from "node:path";
import {
  getPaths,
  ensureDir,
  CURRENT_FILE,
  DEFAULT_TASK,
  isValidTaskName,
  normalizeTaskName,
  taskPointerPath,
  listActiveTasks,
} from "./paths.js";
import { color, err, hint, info, ok } from "./utils.js";

interface DoneOptions {
  task?: string;
  keepCurrent?: boolean;
}

function archiveStamp(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`;
}

export async function cmdDone(opts: DoneOptions = {}): Promise<number> {
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

  const ptr = taskPointerPath(paths.batonDir, task);
  if (!fs.existsSync(ptr)) {
    err(`no active task named "${task}"`);
    const active = listActiveTasks(paths.batonDir);
    if (active.length > 0) {
      hint(
        `active tasks: ${active.map((t) => color("magenta", t.task)).join(", ")}`
      );
    } else {
      hint(`no active tasks at all (run ${color("cyan", "aibaton list --tasks")})`);
    }
    return 2;
  }

  ensureDir(paths.doneDir);
  const stamp = archiveStamp();
  const archivePath = path.join(paths.doneDir, `${task}-${stamp}.md`);

  const content = fs.readFileSync(ptr, "utf8");
  fs.writeFileSync(archivePath, content, "utf8");

  // Remove the active pointer for this task
  try {
    fs.unlinkSync(ptr);
  } catch {}

  // If global CURRENT.md mirrors this task's content, clear it (or repoint).
  const currentPath = path.join(paths.batonDir, CURRENT_FILE);
  if (!opts.keepCurrent && fs.existsSync(currentPath)) {
    let mirrors = false;
    try {
      mirrors = fs.readFileSync(currentPath, "utf8") === content;
    } catch {}
    if (mirrors) {
      const remaining = listActiveTasks(paths.batonDir);
      if (remaining.length === 0) {
        try {
          fs.unlinkSync(currentPath);
        } catch {}
      } else {
        // Repoint CURRENT.md to the most recently saved remaining task.
        const next = remaining[0]!;
        const nextContent = fs.readFileSync(next.pointerPath, "utf8");
        fs.writeFileSync(currentPath, nextContent, "utf8");
        info(
          `CURRENT.md repointed to most recent active task: ${color(
            "magenta",
            next.task
          )}`
        );
      }
    }
  }

  ok(
    `archived task ${color("magenta", task)} → ${color(
      "bold",
      path.relative(process.cwd(), archivePath)
    )}`
  );

  const remaining = listActiveTasks(paths.batonDir);
  if (remaining.length > 0) {
    console.log();
    info(
      `${remaining.length} task${remaining.length === 1 ? "" : "s"} still active: ${remaining
        .map((t) => color("magenta", t.task))
        .join(", ")}`
    );
  } else {
    console.log();
    hint("no active tasks remain. all clear!");
  }
  return 0;
}
