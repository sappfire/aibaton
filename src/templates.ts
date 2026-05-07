export const HANDOVER_TEMPLATE = `# Handover · {{TIMESTAMP}}

> Structured handover card for the next AI coding session.
> Edit freely. Keep it tight: the goal is fast pickup, not full history.

## Goal

<!-- One sentence: what we were trying to do this session. -->

## Done ✅

<!-- Completed items, ideally with commit hashes or file refs.
- [x] Migrated BillingService to PricingV2 (commit a3f2b1)
- [x] Added unit tests for tier calc (commit 9c8e44)
-->

## In Progress 🚧

<!-- What's actively in flight + current state.
- Webhook handler emits new event shape (~60% done; see src/webhooks/router.ts)
-->

## Decisions

<!-- Key decisions made + rationale. Future-you needs the WHY.
- Functional options for PricingV2 ctor (rejected: class hierarchy — see ADR-007)
- Backward-compat for V1 events for 30 days
-->

## Rejected

<!-- Paths we tried and abandoned + why. Stops the next session from re-treading.
- Tried building custom retry layer; using sidekiq's instead.
-->

## Open Questions

<!-- Things we couldn't resolve, need to ask user/team next.
- Should we drop V1 webhooks earlier than 30 days?
-->

## Next

<!-- Concrete next steps. The most important section for resume.
1. Wire up webhook signature verification
2. Add integration test against staging stripe sandbox
3. Run \`pnpm db:migrate\` against staging
-->
`;

export const AGENT_INSTRUCTIONS = `# aibaton — Agent Instructions

> Drop-in instructions for AI coding tools (Claude Code, Cursor, Codex, Aider, Cline).
> Append the contents of this file to CLAUDE.md / .cursor/rules / .github/copilot-instructions.md.

You are working in a repository that uses **aibaton** for cross-session handoffs.

The folder \`.baton/\` in the repo root contains structured handover cards from previous sessions.

## At session START

1. If \`.baton/CURRENT.md\` exists, read it BEFORE doing anything else.
2. If multiple parallel tasks are tracked (i.e. \`.baton/current/\` has more than one file, or CURRENT.md ends with a "Note: N other tasks active" block), you may be on the wrong task. Run:

   \`\`\`sh
   aibaton list --tasks
   \`\`\`

   and confirm with the user which task to resume — then read the right one with \`aibaton resume --task <name>\`.

3. Acknowledge briefly:

  > "Resuming from {Goal}. Last left off at: {first item under Next}."

If \`.baton/CURRENT.md\` does not exist or is empty, proceed normally.

## Before session END (or when the user says "save handover", "/baton save", or context is about to compact)

Do NOT call aibaton yourself with shell. Instead:

1. Generate the markdown content of a handover card following the template at \`.baton/HANDOVER_TEMPLATE.md\`. Fill in:
   - **Goal**: one sentence
   - **Done ✅**: completed items, ideally with commit hashes (\`git log --oneline -10\` to verify)
   - **In Progress 🚧**: what's mid-flight with state pointers
   - **Decisions**: key decisions + rationale
   - **Rejected**: tried-and-abandoned paths
   - **Open Questions**: unresolved
   - **Next**: concrete next steps (most critical section)

2. Pipe it into:

   \`\`\`sh
   aibaton save --stdin
   \`\`\`

   If this session was working on a named parallel task (e.g. "billing-refactor"), pass it explicitly to avoid clobbering other sessions' state:

   \`\`\`sh
   aibaton save --stdin --task billing-refactor
   \`\`\`

3. Confirm to the user: "Saved handover card → .baton/<timestamp>.md"

## When the user says the task is finished / done / shipped

Run:

\`\`\`sh
aibaton done            # for the default (single-task) workflow
aibaton done --task <name>   # for a named parallel task
\`\`\`

This archives the active pointer and removes it from the active task list, so future \`resume\` calls won't keep pulling stale state.

## Operating principles

- The handover is for the **next AI** — be terse, structured, no chitchat.
- Prefer commit hashes / file paths over prose summaries.
- If a TODO list exists in the project, cross-reference its [DONE] markers.
- Verify Done items by checking \`git log\` rather than trusting memory.
- Keep cards under ~80 lines; if longer, you're including too much.
- If you see multiple active tasks and you're not sure which one this session is on, ASK the user before saving.
`;

