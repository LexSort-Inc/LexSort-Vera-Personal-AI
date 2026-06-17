# VERA — Build & Release

---

## Daily Dev Commands

```bash
# Run the full app in dev mode (hot reload)
cd lexsort-personal-ai
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
| `windows-latest` | `.msi` |

The workflow is triggered automatically by any tag matching `v*`.

---

## Version Bump Checklist (run before every tag)

Bump the version number in **all 3 files per repo** — they must stay in sync:

### Freeware (`Lexsort-personal-ai/`)

- [ ] `lexsort-personal-ai/src-tauri/tauri.conf.json` → `"version"`
- [ ] `lexsort-personal-ai/src-tauri/Cargo.toml` → `version =`
- [ ] `lexsort-personal-ai/package.json` → `"version"`

### Pro (`Lexsort-Vera-Pro/`)

- [ ] `lexsort-vera-pro/src-tauri/tauri.conf.json` → `"version"`
- [ ] `lexsort-vera-pro/src-tauri/Cargo.toml` → `version =`
- [ ] `lexsort-vera-pro/package.json` → `"version"`

### After binaries are uploaded to GitHub Releases

- [ ] Update `website/api/manifest.json` → bump `version` field to new version
- [ ] Update download links in `website/download.html` and `website/js/download-detector.js`
- [ ] Update `netlify/functions/uptime-monitor.js` with new expected binary URLs

---

## Tagging & Triggering CI

```bash
# Freeware
git add -A && git commit -m "chore: bump to v1.1.6"
git push
git tag v1.1.6
git push origin v1.1.6

# Pro (same pattern)
git add -A && git commit -m "chore: bump to v1.0.5"
git push
git tag v1.0.5
git push origin v1.0.5
```

CI will: compile all targets → codesign macOS (via Apple secrets) → notarize → create GitHub Release → upload all binaries.

---

## Website Deployment (Netlify)

> ⚠️ **CRITICAL:** The Netlify site for `lexsort.com` is NOT connected to GitHub.
> Git pushes do NOT auto-deploy the website. You must deploy manually after every `website/` change.

**Site ID:** `charming-zuccutto-05cf6a`  
**Publish dir:** `website/` (defined in `netlify.toml`)

### Deploy command

```bash
# From the repo root (netlify.toml sets publish = "website" automatically)
netlify deploy --prod

# If netlify is not in PATH (common in AI/terminal sessions), install first:
npm install -g netlify-cli
netlify login   # opens browser to authenticate (one-time)
netlify deploy --prod
```

### Manual fallback (no CLI needed)
1. Open https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys  
2. Drag and drop the `website/` folder into the deploy zone

### What triggers a website deploy?
Any change to files in `website/` — HTML pages, CSS, screenshots, `api/manifest.json` — must be followed by a manual deploy. This includes:
- New screenshot assets in `website/assets/screenshots/`
- FAQ or page content changes
- Manifest version bumps (so in-app updater picks up new version)

### Connecting Netlify to GitHub (recommended future action)
To enable auto-deploy, go to:  
https://app.netlify.com/projects/charming-zuccutto-05cf6a/configuration/deploys  
Under "Build settings" → connect to the `Lexsort-Core/LexSort-Vera-Personal-AI` repo, branch `main`, publish dir `website`.

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
  "version": "1.1.6",
  "freeware_download": {
    "windows": "https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.6/LexSort-Personal-AI_1.1.6_x64-setup.msi",
    "macos_arm": "https://github.com/Lexsort-Core/.../v1.1.6/LexSort-Personal-AI_1.1.6_aarch64.dmg",
    "macos_x64": "https://github.com/Lexsort-Core/.../v1.1.6/LexSort-Personal-AI_1.1.6_x64.dmg",
    "linux": "https://github.com/Lexsort-Core/.../v1.1.6/lexsort-personal-ai_1.1.6_amd64.AppImage"
  },
  "notes": "Quick Organizer month view fix. Windows CI fixed (MSVC 2022 env)."
}
```

After updating manifest.json, **deploy the website** (see above).

---

*See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md)*
