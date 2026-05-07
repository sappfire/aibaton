# vhs script for the aibaton demo gif/mp4
#
# Usage:
#   1. Install vhs: `brew install vhs` (or see https://github.com/charmbracelet/vhs)
#   2. From this directory: `vhs docs/demo.tape`
#   3. Outputs docs/demo.gif (and demo.mp4 if you uncomment Output below)
#
# To run vhs against a *built* aibaton, do `npm run build` first so dist/cli.js exists.

Output docs/demo.gif
# Output docs/demo.mp4

Set FontSize 16
Set Width 1100
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0
Set Padding 20

# Setup: clean tmp working dir, point PATH at our dist
Hide
Type "rm -rf /tmp/aibaton-demo && mkdir /tmp/aibaton-demo && cd /tmp/aibaton-demo && git init -q && clear"
Enter
Type "alias aibaton='node ${HOME}/Documents/practice/ai-coding/ai-plan/aibaton/dist/cli.js'"
Enter
Sleep 200ms
Show

# === Scene 1: AI forgets ===
Type "# Your AI forgets everything between sessions."
Sleep 800ms
Enter

Type "# 50-75% of every session = re-explaining."
Sleep 1s
Enter

Type "clear"
Enter

# === Scene 2: aibaton init ===
Type "aibaton init"
Sleep 400ms
Enter
Sleep 2500ms

Type "clear"
Enter

# === Scene 3: AI generates handover and saves ===
Type "# At session end, your AI generates the card:"
Sleep 800ms
Enter
Type `cat <<'EOF' | aibaton save --stdin`
Enter
Type "# Handover · 2026-05-06 23:42"
Enter
Type ""
Enter
Type "## Goal"
Enter
Type "Refactor BillingService to use PricingV2"
Enter
Type ""
Enter
Type "## Done"
Enter
Type "- BillingService -> PricingV2 (commit a3f2b1)"
Enter
Type "- Unit tests for tier calc (commit 9c8e44)"
Enter
Type ""
Enter
Type "## In Progress"
Enter
Type "- Webhook handler (~60%)"
Enter
Type ""
Enter
Type "## Decisions"
Enter
Type "- Functional options ctor (rejected: class hierarchy)"
Enter
Type ""
Enter
Type "## Next"
Enter
Type "1. Webhook signature verification"
Enter
Type "2. Integration test against staging"
Enter
Type "EOF"
Enter
Sleep 2500ms

Type "clear"
Enter

# === Scene 4: list shows it ===
Type "aibaton list"
Sleep 400ms
Enter
Sleep 2000ms

Type "clear"
Enter

# === Scene 5: resume in new session ===
Type "# Tomorrow morning, new session:"
Sleep 800ms
Enter
Type "aibaton resume"
Sleep 400ms
Enter
Sleep 4000ms

# === Scene 6: outro ===
Type "# Your AI: 'Got it — picking up from BillingService refactor."
Enter
Type "#  Last left off at: webhook signature verification.'"
Sleep 1500ms
Enter

Type "# One file. One command. Zero cloud."
Sleep 800ms
Enter
Type "# npm i -g aibaton"
Sleep 1500ms
Enter
