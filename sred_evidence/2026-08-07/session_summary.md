# Session Summary — 2026-08-06/07: Windows Chat-Connection Arc

**Final state:** Windows chat connection RESOLVED + VERIFIED end-to-end.
VERA Freeware v1.1.11 completed its first real chat exchange on a clean
Windows 11 ThinkCentre (no dev tools) at **2026-08-07 22:10:56 EDT**
("Hello! How can I assist you today?").

Previously, chat could not complete even though `/api/tags` responded,
models downloaded, and raw PowerShell POSTs to port 11434 succeeded.

## Root causes fixed (chronological)

| # | Fix (commit, version) | Technical problem |
|---|---|---|
| 1 | Runner layout — `424f1a9` (v1.1.8) | v0.9.6 no longer ships `ollama_runners/`; real layout is `lib/ollama/*.dll` (Windows) / flat `libggml-*.so` (macOS); `OLLAMA_RUNNERS_DIR` is dead code. Range-request of the official artifact proved it. |
| 2 | CI release race — `1d5d6c8` | Concurrent tag-push (macOS/Linux) + manual dispatch (Windows) both called `createRelease` for one tag → GitHub releases-API eventual 404 (upstream tauri-action#1270) → release with zero assets. Now `prepare-release` job + `releaseId` uploads + `retryAttempts: 3` + concurrency group. |
| 3 | CORS / invalid origin — `834980d` (v1.1.10) | `tauri://localhost` in `OLLAMA_ORIGINS` panics gin-contrib/cors v1.7.2 at startup (VERA-spawned daemon dies) or, for an external daemon, default origins lack `http://tauri.localhost` (the real WebView2 origin) → 403 preflight → "Failed to fetch". |
| 4 | Process lifecycle — `5a72965` (v1.1.11) | `.is_ok()` on `ollama list` probe is true even for exit≠0 → VERA never spawned and never owned a handle; second blind `serve` spawn in `list_installed_models` orphaned duplicate daemons with no env vars. |

Supporting diagnostics: `a67a74b` (real request logging, retry/backoff,
model-vs-installed comparison, v1.1.8) and `a273683` (file-based
`chat-debug.log` via new `append_chat_log` command, v1.1.9).

## Verification artifacts (clean Windows ThinkCentre, v1.1.11)

`~/.lexsort/logs/ollama-lifecycle.log`:

```
[2026-08-07 22:05:50.449] start_server: SPAWNING new daemon
    (ollama list exit != 0 (no daemon on 11434)), model=phi3:mini
[2026-08-07 22:05:50.454] start_server: daemon spawned PID=21144
```

Exactly one daemon spawned, no duplicate processes.

`~/.lexsort/logs/chat-debug.log`:

```
[2026-08-07 22:10:56.015] sending to
    http://127.0.0.1:11434/v1/chat/completions model=phi3:mini
    origin=http://tauri.localhost
```

No subsequent "Failed to fetch". First assistant response rendered in UI.

## Not fixed (minor cosmetics, tracked in MASTER_HANDOFF #9/#10)

1. Model download description text doesn't always match the selected
   model ("Solid 7B model... ~4.5GB" shown for smaller models).
2. Legacy `C:\Program Files\LexSort Personal AI\` folder not cleaned up
   by the rebranded installer.

## SR&ED

Entry: `sred_log_vera.html` (id **1786241456000**, 2026-08-07,
08:00–22:10, 8.5h). Evidence files in this folder; `git_log.txt`
includes all relevant commits.