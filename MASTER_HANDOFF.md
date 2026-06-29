# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App  
**Parent Brand:** LexSort Inc.  
**Current Versions:** VERA Freeware v1.1.7 ✅ · VERA Pro v1.0.5 (Windows CI pending) · VERA Engine v1.0.0 ✅  
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
| [LAUNCH_DAY_CHECKLIST.md](LAUNCH_DAY_CHECKLIST.md) | Hour-by-hour launch day checklist (VERA Pro) |
| [FREEWARE_PUBLIC_LAUNCH.md](FREEWARE_PUBLIC_LAUNCH.md) | Full public freeware launch plan — gated on Windows confirmed working |
| [TESTER_SETUP.md](TESTER_SETUP.md) | Beta tester onboarding guide |
| [CONTRACTS.md](CONTRACTS.md) | IPC contract definitions |
| [KEY_MANIFEST.md](KEY_MANIFEST.md) | Cryptographic key reference |

---

## 📋 SR&ED Logging — Read This First

LexSort Inc. is enrolled in the Canadian SR&ED program (35% refundable R&D credit).

| Item | Location |
|---|---|
| Logging protocol | `lexsortinc/01_ACTIVE/Lexsort-Legal/SRED_LOGGING_PROTOCOL.md` |
| VERA log file | `lexsortinc/01_ACTIVE/Lexsort-Legal/sred_log_vera.html` |
| Legal log file | `lexsortinc/01_ACTIVE/Lexsort-Legal/sred_log.html` |
| Evidence snapshots | `lexsortinc/01_ACTIVE/Lexsort-Legal/sred_evidence/YYYY-MM-DD/` |
| Machine inventory | `lexsortinc/01_ACTIVE/Lexsort-Legal/sred_evidence/MACHINE_INVENTORY.md` |
| Session briefing | `AGENTS.md` (in this repo) |

**Mandatory:** At end of every session, prepend an entry to `SEED_ENTRIES` in `sred_log_vera.html`. Create an evidence snapshot in `sred_evidence/YYYY-MM-DD/`. See `SRED_LOGGING_PROTOCOL.md` for the schema and CRA writing rules.

---

## ⚡ Quick Reference

### Run in dev mode
```bash
cd vera-freeware && npm run tauri dev
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
# Pro repo is in a separate private repo (Lexsort-Vera-Pro/)
# 1. Bump version in: lexsort-vera-pro/tauri.conf.json, package.json, Cargo.toml
# 2. Commit & push, then tag:
git tag v1.0.6 && git push origin v1.0.6
```

### Run VERA Engine standalone
```bash
cd vera-engine && cargo run
```

### Build a standalone module
```bash
# From VERA repo root:
./scripts/build-module.sh promailer           # build + local deploy
./scripts/build-module.sh promailer --sign    # build + Ed25519 sign + local deploy
# Requires: .env.local with MODULE_SIGNING_PRIVATE_KEY=<128-char hex>
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

All fixes committed. v1.0.11 tag couldn't run due to GitHub Actions **spending limit ($0 cap)**,
not minute exhaustion. All 4 platform jobs were blocked before starting.

**New workflow added:** `.github/workflows/build-windows-only.yml` — manual dispatch to rebuild
only Windows for any given tag (use when only Windows fails, saves ~45 min of runner time).

**To unblock:** GitHub Settings → Billing & Plans → Spending Limits → set above $0 (each
release costs ~$0.30 in Windows runner minutes).

Then re-run: `git push origin v1.0.11` (already tagged, just needs runners unblocked).

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
VERA/                             # This repo — Freeware + Engine + iOS + website
├── vera-freeware/                # Tauri v2 desktop app (React 19 + Rust)
│   ├── src/                      # React frontend (App.tsx, components, hooks)
│   ├── src-tauri/                # Rust backend (lib.rs, commands, team_lab)
│   └── package.json
├── vera-engine/                  # Standalone Rust binary (LLM proxy, model manager)
│   └── src/main.rs               # Entry point: hardware detect, download, llama-server
├── vera-go-ios/                  # Swift iOS companion app (Xcode project)
│   └── VeraGo/                   # Models, Services, Views
├── website/                      # Static marketing site (lexsort.com)
│   ├── index.json                # Module catalog (served at modules.lexsort.com)
│   ├── index.json.sig            # Ed25519 signature
│   └── netlify/                  # Serverless functions (Stripe, license, uptime)
├── scripts/
│   ├── build-module.sh           # Build + sign + deploy modules
│   └── sign-module.js            # Ed25519 signing
├── docs/                         # Architecture, security, build, engine docs
├── resources/                    # Logos, icons
├── AGENTS.md                     # Session briefing (read first)
└── MASTER_HANDOFF.md             # THIS FILE

Lexsort-Vera-Pro/                 # Pro repo (private, separate clone)
└── lexsort-vera-pro/             # Tauri app with Pro feature flags
    ├── modules/promailer/        # Standalone module packages
    ├── modules/guardian-watch/
    └── modules/research-lab/
```

---

## 🔑 Key Facts for Next Session

- **Module CDN:** `modules.lexsort.com/index.json` is live and signed. DNS CNAME already set.
- **Signing key:** `.env.local` in VERA repo root (gitignored). Also in Netlify env.
- **Module bundles:** Already deployed to `~/.lexsort/modules/` locally. Not yet signed as `.vera-module` ZIPs.
- **Freeware App.tsx:** Clean — imports QuickOrganizer + TeamLab. Dynamic module registration via `window.registerVeraModule()`.
- **Contract tests:** Pre-commit hook skips gracefully if contracts test target missing (tests live in Pro repo).
- **Freeware:** v1.1.7 is stable and deployed. Do not touch until calendar import fix is verified.
- **Quick Organizer (committed Jun 17):** Full calendar UX working on BOTH Freeware and Pro:
  localStorage task backend, UTC timezone fix, 7 AM–10 PM visible, click-any-day→Day view,
  Day view time slot click to add.
  - Pro commit: `1582459` on Lexsort-Vera-Pro main
  - Freeware commit: `af4e3bf` on LexSort-Vera-Personal-AI main
