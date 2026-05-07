#!/usr/bin/env bash
# Manual demo runner — replays the aibaton story in a clean tmp dir.
#
# Usage: bash docs/demo.sh
# To record:
#   asciinema rec demo.cast -c "bash docs/demo.sh"
#   then: asciinema-agg or convert to gif

set -uo pipefail

CLI="${AIBATON_CLI:-node $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../dist/cli.js}"
TMP=$(mktemp -d -t aibaton-demo-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
git init -q

# Only clear screen when running interactively (not piped to file/process).
clr() { [ -t 1 ] && clear || echo; }
clr

pause()  { sleep "${1:-1.2}"; }
type_echo() { printf '\033[36m$\033[0m %s\n' "$1"; }

# Scene 1
type_echo "# Your AI forgets everything between sessions."
pause 1.5
type_echo "# 50-75% of every session = re-explaining yesterday."
pause 2

clr
# Scene 2
type_echo "aibaton init"
pause 0.6
$CLI init
pause 3

clr
# Scene 3
type_echo "# At session end, your AI generates the card:"
pause 1
type_echo "cat <<EOF | aibaton save --stdin"
cat <<'EOF' | $CLI save --stdin
# Handover · 2026-05-06 23:42

## Goal
Refactor BillingService to use PricingV2

## Done ✅
- BillingService → PricingV2 (commit a3f2b1)
- Unit tests for tier calc (commit 9c8e44)

## In Progress 🚧
- Webhook handler (~60%)

## Decisions
- Functional options ctor (rejected: class hierarchy — see ADR-007)

## Next
1. Webhook signature verification
2. Integration test against staging
EOF
pause 2.5

clr
# Scene 4
type_echo "aibaton list"
pause 0.6
$CLI list
pause 3

clr
# Scene 5
type_echo "# Tomorrow morning. New session."
pause 1
type_echo "aibaton resume"
pause 0.6
$CLI resume
pause 4

clr
# Scene 6
echo
echo "✓ Your AI now picks up exactly where you left off."
echo
echo "  One file. One command. Zero cloud."
echo
echo "  $ npm i -g aibaton"
echo
echo "  github.com/sappfire/aibaton"
echo
pause 3
