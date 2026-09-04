# ARCHITECTURE.md — VERA Personal AI

**Repository:** LexSort-Inc/LexSort-Vera-Personal-AI
**Last updated:** September 3, 2026
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama v0.9.6
**Versions:** Freeware v1.3.0 · Pro v1.0.13 (separate private repo) · Engine v1.0.0

---

## Overview

VERA is a local-first desktop app using Tauri v2. The frontend (React 19 + TypeScript via Vite) communicates with the Rust backend through Tauri IPC (`invoke`/`listen`). Chat completions bypass IPC and go directly to Ollama's HTTP API at `http://127.0.0.1:11434` for streaming.

---

## Directory Structure

```
vera-freeware/                       # Tauri v2 desktop app (this repo's product)
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   ├── lib.rs                    # ~3300 lines: all Tauri commands + updater
│   │   ├── quick_organizer.rs        # SQLite task CRUD + recurrence engine
│   │   ├── calendar_bridge.rs        # JXA (macOS) / PowerShell (Win) calendar import
│   │   ├── conversations.rs          # SQLite conversation + message CRUD
│   │   ├── recurrence_parser.rs      # Natural-language → RRULE parser
│   │   ├── scheduler.rs              # Background recurring-task advance loop
│   │   ├── rest_api.rs               # Axum REST API on localhost:8888
│   │   └── team_lab/                 # Distributed coding module
│   ├── tauri.conf.json               # Includes plugins.updater (pubkey + feed)
│   └── capabilities/default.json     # Tauri v2 permissions (incl. updater)
│
├── src/                              # React frontend
│   ├── main.tsx
│   ├── App.tsx                       # ~3000 lines: boot, chat, settings, routing
│   ├── app.css                       # Single stylesheet
│   ├── components/
│   │   ├── QuickOrganizer/
│   │   ├── ModuleDrawer.tsx
│   │   ├── ModuleErrorBoundary.tsx
│   │   ├── FeedbackBanner.tsx
│   │   └── TeamLab/
│   ├── hooks/
│   │   ├── useSettings.ts
│   │   ├── useUpdater.ts             # Silent updater: channel, check, progress
│   │   └── useSpeechRecognition.ts
│   ├── types/
│   │   └── module.ts
│   ├── SupportPanel.tsx
│   └── UpdateStatusIndicator.tsx
│
├── vera-engine/                      # Standalone Rust binary (LLM proxy + models)
├── scripts/                          # build-module.sh, sign-module.js, generate-test-keys.js
├── website/                          # Static site (lexsort.com, Netlify CLI deploys)
│   ├── api/                          # Update feeds ({freeware,pro}-{stable,beta}-latest.json) + README
│   ├── downloads/                    # Hosted installers (.dmg + .app.tar.gz + .msi/.exe)
│   └── download.html                 # Tier matrix (?tier=free|pro|beta)
├── discord-bot/                      # Self-hosted on ThinkCentre (PM2), NOT Railway
├── docs/                             # This file, SECURITY, BUILD_AND_RELEASE, UPDATE_SYSTEM, ONBOARDING
├── .github/workflows/                # contracts.yml (free smoke) + retired release.yml
├── .gitattributes                    # UTF-8 LF enforced (Windows mojibake/CRLF lessons)
└── AGENTS.md                         # Session briefing + dev commands
```

**Second repo (private):** `LexSort-Inc/Lexsort-Vera-Pro`
(`02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/lexsort-vera-pro/`) — same shape,
Pro feature flags + modules (emailer, license, benchmark, history).
`handoffs/` there is the machine coordination channel (see below).

---

## Data Flow

### Chat
1. User types message → React `sendMessage()` 
2. If streaming: `fetch()` POST to `http://127.0.0.1:11434/v1/chat/completions`
3. Response streamed via ReadableStream → chunks appended to DOM
4. On save: `invoke('save_messages', ...)` → SQLite via `conversations.rs`

