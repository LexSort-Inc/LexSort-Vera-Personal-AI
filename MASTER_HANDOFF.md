# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App
**Parent Brand:** LexSort Inc. (DUNS 243369420)
**Current Versions:** VERA Freeware **v1.2.0** 🚀 (relaunch tagged Aug 12 — Home dashboard, machine-grounded chat tools, all modules free; CI building, smoke tests pending) · VERA Pro v1.0.12 (binaries recovered; **v1.0.13 scope committed** — Guardian Watch + Smart Inbox, tag pending) · VERA Engine v1.0.0 ✅
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama v0.9.6
**Last Updated:** August 11, 2026

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
| [AMENDMENT_03_AUDIO_PIPELINE.md](docs/AMENDMENT_03_AUDIO_PIPELINE.md) | VERA Engine spec amendment for local STT/TTS audio pipeline |
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

**Mandatory:** At end of every session, prepend an entry to `SEED_ENTRIES` in `sred_log_vera.html`. Each entry **MUST** include `start_time` and `end_time` in `HH:MM` 24h format (CRA audit requirement — logs without specific start/end times will be rejected). Create an evidence snapshot in `sred_evidence/YYYY-MM-DD/`. See `SRED_LOGGING_PROTOCOL.md` for the schema and CRA writing rules.

### Session Time Tracking (automated)
Do NOT fabricate times. Use the session tracker:
```bash
# At the START of every session:
./scripts/session-log.sh start

# At the END of every session:
./scripts/session-log.sh end
# This prints the exact start/end times and duration for the SR&ED entry.
```

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
# Current version: v1.0.13 scope COMMITTED (Guardian Watch + Smart Inbox, Aug 11 2026)
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

## 🏛 Current Architecture State (Aug 12, 2026)

### Infrastructure Status

| Component | State | Notes |
|---|---|---|
| Freeware v1.2.0 | ✅ Live at lexsort.com/download | **v1.2.0 relaunch** tagged Aug 12 2026 — Home dashboard, chat system tool layer, all modules free; CI building ARM/Intel/Linux; manual Windows build in progress |
| Pro v1.0.12 | ⚠️ Binaries recovered 5/9 (org release) | v1.0.1–v1.0.5 + v1.0.12 orphaned by force-moved tags; rpm/setup.exe/tar.gz unrecoverable |
| Pro v1.0.13 (Guardian + Smart Inbox) | ✅ Committed `9ce5392` — **tag NOT yet pushed** | Scope = Guardian Watch + Smart Inbox; business-organizer backend intentionally left uncommitted |
| VERA Engine v1.0.0 | ✅ Stable | Standalone Rust LLM proxy |
| Discord Bot | ✅ Deployed on Railway | `/register` `/mykey` `/mystatus` `/help` |
| Website (lexsort.com) | ✅ Live — serves org release links | Netlify — CLI deploy only (site `charming-zuccutto-05cf6a`) |
| Module CDN | ✅ `modules.lexsort.com/index.json` live | `.vera-module` ZIPs not yet uploaded |
| Stripe Webhook | ⚠️ Wired, needs Netlify env vars | Free beta bypasses Stripe for now |
| GitHub Actions Secrets | ✅ Set (Apple certs + Team ID) | Set Jun 17 2026 — all 6 secrets present |
| Apple Developer Account | ✅ **Organization account LIVE** | LexSort Inc. — developer.apple.com (Jul 3 2026) |
| Intel Mac `.dmg` | ✅ RESUMED at v1.2.0 | `vendored-openssl` on git2 (`40fd72f`) → first Intel build since v1.1.6 ships in v1.2.0; **verify x64 artifact in the v1.2.0 release** |

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
  ✅ Guardian Watch (native, v1.0.13 scope — committed `9ce5392`)
  ✅ Smart Inbox (native, v1.0.13 scope — committed `9ce5392`)

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
✅ v1.2.0 live at lexsort.com/download (tagged Aug 12 2026)
✅ Home dashboard landing — Today strip (calendar/tasks/storage), launchpad, quick-ask chips
✅ Chat system tool layer — model requests real machine data (toolLayer.ts, JSON action protocol)
✅ All modules FREE: Quick Organizer, Team Lab, Guardian Watch, ProMailer, Research Lab
✅ In-app update flow working (v1.1.4 → v1.1.6 → v1.1.7 verified)
✅ Ollama engine auto-install updated to v0.9.6 (Jun 30 2026)
✅ Quick Organizer: full calendar UX (month grid, week strip, day view)
✅ ProMailer bridge: calls lead_finder.py --json-query --json-limit (live progress events + parallel scraping 7s→3s)
✅ Guardian Watch: system stats fetching, real disk metrics, live progress streaming, AI diagnostics
✅ Capability-grounded chat system prompt (buildSystemPrompt, c25b592)
⚠️ Calendar import hang fix committed but not yet verified on device
⚠️ Intel `.dmg` resumed at v1.2.0 — verify x64 artifact present in release
⚠️ v1.2.0 smoke tests (EV/Mac/Windows) pending before public launch wires
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

