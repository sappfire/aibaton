#!/usr/bin/env bash
# aibaton smoke test
# Runs init / save / resume / list / done end-to-end in a clean tmp repo,
# covering both single-task (back-compat) and multi-task workflows.
# Exit 0 on success, non-zero on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="${AIBATON_CLI:-node $SCRIPT_DIR/../dist/cli.js}"
TMP=$(mktemp -d -t aibaton-smoke-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
git init -q

step() { printf '\n\033[36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# ---------- v0.1 back-compat ----------

step "version"
$CLI --version | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "--version did not return semver"
ok "version is semver"

step "init"
$CLI init >/dev/null
[ -f .baton/HANDOVER_TEMPLATE.md ] || fail "HANDOVER_TEMPLATE.md missing"
[ -f .baton/AGENT.md ]              || fail "AGENT.md missing"
[ -f .baton/README.md ]             || fail "README.md missing"
ok "init wrote 3 template files"

step "save --note (default task)"
$CLI save --note "First handover (smoke test)" >/dev/null
[ -f .baton/CURRENT.md ] || fail "CURRENT.md not created after save"
[ -f .baton/current/default.md ] || fail "current/default.md not created"
grep -q "First handover" .baton/CURRENT.md || fail "note not saved into CURRENT.md"
grep -q "First handover" .baton/current/default.md || fail "note not in current/default.md"
ok "save --note created CURRENT.md and current/default.md"

sleep 1
step "save --stdin (default task overwrite)"
cat <<'EOF' | $CLI save --stdin >/dev/null
# Handover · smoke

## Goal
Pretend to do real work

## Next
1. Verify resume works
EOF
grep -q "Pretend to do real work" .baton/CURRENT.md || fail "stdin content not in CURRENT"
grep -q "Pretend to do real work" .baton/current/default.md || fail "stdin content not in current/default.md"
ok "save --stdin overwrote CURRENT.md and current/default.md"

step "list"
LIST_OUT=$($CLI list)
echo "$LIST_OUT" | grep -q "Pretend to do real work" || fail "list did not show latest goal"
echo "$LIST_OUT" | grep -q "First handover" || fail "list did not show earlier card"
ok "list shows both cards"

step "resume (default with prefix, no other tasks)"
RESUME_OUT=$($CLI resume)
echo "$RESUME_OUT" | grep -q "Resuming from a previous AI coding session" || fail "resume missing prefix"
echo "$RESUME_OUT" | grep -q "Pretend to do real work" || fail "resume missing latest content"
echo "$RESUME_OUT" | grep -q "other task" && fail "resume should not show other-tasks notice when only default exists"
ok "resume prints prefix + latest card, no false multi-task notice"

step "resume --raw"
RAW_OUT=$($CLI resume --raw)
echo "$RAW_OUT" | grep -q "Resuming from a previous" && fail "--raw should omit prefix"
echo "$RAW_OUT" | grep -q "Pretend to do real work" || fail "--raw missing content"
ok "resume --raw works"

step "resume --index 1 (second-most-recent)"
SECOND_OUT=$($CLI resume --index 1 --raw)
echo "$SECOND_OUT" | grep -q "First handover" || fail "--index 1 should be the older card"
ok "resume --index 1 works"

step "resume --print-path"
PATH_OUT=$($CLI resume --print-path)
[ -f "$PATH_OUT" ] || fail "--print-path returned non-existent file: $PATH_OUT"
ok "--print-path returns valid file"

step "list --json"
JSON_OUT=$($CLI list --json)
echo "$JSON_OUT" | grep -q '"goal"' || fail "--json missing goal field"
echo "$JSON_OUT" | grep -q '"task"' || fail "--json missing task field (v0.2)"
ok "list --json works and includes task field"

# ---------- v0.2 multi-task ----------

step "save --task billing-refactor"
sleep 1
cat <<'EOF' | $CLI save --stdin --task billing-refactor >/dev/null
# Handover · billing
## Goal
Refactor BillingService to PricingV2

## Next
1. Wire up new event shape
EOF
[ -f .baton/current/billing-refactor.md ] || fail "current/billing-refactor.md not created"
grep -q "Refactor BillingService" .baton/current/billing-refactor.md || fail "billing card content missing"
ls .baton | grep -E '\.billing-refactor\.md$' >/dev/null || fail "timestamp card with .billing-refactor. suffix not found"
grep -q "Refactor BillingService" .baton/CURRENT.md || fail "CURRENT.md should mirror most recent save"
ok "save --task wrote current/billing-refactor.md and timestamped card"

step "save --task api-rewrite (third active task setup)"
sleep 1
cat <<'EOF' | $CLI save --stdin --task api-rewrite >/dev/null
# Handover · api
## Goal
Rewrite REST layer to gRPC

## Next
1. Define proto schema
EOF
[ -f .baton/current/api-rewrite.md ] || fail "current/api-rewrite.md not created"
ok "save --task api-rewrite created"

step "list --tasks"
TASKS_OUT=$($CLI list --tasks)
echo "$TASKS_OUT" | grep -q "default" || fail "list --tasks missing default"
echo "$TASKS_OUT" | grep -q "billing-refactor" || fail "list --tasks missing billing-refactor"
echo "$TASKS_OUT" | grep -q "api-rewrite" || fail "list --tasks missing api-rewrite"
ok "list --tasks shows all 3 active tasks"

step "list --tasks --json"
TJ_OUT=$($CLI list --tasks --json)
echo "$TJ_OUT" | grep -q '"task": "default"' || fail "list --tasks --json missing default"
echo "$TJ_OUT" | grep -q '"task": "billing-refactor"' || fail "list --tasks --json missing billing-refactor"
ok "list --tasks --json works"

step "resume --task billing-refactor"
B_OUT=$($CLI resume --task billing-refactor)
echo "$B_OUT" | grep -q "Refactor BillingService" || fail "resume --task billing-refactor missing content"
echo "$B_OUT" | grep -q "other task" || fail "resume --task should append multi-task notice when others exist"
echo "$B_OUT" | grep -q "default" || fail "multi-task notice should mention default"
echo "$B_OUT" | grep -q "api-rewrite" || fail "multi-task notice should mention api-rewrite"
ok "resume --task billing-refactor printed correct content + multi-task notice"

step "resume --task nonexistent (should fail)"
set +e
$CLI resume --task does-not-exist >/dev/null 2>&1
RC=$?
set -e
[ $RC -ne 0 ] || fail "resume --task on missing task should fail with non-zero exit"
ok "resume --task on missing task fails as expected"

step "resume --list-tasks"
LT_OUT=$($CLI resume --list-tasks)
echo "$LT_OUT" | grep -q "default" || fail "resume --list-tasks missing default"
echo "$LT_OUT" | grep -q "billing-refactor" || fail "resume --list-tasks missing billing-refactor"
ok "resume --list-tasks works"

step "default resume (CURRENT.md) appends multi-task notice when others exist"
DEF_OUT=$($CLI resume)
echo "$DEF_OUT" | grep -q "Resuming from a previous" || fail "default resume missing prefix"
# CURRENT.md mirrors most recent (api-rewrite at this point)
echo "$DEF_OUT" | grep -q "Rewrite REST layer" || fail "CURRENT.md should mirror most recent (api-rewrite)"
echo "$DEF_OUT" | grep -q "other task" || fail "default resume should warn about other tasks"
ok "default resume prints CURRENT + multi-task notice"

step "done --task billing-refactor"
$CLI done --task billing-refactor >/dev/null
[ ! -f .baton/current/billing-refactor.md ] || fail "current/billing-refactor.md should be removed after done"
ls .baton/done | grep -q "billing-refactor-" || fail "done/billing-refactor-* archive missing"
ok "done --task billing-refactor archived correctly"

step "done --task on already-archived task fails"
set +e
$CLI done --task billing-refactor >/dev/null 2>&1
RC=$?
set -e
[ $RC -ne 0 ] || fail "done on already-archived task should fail"
ok "done on missing task fails as expected"

step "done --task api-rewrite (CURRENT.md was mirroring it; should repoint)"
$CLI done --task api-rewrite >/dev/null
[ ! -f .baton/current/api-rewrite.md ] || fail "current/api-rewrite.md should be removed"
[ -f .baton/CURRENT.md ] || fail "CURRENT.md should be repointed (default still active), not deleted"
grep -q "Pretend to do real work" .baton/CURRENT.md || fail "CURRENT.md should be repointed to default's content"
ok "done repointed CURRENT.md to remaining default task"

step "done (default task) – last active task; CURRENT.md should be removed"
$CLI done >/dev/null
[ ! -f .baton/current/default.md ] || fail "current/default.md should be removed"
[ ! -f .baton/CURRENT.md ] || fail "CURRENT.md should be removed when no active tasks remain"
ok "done on last active task removed CURRENT.md"

step "list --tasks shows empty after all done"
EMPTY_OUT=$($CLI list --tasks)
echo "$EMPTY_OUT" | grep -q "no active tasks" || fail "list --tasks should show empty state"
ok "list --tasks empty state works"

step "historical cards still listable after all archived"
HIST_OUT=$($CLI list)
echo "$HIST_OUT" | grep -q "Pretend to do real work" || fail "historical cards should remain listed"
echo "$HIST_OUT" | grep -q "billing-refactor" || fail "historical card task badge should appear"
ok "list still shows historical cards (append-only preserved)"

# ---------- input validation ----------

step "save --task with invalid name"
set +e
echo "x" | $CLI save --stdin --task "../evil" >/dev/null 2>&1
RC=$?
set -e
[ $RC -ne 0 ] || fail "invalid task name should be rejected"
ok "invalid task name rejected"

printf '\n\033[32m✓ all smoke tests passed\033[0m  (in %s)\n' "$TMP"
