# ARCHITECTURE.md — VERA Personal AI

**Repository:** Lexsort-Core/LexSort-Vera-Personal-AI  
**Last updated:** June 23, 2026  
**Covered phases:** 1–5 (Rust split, Ollama proxy, React split, CSS cleanup, Feature-flag unification + Dual-engine)

---

## Build Matrix

| Component | Freeware (default) | Pro |
| :--- | :--- | :--- |
| **Rust** | `cargo build` (default feature `free`) | `cargo build --features pro` |
| **React/Vite** | `VITE_VERA_EDITION=free vite build` | `VITE_VERA_EDITION=pro vite build` |
| **npm deps** | `better-sqlite3` skipped (optional) | `better-sqlite3` bundled |
| **Bundle size** | ~200 KB gzipped | ~280 KB gzipped |
| **Compile-time flag** | `__VERA_PRO__ = false` (tree-shaken) | `__VERA_PRO__ = true` |

**Build commands:**

```bash
# Freeware (default features, VITE_VERA_EDITION=free)
npm run tauri build

# Pro (Cargo features + Vite mode)
npm run tauri build -- --features pro        # passes --features pro through npm to cargo
# or equivalently:
VITE_VERA_EDITION=pro cargo tauri build --features pro
```

---

## Directory Structure

```
vera/
├── src-tauri/
│   ├── Cargo.toml                    # [P5] features = ["free", "pro"]
│   ├── build.rs                      # [NEW] Downloads Windows Ollama binary before build
│   ├── src/
│   │   ├── main.rs                   # Unchanged entry point
│   │   ├── lib.rs                    # [P5] Merged single-source, #[cfg] gated
│   │   ├── core/                     # [P1] Shared business logic (no #[tauri::command])
│   │   │   ├── mod.rs                # Re-exports engine, ollama, mlx, hardware, etc.
│   │   │   ├── app_state.rs          # [P2] CancellationToken + EngineState
│   │   │   ├── engine.rs             # [NEW] EngineManager (dispatcher)
│   │   │   ├── ollama.rs             # [NEW] Windows/Linux: spawn, health, PID
│   │   │   ├── mlx.rs                # [NEW] macOS: venv bootstrap, python -m mlx_lm.server
│   │   │   ├── model_map.rs          # [NEW] Ollama tag ↔ MLX HF path translation
│   │   │   ├── hardware.rs           # Hardware detection (copied from Freeware)
│   │   │   ├── model.rs              # Model selection, download, benchmark (copied from Freeware)
│   │   │   ├── config.rs             # ConfigManager (read/write JSON)
│   │   │   ├── update.rs             # Manifest fetch + version compare
│   │   │   └── lock.rs               # Single-instance TCP lock
│   │   ├── commands/                 # [P1] Thin Tauri wrappers
│   │   │   ├── mod.rs
│   │   │   ├── proxy.rs              # [P2] Streams chat through Rust (uses EngineManager)
│   │   │   ├── engine.rs             # [NEW] start/stop/status Tauri commands
│   │   │   ├── hardware.rs           # Wraps core/hardware.rs
│   │   │   ├── model.rs              # Wraps core/model.rs
│   │   │   ├── config.rs             # Wraps core/config.rs
│   │   │   └── update.rs             # Wraps core/update.rs
│   │   ├── conversations.rs          # Unchanged (SQLite CRUD)
│   │   ├── quick_organizer.rs        # Unchanged (JSON task store)
│   │   └── calendar_bridge.rs        # Unchanged (osascript/PowerShell)
│   ├── entitlements.plist            # [P5] Added com.apple.security.cs.disable-library-validation
│   ├── tauri.conf.json               # beforeBuildCommand reads VITE_VERA_EDITION
│   └── resources/                    # Bundled assets
│       └── ollama.exe                # [Win] Downloaded via build.rs
│
├── src/                              # React Frontend
│   ├── main.tsx                      # [P5] Conditional window.React (Pro only)
│   ├── App.tsx                       # [P3+P5] Orchestrator + dynamic Pro imports
│   ├── env.d.ts                      # [P5] declare const __VERA_PRO__: boolean
│   ├── routes/                       # [P3] View-level components
│   │   ├── BootScreen.tsx            # Calls start_inference_server (dispatches to EngineManager)
│   │   ├── ChatView.tsx
│   │   ├── SettingsView.tsx
│   │   └── ModuleView.tsx
│   ├── components/
│   │   ├── chat/                     # MessageList, ChatInput, Sidebar, GreetingCard
│   │   ├── boot/                     # PhaseIndicator, DownloadProgress, BenchmarkDisplay
│   │   ├── settings/                 # SettingsModal, ModelSelector, DiagnosticsPanel
│   │   ├── updates/                  # UpdateBanner, UpdateProgress
│   │   ├── ModuleDrawer.tsx          # Existing
│   │   ├── ModuleErrorBoundary.tsx   # Existing
│   │   ├── FeedbackBanner.tsx        # Existing
│   │   └── LicenseGate.tsx           # [P5] Pro-only, tree-shaken in free
│   ├── context/                      # [P3] Zustand stores
│   │   ├── AppStateContext.tsx
│   │   └── ChatContext.tsx
│   ├── hooks/
│   │   ├── useBootSequence.ts        # [P3] Extracted from App.tsx
│   │   ├── useChat.ts                # [P2+P3] Tauri proxy streaming
│   │   ├── useConversations.ts       # [P3] Conversation CRUD
│   │   ├── useSettings.ts            # [P3]
│   │   ├── useUpdateChecker.ts       # [P3]
│   │   ├── useEngine.ts              # [NEW] Engine status + startup
│   │   └── useSpeechRecognition.ts   # Existing (note: disabled)
│   ├── services/
│   │   └── tauri.ts                  # [P5] Unified invoke wrapper + Pro-gated functions
│   ├── styles/
│   │   ├── global.css                # [P3+] Cleaned reset + imports
│   │   ├── boot.css                  # Boot screen styles
│   │   ├── chat.css                  # Chat + sidebar + greeting styles
│   │   └── settings.css              # Settings + diagnostics + update styles
│   ├── types/
│   │   └── module.ts                 # Existing
│   ├── SupportPanel.tsx              # Existing
│   ├── UpdateStatusIndicator.tsx     # Existing
│   └── vite-env.d.ts                 # Vite client types
│
├── package.json                      # [P5] Scripts for both editions
├── vite.config.ts                    # [P5] define: { __VERA_PRO__ }
├── tsconfig.json                     # [P5] Added types: ["vite/client"]
└── .github/workflows/
    └── release.yml                   # [P5] Matrix: freeware + pro jobs
```

