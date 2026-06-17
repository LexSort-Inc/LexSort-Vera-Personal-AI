# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App  
**Parent Brand:** LexSort Inc.  
**Current Versions:** VERA Freeware v1.1.6 ✅ · VERA Pro v1.0.5 (CI fix committed, awaiting GH Actions limits)  
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama  
**Launch Date:** July 1, 2026  

---

## 📚 Documentation Map

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, repo structure, mermaid diagram |
| [SECURITY.md](docs/SECURITY.md) | Tauri sandbox, capability whitelisting, Ed25519 license gate |
| [BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md) | Dev commands, CI/CD pipeline, versioning checklist |
| [UPDATE_SYSTEM.md](docs/UPDATE_SYSTEM.md) | Custom update flow: discovery → download → install |
| [AI_ENGINE.md](docs/AI_ENGINE.md) | Ollama onboarding, model selection, SHA hashes |
| [MARKETING_AND_ROADMAP.md](docs/MARKETING_AND_ROADMAP.md) | Marketing tasks, module roadmap, community strategy |
| [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) | Hour-by-hour launch day checklist |
| [TESTER_SETUP.md](TESTER_SETUP.md) | Beta tester onboarding guide |
| [CONTRACTS.md](CONTRACTS.md) | IPC contract definitions |
| [KEY_MANIFEST.md](KEY_MANIFEST.md) | Cryptographic key reference |

---

## ⚡ Quick Reference

### Run in dev mode
```bash
cd lexsort-personal-ai && npm run tauri dev
```

### Release a new version (Freeware)
```bash
# 1. Bump version in: lexsort-personal-ai/tauri.conf.json, package.json, Cargo.toml
# 2. Bump website/api/manifest.json to new version
# 3. Commit & push, then tag:
git tag v1.1.7 && git push origin v1.1.7
# 4. Deploy website immediately after:
netlify deploy --prod --dir=website
```

### Release a new version (Pro)
```bash
# In /02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/
# 1. Bump version in: lexsort-vera-pro/tauri.conf.json, package.json, Cargo.toml
# 2. Commit & push, then tag:
git tag v1.0.5 && git push origin v1.0.5
```

### Deploy the website to lexsort.com

> ⚠️ **GitHub is NOT connected to Netlify and must NEVER be connected.**
> GitHub auto-deploy causes build failures (Netlify tries to bundle Stripe functions
> which don't resolve on Netlify's servers). CLI-only is the correct workflow.

**Step 1 — Ensure netlify-cli is installed (one-time, already done as of Jun 17):**
```bash
npm install -g netlify-cli
```

**Step 2 — Deploy:**
```bash
# From repo root — this is the ONLY correct deploy method
netlify deploy --prod --dir=website
```

The site is already linked (`.netlify/state.json` in the repo). Logged in as william@lexsort.com.

**Site ID:** `charming-zuccutto-05cf6a` (lexsort.com)  
**Netlify dashboard:** https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys  
**If unlinking happens:** `netlify link --id charming-zuccutto-05cf6a`  
**If not logged in:** `netlify login`

---

## ⚠️ Outstanding Items (as of Jun 17, 2026)

### 1. Windows CI — NEEDS VERIFICATION when GitHub Actions limits reset

All fixes are committed to main on the Pro repo. v1.0.11 was the last test tag but couldn't run due to GitHub Actions minute limits.

**What was fixed in `.github/workflows/release.yml` (Pro repo):**
- Per-platform Node.js version in matrix: macOS/Linux = Node 20, Windows = Node 24
- `npm install -g node-gyp@latest` step added BEFORE `npm ci` (Windows only)
- `GYP_MSVS_VERSION=2022` and `npm_config_msvs_version=2022` env vars on the `npm ci` step
- Removed broken `npm config set msvs_version` step (not a valid npm option in npm v10+)

**What was fixed in `lexsort-vera-pro/src-tauri/Cargo.toml`:**
- Added `winreg = "0.52"` as `[target.'cfg(target_os = "windows")'.dependencies]`
- Crate was used in `src/lib.rs:1046` for Windows registry machine ID but was missing

**To verify:** When limits reset, push a new Pro tag and confirm Windows passes.  
**Actions URL:** https://github.com/Lexsort-Core/Lexsort-Vera-Pro/actions

### 2. Pro "Update Core" button — FIXED (Jun 17)

The Settings → Updates → "Update Core" button was hardcoded as `disabled` with "Coming soon" tooltip.
Fixed by passing `onDownloadCoreUpdate`, `onInstallCoreUpdate`, `coreUpdateDownloadStatus`,
`coreUpdateDownloadPercent` props from `App.tsx` → `ChatModule.tsx`.

**Now shows:** idle → clickable Update Core → downloading % → Install & Restart (green)

### 3. Freeware in-app update — VERIFIED WORKING ✅

Freeware v1.1.4 → v1.1.6 update downloaded and installed successfully via the in-app update UI.
"Install & Restart Now" / "Install Later" buttons both present and functional.

### 4. LICENSE_SIGNING_PRIVATE_KEY — rotation needed

The old Ed25519 private key was in `scripts/generate-test-keys.js` and is now in git history.

**To rotate (do when convenient):**
1. Generate new Ed25519 keypair
2. Update `LICENSE_SIGNING_PRIVATE_KEY` in Netlify env vars (dashboard)
3. Update matching public key in Tauri app source
4. Rebuild + release new version
> ⚠️ Rotating breaks all existing Pro licenses — coordinate timing carefully.

### 5. Pro version files not bumped

CI tags v1.0.6 through v1.0.11 were workflow-fix-only. Pro version files still show **v1.0.5**.  
After Windows CI is confirmed passing, bump `tauri.conf.json`, `package.json`, `Cargo.toml` → push proper release tag.

---

## 🏗 Repo Structure (Top Level)

```
Lexsort-personal-ai/          # Freeware repo (public)
├── lexsort-personal-ai/      # Tauri app (React + Rust)
├── website/                  # Static marketing pages + API
├── netlify/                  # Serverless functions (Stripe, uptime)
├── discord-bot/              # License bot + slash commands
├── scripts/                  # Dev utilities (generate-test-keys.js — needs .env.local)
└── docs/                     # This doc set

Lexsort-Vera-Pro/             # Pro repo (private)
├── lexsort-vera-pro/         # Tauri app (React + Rust) 
│   └── src-tauri/Cargo.toml  # ← winreg = "0.52" added Jun 17
└── .github/workflows/        # CI/CD — per-platform Node versions, node-gyp pre-install
```

---

*VERA is a LexSort Inc. project. All rights reserved.*
