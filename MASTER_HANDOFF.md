# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App
**Parent Brand:** LexSort Inc. (DUNS 243369420)
**Current Versions:** VERA Freeware v1.1.7 ✅ · VERA Pro v1.0.12 (CI building) · VERA Engine v1.0.0 ✅
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama v0.9.6
**Last Updated:** June 30, 2026

> [!IMPORTANT]
> **ALWAYS read this file and `AGENTS.md` at the start of every session before touching any code.**
> They reflect the true current state. Ignore version numbers visible in any source file — check this document first.

---

## 📚 Documentation Map

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, repo structure, mermaid diagram |
| [SECURITY.md](docs/SECURITY.md) | Tauri sandbox, capability whitelisting, Ed25519 license gate |
| [BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md) | Dev commands, CI/CD pipeline, versioning checklist |
| [UPDATE_SYSTEM.md](docs/UPDATE_SYSTEM.md) | Custom update flow: discovery → download → install |
| [AI_ENGINE.md](docs/AI_ENGINE.md) | Ollama onboarding, model selection |
| [MARKETING_AND_ROADMAP.md](docs/MARKETING_AND_ROADMAP.md) | Marketing tasks, module roadmap, community strategy |
| [LAUNCH_DAY_CHECKLIST.md](LAUNCH_DAY_CHECKLIST.md) | Hour-by-hour launch day checklist (VERA Pro) |
| [FREEWARE_PUBLIC_LAUNCH.md](FREEWARE_PUBLIC_LAUNCH.md) | Full public freeware launch plan |
| [TESTER_SETUP.md](TESTER_SETUP.md) | Beta tester onboarding guide |
| [CONTRACTS.md](CONTRACTS.md) | IPC contract definitions |
| [KEY_MANIFEST.md](KEY_MANIFEST.md) | Cryptographic key reference — **read before generating any keys** |

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

### Launcher shortcuts (Desktop — double-click, no terminal needed)
```
~/Desktop/Vera_Freeware_Dev.command   → starts Freeware dev server
~/Desktop/Vera_Pro_Dev.command        → starts Pro dev server
```

### Run in dev mode manually
```bash
cd vera-freeware && npm run tauri dev
```

### Release a new Freeware version
```bash
# 1. Bump version in: vera-freeware/src-tauri/tauri.conf.json, package.json, Cargo.toml
# 2. Bump website/api/manifest.json to match
# 3. Commit & push, then tag:
git tag v1.1.8 && git push origin v1.1.8
# 4. Deploy website:
netlify deploy --prod --dir=website
```

### Release a new Pro version
```bash
# Pro repo: 02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/lexsort-vera-pro/
# Current version: v1.0.12 (in CI as of Jun 30 2026)
# 1. Bump version in: src-tauri/tauri.conf.json, package.json, Cargo.toml
# 2. Commit & push, then tag:
git tag v1.0.13 && git push origin v1.0.13
# CI auto-builds .dmg (arm64 + x86), .exe, .deb → GitHub Draft Release
```

### Generate beta license keys
```bash
# From VERA repo root — requires LICENSE_SIGNING_PRIVATE_KEY in .env.local
node scripts/generate-test-keys.js 5
```

### Deploy the website to lexsort.com

> ⚠️ **GitHub is NOT connected to Netlify and must NEVER be connected.**
> GitHub auto-deploy causes build failures. CLI-only is the ONLY correct workflow.

```bash
netlify deploy --prod --dir=website
```

**Site ID:** `charming-zuccutto-05cf6a` (lexsort.com)
**Netlify dashboard:** https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys
**If unlinking happens:** `netlify link --id charming-zuccutto-05cf6a`

---

## 🏛 Current Architecture State (Jun 30, 2026)

### Infrastructure Status

