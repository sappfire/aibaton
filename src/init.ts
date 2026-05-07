import fs from "node:fs";
import path from "node:path";
import {
  AGENT_FILE,
  TEMPLATE_FILE,
  README_FILE,
  getPaths,
  ensureDir,
} from "./paths.js";
import {
  HANDOVER_TEMPLATE,
  AGENT_INSTRUCTIONS,
  QUICK_README,
  SETUP_HINTS_BY_TOOL,
  CURSOR_RULE_MDC,
} from "./templates.js";
import { ok, info, warn, hint, color } from "./utils.js";

interface InitOptions {
  force?: boolean;
  tool?: keyof typeof SETUP_HINTS_BY_TOOL | string;
  silent?: boolean;
}

export async function cmdInit(opts: InitOptions = {}): Promise<number> {
  const paths = getPaths();
  const existed = fs.existsSync(paths.batonDir);

  ensureDir(paths.batonDir);

  const filesToWrite: Array<[string, string]> = [
    [paths.template, HANDOVER_TEMPLATE],
    [paths.agent, AGENT_INSTRUCTIONS],
    [paths.readme, QUICK_README],
  ];

  let written = 0;
  let skipped = 0;
  for (const [file, content] of filesToWrite) {
    if (fs.existsSync(file) && !opts.force) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, content, "utf8");
    written++;
  }

  let cursorRuleWrote: string | null = null;
  if (opts.tool === "cursor") {
    const rulesDir = path.join(paths.root, ".cursor", "rules");
    const rulePath = path.join(rulesDir, "aibaton.mdc");
    if (!fs.existsSync(rulePath) || opts.force) {
      ensureDir(rulesDir);
      fs.writeFileSync(rulePath, CURSOR_RULE_MDC, "utf8");
      cursorRuleWrote = path.relative(paths.root, rulePath);
    }
  }

  if (!opts.silent) {
    if (existed && skipped > 0 && !opts.force) {
      info(
        `${color("bold", ".baton/")} already exists in ${color(
          "dim",
          paths.root
        )}`
      );
      hint(`use ${color("cyan", "aibaton init --force")} to overwrite templates`);
    } else {
      ok(`initialized ${color("bold", ".baton/")} in ${color("dim", paths.root)}`);
    }

    console.log();
    console.log(`  ${color("dim", "wrote")}  ${path.basename(paths.template)}`);
    console.log(`  ${color("dim", "wrote")}  ${path.basename(paths.agent)}`);
    console.log(`  ${color("dim", "wrote")}  ${path.basename(paths.readme)}`);
    if (cursorRuleWrote) {
      console.log(`  ${color("dim", "wrote")}  ${cursorRuleWrote}`);
    }
    console.log();

    const tool = (opts.tool ?? "claude-code") as keyof typeof SETUP_HINTS_BY_TOOL;
    const setup = SETUP_HINTS_BY_TOOL[tool] ?? SETUP_HINTS_BY_TOOL.generic;
    console.log(color("bold", "Next steps:"));
    console.log(setup);
    console.log(color("bold", "Then:"));
    console.log(`  ${color("cyan", "aibaton save")}     # save handover at session end`);
    console.log(`  ${color("cyan", "aibaton resume")}   # print latest at session start`);
    console.log();
  }

  return 0;
}