---

## Phase Summary

| Phase | Sprint Days | Deliverable | Key Metric |
|-------|-------------|-------------|------------|
| **P1: Rust Module Split** | 1–3 | `core/` + `commands/` directories, shared logic separated from Tauri wrappers | Incremental compile ~40% faster |
| **P2: Ollama Proxy** | 4–5 | Chat routes through `proxy_chat_completion` Tauri command with `CancellationToken` | Privacy gap closed — Rust sees every message |
| **P3: React Architecture Split** | 6–8 | Route-level components, Zustand context stores, custom hooks | `App.tsx` < 100 lines |
| **P3b: CSS Cleanup** | 9–10 | `boot.css`, `chat.css`, `settings.css` split from monolithic `app.css` | Per-route CSS < 500 lines |
| **P5: Feature-Flag Unification** | 11–14 | Single `lib.rs` with `#[cfg(feature = "pro")]`, single `vite.config.ts` with `__VERA_PRO__` | Zero duplicated core files |
| **P5b: Dual Engine** | +2 | `EngineManager` with MLX (macOS) / Ollama (Win/Linux) auto-detection | Frontend unchanged |

---

## Key Architecture Decisions

### Why a Rust proxy for chat instead of direct `fetch`?

The Freeware app sent `fetch` requests directly to `http://127.0.0.1:11434/v1/chat/completions`, bypassing the Rust backend entirely. This meant:
- The Rust layer was blind to conversations — no audit, no filtering, no rate-limiting
- The CSP had to allow `connect-src http://127.0.0.1:11434`, opening a wider attack surface
- Cancellation was frontend-only (AbortController); the Ollama stream continued server-side

**After P2:** The frontend calls `invoke('proxy_chat_completion', ...)` which streams through Rust via Tauri events. The CSP can be tightened to `connect-src ipc:`.

### Why `#[cfg(feature = "pro")]` instead of a runtime license check?