| Component | State | Notes |
|---|---|---|
| Freeware v1.1.7 | ✅ Live at lexsort.com/download | macOS arm64 + x86 + Windows |
| Pro v1.0.12 | 🔄 CI building | Triggered Jun 30 — check Actions tab |
| VERA Engine v1.0.0 | ✅ Stable | Standalone Rust LLM proxy |
| Discord Bot | ✅ Deployed on Railway | `/register` `/mykey` `/mystatus` `/help` |
| Website (lexsort.com) | ✅ Live | Netlify — CLI deploy only |
| Module CDN | ✅ `modules.lexsort.com/index.json` live | `.vera-module` ZIPs not yet uploaded |
| Stripe Webhook | ⚠️ Wired, needs Netlify env vars | Free beta bypasses Stripe for now |
| GitHub Actions Secrets | ✅ Set (Apple certs + Team ID) | Set Jun 17 2026 — all 6 secrets present |

### VERA Pro — Onboarding Flow (NEW as of v1.0.12)

```
First launch → OnboardingWizard.tsx
  Step 1: Engine detection → auto-downloads Ollama v0.9.6 (~180MB, silent)
  Step 2: Hardware-matched model selection → download with live % progress
  Step 3: License key entry → offline Ed25519 verification → unlocks modules
  Step 4: Done screen → Launch VERA Pro

Returning users: wizard skipped (localStorage flag) → LicenseGate if expired
```

### VERA Pro — Module System

```
Core (always bundled in binary):
  ✅ Chat + Sidebar
  ✅ Quick Organizer
  ✅ Module Store UI + Loader
  ✅ OnboardingWizard (v1.0.12+)
  ✅ LicenseGate

Standalone downloadable modules (~/.lexsort/modules/<name>/bundle.js):
  ✅ promailer       v1.0.0   IIFE + CSS
  ✅ guardian-watch  v1.0.0   IIFE
  ✅ research-lab    v1.0.0   IIFE + CSS

CDN (modules.lexsort.com):
  ✅ /index.json       — 5-module catalog (signed)
  ✅ /index.json.sig   — Ed25519 signature
  ⏳ /modules/*.vera-module — signed ZIPs not yet uploaded
```

### VERA Freeware

```
✅ v1.1.7 live at lexsort.com/download
✅ In-app update flow working (v1.1.4 → v1.1.6 → v1.1.7 verified)
✅ Ollama engine auto-install updated to v0.9.6 (Jun 30 2026)
✅ Quick Organizer: full calendar UX (month grid, week strip, day view)
✅ ProMailer bridge: calls lead_finder.py --json-query --json-limit
⚠️ Calendar import hang fix committed but not yet verified on device
```

---

## 🏛 Project & Architecture Relationships

> [!IMPORTANT]
> **Standalone ProMailer vs. VERA ProMailer Module — THREE SEPARATE THINGS:**
>
> 1. **Standalone ProMailer** (`JustMeMedia/01_ACTIVE/ProMailer-Mac/`) — A separate Python/Flask app already shipped on a live site from a **different GitHub account**. Has `lead_finder.py` web scraper. Do NOT edit this as if it's the VERA module.
>
> 2. **VERA Freeware bridge** — `vera-freeware/src-tauri/src/lib.rs` calls `lead_finder.py` as a subprocess using `--json-query` and `--json-limit` flags. Temporary fallback for Freeware edition.
>
> 3. **VERA Pro native module** — `lexsort-vera-pro/src-tauri/src/modules/emailer.rs` implements lead finding natively in Rust (reqwest + DuckDuckGo HTML scraper). The `modules/promailer/` folder contains the React frontend IIFE bundle.

---

## ⚠️ Outstanding Items (as of Jun 30, 2026)

### 1. Watch Pro v1.0.12 CI Build
Check: https://github.com/Lexsort-Core/Lexsort-Vera-Pro/actions

Expected artifacts when CI passes:
- `LexSort.VERA.Pro_1.0.12_aarch64.dmg` (macOS Apple Silicon)
- `LexSort.VERA.Pro_1.0.12_x64.dmg` (macOS Intel)
- `LexSort.VERA.Pro_1.0.12_x64-setup.exe` (Windows)