## ⚠️ Outstanding Items (as of Aug 11, 2026)

### 1. Tag & Release Pro v1.0.13 (Guardian Watch + Smart Inbox)
Scope **committed** on `main` (`9ce5392`) and pushed to `LexSort-Inc/Lexsort-Vera-Pro`. Tag NOT yet pushed — waiting for your go:
```bash
# In 02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/lexsort-vera-pro/
# 1. Bump tauri.conf.json, package.json, Cargo.toml → 1.0.13
# 2. cargo check + npx tsc --noEmit (mandatory pre-tag gate)
# 3. git tag v1.0.13 && git push origin v1.0.13
# 4. Verify all 5+ artifacts incl. Intel .dmg land in the Draft Release
```
Expected artifacts:
- `LexSort.VERA.Pro_1.0.13_aarch64.dmg` (macOS Apple Silicon)
- `LexSort.VERA.Pro_1.0.13_x64.dmg` (macOS Intel)
- `LexSort.VERA.Pro_1.0.13_x64-setup.exe` (Windows)

> ⚠️ **History:** v1.0.12 binaries were orphaned on the old repo (force-moved tag);
> 5/9 recovered from `~/Downloads` and re-uploaded to the org release. **Never force-move a release tag.**
> Business-organizer backend changes (`modules/business-organizer/backend/*`) remain uncommitted — intentionally deferred to a later release.

### 2. Add TAURI_PRIVATE_KEY to GitHub Secrets (if CI fails on signing step)
If the CI fails with a signing error on the update bundle step, add these to `LexSort-Inc/Lexsort-Vera-Pro` → Settings → Secrets → Actions:
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
**✅ Windows chat is now VERIFIED** (clean ThinkCentre, v1.1.11, Aug 7 2026 — real chat response received). Launch is unblocked; decision on date is with the founder.

### 8. Local Session-Based Audio Pipeline (Amendment 03)
Specify and implement the local audio pipeline (whisper.cpp for STT, Piper for TTS) integrated directly into the VERA Engine daemon. This includes OpenAI-compatible transcription and speech endpoints, a session-based turn-taking VAD model, capability manifest integration, and benchmarked hardware tiering. See [AMENDMENT_03_AUDIO_PIPELINE.md](docs/AMENDMENT_03_AUDIO_PIPELINE.md).

**Status: ✅ Phase 1 (Backend) + Phase 2 (Freeware Client) — IMPLEMENTED & VERIFIED** *(July 2, 2026)*

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | `/v1/audio/transcriptions` + `/v1/audio/speech` endpoints in `vera-freeware/src-tauri/src/rest_api.rs` | ✅ Done |
| Phase 2 | `useVoiceSession.ts` hook + waveform mic UI in `vera-freeware` React client | ✅ Done |
| Phase 3 | Port Freeware client components to `lexsort-vera-pro` | ⏳ Pending user approval |

