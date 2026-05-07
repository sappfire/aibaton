#!/usr/bin/env bash
# audit-publish-risk.sh — scan all npm projects on this machine and
# report which ones could accidentally publish to the wrong registry.
#
# What it does:
#   1. Find every package.json in given paths (excludes node_modules / dist / build / .git).
#   2. For each one, extract: name, private, publishConfig.registry, scope.
#   3. Classify the publish risk:
#        🟢 SAFE     — private:true OR publishConfig.registry locked OR scoped to corp scope
#        🟡 WARN     — could publish but no explicit publishConfig (relies on global)
#        🔴 HIGH RISK — unscoped public package with no publishConfig + global registry mismatch
#   4. Print a one-page summary and a "fix" suggestion for each WARN/HIGH project.
#
# Usage:
#   bash scripts/audit-publish-risk.sh                # scan default locations
#   bash scripts/audit-publish-risk.sh ~/Code ~/Work  # scan specific dirs
#
# Exit code:
#   0  no HIGH risk projects found
#   2  at least one HIGH risk project found
#   3  at least one WARN project found (no HIGH)

set -uo pipefail

# -------- color setup --------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'; C_MAGENTA=$'\033[35m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_MAGENTA=""
fi

# -------- args: scan paths --------
if [ $# -gt 0 ]; then
  SCAN_PATHS=("$@")
else
  SCAN_PATHS=(
    "$HOME/Documents"
    "$HOME/Code"
    "$HOME/Projects"
    "$HOME/Work"
    "$HOME/work"
    "$HOME/repo"
    "$HOME/repos"
    "$HOME/dev"
    "$HOME/Developer"
    "$HOME/src"
  )
fi

# -------- print header --------
GLOBAL_REGISTRY="$(npm config get registry 2>/dev/null || echo '?')"
case "$GLOBAL_REGISTRY" in
  */) ;;
  *) GLOBAL_REGISTRY="${GLOBAL_REGISTRY}/" ;;
esac

echo ""
printf "%snpm publish risk audit%s\n" "$C_BOLD" "$C_RESET"
printf "%s======================%s\n" "$C_DIM" "$C_RESET"
printf "  Global registry: %s%s%s\n" "$C_MAGENTA" "$GLOBAL_REGISTRY" "$C_RESET"
printf "  Scanning:\n"
for p in "${SCAN_PATHS[@]}"; do
  if [ -d "$p" ]; then
    printf "    %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$p"
  fi
done
echo ""

# -------- collect package.json files --------
PKG_FILES=()
for path in "${SCAN_PATHS[@]}"; do
  [ -d "$path" ] || continue
  while IFS= read -r line; do
    PKG_FILES+=("$line")
  done < <(find "$path" -type f -name "package.json" \
            -not -path "*/node_modules/*" \
            -not -path "*/.git/*" \
            -not -path "*/dist/*" \
            -not -path "*/build/*" \
            -not -path "*/.next/*" \
            -not -path "*/.nuxt/*" \
            -not -path "*/coverage/*" \
            -not -path "*/.cache/*" \
            -not -path "*/out/*" \
            -not -path "*/.turbo/*" \
            -not -path "*/.svelte-kit/*" \
            -not -path "*/storybook-static/*" \
            2>/dev/null)
done

