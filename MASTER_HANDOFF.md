# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App  
**Parent Brand:** LexSort Inc.  
**Current Versions:** VERA Freeware v1.1.6 ✅ · VERA Pro v1.0.5 (module architecture complete)  
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

### Release a new Freeware version
```bash
# 1. Bump version in: tauri.conf.json, package.json, Cargo.toml
# 2. Bump website/api/manifest.json to new version
# 3. Commit & push, then tag:
git tag v1.1.7 && git push origin v1.1.7
# 4. Deploy website immediately after:
netlify deploy --prod --dir=website
```

### Release a new Pro version
```bash
# In /02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/
# 1. Bump version in: lexsort-vera-pro/tauri.conf.json, package.json, Cargo.toml
# 2. Commit & push, then tag:
git tag v1.0.6 && git push origin v1.0.6
```

### Build a standalone module
```bash
# From Lexsort-personal-ai repo root:
./scripts/build-module.sh promailer           # build + local deploy
./scripts/build-module.sh promailer --sign    # build + Ed25519 sign + local deploy
# Requires: .env.local with MODULE_SIGNING_PRIVATE_KEY=<128-char hex>
# Key is also in Netlify env vars (MODULE_SIGNING_PRIVATE_KEY)
```

### Deploy the website to lexsort.com

> ⚠️ **GitHub is NOT connected to Netlify and must NEVER be connected.**
> GitHub auto-deploy causes build failures (Netlify tries to bundle Stripe functions
> which don't resolve on Netlify's servers). CLI-only is the correct workflow.

```bash
# From repo root — this is the ONLY correct deploy method
netlify deploy --prod --dir=website
```

The site is already linked (`.netlify/state.json` in the repo). Logged in as william@lexsort.com.

**Site ID:** `charming-zuccutto-05cf6a` (lexsort.com)  
**Netlify dashboard:** https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys  
**If unlinking happens:** `netlify link --id charming-zuccutto-05cf6a`  

---

## 🏛 Architecture State (as of Jun 17, 2026)

### VERA Pro — Core + Module System

```
VERA Pro core (always bundled):
  ✅ Chat + Sidebar
  ✅ Quick Organizer (free tier feature, always included)
  ✅ Module Store UI (browse + install from CDN)
  ✅ Module Loader (reads ~/.lexsort/installed-modules.json, injects <script>)

Standalone downloadable modules (at ~/.lexsort/modules/<name>/bundle.js):
  ✅ promailer       v1.0.0  90KB   IIFE + CSS inlined
  ✅ guardian-watch  v1.0.0  44KB   IIFE (inline styles)
  ✅ research-lab    v1.0.0  84KB   IIFE + CSS inlined

CDN (modules.lexsort.com):
  ✅ /index.json       — 5-module catalog (signed, HTTP 200)
  ✅ /index.json.sig   — Ed25519 signature, 64 bytes (HTTP 200)
  ⏳ /modules/*.vera-module — signed ZIPs not yet uploaded

Module signing keypair (rotated Jun 17, 2026):
  Public:  fc3c7bdc8c24f0afdf93624ae48d4fb81323301b425293eae99cf63bd50299d1
  Private: in .env.local (gitignored) + Netlify MODULE_SIGNING_PRIVATE_KEY env var
  Embedded in: lexsort-vera-pro/src-tauri/lexsort_public_key.bin
```

### VERA Freeware — Calendar-First AI

```
  ✅ v1.1.6 live at lexsort.com/download
  ✅ In-app update flow: verified working (v1.1.4 → v1.1.6)
  ✅ Quick Organizer calendar built (month grid, week strip, drag events)
  ⚠️ Calendar import hang — fix committed but not yet verified on device
```

---

## ⚠️ Outstanding Items (as of Jun 17, 2026)

### 1. Upload signed .vera-module ZIPs to CDN — TONIGHT

```bash
# From Lexsort-personal-ai/ with .env.local present:
./scripts/build-module.sh promailer --sign
./scripts/build-module.sh guardian-watch --sign
./scripts/build-module.sh research-lab --sign

# Then upload the ZIPs from:
#   modules/promailer/dist/promailer-1.0.0-macos.zip
#   modules/guardian-watch/dist/guardian-watch-1.0.0-macos.zip
#   modules/research-lab/dist/research-lab-1.0.0-macos.zip
# to: modules.lexsort.com/modules/ (via Netlify /website/modules/ folder)

# After uploading, update sha256 + size_bytes in website/index.json and redeploy
netlify deploy --prod --dir=website
```

