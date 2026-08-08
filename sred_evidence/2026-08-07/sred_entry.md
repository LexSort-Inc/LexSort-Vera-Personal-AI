# SR&ED Entry — 2026-08-07

- **ID:** 1786241456000
- **Date:** 2026-08-07
- **Time:** 08:00 – 22:10 (8.5 h, blocks around midday gap)
- **Area:** Ollama Sidecar / CORS / Process Lifecycle / CI Release Pipeline
- **Outcome:** Windows chat connection **RESOLVED + VERIFIED** live on a
  clean ThinkCentre (v1.1.11, 2026-08-07 22:10:56 EDT); four distinct root
  causes fixed across v1.1.8–v1.1.11
- **Agent:** OpenCode
- **Arc commits:** `424f1a9` · `1d5d6c8` · `a67a74b` · `a273683` ·
  `834980d` · `5a72965`

## Problem
On a clean Windows 11 machine VERA Freeware could not complete a single
chat exchange even though `/api/tags` responded, models downloaded, and
direct PowerShell POSTs to 127.0.0.1:11434 succeeded. Four independent
technical gaps contributed, each requiring its own investigation:

1. **Runner library layout** — the sidecar assumed the pre-v0.6
   `ollama_runners/` directory layout, but the actual v0.9.6 release zip
   ships `lib/ollama/*.dll` on Windows and flat `libggml-*.so` files on
   macOS, and `OLLAMA_RUNNERS_DIR` is not referenced anywhere in v0.9.6
   source. The original runner-copy fix therefore never actually solved
   inference-library discovery.
2. **CI release race** — concurrent GitHub Actions runs (v-tag push for
   macOS/Linux + manual dispatch for Windows) both called `createRelease`
   for the same tag and hit the releases-API eventual-consistency 404s
   (upstream tauri-action#1270), producing releases with zero platform
   assets attached.
3. **Invalid CORS origin** — `OLLAMA_ORIGINS` contained the invalid scheme
   `tauri://localhost`. gin-contrib/cors v1.7.2 (bundled in Ollama v0.9.6)
   validates origin schemes at startup: VERA-spawned daemons panicked and
   died; an externally-detected daemon kept Ollama's default origins,
   which lack the real Windows WebView2 origin (`http://tauri.localhost`),
   producing a CORS preflight 403 that the webview collapsed into a generic
   "Failed to fetch".
4. **Lifecycle exit-code bug** — the "is a daemon running" checks used
   `.output().is_ok()` / `.status().is_ok()`, which evaluate to `Ok` even
   when the spawned probe exits non-zero ("could not connect"). VERA
   falsely concluded a daemon was running, so it never spawned one, never
   stored a child handle, and therefore could never kill anything on
   shutdown. A second, self-healing spawn inside `list_installed_models`
   launched bare `ollama serve` processes with no env vars and no owner —
   leaving orphaned/duplicate `ollama.exe` processes across sessions and
   short windows where nothing was bound to port 11434.

## Uncertainty

It was not known in advance whether:

- (a) a range-request of the real GitHub-hosted v0.9.6 zip would prove the
  runner libraries were relocated (to `lib/ollama/` on win32, flat
  `libggml-*.so` on darwin) and that `OLLAMA_RUNNERS_DIR` was dead code in
  v0.9.6;
- (b) the `createRelease` 404s on simultaneous same-tag workflow runs were
  GitHub-side eventual consistency — not a job permissions problem — and
  whether a dedicated `prepare-release` job creating the release exactly
  once ahead of all platform upload jobs could deterministically eliminate
  zero-asset releases;
- (c) gin-contrib/cors v1.7.2 rejects non-http(s) origin schemes at
  startup such that `tauri://localhost` panics the process, and whether the
  sanitized set (`http://tauri.localhost` + http defaults) returns a 204
  preflight with `Access-Control-Allow-Origin` for the actual Windows
  WebView2 origin;
- (d) std::process result semantics (`output()`/`status()` return `Ok`
  even for non-zero exits) were the core of the never-spawn/never-kill
  lifecycle defect, and whether a single spawn site, exit-code-based
  checks, and kill+wait() on every shutdown path guarantee exactly one
  bound daemon on a clean machine.

## Work

- **`424f1a9` (v1.1.8):** verified the v0.9.6 layout via range-request of
  the official release artifact; retargeted `copy_dir_recursive()` to the
  real `lib/ollama` layout; removed the dead `OLLAMA_RUNNERS_DIR` env var
  from all three spawn sites.
- **`1d5d6c8`:** added a `prepare-release` job in `release.yml` that
  creates the GitHub release exactly once; platform jobs upload via
  `releaseId` with `retryAttempts: 3`; a concurrency group keyed on the tag
  serializes same-tag runs.
- **`a67a74b` (v1.1.8) / `a273683` (v1.1.9):** chat diagnostics —
  retry/backoff, per-request logging, model-vs-installed comparison — then a
  new `append_chat_log` Tauri command that writes timestamped lines to
  `~/.lexsort/logs/chat-debug.log` so field builds without DevTools are
  debuggable from the file alone.
- **`834980d` (v1.1.10):** sanitized `OLLAMA_ORIGINS` at both spawn sites —
  `lib.rs start_inference_server` and `server.rs start_ollama` — removing
  `tauri://localhost`, keeping `http://tauri.localhost`; the webview origin
  is logged on every chat send in `App.tsx`.
- **`5a72965` (v1.1.11):** daemon-alive checks now test
  `status.success()`; the blind self-heal spawn in `list_installed_models`
  was removed so `start_inference_server` is the single spawn site;
  kill+wait added to `stop_inference_server`, `factory_reset`, `exit_app`,
  and the vera-server shutdown path; new
  `~/.lexsort/logs/ollama-lifecycle.log` timestamps every spawn/reuse/kill
  with PID and reason.
- **Verification (clean ThinkCentre, v1.1.11):**
  - `ollama-lifecycle.log`: `[2026-08-07 22:05:50.449] start_server:
    SPAWNING new daemon (ollama list exit != 0 (no daemon on 11434)),
    model=phi3:mini` followed by `daemon spawned PID=21144` — exactly one
    process, no duplicates.
  - `chat-debug.log`: `[2026-08-07 22:10:56.015] sending to
    http://127.0.0.1:11434/v1/chat/completions model=phi3:mini
    origin=http://tauri.localhost` and no subsequent "Failed to fetch".
  - First real assistant response ("Hello! How can I assist you today?")
    rendered in the UI.
  - `cargo check` + `npx tsc --noEmit` clean before every tag push.