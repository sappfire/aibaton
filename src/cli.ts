#!/usr/bin/env node
import { cmdInit } from "./init.js";
import { cmdSave } from "./save.js";
import { cmdResume } from "./resume.js";
import { cmdList } from "./list.js";
import { cmdDone } from "./done.js";
import { color, err, logo } from "./utils.js";

const VERSION = "0.2.0";

const HELP = `${logo()}  ${color("dim", "v" + VERSION)}
${color("dim", "Pass the baton between your AI coding sessions.")}

${color("bold", "USAGE")}
  aibaton <command> [options]

${color("bold", "COMMANDS")}
  init [--force] [--tool <name>]
      Set up the .baton/ folder in your repo. Writes HANDOVER_TEMPLATE.md,
      AGENT.md (instructions for AI tools), and a small README.

      --tool      claude-code | cursor | codex | aider | generic  (default: claude-code)
      --force     overwrite existing template files

  save [--task <name>] [--stdin] [--file <path>] [--note "<oneline>"] [--no-editor]
      Save a handover card. Writes a timestamped card, updates the per-task
      pointer (.baton/current/<task>.md), and refreshes the global CURRENT.md.

      --task      isolate by task name (default: "default"); use this when
                  you have multiple parallel AI sessions in the same repo
      --stdin     read markdown body from stdin
      --file      read markdown body from a file
      --note      quick one-line goal-only card
      --no-editor prepare a template file at \$TMPDIR but don't open editor

      With no flags, opens \$EDITOR on the template.

  resume [--task <name>] [--list-tasks] [--copy] [--raw] [--index <n>] [--print-path]
      Print the latest handover to stdout (with a "resume from previous session"
      prefix). If multiple tasks are active, a notice is appended.

      --task        read .baton/current/<name>.md instead of CURRENT.md
      --list-tasks  list active tasks (alias of \`aibaton list --tasks\`)
      --copy        copy to clipboard instead of stdout
      --raw         omit the resume prefix
      --index <n>   show the nth-most-recent (0 = latest, 1 = second, ...)
      --print-path  print just the file path

  done [--task <name>]
      Archive a finished task. Moves .baton/current/<task>.md to
      .baton/done/<task>-<timestamp>.md and (if CURRENT.md mirrors that
      task) repoints CURRENT.md to the most recent remaining task or
      removes it.

      --task      task to archive (default: "default")

  list [--tasks] [--json] [--limit <n>]
      List recent handover cards in this repo.

      --tasks     list active tasks instead of historical cards

  help, --help, -h
      Show this help.

  version, --version, -v
      Show version.

${color("bold", "EXAMPLES")}
  ${color("dim", "# In your repo, once:")}
  aibaton init
  cat .baton/AGENT.md >> CLAUDE.md

  ${color("dim", "# Single-task (default) workflow:")}
  echo "<handover markdown>" | aibaton save --stdin
  aibaton resume

  ${color("dim", "# Parallel tasks:")}
  echo "<billing handover>" | aibaton save --stdin --task billing-refactor
  echo "<api handover>"     | aibaton save --stdin --task api-rewrite
  aibaton list --tasks
  aibaton resume --task billing-refactor

  ${color("dim", "# When a task is finished:")}
  aibaton done --task billing-refactor

${color("bold", "DOCS")}
  https://github.com/sappfire/aibaton
`;

interface ParsedArgs {
  cmd: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  let cmd = "help";
  let rest: string[] = [];
  if (argv.length === 0) {
    cmd = "help";
  } else if (argv[0]!.startsWith("-")) {
    rest = argv;
  } else {
    cmd = argv[0]!;
    rest = argv.slice(1);
  }
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--") && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--") && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, flags, positional };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { cmd, flags } = parseArgs(argv);

  if (flags.v || flags.version || cmd === "version") {
    console.log(VERSION);
    process.exit(0);
  }
  if (flags.h || flags.help || cmd === "help" || cmd === undefined) {
    console.log(HELP);
    process.exit(0);
  }

  const taskFlag = typeof flags.task === "string" ? flags.task : undefined;

  let code = 0;
  try {
    switch (cmd) {
      case "init": {
        code = await cmdInit({
          force: !!flags.force,
          tool: typeof flags.tool === "string" ? flags.tool : undefined,
        });
        break;
      }
      case "save": {
        code = await cmdSave({
          stdin: !!flags.stdin,
          file: typeof flags.file === "string" ? flags.file : undefined,
          note: typeof flags.note === "string" ? flags.note : undefined,
          message: typeof flags.message === "string" ? flags.message : undefined,
          noEditor: !!flags["no-editor"],
          task: taskFlag,
        });
        break;
      }
      case "resume": {
        const idx =
          typeof flags.index === "string" ? parseInt(flags.index, 10) : undefined;
        code = await cmdResume({
          copy: !!flags.copy,
          raw: !!flags.raw,
          index: Number.isFinite(idx) ? idx : undefined,
          printPath: !!flags["print-path"],
          task: taskFlag,
          listTasks: !!flags["list-tasks"],
        });
        break;
      }
      case "done": {
        code = await cmdDone({ task: taskFlag });
        break;
      }
      case "list": {
        const limit =
          typeof flags.limit === "string" ? parseInt(flags.limit, 10) : undefined;
        code = await cmdList({
          json: !!flags.json,
          limit: Number.isFinite(limit) ? limit : undefined,
          tasks: !!flags.tasks,
        });
        break;
      }
      default: {
        err(`unknown command: ${cmd}`);
        console.log(`run ${color("cyan", "aibaton --help")} for usage`);
        code = 2;
      }
    }
  } catch (e: any) {
    err(`unexpected error: ${e?.message || e}`);
    if (process.env.AIBATON_DEBUG) {
      console.error(e?.stack || e);
    }
    code = 1;
  }
  process.exit(code);
}

main();