The Pro edition's extra modules (license, module_loader, emailer, guardian_watch) and their dependencies (ed25519-dalek, keyring, libloading) compile to ~200 KB of binary. Gating them at compile time means:
- Freeware users never load or link these dependencies
- No runtime branch for "am I Pro?" on every command invocation
- CI produces two distinct binaries, which can be signed and distributed separately

The Pro app still validates a license key at runtime via Ed25519 — the compile-time gate controls *which commands exist in the binary*, not whether they're usable.

### Why MLX on macOS instead of Ollama?

Apple Silicon's unified memory and Neural Engine give MLX a 4x prompt processing advantage over Ollama on the same hardware. The `EngineManager` abstracts the engine choice so the frontend never knows which engine is running. Model IDs are translated transparently via `model_map.rs` (e.g., `llama3.2:3b` → `mlx-community/Llama-3.2-3B-Instruct-4bit`).

### Why no sandbox?

VERA is distributed directly (not through the Mac App Store). This keeps the entitlements simple — only `com.apple.security.cs.disable-library-validation` is needed (to load Python C-extensions for MLX). If App Store distribution is ever required, the entitlements list expands to include sandbox allowances for JIT, DYLD, and network.

---

## System Architecture Overview

```mermaid
flowchart TB
    subgraph Frontend ["React (Tauri WebView)"]
        Boot[BootScreen] --> EngineCheck{Engine healthy?}
        EngineCheck -->|No| EngineSetup[Start Inference Server]
        EngineCheck -->|Yes| Chat[ChatView]
        Chat --> |invoke: proxy_chat_completion| Proxy
        Chat --> |invoke: save_messages| TauriIPC
        Chat --> |invoke: get_conversations| TauriIPC
        Settings --> |invoke: set_active_model| TauriIPC
        ProModules[LicenseGate / ModuleStore] --> |invoke: verify_license| TauriIPC
        Boot --> |invoke: detect_hardware| TauriIPC
    end

    subgraph Backend ["Rust (Tauri Commands)"]
        TauriIPC --> Commands
        Commands --> Proxy
        Commands --> EngineCmd[engine::start/stop/status]
        Commands --> Hardware[hardware::detect]
        Commands --> Model[model::download/benchmark]
        Commands --> Config[config::read/write]
        Commands --> Update[update::check]
        Commands --> Conv[conversations::CRUD]
        Commands --> Org[quick_organizer::CRUD]
        Commands --> Calendar[calendar_bridge::import]
        subgraph Pro [gated by #[cfg(feature = \"pro\")]]
            License[license::verify]
            ModuleLoader[module_loader::install/swap]
            Emailer[emailer::send]
            Guardian[guardian_watch::status]
        end
    end

    subgraph Core ["Shared Business Logic (no Tauri deps)"]
        EM[EngineManager] -->|EngineType::MlX| MLX[mlx.rs: venv + python -m mlx_lm.server]
        EM -->|EngineType::Ollama| Ollama[ollama.rs: spawn ollama serve]
        Proxy -->|dynamic port| EM
        MM[model_map.rs: tag → HF path] --> MLX
    end

    subgraph Inference ["Inference Engine"]
        MLX ---|port 8080| MLXServer[MLX-LM Server]
        Ollama ---|port 11434| OllamaServer[Ollama]
    end

    Proxy -->|reqwest POST| Inference
    EngineCmd --> EM
```

---

## Entitlements (macOS)

```xml
<!-- Required for MLX Python C-extension loading (non-sandboxed distribution) -->
<key>com.apple.security.cs.disable-library-validation</key>
<true/>

<!-- These are already present: signing identity, no sandbox -->
```

---

## Implementation Checklist (Before First Build)

To ensure a successful first compilation, the development team must complete these pre-requisite tasks before running `cargo build` or `npm run dev`.

### 1. Copy existing implementations into `core/`

- Open `src-tauri/src/lib.rs` from the **Freeware** codebase.
- Copy the full body of `detect_hardware`, `download_model`, `benchmark_model`, `select_model`, and `ensure_lexsort_dirs` into their respective files in `src-tauri/src/core/` (e.g., `hardware.rs`, `model.rs`, `benchmark.rs`).
- Replace the `unimplemented!()` stubs in `commands/` with thin wrappers: e.g., `crate::core::hardware::detect_hardware().await`.

