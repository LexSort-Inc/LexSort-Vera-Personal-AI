# Verification Artifacts — 2026-08-07 (clean Windows ThinkCentre, v1.1.11)

Both log files live under `~/.lexsort/logs/` on the test machine.

## ollama-lifecycle.log (new in v1.1.11 — spawn/reuse/kill audit trail)

```
[2026-08-07 22:05:50.449] start_server: SPAWNING new daemon (ollama list exit != 0 (no daemon on 11434)), model=phi3:mini
[2026-08-07 22:05:50.454] start_server: daemon spawned PID=21144
```

- Exactly **one** `SPAWNING` line → single daemon, no duplicates.
- The exit-code message proves the v1.1.11 fix (old code would have
  logged "external daemon answers" and never spawned).

## chat-debug.log

```
[2026-08-07 22:10:56.015] sending to http://127.0.0.1:11434/v1/chat/completions model=phi3:mini origin=http://tauri.localhost
```

- `origin=http://tauri.localhost` → correct Windows WebView2 origin
  (CORS fix effective).
- **No** subsequent `Failed to fetch` line (old logs had 3 attempts
  worth) → request succeeded; UI rendered the assistant's first real
  response: "Hello! How can I assist you today?"