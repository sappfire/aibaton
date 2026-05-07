# Changelog

All notable changes to `aibaton` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-07

Per-task isolation + done command. The single hard design fix from v0.1's pre-launch review: when you have two AI sessions open in the same repo on different problems, they no longer silently overwrite each other's handover state.

### Added

- `--task <name>` flag for `save` and `resume`. Each named task gets its own active pointer at `.baton/current/<task>.md`. Default task name is `default`, so unflagged usage is identical to v0.1.
- `aibaton done [--task <name>]` — archive a finished task. Moves `.baton/current/<task>.md` into `.baton/done/<task>-<timestamp>.md`. If `CURRENT.md` mirrored that task, repoints it to the most recent remaining task (or removes it).
- `aibaton list --tasks` — list active tasks with their goals.
- `aibaton resume --list-tasks` — alias of the above.
- Multi-task notice appended to `resume` output whenever more than one task is active. Designed so a parallel-session user can never silently pick up the wrong handover.
- Timestamped cards saved with a non-default task get a `.<task>` infix in the filename (e.g. `2026-05-07-110530.billing-refactor.md`); `list` shows the task badge.
- Task-name validation: `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` (no path traversal, no spaces).

### Changed

- `AGENT.md` and the Cursor rule now instruct the AI to check `aibaton list --tasks` and confirm with the user when multiple active tasks are detected, before saving or resuming.
- `list --json` includes a `task` field for each historical card.
- `.baton/README.md` (written by `init`) updated with the new layout and commands.

### Back-compat

- All v0.1 commands and flags work unchanged.
- `.baton/CURRENT.md` is still written on every `save` (mirrors the most-recently-saved card across any task), so existing AI rules and `cat .baton/CURRENT.md` workflows keep working.

## [0.1.0] — 2026-05-06

Initial release.

### Added

- `aibaton init [--force] [--tool <name>]` — set up `.baton/` folder with template, agent instructions, and quick README.
- `aibaton save [--stdin] [--file <path>] [--note "<oneline>"] [--no-editor]` — save a handover card to `.baton/<timestamp>.md` and update `.baton/CURRENT.md`.
- `aibaton resume [--copy] [--raw] [--index <n>] [--print-path]` — print the latest (or N-th most recent) handover card, with a short prefix that prompts the next AI session to acknowledge and continue.
- `aibaton list [--json] [--limit <n>]` — list recent handover cards.
- `--help` / `--version` flags.
- Built-in tool-specific setup hints: `claude-code` (default), `cursor`, `codex`, `aider`, `generic`.
- Smoke test script at `test/smoke.sh`.
- Demo replay script at `docs/demo.sh` and vhs tape at `docs/demo.tape`.

### Design notes

- Zero LLM calls: the user's existing AI tool generates the card content; aibaton only writes/reads markdown.
- Zero network: pure local file ops. Card lives in the repo's `.baton/` and travels via git.
- Zero database, no daemon. The whole CLI is ~500 lines of TypeScript.
