import fs from "node:fs";
import { spawnSync } from "node:child_process";

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

export function readStdinSync(): string {
  try {
    if (process.stdin.isTTY) return "";
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function writeFileSafe(file: string, content: string): void {
  fs.writeFileSync(file, content, { encoding: "utf8" });
}

/** Open $EDITOR (or fallback) on a file and wait for the user to close. */
export function openInEditor(file: string): boolean {
  const editor =
    process.env.AIBATON_EDITOR ||
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "nano");
  const r = spawnSync(editor, [file], { stdio: "inherit", shell: false });
  return r.status === 0;
}

/** Try common system clipboards. Returns true on success. */
export function copyToClipboard(text: string): boolean {
  const candidates: Array<[string, string[]]> = [];
  if (process.platform === "darwin") {
    candidates.push(["pbcopy", []]);
  } else if (process.platform === "win32") {
    candidates.push(["clip", []]);
  } else {
    candidates.push(["wl-copy", []]);
    candidates.push(["xclip", ["-selection", "clipboard"]]);
    candidates.push(["xsel", ["--clipboard", "--input"]]);
  }
  for (const [bin, args] of candidates) {
    const r = spawnSync(bin, args, { input: text, encoding: "utf8" });
    if (r.status === 0) return true;
  }
  return false;
}

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

export function color(name: keyof typeof C, s: string): string {
  if (!useColor) return s;
  return C[name] + s + C.reset;
}

export function ok(msg: string): void {
  console.log(`${color("green", "✓")} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${color("cyan", "›")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${color("yellow", "!")} ${msg}`);
}

export function err(msg: string): void {
  console.error(`${color("red", "✗")} ${msg}`);
}

export function hint(msg: string): void {
  console.log(color("dim", `  ${msg}`));
}

export function logo(): string {
  if (!useColor) return "aibaton";
  return color("magenta", "aibaton") + color("dim", " 🪄");
}

export function trimToFirstHeading(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

export function firstNonEmptyLineUnder(
  md: string,
  heading: RegExp
): string | null {
  const lines = md.split(/\r?\n/);
  let inSection = false;
  for (const ln of lines) {
    if (/^#{1,6}\s+/.test(ln)) {
      inSection = heading.test(ln);
      continue;
    }
    if (!inSection) continue;
    const trimmed = ln.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<!--")) continue;
    return trimmed;
  }
  return null;
}