- **Windows-only CI:** `.github/workflows/build-windows-only.yml` — manual dispatch if only Windows fails.
- **GitHub spending limit:** Set to $0 (default). Increase to ~$10 to unblock Windows CI.
- **Website SEO (Jun 18):** `website/sitemap.xml` and `website/llms.txt` added. `index.html` has full meta tags: canonical, og:image, og:url, Twitter card, JSON-LD structured data (Organization + WebSite + 4× SoftwareApplication).
- **Website security headers (Jun 18):** Headers intentionally relaxed for public marketing site. `X-Frame-Options: DENY` removed, `frame-ancestors 'none'` → `'self'`, `Cross-Origin-Resource-Policy` → `cross-origin`, `Access-Control-Allow-Origin: *` added. These were blocking ALL AI tools (Meta AI, ChatGPT, Perplexity, Claude) from reading the site. Do NOT restore the old strict headers on `website/*` — they belong on app endpoints only.
- **Freeware public launch gate:** Full public launch (Reddit/HN/Product Hunt/social blast) is intentionally held until Windows version is 100% tested on a real device. See [FREEWARE_PUBLIC_LAUNCH.md](FREEWARE_PUBLIC_LAUNCH.md) for complete plan and social copy.

---

## 📋 Session Log — June 18, 2026

| Item | Status |
|---|---|
| Website `sitemap.xml` | ✅ Created — all 9 public pages indexed |
| Website `llms.txt` | ✅ Created — AI-readable product summary (llmstxt.org standard) |
| `robots.txt` | ✅ Updated — explicit allow for GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, etc. + sitemap ref |
| `index.html` SEO | ✅ Full meta: canonical, og:image, og:url, Twitter card, keywords, geo, JSON-LD |
| `netlify.toml` headers | ✅ Fixed — CORP cross-origin, CORS \*, removed X-Frame-Options DENY, frame-ancestors 'self' |
| AI tools blocked (Meta AI, ChatGPT, etc.) | ✅ Fixed — root cause was CORP same-origin + X-Frame-Options DENY + frame-ancestors 'none' |
| GitHub→Netlify webhook NOT connected | ✅ Confirmed intentional — CLI deploy is the only correct method |
| Deployed to production | ✅ `netlify deploy --prod --dir=website` |

---

## 📋 Session Log — June 17, 2026

| Item | Status |
|---|---|
| Quick Organizer: Save button broken (no Tauri backend) | ✅ Fixed — localStorage (both) |
| Quick Organizer: 7 PM saves as 3 PM (UTC bug) | ✅ Fixed — local Date object (both) |
| Quick Organizer: Events not visible after 6 PM | ✅ Fixed — 7 AM–10 PM range (both) |
| Quick Organizer: Clicking day does nothing | ✅ Fixed — Day view navigation (both) |
| Quick Organizer: Day view add/edit flow | ✅ Built (both Freeware + Pro) |
| Freeware Quick Organizer parity | ✅ Done — af4e3bf |
| Windows CI blocked | ⏳ Spending limit — increase in GitHub Settings |
| Windows-only rebuild workflow | ✅ Added |
| All changes committed and pushed | ✅ |

---

## 📋 Session Log — June 29, 2026

| Item | Status |
|---|---|
| Staged 161-file repo restructure committed | ✅ `cef8a72` |
| Pre-commit hook fixed (graceful skip on missing test target) | ✅ Both `.git/hooks` and `scripts/hooks/` |
| `AGENTS.md` created — session briefing with SR&ED obligation | ✅ New file |
| `SRED_LOGGING_PROTOCOL.md` paths fixed | ✅ `02_ACTIVE_PROJECTS/Lexsort/` → `01_ACTIVE/Lexsort-Legal/` |
| `MASTER_HANDOFF.md` updated — SR&ED section, restructured paths | ✅ |
| `README.md` updated — build path fixed, footer bumped | ✅ |
| `docs/ARCHITECTURE.md` Getting Started path fixed | ✅ |
| `vera-engine/README.md` created — architecture, API, build steps | ✅ New file |
| `discord-bot/README.md` created — commands, setup, env vars | ✅ New file |
| `scripts/README.md` created — script reference table | ✅ New file |
| `website/README.md` created — site structure, deploy command | ✅ New file |
| `sidecar/README.md` created — reserved directory note | ✅ New file |
| `vera-freeware/README.md` expanded — tech stack, dev command, notable files | ✅ |
| SR&ED log entry logged (3.0h, Technical Documentation) | ✅ `sred_log_vera.html` |
| Evidence snapshot created | ✅ `sred_evidence/2026-06-29/` |
| All stale `lexsort-personal-ai/` local-path refs scrubbed (12 docs, 2 CI workflows, 1 HTML) | ✅ grep returns zero |
| Image file renamed: `lexsort-personal-ai.jpg` → `vera-freeware.jpg` | ✅ |
| `package.json` name updated + lockfile regenerated | ✅ `npm install` |
| Windows CI — waiting for July 1 minutes reset | ⏳ 2 days |
| Pro version bump | ⏳ Needs Pro repo access |

---

*VERA is a LexSort Inc. project. All rights reserved.*
