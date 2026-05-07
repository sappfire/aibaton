#!/usr/bin/env bash
# publish.sh — safe one-command publish workflow for aibaton
#
# What it does, in order:
#   1. Preflight: working dir clean? on main branch? deps installed? package.json sane?
#   2. Build (npm run build)
#   3. Smoke test (test/smoke.sh) — must pass
#   4. Show tarball contents (npm pack --dry-run) — interactive confirm before publish
#   5. Publish to npmjs.org
#   6. Verify publish succeeded (npm view)
#   7. Clean up (revoke ephemeral token from ~/.npmrc if --token-stdin was used)
#   8. Print next-step checklist (git tag, GitHub release, social channels)
#
# Token authentication (pick ONE):
#
#   A) Pre-existing ~/.npmrc auth (RECOMMENDED for repeat publishes):
#        ./scripts/publish.sh
#        # Assumes you've previously run:
#        #   echo "//registry.npmjs.org/:_authToken=npm_xxx" >> ~/.npmrc && chmod 600 ~/.npmrc
#
#   B) Ephemeral token (RECOMMENDED for one-shot publish from a borrowed machine):
#        echo "npm_xxxxxxxxxxxx" | ./scripts/publish.sh --token-stdin
#        # Token is written to ~/.npmrc just for this publish, then removed automatically
#        # even on failure.
#
#   C) OTP (RECOMMENDED if you have 2FA enabled and an Authenticator App):
#        ./scripts/publish.sh --otp 123456
#        # Reads OTP from your Authenticator App. Must complete within 30s before refresh.
#
# Other flags:
#   --dry-run        Pack and validate, but don't actually publish.
#   --skip-smoke     Skip smoke tests (NOT recommended; only for hot fixes).
#   --skip-git-check Allow uncommitted changes / non-main branch (NOT recommended).
#   --tag <dist>     Publish under a non-default dist tag (e.g. "next", "beta").
#   --registry <url> Publish to a non-default registry (default: https://registry.npmjs.org/).
#   -h, --help       Show this help.
#
# Exit codes:
#   0  success
#   1  preflight failed
#   2  build / test failed
#   3  publish failed
#   4  user aborted at confirmation prompt

set -euo pipefail

# -------- args --------
TOKEN_STDIN=0
OTP=""
DRY_RUN=0
SKIP_SMOKE=0
SKIP_GIT_CHECK=0
DIST_TAG="latest"
REGISTRY=""              # empty = honor publishConfig in package.json
REGISTRY_OVERRIDDEN=0
EPHEMERAL_TOKEN=""
NPMRC_BACKUP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --token-stdin)    TOKEN_STDIN=1; shift ;;
    --otp)            OTP="$2"; shift 2 ;;
    --otp=*)          OTP="${1#*=}"; shift ;;
    --dry-run)        DRY_RUN=1; shift ;;
    --skip-smoke)     SKIP_SMOKE=1; shift ;;
    --skip-git-check) SKIP_GIT_CHECK=1; shift ;;
    --tag)            DIST_TAG="$2"; shift 2 ;;
    --tag=*)          DIST_TAG="${1#*=}"; shift ;;
    --registry)       REGISTRY="$2"; REGISTRY_OVERRIDDEN=1; shift 2 ;;
    --registry=*)     REGISTRY="${1#*=}"; REGISTRY_OVERRIDDEN=1; shift ;;
    -h|--help)        sed -n '2,40p' "$0"; exit 0 ;;
    *)                echo "✗ unknown flag: $1" >&2; exit 1 ;;
  esac
done