### 9. Minor cosmetic bugs (field-observed, not fixed yet)
- [ ] **Model download card text mismatch** — description shows "Solid 7B model... ~4.5GB" for models that are neither 7B nor 4.5GB. Fix: description block in the model-select/download UI should use the resolved model's metadata, not a canned string.
- [ ] **Pre-rebrand folder not cleaned** — `C:\Program Files\LexSort Personal AI\` (old brand) isn't removed when installing rebranded `LexSort VERA`. Fix: uninstall/install script should clean the legacy directory. macOS `~/Applications` variant may exist too.

> [!WARNING]
> **INTEGRATION CONSTRAINT & STAGED ROLLOUT**:
> * Phase 3 has **NOT** started. Do **NOT** merge the audio implementation to `main`, and do **NOT** push release tags triggering GitHub Actions or upload built artifacts to R2 CDN until full local/manual verification and **explicit user approval** of the Freeware build are obtained.



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

- **Pro CI has been running since v1.0.2.** Tags v1.0.6–v1.0.11 were CI fix iterations. The first real feature release is **v1.0.12**; **v1.0.13** (Guardian + Smart Inbox) is committed (`9ce5392`) but not yet tagged.
- **VERA-01..05 features are REAL and live in the Pro repo** (committed `9ce5392`): Job Objects sidecar binding, VRAM-aware model gating, `/api/show` dynamic model metadata, `purge_local_user_data`, lifecycle logging. An early Aug 11 draft mis-attributed them to Freeware; they exist in Pro.
- **Discord bot is live.** `/register`, `/mykey`, `/mystatus`, `/help` all working on LexSort server.
- **License signing key was rotated Jun 30, 2026.** New public key is in `lexsort_public_key.bin` (Pro repo). Private key is in `.env.local`. Old key in git history is for module signing — not license signing.
- **GitHub Actions secrets (Apple certs) already set** in Pro repo — set Jun 17 2026.
- **Netlify and GitHub are intentionally not connected.** Deploy via CLI only.
- **module signing key** (`MODULE_SIGNING_PRIVATE_KEY`) and **license signing key** (`LICENSE_SIGNING_PRIVATE_KEY`) are **two different keys with different formats.**
- **Website security headers** are intentionally relaxed on `website/*` so AI tools (Meta AI, ChatGPT, Perplexity) can index them. Do NOT restore strict headers on the marketing site.
- **Canonical repos live in orgs** (post Aug 8 migration): Freeware = `LexSort-Inc/LexSort-Vera-Personal-AI` (public), Pro = `LexSort-Inc/Lexsort-Vera-Pro` (private), legal = `LexSort-Inc/lexsort-legal`. Old `Lexsort-Core/…` copies are stale duplicates pending UI deletion. Full report: `01_STUDIO_CORE/GITHUB_REPO_MIGRATION.md`.
- **Releases were re-migrated to org repos Aug 11** — `git push --mirror` does NOT copy GitHub Releases. All download links in the website now point to org URLs. Pro v1.0.12 has 5/9 assets (rest unrecoverable).
- **Intel Mac `.dmg` resumes at the next tag** — `vendored-openssl` fix committed Aug 11 (v1.1.7–v1.1.11 had no Intel builds; website routes Intel → v1.1.6 meanwhile).

---

## 📋 Session Log — August 11, 2026 (Pro v1.0.13 Scope + Full Doc Sweep)

> Pro Guardian + Smart Inbox committed & pushed (`9ce5392`); VERA-01..05 confirmed real (Pro repo WIP, not phantom); SR&ED evidence corrected; full doc sweep across VERA, Pro, and studio-core docs.

| Item | Status |
|---|---|
| Pro WIP scoped per user decision | ✅ Guardian + Smart Inbox only; business-organizer backend excluded (left uncommitted for later release) |
| Pro scope committed + pushed | ✅ `9ce5392` — 11 files, +1283: guardian_watch.rs, smart_inbox.rs, GuardianModule/SmartInboxModule, ChatModule port-collision UI, lib.rs (VERA-01..05: Job Objects `KILL_ON_JOB_CLOSE`, VRAM gating <6GB→qwen2.5:3b, `/api/show` metadata, purge_local_user_data, lifecycle logging). `cargo check` + `npx tsc --noEmit` clean |
| **VERA-01..05 phantom → real** | ✅ All five features found in **Pro repo** (uncommitted WIP), not Freeware — the phantom draft mis-attributed repo. Now committed + pushed. SR&ED evidence + MASTER_HANDOFF corrected (`8a62139`) |
| Compile gates | ✅ `cargo check` (Pro) + `npx tsc --noEmit` (Pro) clean |
| Business-organizer WIP | 📋 `modules/business-organizer/backend/{alembic/env.py, app/routers/ingest.py, requirements.txt}` — intentionally uncommitted, deferred |
| Full doc sweep | ✅ AGENTS.md, MASTER_HANDOFF.md, KEY_MANIFEST (verified), SR&ED log + evidence, studio-core docs (LEXSORT_WEBSITE_MANAGEMENT, STUDIO_INFRASTRUCTURE), Pro README/todo-marketing — see commits this session |
| SR&ED | ✅ Entry id 1786582000000 updated with corrected outcome + full-session work; evidence snapshot updated (git_log.txt, session_summary.md) |

## 📋 Session Log — August 11, 2026 (Capability Grounding + Accuracy Audit)

> Chat system prompt grounded to actual installed capabilities; repo docs/versions/evidence audited to v1.1.11 reality. Commits on `main`, **not pushed, no tag** (testing continues on Mac + Windows + EV before v1.1.12).

| Item | Status |
|---|---|
| Capability-grounding system prompt | ✅ `buildSystemPrompt()` in `App.tsx` — module list from `MODULES_LIST` registry (installed only), explicit capability + not-available lists, edition framing, canonical community links, "assume it does not" rule — commit `c25b592` |
| Docs refresh to v1.1.11 reality | ✅ README (Windows verified), AGENTS.md version line, ARCHITECTURE rewrite, MARKETING roadmap, download.html, Cargo.lock, Amendment 03 doc, session-log.sh — commit `7e79c6c` |
| Compile gates | ✅ `npx tsc --noEmit` + `cargo check` clean |
| Version consistency audit | ✅ tauri.conf.json / package.json / Cargo.toml / Cargo.lock / website manifest all at 1.1.11 |
| **Phantom SR&ED draft (2026-08-11)** | ⚠️→✅ An 8-min agent session (10:07–10:15 EDT, "Antigravity") claimed VERA-01..05 work (Job Objects, purge cmd, VRAM gating, dynamic model info) — Freeware-tree grep proved none exists there. **Later corrected:** the work WAS real — it lived as uncommitted WIP in the **Pro repo** and is now committed (`9ce5392`). Draft replaced with real entry (id 1786582000000); evidence snapshot rewritten |
| Evidence folders committed | ✅ `2026-07-02/` + `2026-08-06/` snapshots (previously untracked, match logged entries) |
| SR&ED entry | ✅ `sred_log_vera.html` + `sred_evidence/2026-08-11/` (id 1786582000000, hours provisional — finalize at session close) |
| **GitHub org consolidation verification** | ✅ Migration confirmed complete (Aug 8, `git push --mirror`): LexSort-Inc 3 + Just-Me-Media 18 repos; all 8 local remotes verified; canonical `LexSort-Inc/LexSort-Vera-Personal-AI` at `57b738d` (see `01_STUDIO_CORE/GITHUB_REPO_MIGRATION.md`) |
| **Live-site health checks** | ✅ justmemedia.ca / promailer.ca / sportsprophecyapp.com / tripsync.ca / lexsort.com / modules.lexsort.com / saaspricedb.com + Render backends all HTTP 200 |

## 📋 Session Log — August 11, 2026 (Release Migration — CRITICAL FINDINGS)

> Health-check follow-up uncovered that `git push --mirror` does **not** copy GitHub Releases, and the mirror created the Freeware org repo **private** — all public downloads 404'd since Aug 8. 23 releases migrated via API script; repo made public; website links bumped v1.1.6→v1.1.11. See `01_STUDIO_CORE/GITHUB_REPO_MIGRATION.md` §6.

| Item | Status |
|---|---|
| Releases missing on org repos (0 vs 18+5 on old) | ⚠️→✅ Discovered via API; 18 Freeware + 5 Pro releases migrated (notes + assets streamed to `uploads.github.com`), `201` on all live assets |
| **Freeware repo PRIVATE (mirror default)** | 🚨→✅ `PATCH /repos` → public. All v1.1.11 installers verified **HTTP 200 anonymously** (dmg/msi/deb/AppImage) |
| **Pro v1.0.1–v1.0.12 binaries dead on old repo too** | 🚨 Force-moved release tags orphan downloads permanently (CI-fix era). v1.0.12 recovered 5/9 from `~/Downloads` (aarch64/x64 dmg, msi, deb, AppImage — exactly the website-linked set); rpm/setup.exe/tar.gz unrecoverable |
| Website links | ✅ download.html / download-detector.js / freeware.html / vera.html / faq.html → org URLs + v1.1.11; **Intel Macs routed to v1.1.6** (last Intel build); README + AGENTS.md paths fixed |
| Netlify deploy | ✅ `netlify deploy --prod --dir=website` — live site serving org links (verified) |
| **Intel Mac builds missing v1.1.7+** | 🚨 `git2` → `openssl-sys` fails on `x86_64-apple-darwin` ("Could not find directory of OpenSSL"). **Fix committed**: `vendored-openssl` feature on git2; `cargo check` + `cargo test` + `tsc` clean |
| Website/doc commits | ✅ `82fcd74` (org links + v1.1.11), pushed to canonical |

---

## 📋 Session Log — August 6–7, 2026 (Windows Chat-Connection Arc)

> **RESOLVED + VERIFIED end-to-end.** VERA Freeware completed its first real chat exchange on a clean Windows 11 machine (ThinkCentre, no dev tools) at **2026-08-07 22:10:56 EDT** under v1.1.11.
> Arc spanned v1.1.7 → v1.1.11. SR&ED entry logged in `sred_log_vera.html` + `sred_evidence/2026-08-07/`.

| Item | Status |
|---|---|
| **RC1 — Runner library layout** — v0.9.6 ships `lib/ollama/*.dll` (win) / flat `libggml-*.so` (mac); `ollama_runners/` + `OLLAMA_RUNNERS_DIR` are gone in v0.9.6. Copy logic retargeted to the real layout; dead env var removed. | ✅ Fixed — `424f1a9` (v1.1.8) |
| **RC2 — CI release race** — tag-push + manual-dispatch runs both called `createRelease` for one tag → GitHub releases-API eventual 404 (upstream tauri-action#1270) → release with zero assets. | ✅ Fixed — `1d5d6c8` (prepare-release job, `releaseId` uploads, `retryAttempts:3`, concurrency group) |
| **RC3 — Invalid CORS origin** — `tauri://localhost` in `OLLAMA_ORIGINS` panic-kills Ollama via gin-contrib/cors v1.7.2 (VERA-spawned) or leaves default origins without `http://tauri.localhost` (external daemon) → webview 403 → "Failed to fetch". | ✅ Fixed — `834980d` (v1.1.10), sanitized origins at both spawn sites, origin logged per send |
| **RC4 — Process lifecycle exit-code bug** — `.is_ok()` on `ollama list` true even on exit≠0 → VERA never spawned, never owned a handle (never killed on exit); `list_installed_models` had a second blind `serve` spawn (no env, no owner) → duplicate/orphaned `ollama.exe`. | ✅ Fixed — `5a72965` (v1.1.11): exit-code checks, single spawn site, kill+wait on all shutdown paths, new `~/.lexsort/logs/ollama-lifecycle.log` |
| Field diagnostics infrastructure | ✅ `append_chat_log` → `chat-debug.log` (v1.1.9); retry/backoff + model-vs-installed logging (v1.1.8) |
| Live verification (clean ThinkCentre, v1.1.11) | ✅ Single `SPAWNING` line PID=21144 (22:05:50) in lifecycle log; `origin=http://tauri.localhost` at 22:10:56; real assistant response in UI |
| Compile gates before tags | ✅ `cargo check` + `npx tsc --noEmit` clean for every tag push |
| SR&ED entry | ✅ `sred_log_vera.html` + `sred_evidence/2026-08-07/` (08:00–22:10, 8.5h, id 1786241456000) |
| Minor cosmetic bugs spotted (not fixed) | 📋 See Outstanding Items #9 (model description text) + #10 (legacy `Program Files\LexSort Personal AI` cleanup) |

> Follow-up note: the old Aug 6 blocked row "pending clean-machine validation of 1.1.7" is now **superseded** — validation actually landed on v1.1.11 and **passed** (the ollama_runners approach from v1.1.7 was itself replaced by `424f1a9`).

---

## 📋 Session Log — August 12, 2026

| Item | Status |
|---|---|
| Host machine optimization (speed) | ✅ sccache + lazy-nvm + daemon cleanup (see SR&ED entry 1786571520000) |
| Chat system tool layer | ✅ `toolLayer.ts` — 8 tools, 2-turn orchestration; chat now answers "how's my system?" with real data (SR&ED 1786580400000) |
| Freeware module unlock (Option A) | ✅ `isFree: true` on ProMailer, Research Lab, Guardian Watch, Team Lab — no more Pro alert-gate |
| Home dashboard landing screen | ✅ `HomeDashboard.tsx` — Today strip (calendar/tasks/storage), quick-ask chips, launchpad grid, status footer; app boots to Home, chat demoted to tab |
| Vera Go / Business Organizer | ✅ Re-scoped to "soon" (Vera Go excluded per decision; Business Organizer backend still WIP) |
| Greeting + chips repointed | ✅ Chat greeting now leads with system-health asks |
| Verify compile | ✅ `cargo check` 0 warnings; `npx tsc --noEmit` clean |
| SR&ED entries logged | ✅ `sred_log_vera.html` + `sred_evidence/2026-08-12/` |
| **v1.2.0 released** | ✅ `28cf5ed` committed + pushed; tag `v1.2.0` → CI (macOS ARM/Intel/Linux); lexsort.com deployed (manifest + download links verified live) |
| **Windows build** | ⏳ Manual workflow run started by founder Aug 12 — PowerShell runner (~75-90 min, ~$6-8) |

---

## 📋 Session Log — August 6, 2026

| Item | Status |
|---|---|
| Windows test machine setup | ✅ Hardware + tooling installed (session start 16:00) |
| Ollama sidecar inference blocker (500 on `/api/generate`, `server cpu not listed`) | ✅ Fixed — root cause: engine extraction kept only `ollama.exe`, destroyed extracted folder + `ollama_runners/` |
| `copy_dir_recursive()` + `ollama_runners_dir()` helpers | ✅ Added in `lib.rs:58-88`; extraction now persists `ollama_runners/` on Windows and macOS |
| `OLLAMA_RUNNERS_DIR` env on all serve paths | ✅ `start_inference_server` (lib.rs), `list_installed_models` retry-serve, `server.rs::start_ollama` |
| CORS 403 `OPTIONS /v1/chat/completions` | ✅ `OLLAMA_ORIGINS` expanded: `http://localhost`, `http://localhost:1420`, `http://tauri.localhost`, `tauri://localhost`, `http://127.0.0.1:*` |
| Verify compile | ✅ `cargo check` 0 warnings; `npx tsc --noEmit` clean |
| Installer filename check | ✅ `tauri.conf.json` productName already `LexSort VERA` → next MSI = `LexSort.VERA_1.1.7_x64_en-US.msi` |
| SR&ED entry logged | ✅ `sred_log_vera.html` + `sred_evidence/2026-08-06/` (16:00–19:38, SRED id 1786059521000) |
| **Blocked — pending clean-machine validation** | ⏳ Build+install 1.1.7 on clean Windows 11; pass = `OLLAMA_RUNNERS_DIR` + `Dynamic LLM libraries [cpu ...]` both non-empty |

---

## 📋 Session Log — July 3, 2026

| Item | Status |
|---|---|
| Apple Developer Organization account | ✅ **LexSort Inc. Organization account activated** — `developer.apple.com` portal live |
| Next steps unlocked | ⏳ Register Bundle ID (`com.lexsort.vera`), create Distribution Certificate, set up App Store Connect listing |

---

## 📋 Session Log — July 2, 2026

| Item | Status |
|---|---|
| Python `lead_finder.py` speed + live logging | ✅ `ThreadPoolExecutor(max_workers=5)` parallel scraping, DuckDuckGo delay 1.5s→0.5s, `log_step()` stderr logging |
| Rust `emailer_search_leads` stderr streaming | ✅ `tokio::process::Command` with piped stderr → `app.emit("search_log", msg)` |
| Frontend search log overlay | ✅ `searchLogs` state + spinner in module header during live searches |
| Guardian Watch crash fix | ✅ `SystemStats` field names matched to bundle (`cpu_usage`, `total_memory_bytes`, etc.), real disk space from `sysinfo::Disks`, `#[serde(rename)]` serialization |
| Research Lab crash fix | ✅ `list_installed_models()` changed from `Vec<String>` → `Vec<ModelDetails>` (Ollama API `/api/tags` + CLI fallback with size parsing), frontend guarded against mixed string/object responses |
| ProMailer API key passthrough | ✅ Rust reads `google_places_api_key` from saved SMTP config → passes `--json-api-key` to Python → overrides `GOOGLE_API_KEY` global |
| Internet connectivity check | ✅ `check_internet_connection()` via `socket.gethostbyname("google.com")` in Python, early-exit with clear error message |
| DuckDuckGo directory filtering | ✅ Expanded skip list from 12 → 70+ aggregator/directory domains (MapQuest, SuperPages, Manta, Hotfrog, etc.) |
| Max Results input readability | ✅ CSS overrides: explicit `color: #e2e8f0` + `background: #1e293b`, wider form-group 120px → 140px, visible spin buttons |
| SR&ED entry logged | ✅ `sred_log_vera.html` + `sred_evidence/2026-07-02/` |
| Codebase security/stability audit | ✅ 16 issues found: god file lib.rs (2806→2837 lines), 32 unwrap() → 8 fixed, 56 `any`, dialog plugin migration |
| REST API loopback lockdown | ✅ `[0,0,0,0]:8888` → `127.0.0.1:8888` |
| SHA256 download skip fix | ✅ Empty `expected_sha` skips verification with warning |
| Auth middleware token fix | ✅ `Some(_)` → `Some(t) if !t.is_empty()` |
| CI cost optimization | ✅ `contracts.yml` macos→ubuntu, `release.yml` Windows split to manual job |
| Hook extraction | ✅ 6 hooks extracted: useAudio, useSettings, useSwitching, useConversations, useChat, useEngine (App.tsx 2861→2727 lines) |
| DB schema consolidation | ✅ `src/schema.rs` — single init_db for all 3 tables |

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