### 2. Add TAURI_PRIVATE_KEY to GitHub Secrets (if CI fails on signing step)
If the CI fails with a signing error on the update bundle step, add these to `Lexsort-Core/Lexsort-Vera-Pro` → Settings → Secrets → Actions:
```
TAURI_PRIVATE_KEY      = -----BEGIN PRIVATE KEY-----
                         MC4CAQAwBQYDK2VwBCIEIDj+7tU4KsifCVO6TD74aKfGtnbI9H1zb5xzGtDrIxIG
                         -----END PRIVATE KEY-----
TAURI_PRIVATE_KEY_PASSWORD = (leave blank)
```

### 3. Send Testers Their Keys
Use `node scripts/generate-test-keys.js 5` to generate 5 keys.
DM each tester 1 key privately in Discord.
They download VERA Pro → wizard handles everything automatically.

### 4. Upload Module ZIPs to CDN
```bash
./scripts/build-module.sh promailer --sign
./scripts/build-module.sh guardian-watch --sign
./scripts/build-module.sh research-lab --sign
# Upload ZIPs to: website/modules/ then netlify deploy --prod --dir=website
```

### 5. Netlify Stripe Env Vars (for when we turn on paid flow)
Add to Netlify dashboard → Site Config → Environment Variables:
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID_MONTHLY`
- `STRIPE_WEBHOOK_SECRET`
- `LICENSE_SIGNING_PRIVATE_KEY` (see KEY_MANIFEST.md)

### 6. Calendar Import Hang — Device Verification
Fix committed but never confirmed on a real device. Symptom: importing `.ics` hangs UI.

### 7. Freeware Public Launch (held until Windows verified)
Full Reddit/HN/Product Hunt blast is intentionally held until Windows version confirmed on real hardware. See [FREEWARE_PUBLIC_LAUNCH.md](FREEWARE_PUBLIC_LAUNCH.md).

---

## 🏗 Repo Structure

```
VERA/                             # This repo — Freeware + Engine + iOS + website
├── vera-freeware/                # Tauri v2 desktop app (React 19 + Rust)
│   ├── src/                      # React frontend (App.tsx, components)
│   ├── src-tauri/                # Rust backend (lib.rs — all commands inline)
│   └── package.json
├── vera-engine/                  # Standalone Rust binary (LLM proxy, model manager)
│   └── src/main.rs
├── vera-go-ios/                  # Swift iOS companion app (Xcode project)
├── website/                      # Static marketing site (lexsort.com)
│   ├── api/manifest.json         # Update manifest (bump here when releasing Freeware)
│   └── netlify/                  # Serverless functions (Stripe, license, uptime)
├── discord-bot/                  # DEPLOYED on Railway — all slash commands live
├── scripts/
│   ├── build-module.sh           # Build + sign + deploy modules
│   ├── sign-module.js            # Ed25519 signing
│   └── generate-test-keys.js     # Generate beta license keys
├── docs/
├── AGENTS.md                     # Session briefing (read first every session)
├── MASTER_HANDOFF.md             # THIS FILE — project state + session logs
└── KEY_MANIFEST.md               # Cryptographic key reference

02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/   # Pro repo (private, separate clone)
└── lexsort-vera-pro/
    ├── src/
    │   └── components/
    │       ├── LicenseGate.tsx          # Returning users with expired license
    │       └── OnboardingWizard.tsx     # NEW v1.0.12 — first-launch automated setup
    ├── src-tauri/
    │   ├── lexsort_public_key.bin       # Ed25519 license public key (rotated Jun 30)
    │   └── src/modules/
    │       ├── emailer.rs               # ProMailer native Rust lead finder
    │       ├── license.rs               # License validation (validate_license command)
    │       ├── benchmark.rs             # Research Lab benchmarking
    │       └── history.rs               # Conversation history
    ├── modules/                         # Standalone React IIFE module bundles
    └── .github/workflows/
        ├── release.yml                  # v* tag → build all platforms
        └── build-windows-only.yml       # Manual dispatch — rebuild Windows only
