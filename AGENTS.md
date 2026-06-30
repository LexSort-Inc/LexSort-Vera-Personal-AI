# VERA — Agent Session Briefing

**Project:** LexSort VERA — Local-First Private AI Desktop App
**Parent:** LexSort Inc. (Corp #1799606-3, BN 774849178, DUNS 243369420, Federal CBCA)
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama/llama-server
**Freeware v1.1.7** · **Pro v1.0.5** · **Engine v1.0.0** · **iOS Go (Phase 3b)**
**Launch:** July 1, 2026

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
VERA/
├── vera-freeware/          # Tauri v2 desktop app (React + Rust)
│   ├── src/                # React frontend (App.tsx, components, hooks)
│   ├── src-tauri/          # Rust backend (lib.rs, commands, team_lab, etc.)
│   └── package.json        # npm deps
├── vera-engine/            # Standalone Rust binary (LLM proxy + model manager)
│   └── src/main.rs         # Entry point: hardware detect, model download, llama-server
├── vera-go-ios/            # Swift iOS companion app (Xcode project)
│   └── VeraGo/             # Views, Services, Models
├── website/                # Static marketing site (lexsort.com)
│   └── netlify/            # Serverless functions (Stripe, license, uptime)
├── scripts/                # Build utilities (build-module.sh, sign-module.js)
├── docs/                   # Architecture, security, build, update docs
│   ├── ARCHITECTURE.md     # System design, component map, decisions
│   ├── AI_ENGINE.md        # Model selection, engine setup, voice
│   ├── SECURITY.md         # Sandbox, CSP, Ed25519 licensing
│   ├── BUILD_AND_RELEASE.md # CI/CD, version bump, deploy
│   └── UPDATE_SYSTEM.md    # In-app update flow
├── resources/              # Icons, logos
├── AGENTS.md               # THIS FILE — session briefing
├── MASTER_HANDOFF.md       # Project state, blockers, session logs
└── README.md               # Public-facing intro
```

## ProMailer Architecture Distinction

> [!IMPORTANT]
> **Standalone ProMailer vs. VERA ProMailer Module:**
> 1. **Standalone ProMailer:** This is a separate, standalone Python/Flask application (located in the workspace under `JustMeMedia/01_ACTIVE/ProMailer-Mac` or similar) already shipped on a live site from a different GitHub account.
> 2. **VERA ProMailer Module:** This is a custom React/TypeScript module built specifically for the VERA Pro desktop app, located under `Lexsort-Vera-Pro/lexsort-vera-pro/modules/promailer` (frontend React entry) and supported natively in Rust by VERA Pro's Tauri backend (`src-tauri/src/modules/emailer.rs`).
> 3. **Freeware Subprocess Fallback:** In the VERA Freeware edition, because native Pro modules are not compiled into the Tauri binary, a fallback bridge is implemented in `lib.rs` that calls out to the Python `lead_finder.py` script from the standalone ProMailer project using non-interactive arguments (`--json-query` and `--json-limit`).

### Key Files at Session Start
Always read these to understand current state:
1. `MASTER_HANDOFF.md` — latest project state, blockers, last session notes
2. `AGENTS.md` — this briefing
3. `docs/ARCHITECTURE.md` — system design
4. `sred_log_vera.html` — latest SR&ED log entries (nearby, in `01_ACTIVE/Lexsort-Legal/`)

---

## Dev Commands

```bash
# Run Freeware in dev mode
cd vera-freeware && npm run tauri dev

# Run VERA Engine standalone
cd vera-engine && cargo run

# Check Rust compiles
cd vera-freeware/src-tauri && cargo check

# Run tests
cd vera-freeware/src-tauri && cargo test
cd vera-engine && cargo test

# Deploy website
netlify deploy --prod --dir=website
```

---

## Commit Conventions
- Prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- Include SR&ED entry ID in body when applicable (e.g., `SRED: 1782691200000`)
- Pre-commit hook runs contract tests (skips gracefully if target missing)
- Never push `v*` tags without local `cargo check` + `npx tsc --noEmit` first

---

## Current Blockers (as of Jun 29, 2026)
- Windows CI: GitHub spending cap $0 — minutes reset Jul 1
- CDN module ZIPs: not yet uploaded to modules.lexsort.com
- Calendar import hang: fix committed, needs device verification
- Pro version files: still show v1.0.5 (not bumped)
- License signing key: rotation needed (coordinate with customers)