if [ ${#PKG_FILES[@]} -eq 0 ]; then
  printf "%s!%s no package.json files found in scan paths.\n" "$C_YELLOW" "$C_RESET"
  exit 0
fi

printf "Found %d package.json files.\n\n" "${#PKG_FILES[@]}"

# -------- classify each --------
SAFE_COUNT=0
WARN_COUNT=0
HIGH_COUNT=0

# Buffers for grouped output
SAFE_LINES=()
WARN_LINES=()
HIGH_LINES=()

extract_field() {
  # $1 = file, $2 = node expression
  node -e "
    try {
      const p = require('$1');
      const v = $2;
      if (v === undefined || v === null) process.stdout.write('');
      else process.stdout.write(String(v));
    } catch (e) { process.stdout.write(''); }
  " 2>/dev/null
}

for f in "${PKG_FILES[@]}"; do
  PROJECT_DIR="$(dirname "$f")"
  REL_PATH="${PROJECT_DIR/#$HOME/~}"

  NAME="$(extract_field "$f" "p.name")"
  IS_PRIVATE="$(extract_field "$f" "p.private === true ? 'yes' : ''")"
  # detect the npm pkg set private=true (without --json) footgun: leaves "private":"true" as STRING
  PRIVATE_STRING_BUG="$(extract_field "$f" "p.private === 'true' ? 'yes' : ''")"
  PUBLISH_REG="$(extract_field "$f" "p.publishConfig && p.publishConfig.registry || ''")"
  PUBLISH_ACCESS="$(extract_field "$f" "p.publishConfig && p.publishConfig.access || ''")"

  # No name / scope detection
  SCOPE=""
  case "$NAME" in
    @*/*) SCOPE="${NAME%%/*}" ;;
  esac

  # Classify
  REASON=""
  CATEGORY=""

  if [ -z "$NAME" ]; then
    CATEGORY="SAFE"
    REASON="no name (cannot publish)"
  elif [ "$PRIVATE_STRING_BUG" = "yes" ]; then
    # FOOTGUN: "private":"true" (string) does NOT block npm publish
    CATEGORY="HIGH"
    REASON="\"private\":\"true\" is a STRING, not boolean — does NOT block publish! Run: npm pkg set private=true --json"
  elif [ "$IS_PRIVATE" = "yes" ]; then
    CATEGORY="SAFE"
    REASON="private:true (npm refuses to publish, EPRIVATE)"
  elif [ -n "$PUBLISH_REG" ]; then
    case "$PUBLISH_REG" in
      *npmjs.org* )
        CATEGORY="SAFE"
        REASON="publishConfig→npmjs.org (locked)"
        ;;
      *)
        CATEGORY="SAFE"
        REASON="publishConfig→$PUBLISH_REG (locked)"
        ;;
    esac
  else
    # No publishConfig → would use global registry
    if [ -n "$SCOPE" ]; then
      # Scoped, but unlocked. Could go either way depending on global / scope:registry config.
      CATEGORY="WARN"
      REASON="scope $SCOPE, no publishConfig — would use global '$GLOBAL_REGISTRY'"
    else
      # Unscoped public package without publishConfig.
      # If global registry is npmjs.org → it's a personal-style project, fine.
      # If global registry is corp registry → publish would go to corp. Not fatal but unusual.
      case "$GLOBAL_REGISTRY" in
        *npmjs.org*)
          CATEGORY="WARN"
          REASON="unscoped, no publishConfig — would publish to npmjs.org via global"
          ;;
        *)
          CATEGORY="HIGH"
          REASON="unscoped public-style name, no publishConfig — would publish to '$GLOBAL_REGISTRY' via global"
          ;;
      esac
    fi
  fi

  LINE=$(printf "  %s\n      name=%s  private=%s  publishConfig=%s\n      → %s\n" \
    "$REL_PATH" "${NAME:-(none)}" "${IS_PRIVATE:-no}" "${PUBLISH_REG:-(none)}" "$REASON")

  case "$CATEGORY" in
    SAFE) SAFE_COUNT=$((SAFE_COUNT+1)); SAFE_LINES+=("$LINE") ;;
    WARN) WARN_COUNT=$((WARN_COUNT+1)); WARN_LINES+=("$LINE") ;;
    HIGH) HIGH_COUNT=$((HIGH_COUNT+1)); HIGH_LINES+=("$LINE") ;;
  esac
done

# -------- print grouped report --------

if [ "$HIGH_COUNT" -gt 0 ]; then
  printf "%s🔴 HIGH RISK%s (%d projects) — would publish to a non-trivial wrong registry\n\n" \
    "$C_RED" "$C_RESET" "$HIGH_COUNT"
  for line in "${HIGH_LINES[@]}"; do printf "%s%s%s\n" "$C_RED" "$line" "$C_RESET"; done
  echo ""
fi

if [ "$WARN_COUNT" -gt 0 ]; then
  printf "%s🟡 WARN%s (%d projects) — could publish but relies on global registry, no project-level lock\n\n" \
    "$C_YELLOW" "$C_RESET" "$WARN_COUNT"
  for line in "${WARN_LINES[@]}"; do printf "%s%s%s\n" "$C_YELLOW" "$line" "$C_RESET"; done
  echo ""
fi

if [ "$SAFE_COUNT" -gt 0 ]; then
  printf "%s🟢 SAFE%s (%d projects) — locked, private, or unpublishable\n\n" \
    "$C_GREEN" "$C_RESET" "$SAFE_COUNT"
  for line in "${SAFE_LINES[@]}"; do printf "%s%s%s\n" "$C_GREEN" "$line" "$C_RESET"; done
  echo ""
fi

# -------- summary + fix suggestion --------

printf "%s%sSummary%s\n" "$C_BOLD" "$C_CYAN" "$C_RESET"
printf "  🟢 SAFE: %d  |  🟡 WARN: %d  |  🔴 HIGH: %d  (total %d)\n\n" \
  "$SAFE_COUNT" "$WARN_COUNT" "$HIGH_COUNT" "${#PKG_FILES[@]}"

if [ "$HIGH_COUNT" -gt 0 ] || [ "$WARN_COUNT" -gt 0 ]; then
  printf "%s%sRecommended fix for each WARN/HIGH project:%s\n\n" "$C_BOLD" "$C_CYAN" "$C_RESET"
  cat <<'EOF'
  1. Open the project's package.json
  2. Add publishConfig.registry pointing to the CORRECT registry, e.g.:

       For corporate / private projects (Tencent example):
         "publishConfig": {
           "registry": "https://mirrors.tencent.com/npm/"
         }

       For open-source (npmjs.org):
         "publishConfig": {
           "registry": "https://registry.npmjs.org/",
           "access": "public"
         }

       For never-published projects (apps, internal tools):
         "private": true

  3. Commit the change.

  After this, `npm publish` in that project becomes hard-locked
  to the right registry, regardless of your global ~/.npmrc.
EOF
  echo ""
fi

# -------- exit code --------
if [ "$HIGH_COUNT" -gt 0 ]; then
  exit 2
elif [ "$WARN_COUNT" -gt 0 ]; then
  exit 3
else
  printf "%s✓%s no risk found. you are safe.\n\n" "$C_GREEN" "$C_RESET"
  exit 0
fi
