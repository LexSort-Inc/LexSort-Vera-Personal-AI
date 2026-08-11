# SR&ED Entry — July 2, 2026

**Agent:** OpenCode
**Hours:** 4.0 (18:30–22:30)
**Area:** Module Compatibility / Search Infrastructure

## Problem
Research Lab module crashed on model list iteration because `list_installed_models()` returned `Vec<String>` but the bundle expected objects with `.size_gb`, `.id`, etc. ProMailer's Google Places API key was decorative — saved in Settings but never passed to the Python subprocess. DuckDuckGo fallback returned mostly directory sites with no business emails. No internet connectivity check existed before search.

## Uncertainty
It was not known in advance whether the Ollama API `/api/tags` endpoint returns model size/quantization info reliably across versions, or whether a socket-based connectivity check would be fast enough to not degrade UX. The expanded DuckDuckGo skip list (12→70+ domains) might over-filter legitimate business sites.

## Work Performed
- Changed `list_installed_models()` from `Vec<String>` → `Vec<ModelDetails>` with Ollama API + CLI fallback parsing
- Added `--json-api-key` argument to Python script, overrides `GOOGLE_API_KEY` global at runtime
- Rust `emailer_search_leads` reads SMTP config and passes API key to Python subprocess
- Added `check_internet_connection()` via `socket.gethostbyname("google.com")` with early-exit
- Expanded DuckDuckGo skip list from 12 to 70+ directory/aggregator domains
- Fixed Max Results input visibility with explicit CSS color/background overrides

## Files Modified
- `vera-freeware/src-tauri/src/lib.rs`: list_installed_models return type (lines 1763-1835), emailer_search_leads API key passthrough (lines 2180-2199)
- `vera-freeware/src/App.tsx`: Frontend guard for mixed string/object model responses (lines 779, 871)
- `vera-freeware/src/app.css`: CSS overrides for #em-max-results (lines 3927-3946)
- `~/.lexsort/modules/promailer/current/lead_finder.py`: --json-api-key arg, connectivity check, expanded domain filter (lines 73-81, 88, 530-534)