### 2. Implement `core/ollama.rs` and `core/mlx.rs` as siblings

- `engine.rs` acts as the **dispatcher** — it calls `ollama::start()` or `mlx::start()` based on `EngineType::detect()`.
- `ollama.rs` contains the **Windows/Linux** implementation: copying the binary from `resources/` to `$APPDATA`, spawning `ollama serve`, and checking health on port 11434.
- `mlx.rs` contains the **macOS** implementation: checking for `python3`, creating a venv in the app data dir, running `python -m mlx_lm.server`, and checking health on port 8080 (with fallback).
- **Do not** place the entire engine logic inside `engine.rs` — keep it as a thin orchestrator.

### 3. Bundle Windows Ollama binary

- Download `ollama-windows-amd64.exe` from [https://github.com/ollama/ollama/releases](https://github.com/ollama/ollama/releases).
- Place it at `src-tauri/resources/ollama.exe`.
- Add a `build.rs` script to copy it to the target folder, or commit it directly to `resources/`. During runtime, `core/ollama.rs` copies it to `$APPDATA/lexsort/vera/ollama/ollama.exe` on first run.

### 4. Initialize SQLite tables

- In `conversations.rs`, add `fn init_db() -> Result<(), String>` that creates the `conversations` and `messages` tables.
- Call it from `lib.rs::run()` before any command uses the DB.

### 5. Verify Tauri v2 APIs

- Use `app_handle.path().app_data_dir()` (returns `Result<PathBuf, ...>`).
- **Never** use `path_resolver()` — that is Tauri v1.

### 6. Test the Python venv on macOS

- Ensure the system has `python3` (Homebrew or official installer). The app will create `mlx-venv` automatically on first run.
- If `python3` is missing, the `check_engine_requirements` command will return a user-friendly error.

### 7. TypeScript guard for React.lazy imports in App.tsx

Use a wrapper pattern to avoid null checks:

```tsx
const ProComponents = __VERA_PRO__
  ? {
      LicenseGate: React.lazy(() => import("./components/LicenseGate")),
      Sidebar: React.lazy(() => import("./components/Sidebar")),
    }
  : null;

// In render:
{__VERA_PRO__ && ProComponents && (
  <Suspense fallback={<div className="boot-status"><Spinner /></div>}>
    <ProComponents.LicenseGate onValidated={() => setLicenseValid(true)} />
  </Suspense>
)}
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **Engine** | The inference backend (Ollama or MLX-LM Server) |
| **EngineManager** | Rust struct that detects OS, spawns/kills the engine, manages port and PID |
| **Proxy** | Tauri command that receives chat messages from React, forwards to engine, streams response back via events |
| **`__VERA_PRO__`** | Compile-time boolean in React (Vite `define`) — gates Pro UI and service calls |
| **`#[cfg(feature = "pro")]`** | Rust conditional compilation — gates Pro structs, commands, and dependencies |
| **P-phases** | The 5 numbered refactoring phases described in the design sprint |

---

## Getting Started (For the Dev Team)

```bash
git clone <repo>
cd lexsort-personal-ai
npm install

# For the M1 Pro today (Freeware, MLX on macOS / Ollama on Win):
npm run tauri:dev

# For the Mac Studio tomorrow (Pro, with additional modules):
npm run tauri:dev:pro
```

**First-run experience:**
- On macOS, the app will detect `python3`, create `~/Library/Application Support/com.lexsort.vera/mlx-venv`, and install `mlx-lm` (approx. 1–2 minutes).
- On Windows, it will copy the bundled `ollama.exe` and run `ollama serve`.
- The boot screen will show progress for each step. Once the engine is healthy, VERA's chat interface opens.

**Performance expectations:**
- **M1 Pro (16GB)** — ~50–80 tok/s prompt processing, ~10–15 tok/s generation for 7B models.
- **Mac Studio (M4/M5 Ultra)** — ~200+ tok/s generation, Neural Engine accelerates prompt processing by 4x.

---

## See Also

- [SECURITY.md](SECURITY.md) — Threat model, CSP hardening, zero-telemetry guarantees
- [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) — CI/CD pipeline, signing, notarization
- `docs/architecture/` — Per-phase design handoffs from the architecture sprint

---

*This document supersedes all previous drafts. Happy building!*
