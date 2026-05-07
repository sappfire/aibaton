<div align="center">

# `aibaton`

**Hand off context between your AI coding sessions, in one command.**

[![npm version](https://img.shields.io/npm/v/aibaton.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/aibaton)
[![npm downloads](https://img.shields.io/npm/dm/aibaton.svg?color=cb3837)](https://www.npmjs.com/package/aibaton)
[![GitHub stars](https://img.shields.io/github/stars/sappfire/aibaton?style=flat&color=yellow)](https://github.com/sappfire/aibaton/stargazers)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#requirements)
[![zero deps](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

English · [中文](./README.zh-CN.md)

</div>

---

A tiny CLI for the moments when an AI coding session ends mid-task — the laptop closes, the context window fills, you switch tools — and the next session has to pick up where this one left off.

`aibaton` writes a structured handover card (`.baton/<timestamp>.md`) at the end of one session and prints it back at the start of the next. Per-task isolation so two parallel sessions don't overwrite each other. No cloud, no daemon, no LLM call — your existing AI tool fills in the card.

```sh
npx aibaton init      # set up .baton/ in your repo
aibaton save          # save a handover card at session end
aibaton resume        # print it at the start of the next one
```

Works with any AI tool that reads markdown — Claude Code, Cursor, Codex, Aider, Cline, opencode, Continue, etc.

---

## When this is useful

- You ended a 2-hour Cursor / Claude Code session mid-refactor and want tomorrow's session to resume without re-explaining the last 50 commits.
- Your context window was about to compact and you'd rather pin the state yourself than let a lossy auto-summary do it.
- You routinely have **two AI sessions open in the same repo on different problems** — `--task billing-refactor` keeps them from clobbering each other's state.
- You hand off work between machines (laptop ↔ desktop), collaborators, or branches and want the in-flight reasoning to travel with the code.

## When this isn't useful

Be honest with yourself before you install:

- **You only ever run one short AI session at a time.** Built-in `/compact` and per-tool memory are fine for that.
- **You want full automation.** `aibaton` is explicit by design — you (or your AI on your command) decide when to write the card. If you want hooks-based auto-saving, [`claude-mem`](https://github.com/thedotmack/claude-mem) is excellent.
- **You don't commit `.baton/` to git.** The whole point is that handovers travel with the repo. If your workflow can't allow that, this tool isn't for you.

## Install

```sh
npm install -g aibaton
# or run on demand
npx aibaton <command>
```

Requires Node ≥ 18.

## Quick start

```sh
# 1. In any repo, once:
aibaton init
cat .baton/AGENT.md >> CLAUDE.md      # or .cursor/rules/, AGENTS.md, etc.

# 2. End of an AI coding session, ask your AI:
#    "Save a handover. Use the .baton/HANDOVER_TEMPLATE.md format
#     and pipe it into `aibaton save --stdin`."

# 3. Start of the next session:
aibaton resume                         # AI reads it and picks up where you left off
```

That's it.

### Parallel tasks

When you have two AI sessions in the same repo on different problems, name each task so they stay isolated:

```sh
# Session A
echo "<billing handover>" | aibaton save --stdin --task billing-refactor

# Session B (different terminal, different problem, same repo)
echo "<api handover>" | aibaton save --stdin --task api-rewrite

# Inspect
aibaton list --tasks
#   billing-refactor   2026-05-07 11:05
#     → Refactor BillingService to PricingV2
#   api-rewrite        2026-05-07 11:08
#     → Rewrite REST layer to gRPC

# Resume the right one
aibaton resume --task billing-refactor

# When a task is finished, archive it so future `resume` calls don't
# keep pulling stale state:
aibaton done --task billing-refactor
```

If you only ever do one task at a time, you can ignore `--task` entirely — everything defaults to `default` and behaves like v0.1.

## How it works

`aibaton` is intentionally tiny. The whole CLI does five things:

1. **`init`** — drops `HANDOVER_TEMPLATE.md`, `AGENT.md`, and a small `README.md` into `.baton/`.
2. **`save [--task <name>]`** — writes a timestamped card (e.g. `.baton/2026-05-06-202705.md`), updates the per-task pointer at `.baton/current/<task>.md`, and refreshes `.baton/CURRENT.md` (the global "most recent across any task" mirror, kept for back-compat).
3. **`resume [--task <name>]`** — prints `.baton/CURRENT.md` (or `.baton/current/<task>.md`) to stdout with a "resume from previous session" prefix. If multiple tasks are active, appends a one-line notice so you don't silently pick up the wrong one.
4. **`done [--task <name>]`** — archives a finished task into `.baton/done/`.
5. **`list [--tasks]`** — lists historical cards or active tasks.

There's no LLM call, no daemon, no database, no network. The compression and writing of the card is done by **your existing AI tool** — `aibaton` just gives it a protocol and a place.

## The handover card format

```markdown
# Handover · 2026-05-06 23:42

## Goal
Refactor BillingService to use PricingV2 engine

## Done ✅
- Migrated BillingService → PricingV2 (commit a3f2b1)
- Added unit tests for tier calc (commit 9c8e44)

## In Progress 🚧
- Webhook handler emits new event shape (~60%)

## Decisions
- Functional options for PricingV2 ctor (rejected: class hierarchy)
- Backward-compat for V1 events for 30 days

## Rejected
- Custom retry layer; using sidekiq's instead

## Open Questions
- Should we drop V1 webhooks earlier than 30 days?

## Next
1. Wire up webhook signature verification
2. Add integration test against staging stripe sandbox
```

Eight sections, no more. Edit by hand if you like — it's just markdown.

## Layout under `.baton/`

```
.baton/
├── HANDOVER_TEMPLATE.md
├── AGENT.md                    # instructions for your AI tool
├── README.md
├── CURRENT.md                  # most recent card across any task (back-compat)
├── current/                    # one pointer per active task
│   ├── default.md
│   └── billing-refactor.md
├── done/                       # archived (finished) tasks
│   └── billing-refactor-2026-05-07-110530.md
└── 2026-05-07-110530.md        # historical, append-only
```

## Why not [existing solution]?

| | What it does | What's missing |
|---|---|---|
| `/compact` (built-in) | Lossy auto-summarize | Drops earliest decisions; not session-to-session |
| `/resume` `--continue` | Reload full history | Token-bloated; hits limits faster |
| `CLAUDE.md` (built-in) | Project-level standing facts | Not session-level state |
| [`claude-mem`](https://github.com/thedotmack/claude-mem) | Auto hooks, full pipeline | Implicit; locked to Claude Code hooks |
| Cloud SaaS (e.g. ContextPool) | Persistent server-side memory | Login, network, billing |
| Hand-rolled `MEMORY.md` + slash commands | Works | Everyone reinvents it |

`aibaton` takes a different angle:

- **Explicit, not auto.** You decide when to hand off. The card is yours to read.
- **Structured.** Same eight fields every time.
- **Cross-tool.** Anything that reads markdown.
- **Per-task isolated.** `--task` keeps parallel sessions from overwriting each other.
- **Git-native.** `.baton/` lives in your repo. Travels across machines, branches, and teammates.
- **Zero cloud, zero API key, zero LLM call.** Your AI tool does the writing — `aibaton` just gives it a place to write.

## Tool-specific setup

### Claude Code

```sh
aibaton init --tool claude-code
cat .baton/AGENT.md >> CLAUDE.md
```

Then in any session: *"save handover"* and Claude generates a card and runs `aibaton save --stdin`.

### Cursor

```sh
aibaton init --tool cursor
```

This writes a ready-to-use rule at `.cursor/rules/aibaton.mdc` (auto-loaded by Cursor). Open Cursor in **Agent mode** (Cmd+L → Agent), then say *"save handover"* at session end and *"resume"* at session start. Full walkthrough — including Auto-run setup and multi-task handoffs — in [`docs/cursor-guide.md`](docs/cursor-guide.md).

### Codex CLI / Aider / generic

```sh
aibaton init --tool generic
cat .baton/AGENT.md >> AGENTS.md
```

## Commands

```sh
aibaton init [--force] [--tool <name>]
aibaton save [--task <name>] [--stdin] [--file <path>] [--note "<oneline>"] [--no-editor]
aibaton resume [--task <name>] [--list-tasks] [--copy] [--raw] [--index <n>] [--print-path]
aibaton done [--task <name>]
aibaton list [--tasks] [--json] [--limit <n>]
```

Run `aibaton --help` for full details.

## FAQ

**Why isn't this just one markdown file I'd write by hand?**
It can be — `aibaton` is just a thin protocol around that file. The CLI exists so (a) every card has the same fields, (b) two parallel sessions don't silently overwrite each other (the v0.2 `--task` work), and (c) your AI tool has a clearly-named command to call instead of free-styling a prompt.

**Won't `claude-mem` already do this?**
`claude-mem` is great if you want full automation via hooks. `aibaton` is for the times you want explicit control: a clean named handover at a meaningful boundary, not every keystroke. The output of one card per session is also much easier to review and edit than an evolving auto-store.

**Why not also do auto-save / hooks?**
Maybe in v0.3 as opt-in. The current scope is intentionally small — markdown protocol + five commands.

**What if I'm not using Claude Code?**
The card is plain markdown. Any AI tool that reads markdown and runs shell commands can write and read it. The tool-specific setup hints just point you at the right rules file.

**Should I commit `.baton/` to my repo?**
Yes. That's the point. Handovers travel with the code, across machines, branches, and pairings. If a card is sensitive (security work, personal notes), gitignore that one card.

**Is the card format a standard?**
Sort of. The fields (Goal/Done/InProgress/Decisions/Rejected/OpenQ/Next) follow the proposal in [Claude Code #54254](https://github.com/anthropics/claude-code/issues/54254). We'd love for it to become a community convention so any tool can read any other's cards.

**What if I forget `--task` in a parallel-session setup?**
`aibaton` can't read your mind, but `resume` always appends a "Note: N other tasks active" footer when more than one is in flight, and the bundled AGENT.md instructs your AI to check `aibaton list --tasks` and ask you if it's not sure. The goal is: never silently load the wrong handover.

## Roadmap

- **v0.1** — `init`, `save`, `resume`, `list`.
- **v0.2** (current) — `--task` per-task isolation, `aibaton done` for archival, multi-task notice in `resume`.
- **v0.3** — opt-in pre-commit / `SessionEnd` hooks; smarter `resume` injection for Claude Code & Cursor.
- **v0.4** — VS Code / Cursor extension: one-click "Save Handover" button on the AI chat panel.
- **v0.5** — Cross-machine `.baton/` sync via git (no cloud).

## Contributing

PRs welcome. The whole CLI is ~600 lines. Open an issue first for non-trivial features.

```sh
git clone https://github.com/sappfire/aibaton
cd aibaton
npm install
npm run build
node dist/cli.js --help
bash test/smoke.sh
```

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

If `aibaton` saves you re-explaining your last session even once, give it a ⭐ on [GitHub](https://github.com/sappfire/aibaton).

</div>
