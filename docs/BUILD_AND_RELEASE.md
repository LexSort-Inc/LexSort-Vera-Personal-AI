# VERA — Build & Release

---

## ⚠️ CI Budget Rules — Read Before Pushing Tags

GitHub Actions minutes are a limited resource. macOS runners cost **10× Linux**, Windows **2× Linux**.  
**A full 4-platform publish = ~$1.60 in runner minutes.**

### The 3 tiers — use the cheapest one that fits

| Situation | What to do | Cost |
|---|---|---|
| Debugging a build error | **`workflow_dispatch`** → `test-build-windows` on `main` | ~$0.32 |
| Only Windows failed, others passed | **"Re-run failed jobs"** in GitHub Actions UI | ~$0.32 |
| Only Windows failed, need a re-release | **`workflow_dispatch`** → `build-windows-only` with the tag | ~$0.32 |
| Code is confirmed working, official release | Push a `v*` tag — triggers full 4-platform publish | ~$1.60 |

### ❌ Never do this
- Push multiple `v*` tags to debug CI (we burned v1.0.7–v1.0.11 this way)
- Push a version tag before verifying Rust compiles locally (`cargo check`)
- Retry a failing publish without understanding why it failed first

### ✅ Pre-tag checklist
1. `cargo check` in `src-tauri/` — Rust must compile clean
2. `npx tsc --noEmit` — TypeScript must compile clean  
3. Contract tests pass: `cargo test` (pre-commit hook runs this automatically)
4. Only then: `git tag vX.X.X && git push origin vX.X.X`

### Workflows available
| Workflow | Trigger | Purpose |
|---|---|---|
| `publish` | `v*` tag | Full 4-platform release |
| `build-windows-only` | Manual dispatch | Re-build Windows for existing tag |
| `test-build-windows` | Manual dispatch | Debug Windows build (no release created) |
| `contracts` | Every push | Fast contract tests (2 min, cheap) |

---

## Daily Dev Commands

```bash
# Run the full app in dev mode (hot reload)
cd vera-freeware
npm run tauri dev

# Build frontend only (type-check + bundle)
npm run build

# Check Rust backend compiles
cd src-tauri
cargo check

# Run Rust contract/unit tests
cargo test
```

---

## Release Pipeline

Both Freeware and Pro use `tauri-apps/tauri-action@v0` via GitHub Actions.  
The matrix covers **4 targets per repo:**

| Runner | Output |
|---|---|
| `macos-latest` (aarch64) | `.dmg` (Apple Silicon) |
| `macos-latest` (x86_64) | `.dmg` (Intel) |
| `ubuntu-22.04` | `.AppImage` + `.deb` |
| `windows-latest` | `.msi` (Windows is **manual-only** — see AGENTS.md CI cost policy) |

The workflow is triggered automatically by any tag matching `v*`.

> ⚠️ **Intel Mac regression (Aug 2026):** v1.1.7 added `git2` (for update/changelog
> checks), whose `libgit2-sys → libssh2-sys → openssl-sys` chain requires a system
> OpenSSL. The Intel (`x86_64-apple-darwin`) job fails with *"Could not find directory
> of OpenSSL installation"* — which is why **v1.1.7 through v1.1.11 shipped no Intel
> `.dmg`**. Fixed in Cargo.toml by enabling `vendored-openssl` on `git2` (builds
> OpenSSL from source; no system dependency). Verified locally via `cargo check` +
> `cargo test`. **Any new tag must verify the Intel `.dmg` is present in the release
> before announcing.**

---

## Version Bump Checklist (run before every tag)

Bump the version number in **all 3 files per repo** — they must stay in sync:

### Freeware (`vera-freeware/`)

- [ ] `vera-freeware/src-tauri/tauri.conf.json` → `"version"`
- [ ] `vera-freeware/src-tauri/Cargo.toml` → `version =`
- [ ] `vera-freeware/package.json` → `"version"`

### Pro (`Lexsort-Vera-Pro/`)

- [ ] `lexsort-vera-pro/src-tauri/tauri.conf.json` → `"version"`
- [ ] `lexsort-vera-pro/src-tauri/Cargo.toml` → `version =`
- [ ] `lexsort-vera-pro/package.json` → `"version"`

### After binaries are uploaded to GitHub Releases