### Calendar Import
1. React calls `invoke('import_calendar_events', { daysAhead: 30 })`
2. Rust spawns `osascript -l JavaScript` with JXA script using EventKit
3. Parsed JSON → `Vec<Task>` returned to frontend
4. Events live in React state (not persisted to SQLite)

### Model Management
1. `detect_hardware` → sysinfo RAM/CPU/GPU → `select_model()` picks best Ollama tag
2. `check_model_exists` → `ollama list` subprocess
3. `download_model` → spawns `ollama pull <tag>` (streams progress via events)
4. `start_inference_server` → ensures Ollama is running
5. `benchmark_model` → sends test prompts, measures tokens/sec

---

## Key Architecture Decisions

### No Feature Flags
Cargo.toml has no `free`/`pro` features. The Freeware and Pro repos are separate clones with different codebases. This avoids conditional compilation complexity and keeps each binary minimal.

### No MLX for v1
All inference goes through Ollama. The MLX path (Python venv + `mlx_lm.server`) was explored and deferred to a future release. Model IDs are Ollama tags only (e.g. `qwen2.5-coder:7b`).

### Direct HTTP Chat (no Rust proxy)
Chat completions are sent directly from React to Ollama via `fetch()`, bypassing Rust IPC. This keeps streaming simple (ReadableStream) and avoids double-serialization. The trade-off is that Rust never sees chat content at runtime.

### Ephemeral Calendar Events
Calendar events are fetched fresh on every mount/refresh via JXA/PowerShell and stored only in React state. They are never written to SQLite. This means no dedup or stale data, but events disappear on app restart.

### Module System
Dynamic modules (ProMailer, Research Lab, Guardian Watch) are loaded at runtime via `registerVeraModule` global + IIFE JavaScript bundles. The `ModuleDrawer` component shows available modules; clicking one loads its bundle and renders the exported component.

### Silent Auto-Update
`useUpdater.ts` + `tauri-plugin-updater`: channel feeds under
`website/api/` (`{freeware,pro}-{stable,beta}-latest.json`), one shared
Ed25519 keypair, background download + restart-to-apply. Beta is opt-in
with a persistent in-app Beta pill. Full design: [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md).

### Two-Machine Builds (internal only — no CI releases)
ThinkCentre builds Windows (`.msi`/`-setup.exe`), M1 Pro builds macOS
(`aarch64` + `x64` `.dmg` + updater `.tar.gz`/`.sig`). Never push `v*`
tags to trigger CI. Ownership map: `handoffs/2026-09-03-28-*`
in the Pro repo; policy: `AGENTS.md`.

### Machine Coordination
The Pro repo's `handoffs/` directory is the async message bus
(ID-numbered notes + `BOARD.md` index) plus the age-encrypted secret
channel (`SECURE-CHANNEL.md`, `keys/`, `inbox/`). Read the board tail
before starting cross-machine work.

---

## Current Technical Debt

1. **lib.rs** (~2800 lines) — all ~50+ Tauri commands in one file. Should split into `commands/` modules.
2. **App.tsx** (~2800 lines, 40+ useState) — boot logic, chat state, settings, and module routing in one component.
3. **app.css** (~3900 lines) — single monolithic stylesheet.
4. **32 `unwrap()` calls** in production Rust — risk of panics on binding, serialization, path conversion.
5. **56 `any` usages** in TypeScript — degrades strict mode benefits.
6. **Duplicated DB schema** — quick_organizer.rs and conversations.rs both create the same `tasks` table.

---

## Entitlements (macOS)

Only `com.apple.security.cs.disable-library-validation` for Python C-extension loading (reserved for future MLX path). No sandbox — distributed directly, not through Mac App Store.

---

## See Also

- [SECURITY.md](SECURITY.md) — Threat model, CSP, zero-telemetry
- [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) — Internal builds, signing, feeds
- [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md) — Silent updater design + publishing
- [ONBOARDING.md](ONBOARDING.md) — New-developer guide (read order, machines, boards)