# -------- colored print helpers --------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'; C_MAGENTA=$'\033[35m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_MAGENTA=""
fi
step() { printf '\n%s›%s %s\n'   "$C_CYAN"  "$C_RESET" "$1"; }
ok()   { printf '%s✓%s %s\n'     "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf '%s!%s %s\n'     "$C_YELLOW" "$C_RESET" "$1"; }
fail() { printf '%s✗%s %s\n'     "$C_RED"   "$C_RESET" "$1" >&2; }
info() { printf '  %s%s%s\n'     "$C_DIM"   "$1"        "$C_RESET"; }

# -------- locate package root (parent of scripts/) --------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PKG_DIR"

# -------- ephemeral token cleanup (registered as trap) --------
cleanup_ephemeral_token() {
  if [ -n "$EPHEMERAL_TOKEN" ] && [ -f "$HOME/.npmrc" ]; then
    # Remove the line that contains our ephemeral token.
    # Use a temp file to be portable across BSD/GNU sed.
    local tmp
    tmp="$(mktemp)"
    grep -vF "$EPHEMERAL_TOKEN" "$HOME/.npmrc" > "$tmp" || true
    mv "$tmp" "$HOME/.npmrc"
    chmod 600 "$HOME/.npmrc" 2>/dev/null || true
    EPHEMERAL_TOKEN=""
    info "removed ephemeral token from ~/.npmrc"
  fi
  if [ -n "$NPMRC_BACKUP" ] && [ -f "$NPMRC_BACKUP" ]; then
    info "previous ~/.npmrc backed up at $NPMRC_BACKUP (kept just in case)"
  fi
}
trap cleanup_ephemeral_token EXIT

# ===================================================================
# 1. PREFLIGHT
# ===================================================================

step "preflight"

# Confirm we're in a recognizable npm package
[ -f package.json ] || { fail "no package.json in $PKG_DIR"; exit 1; }
PKG_NAME="$(node -p "require('./package.json').name")"
PKG_VERSION="$(node -p "require('./package.json').version")"
ok "package: $C_BOLD$PKG_NAME$C_RESET@$C_BOLD$PKG_VERSION$C_RESET"

# Resolve effective registry (publishConfig wins over global default).
# Order:
#   1. --registry CLI flag (REGISTRY_OVERRIDDEN=1)
#   2. publishConfig.registry in package.json
#   3. global npm config get registry
PKG_PUBLISH_REGISTRY="$(node -p "require('./package.json').publishConfig?.registry || ''")"
if [ "$REGISTRY_OVERRIDDEN" -eq 1 ]; then
  EFFECTIVE_REGISTRY="$REGISTRY"
  REGISTRY_SOURCE="--registry CLI flag"
elif [ -n "$PKG_PUBLISH_REGISTRY" ]; then
  EFFECTIVE_REGISTRY="$PKG_PUBLISH_REGISTRY"
  REGISTRY_SOURCE="package.json publishConfig.registry"
else
  EFFECTIVE_REGISTRY="$(npm config get registry 2>/dev/null || echo "https://registry.npmjs.org/")"
  REGISTRY_SOURCE="npm config (global default)"
fi
# Normalize trailing slash for downstream comparisons.
case "$EFFECTIVE_REGISTRY" in
  */) ;;
  *) EFFECTIVE_REGISTRY="${EFFECTIVE_REGISTRY}/" ;;
esac
REGISTRY="$EFFECTIVE_REGISTRY"  # downstream code uses $REGISTRY

ok "target registry: $C_MAGENTA$REGISTRY$C_RESET"
info "(source: $REGISTRY_SOURCE)"

# Loud warning if package.json has no publishConfig.registry and the
# resolved registry is anything other than npmjs.org. Almost always a
# mistake when publishing a public open-source package.
if [ -z "$PKG_PUBLISH_REGISTRY" ] && [ "$REGISTRY_OVERRIDDEN" -eq 0 ]; then
  case "$REGISTRY" in
    https://registry.npmjs.org/) ;;
    *)
      warn "package.json has no publishConfig.registry and your global"
      warn "registry is NOT npmjs.org. About to publish to: $REGISTRY"
      info "if this is a public open-source package, this is almost"
      info "certainly wrong. Add to package.json:"
      info '    "publishConfig": { "registry": "https://registry.npmjs.org/", "access": "public" }'
      printf "  continue anyway? [y/N] "
      read -r reply
      case "$reply" in
        y|Y|yes|YES) ;;
        *) fail "aborted by user"; exit 4 ;;
      esac
      ;;
  esac
fi

# Node version (>=18 per engines field)
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node $NODE_MAJOR detected; aibaton requires Node >= 18"
  exit 1
fi
ok "node version: $(node --version)"

# Dependencies installed
if [ ! -d node_modules ]; then
  warn "node_modules/ missing, running npm install"
  npm install --silent
