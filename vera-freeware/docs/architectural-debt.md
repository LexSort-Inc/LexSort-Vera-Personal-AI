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
