# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App  
**Parent Brand:** LexSort Inc.  
**Current Versions:** VERA Freeware v1.1.6 · VERA Pro v1.0.5 (CI tags v1.0.6/v1.0.7 are test-only)  
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

### 1. Windows CI — better-sqlite3 native compile failure (IN PROGRESS)

Both repos had `windows-latest` CI failing: `Could not find any Visual Studio installation`.

**Freeware fix** (`.github/workflows/release.yml`):
- Moved MSVC env var setup BEFORE `npm ci` ✅ committed to main
- Not yet verified — push a new freeware tag to test

**Pro fix** (`.github/workflows/release.yml`):
- v1.0.6 tag: GITHUB_ENV approach → failed
- v1.0.7 tag: env vars set directly on the `npm ci` step → **currently running in CI**
- Check: https://github.com/Lexsort-Core/Lexsort-Vera-Pro/actions
- If v1.0.7 still fails, next approach: use `better-sqlite3` prebuilt binaries or switch to `sql.js`

### 2. LICENSE_SIGNING_PRIVATE_KEY — rotation needed

The old Ed25519 private key was hardcoded in `scripts/generate-test-keys.js` as a fallback and was caught by Netlify's secret scanner. It is in **git history**.

**To rotate (do when convenient, not urgent):**
1. Generate new Ed25519 keypair
2. Update `LICENSE_SIGNING_PRIVATE_KEY` in Netlify env vars (dashboard)
3. Update the matching public key in the Tauri app source
4. Rebuild + release new version
> ⚠️ Rotating breaks all existing Pro licenses — coordinate timing carefully.

### 3. Pro version files not bumped

CI tags v1.0.6 and v1.0.7 were test-only. Version files in Pro repo still show v1.0.5.  
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
└── .github/workflows/        # CI/CD release pipeline
```

---

*VERA is a LexSort Inc. project. All rights reserved.*
