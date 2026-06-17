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

> ✅ **Netlify is connected to GitHub** (`Lexsort-Core/LexSort-Vera-Personal-AI`, branch `main`, publish dir `website/`).
> Every `git push origin main` automatically deploys lexsort.com. No manual deploy needed.

**Site ID:** `charming-zuccutto-05cf6a`  
**Publish dir:** `website/` (defined in `netlify.toml`)  
**Netlify dashboard:** https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys

### How it works

When you push any commit to `main` that touches the `website/` directory, Netlify detects the change and auto-deploys within ~30 seconds. The deploy log is visible in the dashboard above.

### Manual fallback (if auto-deploy ever fails)

```bash
# From the repo root
netlify deploy --prod
```

Or drag the `website/` folder to the deploy zone at:  
https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys

### What to deploy after a version bump
After every release, the following files in `website/` will already be included in the auto-deploy:
- `website/api/manifest.json` — tells existing users there’s a new version
- `website/download.html` — updated download links
- Any new screenshots in `website/assets/screenshots/`

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
