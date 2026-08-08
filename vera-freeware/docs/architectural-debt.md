# Architectural Debt

## AD-001: Chat inference via Ollama proxy

**Current:** `ws_chat` proxies to VERA-managed Ollama child process on
port 11434 via HTTP (`/api/generate`).

**Target:** Direct inference through shared Tauri state, eliminating
the internal HTTP hop and Ollama dependency.

**Trigger:** When embedded llama.cpp engine replaces Ollama as the
active inference backend (planned).

**Risk if deferred:** None for users (Ollama is VERA-managed).
Performance overhead of internal HTTP hop is negligible for
chat use case.

**Blocks:** Windows no-Ollama constraint cannot be met until this
is resolved.

---

## Resolved — 2026-08-07 (Windows Ollama connection arc, v1.1.8–v1.1.11)

The Ollama-sidecar connection issues that previously blocked live Windows
chat are fixed and **verified on-device** (clean ThinkCentre, v1.1.11,
2026-08-07 22:10:56 EDT):

- Runner libraries: retargeted to the real v0.9.6 layout
  (`lib/ollama/*.dll` on Windows, flat `libggml-*.so` on macOS);
  dead `OLLAMA_RUNNERS_DIR` env var removed (`424f1a9`).
- CI release race fixed (`1d5d6c8`): single `prepare-release` job,
  `releaseId` uploads, `retryAttempts:3`.
- CORS: `OLLAMA_ORIGINS` sanitized at every spawn site — removed the
  invalid `tauri://localhost` scheme, kept `http://tauri.localhost`
  for the Windows WebView2 origin (`834980d`).
- Lifecycle: daemon-alive detection now uses exit codes
  (`status.success()`), `start_inference_server` is the **single** spawn
  site, every shutdown path kills and `wait()`s, and
  `~/.lexsort/logs/ollama-lifecycle.log` records every spawn/reuse/kill
  with PID and reason (`5a72965`).