fi
ok "dependencies present"

# Git clean check (skippable but loud)
if [ "$SKIP_GIT_CHECK" -eq 0 ]; then
  if [ -d .git ] || git rev-parse --git-dir >/dev/null 2>&1; then
    if [ -n "$(git status --porcelain)" ]; then
      fail "git working tree has uncommitted changes:"
      git status --short | sed 's/^/    /'
      info "commit / stash before publishing, or pass --skip-git-check"
      exit 1
    fi
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
      warn "not on main/master (current: $BRANCH)"
      printf "  continue anyway? [y/N] "
      read -r reply
      case "$reply" in
        y|Y|yes|YES) ;;
        *) fail "aborted by user"; exit 4 ;;
      esac
    fi
    ok "git: branch $C_BOLD$BRANCH$C_RESET, working tree clean"
  else
    warn "not a git repo (skipping git checks)"
  fi
else
  warn "git checks skipped (--skip-git-check)"
fi

# Package version not already on npm
if EXISTING="$(npm view "$PKG_NAME@$PKG_VERSION" version --registry="$REGISTRY" 2>/dev/null)" && [ -n "$EXISTING" ]; then
  fail "$PKG_NAME@$PKG_VERSION is ALREADY published on $REGISTRY"
  info "bump the version in package.json (npm version patch / minor / major)"
  exit 1
fi
ok "version $PKG_VERSION is not yet on npm — clear to publish"

# ===================================================================
# 2. AUTH SETUP
# ===================================================================

step "auth"

if [ "$TOKEN_STDIN" -eq 1 ]; then
  if [ -t 0 ]; then
    fail "--token-stdin given but stdin is a TTY (no token piped in)"
    info 'usage:  echo "npm_xxxx" | ./scripts/publish.sh --token-stdin'
    exit 1
  fi
  EPHEMERAL_TOKEN="$(cat)"
  EPHEMERAL_TOKEN="${EPHEMERAL_TOKEN%$'\n'}"   # strip trailing newline
  if [ -z "$EPHEMERAL_TOKEN" ]; then
    fail "empty token on stdin"
    exit 1
  fi
  case "$EPHEMERAL_TOKEN" in
    npm_*) ;;
    *)
      fail "token does not look like an npm token (must start with 'npm_')"
      exit 1
      ;;
  esac
  # Backup existing ~/.npmrc once (in case user wants to revert)
  if [ -f "$HOME/.npmrc" ] && [ -z "$NPMRC_BACKUP" ]; then
    NPMRC_BACKUP="$HOME/.npmrc.publish-backup-$(date +%s)"
    cp -p "$HOME/.npmrc" "$NPMRC_BACKUP"
  fi
  REG_PATH="${REGISTRY#https:}"; REG_PATH="${REG_PATH#http:}"
  echo "${REG_PATH}:_authToken=${EPHEMERAL_TOKEN}" >> "$HOME/.npmrc"
  chmod 600 "$HOME/.npmrc"
  ok "wrote ephemeral token to ~/.npmrc (will be removed after publish)"
elif [ -n "$OTP" ]; then
  ok "using --otp ${OTP:0:2}**** (be quick, OTP rotates every 30s)"
else
  # Default: assume ~/.npmrc has the right token already.
  if grep -q "^//${REGISTRY#https://}.*_authToken=" "$HOME/.npmrc" 2>/dev/null; then
    ok "found auth token in ~/.npmrc for $REGISTRY"
  else
    warn "no auth token in ~/.npmrc for $REGISTRY"
    info "publish will likely fail. Either:"
    info "  - run with --token-stdin (echo 'npm_xxx' | $0 --token-stdin), or"
    info "  - run with --otp 123456 (if you have 2FA), or"
    info "  - first save your token: echo \"//${REGISTRY#https://}:_authToken=npm_xxx\" >> ~/.npmrc && chmod 600 ~/.npmrc"
    info "see scripts/PUBLISH.md for token generation steps."
    printf "  continue anyway? [y/N] "
    read -r reply
    case "$reply" in
      y|Y|yes|YES) ;;
      *) fail "aborted by user"; exit 4 ;;
    esac
  fi
fi

