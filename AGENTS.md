# VERA — Agent Session Briefing

**Project:** LexSort VERA — Local-First Private AI Desktop App
**Parent:** LexSort Inc. (Corp #1799606-3, BN 774849178, DUNS 243369420, Federal CBCA)
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama v0.9.6
**Freeware v1.3.0 in tree** (silent updater merged to main, release pending — internal Mac builds) · **Pro v1.0.13 in tree** (Guardian Watch + Smart Inbox + updater, release pending) · **Engine v1.0.0** · **iOS Go (Phase 3b)**
**Last Updated:** August 12, 2026

---

## Build Policy — INTERNAL BUILDS ONLY (Sep 2026, founder directive)

**No GitHub Actions builds for releases. Ever.** All release artifacts are
built locally: **ThinkCentre = Windows** (`.msi`/`-setup.exe`), **M1 Pro =
macOS** (`aarch64` + `x64` `.dmg`, signing + updater `.sig`). Linux currently
has no builder — do not promise Linux updater payloads.

Rules:
- **NEVER push a `v*` tag to trigger CI** — tag pushes auto-build macOS/Linux
  on paid runners for artifacts nobody uses. Tags are version markers only,
  and only if the founder asks for them.
- `release.yml` / `publish` workflows are **retired in practice** (kept in repo
  for reference). Do not "fix" or rely on them.
- `contracts.yml` (ubuntu free) may still run on pushes — harmless, ignore or
  use as a smoke signal.
- Release flow: local signed builds → upload artifacts to GitHub Releases →
  update `website/api/*-latest.json` feeds (beta first, then stable) →
  `netlify deploy --prod --dir=website`.
- Before any release build: `cargo check` + `npx tsc --noEmit` locally.

## CI Cost Policy (historical — superseded by internal-build policy above)

**GitHub spending cap is at $0.** Every CI minute on `windows-latest` costs ~$0.08. A full Windows build takes ~75-90 min = **~$6-8 per run**.

Rules:
- **Windows builds are manual-only** in `release.yml` — never triggered by auto tag pushes
- Tag pushes (`git push origin v*`) auto-build **macOS ARM + Intel + Linux** only
- To build Windows: use **Actions → "Build & Release VERA Freeware" → Run workflow → `windows-only`**
- `contracts.yml` runs on **ubuntu-latest** (free) — never change back to `macos-latest` or `windows-latest`
- Before pushing a `v*` tag, run `cargo check` + `npx tsc --noEmit` locally first — avoid wasting CI on fix iterations

---

## SR&ED Logging — Mandatory

LexSort Inc. is enrolled in the Canadian SR&ED tax incentive program (35% refundable credit on R&D expenditures). **At the end of every session**, you must log an entry. See protocol and log file below.

### Quick-start
1. Open `sred_log_vera.html`
2. Prepend a new object to the `SEED_ENTRIES` array (top of array = newest)
3. Schema: `{ id: Date.now(), date: 'YYYY-MM-DD', hours: X.X, area: '...', outcome: '...', agent: 'OpenCode', problem: '...', uncertainty: '...', work: '...' }`
4. Also create evidence snapshot: `sred_evidence/YYYY-MM-DD/sred_entry.md`, `session_summary.md`, `git_log.txt`
5. Ensure the HTML file remains valid JS/HTML

### CRA Writing Rules
- **problem:** Describe the technical gap/conflict, not the symptom
- **uncertainty:** Use "It was not known in advance whether..." phrasing
- **work:** Cite specific files, algorithms, tests. Be systematic.
- **Never** write "fixed bugs" or "refactored component"

---

## Repo Structure

```
VERA/                             ← This repo (Freeware + Engine + iOS + website)
├── vera-freeware/                # Tauri v2 desktop app (React + Rust)
│   ├── src/                      # React frontend (App.tsx, components)
│   ├── src-tauri/                # Rust backend (lib.rs — all commands inline)
│   └── package.json
├── vera-engine/                  # Standalone Rust binary (LLM proxy + model manager)
├── vera-go-ios/                  # Swift iOS companion app
├── website/                      # Static marketing site (lexsort.com)
│   └── netlify/                  # Serverless functions (Stripe, license, uptime)
├── discord-bot/                  # DEPLOYED on Railway — /register /mykey /mystatus /help
├── scripts/                      # build-module.sh, sign-module.js, generate-test-keys.js
├── docs/                         # ARCHITECTURE.md, SECURITY.md, BUILD_AND_RELEASE.md etc.
├── AGENTS.md                     # THIS FILE — read every session
├── MASTER_HANDOFF.md             # Project state, session logs, outstanding items
└── KEY_MANIFEST.md               # Cryptographic key reference

02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/   ← Pro repo (separate private clone)
└── lexsort-vera-pro/
    ├── src/                      # React frontend — Pro-specific UI
    │   └── components/
    │       ├── LicenseGate.tsx   # Shown to returning users with expired license
    │       └── OnboardingWizard.tsx  # NEW — first-launch wizard (engine+model+license)
    ├── src-tauri/                # Rust backend — Pro feature flags + module system
    │   └── src/modules/          # emailer.rs, license.rs, benchmark.rs, history.rs
    ├── modules/                  # Standalone downloadable module packages
    │   ├── promailer/            # ProMailer frontend module
    │   ├── guardian-watch/
    │   └── research-lab/
    └── .github/workflows/        # CI: release.yml (v* tag → build all platforms)
```

---

## ProMailer Architecture — CRITICAL DISTINCTION

> [!IMPORTANT]
> **Three separate things — do NOT confuse them:**
>
> 1. **Standalone ProMailer** (`JustMeMedia/01_ACTIVE/ProMailer-Mac/`) — A separate Python/Flask application already shipped on a live site from a **different GitHub account**. Has its own `lead_finder.py` web scraper.
>
> 2. **VERA Freeware bridge** — `lib.rs` in the Freeware Tauri backend calls `lead_finder.py` as a subprocess using `--json-query` and `--json-limit` CLI flags. This is a temporary bridge until the Pro binary is shipped.
>
> 3. **VERA Pro native module** — `src-tauri/src/modules/emailer.rs` implements lead finding natively in Rust using `reqwest` (DuckDuckGo HTML scraper + Google Places). The `modules/promailer/` folder contains the React frontend IIFE bundle.

---

## Key Infrastructure — Current State (Jun 30, 2026)

| Component | Status | Location |
|---|---|---|
| Discord Bot | ✅ **LIVE** on Railway | `/register`, `/mykey`, `/mystatus`, `/help` all working |
| Stripe Webhook | ⚠️ Needs env vars in Netlify | `netlify/functions/stripe-webhook.js` |
| Freeware CI | ✅ Active — auto-builds on `v*` tag | `LexSort-Inc/LexSort-Vera-Personal-AI` |
| Pro CI | ✅ Active — auto-builds on `v*` tag | `LexSort-Inc/Lexsort-Vera-Pro` |
| GitHub Actions Secrets (Pro) | ✅ All 6 Apple secrets set | Set Jun 17, 2026 — APPLE_ID, CERT, TEAM_ID etc. |
| Apple Developer Org Account | ✅ **LIVE — LexSort Inc.** | Activated Jul 3, 2026 — developer.apple.com |
| License Signing Keypair | ✅ Rotated Jun 30 | Private key in `.env.local`, public key in Pro `lexsort_public_key.bin` |
| Module Signing Keypair | ✅ Active Jun 17 | Private key in `.env.local` (`MODULE_SIGNING_PRIVATE_KEY`) |
| Netlify deploy | ✅ CLI only — NEVER connect GitHub | `netlify deploy --prod --dir=website` |

---

## Dev Commands

```bash
# ── Desktop Launcher Shortcuts (double-click on Desktop) ─────────────────────
# Vera_Freeware_Dev.command  → launches Freeware dev server
# Vera_Pro_Dev.command       → launches Pro dev server

# ── Run manually ─────────────────────────────────────────────────────────────
cd vera-freeware && npm run tauri dev        # Freeware
cd vera-engine && cargo run                 # Engine standalone
cd vera-freeware/src-tauri && cargo check   # Rust compile check
cd vera-freeware/src-tauri && cargo test    # Run tests (sandboxed)

# ── Deploy website ────────────────────────────────────────────────────────────
netlify deploy --prod --dir=website   # CLI ONLY — never connect GitHub to Netlify

# ── Release a new Freeware version ───────────────────────────────────────────
# 1. Bump: vera-freeware/src-tauri/tauri.conf.json, package.json, Cargo.toml
# 2. Bump: website/api/manifest.json (+ website/download.html, freeware.html)
git tag v1.2.0 && git push origin v1.2.0
netlify deploy --prod --dir=website

# ── Release a new Pro version ─────────────────────────────────────────────────
# 1. Bump: lexsort-vera-pro/src-tauri/tauri.conf.json, package.json, Cargo.toml
git tag v1.0.13 && git push origin v1.0.13
# CI builds and creates Draft Release automatically on GitHub

# ── Generate beta license keys (for testers) ──────────────────────────────────
# From VERA repo root (requires LICENSE_SIGNING_PRIVATE_KEY in .env.local)
node scripts/generate-test-keys.js 5

# ── Build + sign a module ZIP ────────────────────────────────────────────────
./scripts/build-module.sh promailer --sign
```

---

## Version History — Pro CI Tags

> [!NOTE]
> Pro CI has been running since v1.0.2. Tags v1.0.5–v1.0.11 were workflow fix iterations.
> **v1.0.12 is the first release with real feature content (onboarding wizard).**

| Tag | What Changed |
|---|---|
| v1.0.2 | Initial Pro release |
| v1.0.5 | Base Pro features |
| v1.0.6–v1.0.11 | CI/workflow fixes only (Windows runner, signing, node-gyp) |
| **v1.0.12** | **OnboardingWizard, Ollama v0.9.6 engine URLs, new license keypair** |
| **v1.0.13** (committed, untagged) | **Guardian Watch sidecar supervision + Smart Inbox** (`9ce5392`) — Job Objects, VRAM gating, /api/show metadata, purge cmd, lifecycle logging, port-collision UI |

---

## Commit Conventions
- Prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- Include SR&ED entry ID in body when applicable (e.g., `SRED: 1782691200000`)
- Pre-commit hook runs contract tests (skips gracefully if target missing)
- Never push `v*` tags without local `cargo check` + `npx tsc --noEmit` first

---

## Current Blockers (as of Aug 11, 2026)

- **Apple Developer Org** — ✅ LIVE — `developer.apple.com` (LexSort Inc.)
- **Bundle ID registration** — ⏳ Register `com.lexsort.vera` in Certificates, IDs & Profiles
- **App Store Connect listing** — ⏳ Create VERA Pro app listing
- **Distribution Certificate** — ⏳ Generate Mac App Distribution Certificate
- **Intel Mac builds** — ✅ RESUMED at v1.2.0 (`vendored-openssl` fix from Aug 11 ships the first x64 `.dmg` since v1.1.6; **verify the x64 artifact in the v1.2.0 release**)
- **Pro binaries (v1.0.1–v1.0.12)** — ⚠️ Orphaned on old repo (force-moved tags); v1.0.12 partially recovered (5/9 assets from local Downloads). Never force-move release tags.
- **Pro v1.0.13 tag** — ⏳ Scope (Guardian Watch + Smart Inbox) committed + pushed (`9ce5392`); bump versions + tag when user approves. Business-organizer backend WIP intentionally uncommitted.
- **Pro CI build** — Check: https://github.com/LexSort-Inc/Lexsort-Vera-Pro/actions
- **TAURI_PRIVATE_KEY** — May need adding to Pro repo GitHub secrets if CI fails on update signing step
- **Stripe env vars** — Not yet set in Netlify dashboard (free beta bypasses Stripe for now)
- **Module ZIPs** — `.vera-module` signed ZIPs not yet uploaded to CDN (`modules.lexsort.com`)
- **Freeware public launch** — ✅ Windows chat verified (Aug 7, v1.1.11) — launch unblocked; **v1.2.0 released Aug 12** (Home dashboard, machine-grounded chat tools, all modules free) — awaiting v1.2.0 EV/Mac/Windows smoke tests before public blast
- **4 stale duplicate repos** (`Lexsort-Core/…`) — safe to delete now that releases are migrated to orgs; API deletion blocked (token lacks `delete_repo`) → delete via GitHub UI

---

## DO NOT section — Agent Rules

> [!CAUTION]
> - **Never** connect GitHub repo to Netlify auto-deploy
> - **Never** run `cargo test` without `LEXSORT_DIR_OVERRIDE` sandbox env var — it will delete `~/.lexsort`
> - **Never** assume Pro tag history = version number (tags v1.0.6–v1.0.11 were CI fixes)
> - **Never** edit the standalone ProMailer (`JustMeMedia/ProMailer-Mac`) as if it's the VERA module
> - **Never** commit the `.env.local` file (contains private signing keys)
> - **Never** delete/re-push (force-move) a tag that a GitHub Release is attached to — it orphans every download URL permanently (destroyed the v1.0.12 Pro binaries)
> - **Never** create a mirror of a public repo as private (broke all Freeware downloads Aug 8–11) — verify visibility after any repo creation