### 2. Module Store end-to-end test — DEVICE VERIFICATION

After ZIPs are uploaded:
1. Open VERA Pro → sidebar → **Module Store**
2. Confirm ProMailer, Guardian Watch, Research Lab all appear from CDN
3. Click **Install** on ProMailer → download progress → confirm it loads in sidebar
4. Restart app → confirm module persists (still in sidebar after restart)
5. Uninstall module → confirm it disappears and `~/.lexsort/modules/promailer/` is cleaned up

### 3. Calendar import hang — DEVICE VERIFICATION

Fix was committed to Freeware repo but never confirmed on device. Symptom: importing a `.ics` file hangs the UI. Test with a real calendar export.

### 4. Windows CI — verify when GitHub Actions limits reset

All fixes committed. v1.0.11 tag couldn't run due to Actions minute exhaustion.

**What was fixed:**
- Per-platform Node version: macOS/Linux = Node 20, Windows = Node 24
- `npm install -g node-gyp@latest` before `npm ci` (Windows only)
- `GYP_MSVS_VERSION=2022` env vars on the `npm ci` step
- `winreg = "0.52"` added to `Cargo.toml` as Windows-only dependency

**To verify:** Push a new Pro tag → confirm Windows build passes.  
**Actions URL:** https://github.com/Lexsort-Core/Lexsort-Vera-Pro/actions

### 5. Pro version files not bumped

CI tags v1.0.6–v1.0.11 were workflow-fix-only. Pro version files still show **v1.0.5**.  
After Windows CI confirmed + module ZIPs uploaded → bump `tauri.conf.json`, `package.json`, `Cargo.toml` → push proper release tag.

### 6. LICENSE_SIGNING_PRIVATE_KEY — rotation needed (separate from module key)

The old license signing key (for Stripe-issued Pro licenses) was in `scripts/generate-test-keys.js` and is now in git history. This is separate from the module signing key (already rotated today).

> ⚠️ Rotating the license key breaks all existing Pro licenses — coordinate timing carefully.  
> Do not rotate until you have a plan to re-issue licenses to all paying customers.

---

## 🏗 Repo Structure

```
Lexsort-personal-ai/              # Freeware repo + website
├── lexsort-personal-ai/          # Tauri app (React + Rust)
├── website/                      # Static marketing + API
│   ├── index.json                # Module catalog (served at modules.lexsort.com/index.json)
│   ├── index.json.sig            # Ed25519 signature for catalog
│   └── modules/                  # Modules CDN subfolder
├── netlify/                      # Serverless functions (Stripe, license, uptime)
├── scripts/
│   ├── build-module.sh           # Build + sign + deploy any module
│   └── sign-module.js            # Ed25519 signing (128-char hex key)
└── docs/                         # Architecture, security, build docs

Lexsort-Vera-Pro/                 # Pro repo (private)
├── lexsort-vera-pro/
│   ├── src/                      # React app (App.tsx is lean core)
│   ├── src-tauri/
│   │   ├── lexsort_public_key.bin  # Module verification key (rotated Jun 17)
│   │   └── tests/contracts.rs      # 7 contract tests, all passing
│   └── modules/                  # Standalone module packages
│       ├── promailer/            # Vite IIFE build → dist/bundle.js
│       ├── guardian-watch/       # Vite IIFE build → dist/bundle.js
│       └── research-lab/         # Vite IIFE build → dist/bundle.js
└── .github/workflows/            # CI/CD (per-platform Node, node-gyp pre-install)
```

---

## 🔑 Key Facts for Next Session

- **Module CDN:** `modules.lexsort.com/index.json` is live and signed. DNS CNAME already set.
- **Signing key:** `.env.local` in Lexsort-personal-ai root (gitignored). Also in Netlify env.
- **Module bundles:** Already deployed to `~/.lexsort/modules/` locally. Not yet signed as `.vera-module` ZIPs.
- **App.tsx is clean:** Only imports QuickOrganizer + MobileBridgeModule + BusinessOrganizerModule. All Pro modules load from disk dynamically.
- **Contract tests:** 7/7 passing on both repos. Pre-commit hook blocks regressions.
- **Freeware:** v1.1.6 is stable and deployed. Do not touch until calendar import fix is verified.

---

*VERA is a LexSort Inc. project. All rights reserved.*
