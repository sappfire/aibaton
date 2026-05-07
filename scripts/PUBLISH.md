# Publish Playbook

Everything needed to publish a new version of `aibaton` to npm. Read once, then `scripts/publish.sh` does the rest.

---

## TL;DR — quickest path

```sh
# Bump version, then publish (assumes ~/.npmrc already has a token)
cd aibaton
npm version patch          # 0.2.0 → 0.2.1   (or `minor` / `major`)
git push --follow-tags
npm run release            # = ./scripts/publish.sh
```

If you see `401 Unauthorized` or `403`, your token isn't configured — jump to **§ Token setup** below.

---

## When to publish

- **Patch (0.2.0 → 0.2.1)**: bug fixes, doc-only changes, no behavior change.
- **Minor (0.2.0 → 0.3.0)**: new features, backward compatible.
- **Major (0.2.0 → 1.0.0)**: breaking change to CLI flags, file format, or behavior.

Run `npm version patch|minor|major` — it edits `package.json` *and* creates a git tag.

---

## Token setup (do this once every 90 days)

`aibaton` is published to npmjs.org, which requires either:

- A **Granular Access Token** with **Bypass 2FA** enabled, *or*
- An **OTP** from your Authenticator App (with 2FA enabled on your account)

The Granular Token route is easier for repeat publishes.

### Generate a token (3 minutes)

1. Open **<https://www.npmjs.com/settings/YOUR_USERNAME/tokens/new>**
   (replace `YOUR_USERNAME`)

2. Fill the form **exactly** as below — every checkbox matters:

   | Field | Value | Why |
   |---|---|---|
   | **Token name** | `aibaton-publish-2026q2` | quarter-named so future-you knows what's expiring |
   | **Token expiration** | `90 days` | balances security and convenience |
   | **Allowed IP ranges** | empty | (any IP) |
   | **Permissions: Repository** | n/a | this is npm, not GitHub |
   | **Permissions: Packages and scopes → Permissions** | **Read and write** | publish needs write |
   | **Select packages** | **All packages** | aibaton may not yet be in your packages list before first publish |
   | **⭐ Bypass 2FA when publishing** | ✅ **must be checked** | this is the #1 reason publishes fail |
   | **Permissions: Organizations** | (default) No access | |

3. Click **Generate Token** at the bottom.

4. **Copy the `npm_xxxx…` string immediately** — it's shown exactly once.

### Store the token (~/.npmrc, the safe long-term home)

```sh
# Replace npm_xxxxxxxx with your real token
echo "//registry.npmjs.org/:_authToken=npm_xxxxxxxx" >> ~/.npmrc
chmod 600 ~/.npmrc
ls -la ~/.npmrc        # verify: must show -rw-------
```

After this, `npm publish` Just Works for 90 days. You don't need to think about tokens again until expiration.

> **Why `chmod 600`?** Without it, any other user on the same machine can read your token. With it, only your OS user can. Combined with your laptop's full-disk encryption, this is a sensible default for a personal project.

> **What about iCloud / Time Machine syncing `~/.npmrc`?** If you keep your home directory in iCloud Drive, exclude `~/.npmrc` from sync. Time Machine encrypted backups are fine.

### Rotate when it expires (~90 days)

When `npm publish` starts saying `401 Unauthorized`, your token expired. Repeat the steps above, then:

```sh
# Replace npm_xxxxxxxx with the NEW token, and the OLD one with what's currently in ~/.npmrc
sed -i '' '/^\/\/registry\.npmjs\.org\/:_authToken=/d' ~/.npmrc
echo "//registry.npmjs.org/:_authToken=npm_NEW_TOKEN" >> ~/.npmrc
chmod 600 ~/.npmrc
```

---

## How to use `publish.sh`

The script does **everything** for you:

1. Preflight: clean git tree, on `main`, version isn't already published, deps installed
2. `npm run build`
3. `bash test/smoke.sh` (must pass)
4. `npm pack --dry-run` to show what's being uploaded — **interactive confirm before publish**
5. `npm publish`
6. Post-publish verification (`npm view` to confirm registry replicated)
7. Print next-step checklist (git tag, GitHub release, social channels)

### Mode A — `~/.npmrc` already has token (recommended for repeat publishes)

```sh
./scripts/publish.sh
# or via npm alias:
npm run release
```

This is the path you'll use 99% of the time after first-time token setup.

### Mode B — One-shot ephemeral token (recommended for borrowed machines / CI)

```sh
echo "npm_xxxxxxxx" | ./scripts/publish.sh --token-stdin
```

The token is **temporarily** appended to `~/.npmrc`, used for the publish, and **automatically removed** afterward — even if the publish fails.

### Mode C — OTP path (you have 2FA enabled and an Authenticator App)

```sh
# Be quick — OTP rotates every 30 seconds
./scripts/publish.sh --otp 123456
```

Replace `123456` with the current 6-digit code from your Authenticator (Google Authenticator / 1Password / etc.).

### Other useful flags

```sh
./scripts/publish.sh --dry-run            # all checks + pack, but never publishes
./scripts/publish.sh --tag next           # publish under "next" dist tag (no @latest)
./scripts/publish.sh --skip-smoke         # skip smoke (NOT recommended)
./scripts/publish.sh --skip-git-check     # allow uncommitted / non-main (NOT recommended)
./scripts/publish.sh --registry https://my-private-registry.com/  # custom registry
```