- [ ] **Verify every platform binary exists in the release** — esp. Intel `.dmg` (`x86_64-apple-darwin` job can fail silently while others pass)
- [ ] Update `website/api/manifest.json` → bump `version` field to new version
- [ ] Update download links in `website/download.html` and `website/js/download-detector.js` (and `VERSION_INTEL` if applicable)
- [ ] Update `netlify/functions/uptime-monitor.js` with new expected binary URLs
- [ ] Deploy website: `netlify deploy --prod --dir=website`

---

## Tagging & Triggering CI

```bash
# Freeware
git add -A && git commit -m "chore: bump to v1.2.0"
git push
git tag v1.2.0
git push origin v1.2.0

# Pro (same pattern)
git add -A && git commit -m "chore: bump to v1.0.13"
git push
git tag v1.0.13
git push origin v1.0.13
```

CI will: compile all targets → codesign macOS (via Apple secrets) → notarize → create GitHub Release → upload all binaries.

> ⚠️ **Never force-move a release tag after the release exists.** Deleting + re-pushing
> a tag that a release is attached to orphans the release — all download URLs 404
> permanently (this destroyed the v1.0.1–v1.0.12 Pro binaries; 5 of 9 v1.0.12 files
> were only recoverable from local Downloads). If a release needs fixing, create a new
> version instead.

---

## Website Deployment (Netlify)

> ❌ **DO NOT connect Netlify to GitHub.** GitHub auto-deploy triggers a build that
> fails because Netlify tries to bundle the Stripe serverless functions, which
> cannot resolve the `stripe` npm dependency on Netlify's build servers.
> **CLI-only is the correct and proven deployment method.**

**Site ID:** `charming-zuccutto-05cf6a`  
**Netlify dashboard:** https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys  
**Site is already linked** via `.netlify/state.json` in the repo.

### One-time setup (if netlify-cli is not installed)

```bash
npm install -g netlify-cli
# Verify you're logged in:
netlify status
# If not logged in:
netlify login
# If site is unlinked:
netlify link --id charming-zuccutto-05cf6a
```

### Deploy command (run after every website change)

```bash
# From the repo root — deploys only the website/ static folder + functions
netlify deploy --prod --dir=website
```

The CLI uploads `website/` as static files and bundles `netlify/functions/` locally
(where `node_modules` exist). This is why it works but GitHub auto-deploy does not.

### When to deploy
After any commit that changes files in `website/`:
- HTML page edits (faq, freeware, vera-pro, download pages)
- New screenshot assets in `website/assets/screenshots/`
- `website/api/manifest.json` version bump (triggers in-app update for users)

---

## Required GitHub Secrets (both repos)

| Secret | Purpose |
|---|---|
| `TAURI_PRIVATE_KEY` | Ed25519 key for signing update manifests |
| `TAURI_PRIVATE_KEY_PASSWORD` | Passphrase for above |
| `APPLE_CERTIFICATE_BASE64` | macOS signing certificate (base64) |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate import password |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple team ID |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: ...` string |

---

## Manifest.json Update (triggers in-app update prompt)

After binaries are live on GitHub Releases, update the CDN manifest so existing users get the update notification:

```json
// website/api/manifest.json
{
  "version": "1.2.0",
  "freeware_download": {
    "windows": "https://github.com/LexSort-Inc/LexSort-Vera-Personal-AI/releases/download/v1.1.11/LexSort.VERA_1.1.11_x64_en-US.msi",
    "macos_arm": "https://github.com/LexSort-Inc/LexSort-Vera-Personal-AI/releases/download/v1.1.11/LexSort.VERA_1.1.11_aarch64.dmg",
    "macos_x64": "https://github.com/LexSort-Inc/LexSort-Vera-Personal-AI/releases/download/v1.1.11/LexSort.VERA_1.1.11_x64.dmg",
    "linux": "https://github.com/LexSort-Inc/LexSort-Vera-Personal-AI/releases/download/v1.1.11/LexSort.VERA_1.1.11_amd64.AppImage"
  },
  "notes": "Fix Ollama daemon lifecycle."
}
```

> **Note:** the manifest mirrors the *intended* binary set. As of v1.1.11 the Intel
> `.dmg` is missing (see Intel regression above) — the website routes Intel Macs to
> v1.1.6. v1.2.0 shipped with `vendored-openssl` — Intel `.dmg` resumed; committed to **verify the x64 artifact present in the v1.2.0 release** before removing the fallback note.

After updating manifest.json, **deploy the website** (see above).

---

*See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md)*