# Whoami sanity check (tells us auth is at least syntactically valid)
if WHO="$(npm whoami --registry="$REGISTRY" 2>/dev/null)"; then
  ok "logged in as $C_BOLD$WHO$C_RESET on $REGISTRY"
else
  warn "npm whoami failed; will let publish surface the real error"
fi

# ===================================================================
# 3. BUILD
# ===================================================================

step "build"
npm run build
ok "build OK"

# ===================================================================
# 4. SMOKE TEST
# ===================================================================

if [ "$SKIP_SMOKE" -eq 0 ]; then
  step "smoke test"
  if [ -x test/smoke.sh ]; then
    bash test/smoke.sh > /tmp/aibaton-smoke-$$.log 2>&1 || {
      fail "smoke tests failed"
      tail -40 /tmp/aibaton-smoke-$$.log
      rm -f /tmp/aibaton-smoke-$$.log
      exit 2
    }
    rm -f /tmp/aibaton-smoke-$$.log
    ok "smoke tests passed"
  else
    warn "no test/smoke.sh found; skipping"
  fi
else
  warn "smoke tests skipped (--skip-smoke)"
fi

# ===================================================================
# 5. PACK PREVIEW + USER CONFIRM
# ===================================================================

step "pack preview"
npm pack --dry-run 2>&1 | grep -E "(npm notice|^[A-Za-z])" | head -40

if [ "$DRY_RUN" -eq 1 ]; then
  step "DRY RUN — stopping here, nothing published"
  ok "all preflight + build + smoke + pack passed"
  exit 0
fi

printf '\n  %sready to publish %s%s@%s%s to %s%s%s with tag %s%s%s%s\n' \
  "$C_BOLD" "$C_RESET" "$PKG_NAME" "$PKG_VERSION" "$C_BOLD" \
  "$C_MAGENTA" "$REGISTRY" "$C_RESET" "$C_MAGENTA" "$DIST_TAG" "$C_RESET" "$C_RESET"
printf '  proceed? [y/N] '
read -r reply
case "$reply" in
  y|Y|yes|YES) ;;
  *) fail "aborted by user"; exit 4 ;;
esac

# ===================================================================
# 6. PUBLISH
# ===================================================================

step "publish"
PUBLISH_ARGS=(--registry="$REGISTRY" --access public --tag "$DIST_TAG")
if [ -n "$OTP" ]; then
  PUBLISH_ARGS+=(--otp "$OTP")
fi
npm publish "${PUBLISH_ARGS[@]}"
ok "publish OK"

# ===================================================================
# 7. POST-PUBLISH VERIFY
# ===================================================================

step "post-publish verification"
sleep 2  # let npm replicate
if PUBLISHED_VERSION="$(npm view "$PKG_NAME" version --registry="$REGISTRY" 2>/dev/null)"; then
  if [ "$PUBLISHED_VERSION" = "$PKG_VERSION" ]; then
    ok "verified: $PKG_NAME@$PUBLISHED_VERSION is live on $REGISTRY"
  else
    warn "registry latest is $PUBLISHED_VERSION (expected $PKG_VERSION). Caches may catch up shortly."
  fi
else
  warn "npm view failed (registry replication lag is normal); check https://www.npmjs.com/package/$PKG_NAME in 1-2 min"
fi

# ===================================================================
# 8. NEXT STEPS
# ===================================================================

step "next steps (manual)"
cat <<EOF
  1. Tag the release in git:
       git tag v$PKG_VERSION
       git push origin v$PKG_VERSION

  2. Create GitHub release at:
       https://github.com/sappfire/$PKG_NAME/releases/new?tag=v$PKG_VERSION
     Use the changelog body from CHANGELOG.md (or LAUNCH.md §9).

  3. Validate from a clean machine perspective:
       cd \$(mktemp -d) && npm i -g $PKG_NAME && $PKG_NAME --version

  4. Begin LAUNCH.md rollout cadence:
       - 即刻 / V2EX (CN)
       - Show HN / Reddit / X / PH (EN)

  npm page:    https://www.npmjs.com/package/$PKG_NAME
  GitHub repo: https://github.com/sappfire/$PKG_NAME
EOF

ok "all done — well done."
