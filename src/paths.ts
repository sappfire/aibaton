import path from "node:path";
import fs from "node:fs";

export const BATON_DIR_NAME = ".baton";
export const TEMPLATE_FILE = "HANDOVER_TEMPLATE.md";
export const AGENT_FILE = "AGENT.md";
export const CURRENT_FILE = "CURRENT.md";
export const README_FILE = "README.md";
export const CURRENT_DIR_NAME = "current";
export const DONE_DIR_NAME = "done";
export const DEFAULT_TASK = "default";

export interface BatonPaths {
  root: string;
  batonDir: string;
  template: string;
  agent: string;
  current: string;
  readme: string;
  currentDir: string;
  doneDir: string;
}

export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    if (fs.existsSync(path.join(dir, BATON_DIR_NAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function getPaths(start: string = process.cwd()): BatonPaths {
  const root = findRepoRoot(start);
  const batonDir = path.join(root, BATON_DIR_NAME);
  return {
    root,
    batonDir,
    template: path.join(batonDir, TEMPLATE_FILE),
    agent: path.join(batonDir, AGENT_FILE),
    current: path.join(batonDir, CURRENT_FILE),
    readme: path.join(batonDir, README_FILE),
    currentDir: path.join(batonDir, CURRENT_DIR_NAME),
    doneDir: path.join(batonDir, DONE_DIR_NAME),
  };
}

const VALID_TASK_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isValidTaskName(name: string): boolean {
  return VALID_TASK_RE.test(name);
}

export function normalizeTaskName(name: string | undefined | null): string {
  if (!name) return DEFAULT_TASK;
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_TASK;
  return trimmed;
}

export function taskPointerPath(batonDir: string, task: string): string {
  return path.join(batonDir, CURRENT_DIR_NAME, `${task}.md`);
}

export function timestampedCardName(
  d: Date = new Date(),
  task?: string
): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const stamp = `${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`;
  if (task && task !== DEFAULT_TASK) {
    return `${stamp}.${task}.md`;
  }
  return `${stamp}.md`;
}

export function uniqueCardPath(batonDir: string, base: string): string {
  let candidate = path.join(batonDir, base);
  if (!fs.existsSync(candidate)) return candidate;
  const stem = base.replace(/\.md$/, "");
  for (let i = 2; i < 100; i++) {
    candidate = path.join(batonDir, `${stem}-${i}.md`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(batonDir, `${stem}-${Date.now()}.md`);
}

const CARD_FILE_RE =
  /^\d{4}-\d{2}-\d{2}-\d{4,6}(\.[a-zA-Z0-9._-]+)?(-\d+)?\.md$/;

export function listCards(batonDir: string): string[] {
  if (!fs.existsSync(batonDir)) return [];
  return fs
    .readdirSync(batonDir)
    .filter((f) => CARD_FILE_RE.test(f))
    .sort()
    .reverse();
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Parse the task name embedded in a card file name (returns DEFAULT_TASK if absent). */
export function parseTaskFromCardName(file: string): string {
  // Format: YYYY-MM-DD-HHMMSS[.<task>][-<dedup>].md
  const m = file.match(
    /^\d{4}-\d{2}-\d{2}-\d{4,6}(?:\.([a-zA-Z0-9._-]+?))?(?:-\d+)?\.md$/
  );
  if (m && m[1]) return m[1];
  return DEFAULT_TASK;
}

export interface ActiveTask {
  task: string;
  pointerPath: string;
  mtime: Date;
}

/** Scan .baton/current/*.md and return the active tasks, newest first. */
export function listActiveTasks(batonDir: string): ActiveTask[] {
  const dir = path.join(batonDir, CURRENT_DIR_NAME);
  if (!fs.existsSync(dir)) return [];
  const out: ActiveTask[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const task = f.replace(/\.md$/, "");
    if (!isValidTaskName(task)) continue;
    const full = path.join(dir, f);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    out.push({ task, pointerPath: full, mtime: stat.mtime });
  }
  out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return out;
}
