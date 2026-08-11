# ARCHITECTURE.md — VERA Personal AI

**Repository:** Lexsort-Core/LexSort-Vera-Personal-AI  
**Last updated:** July 2, 2026  
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama

---

## Overview

VERA is a local-first desktop app using Tauri v2. The frontend (React 19 + TypeScript via Vite) communicates with the Rust backend through Tauri IPC (`invoke`/`listen`). Chat completions bypass IPC and go directly to Ollama's HTTP API at `http://127.0.0.1:11434` for streaming.

---

## Directory Structure

```
vera/
├── src-tauri/                        # Rust backend
│   ├── Cargo.toml                    # No feature flags (single binary)
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   ├── lib.rs                    # ~2800 lines: all Tauri commands inline
│   │   ├── quick_organizer.rs        # SQLite task CRUD + recurrence engine
│   │   ├── calendar_bridge.rs        # JXA (macOS) / PowerShell (Win) calendar import
│   │   ├── conversations.rs          # SQLite conversation + message CRUD
│   │   ├── recurrence_parser.rs      # Natural-language → RRULE parser
│   │   ├── scheduler.rs              # Background recurring-task advance loop
│   │   ├── rest_api.rs               # Axum REST API on localhost:8888
│   │   └── team_lab/                 # Distibuted coding module
│   ├── tauri.conf.json
│   └── capabilities/default.json     # Tauri v2 permissions
│
├── src/                              # React frontend
│   ├── main.tsx
│   ├── App.tsx                       # ~2800 lines: boot, chat, settings, routing
│   ├── app.css                       # ~3900 lines: single stylesheet
│   ├── components/
│   │   ├── QuickOrganizer/           # Calendar/task week view
│   │   ├── ModuleDrawer.tsx
│   │   ├── ModuleErrorBoundary.tsx
│   │   ├── FeedbackBanner.tsx
│   │   └── TeamLab/
│   ├── hooks/
│   │   └── useSpeechRecognition.ts
│   ├── types/
│   │   └── module.ts
│   ├── SupportPanel.tsx
│   └── UpdateStatusIndicator.tsx
│
├── vera-engine/                      # Standalone Rust binary (Pro path — llama.cpp)
│   ├── src/
│   │   ├── main.rs                   # CLI args, server dispatch
│   │   ├── server.rs                 # Axum HTTP server + scheduler
│   │   ├── models.rs                 # Model capability matching
│   │   ├── system.rs                 # Hardware detection
│   │   ├── token.rs                  # Tokenizer via llama-cpp-sys2
│   │   └── config.rs                 # TOML config
│   └── Cargo.toml
│
├── scripts/                          # Build tools
│   ├── build-module.sh               # Create .vera-module ZIP
│   ├── sign-module.js                # Ed25519 sign module
│   └── generate-test-keys.js         # Beta license key gen
│
├── website/                          # Static site (lexsort.com)
│   └── netlify/                      # Serverless functions
│
├── discord-bot/                      # Railway-deployed Discord bot
├── docs/
│   ├── ARCHITECTURE.md               # This file
│   ├── SECURITY.md
│   └── BUILD_AND_RELEASE.md
└── AGENTS.md                         # Session briefing + dev commands
```

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
- [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) — CI/CD, signing, notarization