export const QUICK_README = `# .baton/ — AI Session Handover Cards

This folder is managed by [\`aibaton\`](https://github.com/sappfire/aibaton).

## Layout

- \`YYYY-MM-DD-HHMMSS.md\` — historical handover cards (append-only)
- \`CURRENT.md\` — the most recently saved card across any task (back-compat)
- \`current/<task>.md\` — per-task active pointers (one per parallel task)
- \`done/<task>-<timestamp>.md\` — archived (finished) tasks

## Common commands

\`\`\`sh
aibaton save                       # save (default task)
aibaton save --stdin --task foo    # save under a named task
aibaton resume                     # print the latest card
aibaton resume --task foo          # print a specific task's card
aibaton list                       # list historical cards
aibaton list --tasks               # list active tasks
aibaton done --task foo            # archive a finished task
\`\`\`

## How AI tools should use this

See \`AGENT.md\`. Append it to your AI tool's instructions file
(CLAUDE.md / .cursor/rules / etc.) so your AI knows how to write
and read handovers.

## Tips

- Commit \`.baton/\` to your repo. Handovers travel with the code.
- Use \`--task\` whenever you have two AI sessions open in the same repo
  on different problems — otherwise they will overwrite each other's
  pointers in \`CURRENT.md\`.
- The whole format is just markdown — feel free to edit by hand.
- Historical cards are append-only by convention; don't rewrite them.
`;

export const CURSOR_RULE_MDC = `---
description: aibaton — pass the baton between AI coding sessions. Reads / writes structured handover cards in .baton/.
globs:
  - ".baton/**"
  - "CLAUDE.md"
  - "AGENTS.md"
alwaysApply: true
---

# aibaton — Cursor agent rule

This repo uses **aibaton** for cross-session handoffs.
The folder \`.baton/\` holds structured handover cards.
\`.baton/CURRENT.md\` is the most recent card across any task (back-compat).
\`.baton/current/<task>.md\` is the active pointer for a named parallel task.

## At session start (always do this first)

1. If \`.baton/CURRENT.md\` exists and is non-empty, read it.
2. If you see a "Note: N other tasks active" footer at the bottom, or \`.baton/current/\` has more than one file, you may be on the wrong task. Run:

   \`\`\`sh
   aibaton list --tasks
   \`\`\`

   Confirm with the user which one to resume, then read it via \`aibaton resume --task <name>\`.

3. Acknowledge in one short line: \`Resuming from <Goal>. Last left off at <first item under Next>.\`
4. Continue from the **Next** section.

If \`.baton/CURRENT.md\` does not exist, proceed normally.

## When the user says "save handover" / "/baton save" / "wrap up this session"

In Cursor you have terminal access from Agent mode. Do this in one go:

1. Generate the handover markdown following \`.baton/HANDOVER_TEMPLATE.md\`
   (sections: Goal, Done ✅, In Progress 🚧, Decisions, Rejected, Open Questions, Next).

2. Run in the integrated terminal:

   \`\`\`sh
   aibaton save --stdin <<'EOF'
   <the markdown you just generated>
   EOF
   \`\`\`

   If this session is part of a named parallel task, pass it explicitly so you do not clobber other sessions:

   \`\`\`sh
   aibaton save --stdin --task <name> <<'EOF'
   <markdown>
   EOF
   \`\`\`

3. Confirm: \`Saved → .baton/<timestamp>.md\`.

If \`aibaton\` is not installed globally, fall back to \`npx aibaton save ...\`.

## When the user says the task is finished / done

Run:

\`\`\`sh
aibaton done                  # default (single-task) workflow
aibaton done --task <name>    # named parallel task
\`\`\`

This archives the active pointer and stops future \`resume\` calls from pulling stale state.

## Operating principles

- Be terse. The card is for the **next AI**, not a journal.
- Prefer commit hashes / file paths over prose. Verify by \`git log --oneline -10\` rather than memory.
- Keep cards under ~80 lines.
- The Decisions and Next sections are the most valuable — fill them well.
- Historical cards are append-only by convention; never rewrite past cards.
- If multiple active tasks exist and you're not sure which one this session is on, ASK the user before saving.
`;

export const SETUP_HINTS_BY_TOOL: Record<string, string> = {
  "claude-code": `
For **Claude Code**:
  Append .baton/AGENT.md to your CLAUDE.md so Claude knows the handover protocol:

    cat .baton/AGENT.md >> CLAUDE.md

  Then in any session you can say:
    "save handover" → Claude generates a card and runs \`aibaton save --stdin\`
    "resume" or auto-on-start → Claude reads \`.baton/CURRENT.md\`
`,
  cursor: `
For **Cursor**:
  A ready-to-use rule has been written for you at:

    .cursor/rules/aibaton.mdc

  It will load automatically whenever you open Cursor in this repo.

  Recommended workflow:
    1. Switch to Cursor's "Agent" mode (Cmd+L → "Agent").
    2. (Optional) Settings → Beta → enable "Auto-run mode" so the agent can
       run \`aibaton save --stdin\` directly. Otherwise click "Run" when prompted.
    3. End of session: say "save handover" — the agent writes the card.
    4. Start of next session: it auto-reads .baton/CURRENT.md and acknowledges.

  See docs/cursor-guide.md (in the aibaton repo) for the full step-by-step.
`,
  codex: `
For **Codex CLI** / **Aider**:
  Append .baton/AGENT.md to your AGENTS.md or system prompt file.
`,
  generic: `
For any AI tool:
  Add the contents of .baton/AGENT.md to your tool's instruction file.
  The protocol is just: write markdown + run \`aibaton save --stdin\`.
`,
};
