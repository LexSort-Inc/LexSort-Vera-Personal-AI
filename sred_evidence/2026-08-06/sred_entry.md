# SR&ED Entry — 2026-08-06

- **ID:** 1786059521000
- **Date:** 2026-08-06
- **Time:** 16:00 – 19:38 (3.6 h)
- **Area:** Ollama Sidecar / Windows Runtime
- **Outcome:** Windows inference blocker fixed (missing `ollama_runners` dir + CORS); macOS latent bug caught
- **Agent:** OpenCode

## Problem
On Windows the Ollama sidecar presented a non-obvious failure mode: the server started,
`/api/tags` responded, and the app booted normally, but the first `/api/generate` call
returned HTTP 500 with `Dynamic LLM libraries []` and `server cpu not listed in available
servers map`. Device has 21.6 GiB RAM so memory pressure was not the cause. In parallel the
Tauri webview received 403 on `OPTIONS /v1/chat/completions`. The separate inference paths
made the true gap non-obvious: the extraction step hosted the server fine, only the
model-load path failed. Additionally, an installer-filename artifact
(`LexSort.Personal.AI_1.1.6`) needed confirmation against the rebranded tauri.conf
productName (`LexSort VERA`).

## Uncertainty
It was not known in advance whether:
- (a) setup_engine preserved the `ollama_runners/` directory from the extracted Ollama
  bundle — only `ollama.exe` was copied to `~/.lexsort/bin` then the extraction dir was
  destroyed, so runner binaries never reached the persistent location;
- (b) Windows Ollama honors `OLLAMA_RUNNERS_DIR` when set on the spawned serve child
  process rather than needing a global environment variable;
- (c) the macOS extraction path (`Ollama.app/Contents/Resources`) had the same
  runner-persistence gap, which would surface as an ARM inference failure later;
- (d) Ollama 0.9.6 CORS enforcement blocks the Tauri custom protocol origin
  (`tauri://localhost`) for `/v1/chat/completions` when `OLLAMA_ORIGINS` only lists
  `127.0.0.1:<port>`.

## Work
- Added `copy_dir_recursive()` helper and `ollama_runners_dir()` resolver in
  `lib.rs:58-88`.
- Windows extraction branch now copies `ollama_runners/` from the extracted zip into the
  persistent bin dir after `ollama.exe` (destructive delete of extracted dir happens only
  after the runner copy finishes), with a warning log if the zip lacks the folder; macOS
  extraction now copies `Ollama.app/Contents/Resources/ollama_runners` identically.
- Set `OLLAMA_RUNNERS_DIR` on the serve child in `start_inference_server`
  (`lib.rs:733-742`), on the `list_installed_models` retry-serve spawn
  (`lib.rs:1860-1862`), and on `server.rs start_ollama` headless path (`server.rs:33-48`).
- Expanded `OLLAMA_ORIGINS` from `http://127.0.0.1:<port>` only, to
  `http://localhost`, `http://localhost:1420`, `http://tauri.localhost`,
  `tauri://localhost`, `http://127.0.0.1:*` for both dev and production origins.
- Verified `cargo check` zero warnings, `npx tsc --noEmit` clean; confirmed
  `tauri.conf.json` productName is already `LexSort VERA` so the next Windows MSI will be
  `LexSort.VERA_1.1.7_x64_en-US.msi` (stale `Personal.AI` filename was a pre-rebrand
  artifact).

## Pending Validation
Clean Windows 11 clean-install validation required. Pass condition:

```
OLLAMA_RUNNERS_DIR: C:\...\ollama_runners
Dynamic LLM libraries [cpu ...]
```

Both non-empty in the startup log after onboarding.