---

## After a successful publish

The script ends with a checklist; here's the same list verbatim so you don't lose it:

1. **Tag and push the release in git**:

   ```sh
   git tag v$(node -p "require('./package.json').version")
   git push origin --tags
   ```

   (`npm version patch|minor|major` does this automatically *before* publish — but if you bumped the version by hand, tag manually now.)

2. **Create a GitHub release** at:

   ```
   https://github.com/sappfire/aibaton/releases/new
   ```

   Pick the tag you just pushed. Body = the relevant section of `CHANGELOG.md`, or use `LAUNCH.md §9` as the template for first-time release notes.

3. **Sanity-check from a clean perspective** — install on a fresh shell to make sure it really works:

   ```sh
   cd $(mktemp -d) && npm i -g aibaton && aibaton --version
   ```

4. **Run the launch playbook** (only on milestone releases like v1.0):
   - 即刻 / V2EX 分享创造 (CN audience)
   - Show HN / Reddit r/cursor + r/ClaudeAI / X thread / Product Hunt (EN audience)
   - All copy is pre-written in `LAUNCH.md`

---

## Troubleshooting

### `403 Forbidden — Two-factor authentication or granular access token with bypass 2fa enabled is required`

Your token (or login session) doesn't have the **Bypass 2FA** flag.

**Fix**: re-generate token, ✅ check the **Bypass 2FA when publishing** box (see Token setup §2 above).

### `404 Not Found - PUT https://registry.npmjs.org/<pkg>`

npm uses 404 to mean "you don't have permission to write this package" (so it doesn't reveal whether the name is taken). Causes:

- Token doesn't have **Read and write** permission (only Read)
- Token's **Select packages** is set to specific packages but yours isn't in the list
- For a brand-new package: select **All packages** instead

### `401 Unauthorized`

Token is expired, missing, or wrong. Run:

```sh
cat ~/.npmrc
# Should contain a line like: //registry.npmjs.org/:_authToken=npm_xxxxxxx
```

If absent or expired, regenerate per Token setup §2.

### `EOTP — Required: one-time password`

You used `--otp 123456` but the OTP already rotated (30 seconds passed). Look at your Authenticator again, run the command again with the new digits.

### `EPUBLISHCONFLICT` / `cannot publish over the previously published versions`

You're trying to publish the same version that's already on npm.

**Fix**: bump the version with `npm version patch|minor|major`, then publish again.

### `git working tree has uncommitted changes`

The script blocks this on purpose — publishing source-out-of-sync-with-git is a common cause of "but it works on my machine" bug reports.

**Fix**: `git status` to see, then `git add . && git commit -m "..."` (or `git stash` if WIP).

If you really need to publish dirty (e.g. emergency hotfix), pass `--skip-git-check`. **Avoid in normal flow.**

### Smoke tests fail

The `test/smoke.sh` output is dumped to your terminal. Read it. Common causes:

- Forgot to `npm run build` after editing `src/` (the script does this for you, but if you ran it manually, the dist may be stale)
- A real bug in your changes — fix it and try again

---

## Emergency: token leaked

If you typed a token into a command line by accident (it's now in `~/.zsh_history`), or you committed one, or you screenshot one to a chat:

1. **Immediately revoke** at <https://www.npmjs.com/settings/YOUR_USERNAME/tokens> — find the token, click "Revoke".

2. Check the GitHub commit feed at <https://github.com/sappfire/aibaton/commits/main>; if you accidentally committed a token, GitHub's secret scanning often auto-revokes too, but don't rely on it.

3. Generate a new token per Token setup.

4. Optionally, scrub your shell history:

   ```sh
   # macOS zsh
   sed -i '' '/npm_/d' ~/.zsh_history
   ```

5. If you suspect actual misuse (npm publish from somewhere you didn't run it), check <https://www.npmjs.com/settings/YOUR_USERNAME/audit-log>.

---

## Useful one-liners

```sh
# What's the latest version of aibaton on npm right now?
npm view aibaton version

# What does my token allow?
npm token list                           # all tokens (some output)
npm whoami                               # current login

# What would a publish look like? (no actual publish)
npm pack --dry-run

# Manually pack into a tarball (useful for sharing pre-publish builds)
npm pack
# → aibaton-0.2.1.tgz

# Install from a tarball to test (in another tmp dir)
cd $(mktemp -d) && npm i /path/to/aibaton-0.2.1.tgz && npx aibaton --help

# Unpublish (only allowed within 24h of publish, only if no one depends on it)
npm unpublish aibaton@0.2.1                  # specific version
npm unpublish aibaton --force                # everything (DANGER)
```

---

## Background: why publishing is annoying (and how the script hides it)

npm requires 2FA for all publishes since 2024. There are exactly four ways to satisfy it:

| Method | Where token lives | Each-publish friction | Best for |
|---|---|---|---|
| Granular token in `~/.npmrc` | Local file | None | **Recommended for individuals** |
| Granular token via stdin | Memory only (then deleted) | Generate + revoke per use | Borrowed machine, CI |
| OTP via Authenticator App | Nowhere persistent | 6 digits per publish | Already have 2FA habit |
| Web-flow `npm login` then publish | Login session in `~/.npmrc` | Re-login when expires | Rare; often hits the same 2FA wall |

`scripts/publish.sh` supports the first three — pick whichever fits your habit.