```

---

## 🔑 Key Facts for Any New Session

- **Pro CI has been running since v1.0.2.** Tags v1.0.6–v1.0.11 were CI fix iterations. The first real feature release is **v1.0.12**.
- **Discord bot is live.** `/register`, `/mykey`, `/mystatus`, `/help` all working on LexSort server.
- **License signing key was rotated Jun 30, 2026.** New public key is in `lexsort_public_key.bin` (Pro repo). Private key is in `.env.local`. Old key in git history is for module signing — not license signing.
- **GitHub Actions secrets (Apple certs) already set** in Pro repo — set Jun 17 2026.
- **Netlify and GitHub are intentionally not connected.** Deploy via CLI only.
- **module signing key** (`MODULE_SIGNING_PRIVATE_KEY`) and **license signing key** (`LICENSE_SIGNING_PRIVATE_KEY`) are **two different keys with different formats.**
- **Website security headers** are intentionally relaxed on `website/*` so AI tools (Meta AI, ChatGPT, Perplexity) can index them. Do NOT restore strict headers on the marketing site.

---

## 📋 Session Log — June 30, 2026

| Item | Status |
|---|---|
| Onboarding Wizard built | ✅ `OnboardingWizard.tsx` + `OnboardingWizard.css` — multi-step: engine → model → license → done |
| Wired into Pro App.tsx | ✅ Shows on first launch, skipped on return (localStorage flag) |
| Ollama URLs updated to v0.9.6 | ✅ macOS + Windows + Linux in `vera-freeware/src-tauri/src/lib.rs` |
| License signing keypair rotated | ✅ Ed25519 PKCS8 format — public key in Pro binary, private key in `.env.local` |
| Pro tauri.conf.json version bumped | ✅ `1.0.5` → `1.0.12` |
| v1.0.12 tag pushed to Pro repo | ✅ CI triggered — check Actions tab |
| AGENTS.md rewritten | ✅ Full current-state rewrite |
| MASTER_HANDOFF.md rewritten | ✅ Full current-state rewrite |
| KEY_MANIFEST.md updated | ✅ Both keypairs documented |
| Discovered: Pro CI was already running | ✅ Tags v1.0.2–v1.0.11 existed — v1.0.6–v1.0.11 were CI fixes |
| Discovered: Discord bot already live | ✅ LexSort server — all slash commands working |
| Discovered: GitHub Actions Apple secrets already set | ✅ Jun 17, 2026 |

---

## 📋 Session Log — June 18, 2026

| Item | Status |
|---|---|
| Website `sitemap.xml` | ✅ Created — all 9 public pages indexed |
| Website `llms.txt` | ✅ Created — AI-readable product summary |
| `robots.txt` | ✅ Updated — explicit allow for GPTBot, ClaudeBot, PerplexityBot, etc. |
| `index.html` SEO | ✅ Full meta: canonical, og:image, Twitter card, JSON-LD |
| `netlify.toml` headers | ✅ Fixed — CORP cross-origin, CORS *, removed X-Frame-Options DENY |
| Deployed to production | ✅ `netlify deploy --prod --dir=website` |

---

## 📋 Session Log — June 17, 2026

| Item | Status |
|---|---|
| Quick Organizer: Save button broken | ✅ Fixed — localStorage (both apps) |
| Quick Organizer: UTC timezone bug | ✅ Fixed — local Date object (both apps) |
| Quick Organizer: Events invisible after 6 PM | ✅ Fixed — 7 AM–10 PM range |
| Quick Organizer: Day view add/edit | ✅ Built (both Freeware + Pro) |
| Module signing keypair rotated | ✅ |
| Windows CI blocked by spending cap | ⏳ Increase GitHub spending limit above $0 |
| Windows-only rebuild workflow | ✅ `.github/workflows/build-windows-only.yml` |
| GitHub Actions Apple secrets added | ✅ |

---

## 📋 Session Log — June 29, 2026

| Item | Status |
|---|---|
| 161-file repo restructure committed | ✅ `cef8a72` |
| Pre-commit hook fixed | ✅ Graceful skip on missing test target |
| Path refs scrubbed (`lexsort-personal-ai/` → correct paths) | ✅ 12 docs, 2 CI workflows, 1 HTML |
| SR&ED log entry logged | ✅ `sred_log_vera.html` |
| Evidence snapshot created | ✅ `sred_evidence/2026-06-29/` |

---

*VERA is a LexSort Inc. project. All rights reserved.*
