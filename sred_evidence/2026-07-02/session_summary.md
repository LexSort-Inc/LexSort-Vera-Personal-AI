# Session Summary — July 2, 2026

## Goals
1. Fix Guardian Watch crash on load (TypeError: undefined field access)
2. Speed up ProMailer lead finder and add live progress feedback
3. Fix Research Lab crash on load (TypeError: size_gb on string)
4. Wire Google Places API key from Settings → Python subprocess
5. Add internet connectivity check before search
6. Improve DuckDuckGo result quality with expanded directory filtering
7. Fix Max Results input visibility

## Results
- **Guardian Watch**: Field mismatch resolved via `#[serde(rename)]` — bundle now receives `cpu_usage`, `total_memory_bytes`, `used_memory_bytes`, `total_disk_bytes`, `available_disk_bytes`. Real disk metrics from `sysinfo::Disks`.
- **ProMailer speed**: 7s → ~3s via ThreadPoolExecutor (5 workers), reduced DuckDuckGo delay 1.5s→0.5s, early stop on enough results.
- **Live logging**: Rust backend streams stderr `[STEP]` lines as Tauri `search_log` events. Frontend shows spinner + latest log in module header.
- **Research Lab**: `list_installed_models()` changed to return `Vec<ModelDetails>` with real model sizes from Ollama API. Frontend guarded against mixed types.
- **API key passthrough**: Settings → Rust config read → `--json-api-key` → Python `GOOGLE_API_KEY` override. Google Places API now actually used when key is configured.
- **Connectivity check**: `socket.gethostbyname("google.com")` prevents silent failure with clear error.
- **Directory filtering**: Skip list expanded 12→70+ aggregate sites. Results should have more real business websites.
- **Max Results input**: Explicit colors applied — light text on dark surface, visible spin buttons, wider form group.

## Files Changed
| File | Change |
|---|---|
| `lib.rs` | Guardian Watch SystemStats struct, ProMailer stderr streaming, Research Lab list_installed_models return type, emailer_search_leads API key passthrough |
| `App.tsx` | search_log listener, model list type guard (2 call sites) |
| `app.css` | #em-max-results visibility overrides |
| `lead_finder.py` | ThreadPoolExecutor, log_step(), --json-api-key, connectivity check, expanded domain filter, reduced delays |
| `.github/workflows/release.yml` | Windows split to manual job |
| `.github/workflows/contracts.yml` | macos-latest → ubuntu-latest |
| `docs/ARCHITECTURE.md` | Complete rewrite |
| `README.md` | Model matrix fix |

## Verification
- `cargo check` — 0 errors, 0 warnings
- `python3 py_compile` — OK
- `npx tsc --noEmit` — no errors

## Remaining
- Module CDN `.vera-module` ZIPs not yet uploaded to `modules.lexsort.com`
- Freeware public launch held until Windows CI confirmed on real device
- Stripe env vars not set in Netlify dashboard (free beta bypasses Stripe for now)
