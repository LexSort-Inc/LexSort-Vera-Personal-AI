# VERA — AI Engine & Model Selection

---

## 1. Engine Detection on Boot

During `bootSequence()`, VERA calls `check_engine_installed` which:

1. Checks for `~/.lexsort/bin/ollama` (portable path — installed by VERA)
2. Falls back to scanning system candidate folders (`/usr/local/bin`, `/usr/bin`, etc.)
3. Runs `ollama --version` to verify the binary is responsive
4. If missing → transitions to `PHASE.ENGINE_SETUP` and halts boot

---

## 2. Zero-Config Engine Setup (Auto-Install Ollama)

If Ollama is not found, the user sees an "Engine Setup" screen with a single button: **"Download & Configure Engine"**.

This calls `setup_engine` which downloads and installs a portable Ollama binary silently, **without administrator/UAC prompts:**

| Platform | Source | Destination |
|---|---|---|
| macOS | `Ollama-darwin.zip` | `~/.lexsort/bin/ollama` (extracted from `.app/Contents/Resources/`) |
| Windows | `ollama-windows-amd64.zip` | `~/.lexsort/bin/ollama.exe` (via PowerShell `Expand-Archive`) |
| Linux | `ollama-linux-amd64` (binary) | `~/.lexsort/bin/ollama` |

On macOS + Linux: `chmod 0755` is set on the binary automatically.

After copying, the downloaded archive and temp files are deleted to free disk space.

### SHA-256 Verification Hashes

The engine download verifies integrity before installing:

| Platform | SHA-256 |
|---|---|
| macOS | `56fd727e2c2cd7388bcb3ad10ea50482bf3f326143a18814d0de38cabd7c08dd` |
| Windows | `a095dce6739c4635e7f4b856c08d1429598d3eae5c632995653f5339e15b5933` |
| Linux | `7641b21e9d0822ba44e494f5ed3d3796d9e9fcdf4dbb66064f8c34c865bbec0b` |

> **To update these hashes:** Download the new Ollama release, run `sha256sum <file>`, and update `lib.rs`. Then update this table.

**Retry resiliency:** The downloader retries up to 3 times on hash mismatch or connection failure.

---

## 3. First-Launch Model Selection (`PHASE.MODEL_SELECTION`)

Triggered when no active model is configured in the backend registry.

### Supported models

| Model | Size | Min RAM | Tier |
|---|---|---|---|
| Qwen 2.5 14B | 9.0 GB | 32 GB | Quality |
| Llama 3.1 8B | 4.7 GB | 16 GB | Balanced |
| Mistral 7B | 4.1 GB | 16 GB | Balanced |
| Llama 3.2 3B | 2.0 GB | 8 GB | Balanced / Fast |
| Phi-3 Mini | 2.2 GB | — | Fast (any hardware) |

### Detection and prioritization

1. VERA queries `list_installed_models` to find already-downloaded Ollama models
2. Detected models display with a green `Local` badge and skip the download phase
3. Undetected recommended models show download size and description
4. **RAM guard:** If selected model RAM > system RAM → button disabled + warning shown
5. **RAM warning:** If local model RAM > system RAM → warning shown, button stays enabled (model already cached)

### Skip option

"Skip Onboarding / Use Lightweight Default" → configures `phi3:mini` immediately and boots to chat. Good for testers and power users.

---

## 4. Voice Input (Speech-to-Text) — Currently Disabled

- **Status:** Feature-flagged OFF (`supported: false` in `useSpeechRecognition.ts`)
- **Issue:** `webkitSpeechRecognition` triggers SIGABRT in WKWebView on macOS when the parent process (Terminal/IDE) lacks microphone permission
- **Future fix:** Replace with a native Rust audio capture layer (`cpal`) or embed a local `whisper.cpp` model — fully offline, no OS browser permission issues

---

## 5. Cloud Model Routing for Team Lab (Pro — Roadmap)

### Rationale

Team Lab agents (reviewer, tester, workflow runner) can benefit from frontier cloud models (GLM 5.2, Claude, GPT) for QA, validation, and complex code review — while keeping interactive chat on local inference. This is already anticipated by the engine's capability manifest system.

### Architecture

The existing `CapabilityManifest` + `select_model()` in `vera-engine/src/models.rs` already routes module tasks to the best available model. Adding a `provider` dimension enables:

```
Module Manifest
  └─ capabilities_required: { tool_calling, json_output, context_window_min }
  └─ model_preferences: [{ model_id: "glm-5.2", ... }]
       │
       ▼
select_model(manifest, available_models)
       │
       ├─ Local models (Ollama/llama-server)  →  /v1/chat/completions (existing)
       └─ Cloud models (API key pool)         →  provider API endpoint
```

### Key Rotation & Cost Sharing

- Team members contribute API keys to a shared keychain-backed pool
- Engine rotates keys round-robin per project to stay within free-tier limits
- Each Team Lab session tracks token usage per key, with per-project budgets
- No cloud keys in git — stored in system keychain via `VERAAuthStore` pattern (same as iOS Go pairing)

### Integration Points

| Component | Change Required |
|---|---|
| `vera-engine/src/models.rs` | Add `provider: "ollama" | "openai" | "zai"` to model baseline |
| `vera-engine/src/router.rs` | `/v1/chat/completions` routes by provider, not just local proxy |
| `vera-freeware` settings UI | API key management screen (add/remove/rotate keys) |
| `vera-go-ios` | Optional: mobile key management via Settings view |

### Community API Key Distribution (Discord Integration)

The VERA Pro Discord bot (`discord-bot/tester-manager.js`) handles beta onboarding. This same infrastructure can distribute cloud API keys:

- **`/apikeys`** slash command lists partner providers (Z.ai, OpenAI, Anthropic, Google, etc.) with affiliate/referral links
- **`approval-bot.js`** auto-verifies license tier and DMs a curated starter pack — e.g. "$X credit for GLM 5.2, GPT-5.6 trial key"
- Users paste keys once in VERA settings; engine's keychain-backed rotation pool handles the rest
- No per-user rate limit friction — the round-robin pool distributes load across all contributed keys

### Status

- **Architecture:** Proposed
- **Discord integration:** Noted — build alongside cloud routing engine work
- **Target:** VERA Pro v1.2+

## 7. Share Sheet Processing — "Private AI Inbox" (Pro — Planned)

### Architecture: Share Extension, Not Custom Recorder

Every phone already has a built-in recorder. Building another one inside VERA Go is redundant. Instead, VERA Go registers as a **Share Sheet destination** — users record in any app they already use (Voice Memos, etc.), tap Share, select VERA Go, and the file is processed on the desktop.

### Philosophy

```
Phone (any app)                     VERA Go              VERA Desktop
─────────────                       ────────             ───────────
Voice Memos app                      Share Extension      whisper.cpp → STT
  → tap Share                        → receive .m4a       → LLM: summarize
  → select VERA Go                   → stream over WiFi     → extract tasks
                                       ────────             → SQLite
PDF / Office doc                                           → LLM: summarize
  → tap Share                                               → extract action items
  → select VERA Go                   (same pipeline)      
                                                           → push tasks + results
Photo                                                         to VERA Go via REST
  → tap Share
  → select VERA Go                   (same pipeline)
```

### Why Share Extension Over Custom Recorder

- **Zero microphone permissions** — recording happens in the user's app of choice
- **Zero recording UI to build** — Share Extension is ~80 lines of Swift
- **Supports any media type** — audio, PDF, images, web pages, emails
- **Users already trust their recorder** — no learning curve
- **VERA Go becomes an intake point**, not a feature clone of native apps

### Supported Share Types (by Phase)

| Phase | Media Type | Desktop Processing | User Sees |
|---|---|---|---|
| Phase 4 | Audio (.m4a, .wav, .mp3) | whisper.cpp → LLM | Transcript + extracted tasks |
| Phase 4 | PDF / Office docs | text extraction → LLM | Summary + action items |
| Phase 5 | Images / Whiteboard photos | OCR → LLM | Text extraction + tasks |
| Phase 5 | Web pages / URLs | HTML fetch → LLM | Summary + save to context |
| Phase 5 | Emails (copied text) | LLM | Summary + action items |

### Pipeline (Audio — Phase 4)

1. User records in Voice Memos → taps Share → selects VERA Go
2. VERA Go receives the `.m4a` file via Share Extension
3. Streams file to desktop over LAN WebSocket
4. Desktop runs `whisper.cpp` (local, offline) → produces transcript
5. Desktop runs transcript through local LLM → summary + action items
6. Action items → `quick_organizer::save_task` → persisted to SQLite
7. Tasks + transcript pushed to VERA Go via REST/WebSocket

### iOS Implementation

- **Target:** `VERAShareExtension` — small Swift target in `vera-go-ios` Xcode project
- **Entry point:** `NSExtensionActivationRule` for `public.audio`, `public.pdf`, `public.image`, `public.url`
- **Flow:** Receive file → write to shared app group container → notify main app via `CFNotificationCenter` → main app streams to desktop
- **Lines of code:** ~80

### Dependencies

- **vera-engine:** `whisper-rs` crate wrapping `whisper.cpp` — **NOT YET IN CARGO.TOML** — flag for Phase 4 build
- **vera-go-ios:** No new dependencies — uses existing LAN WebSocket + REST client
- **vera-freeware:** No changes — processing happens in vera-engine

### Status

- **Design:** 🏗 In progress
- **Dependency flag:** `whisper-rs` / `whisper.cpp` needs adding to `vera-engine/Cargo.toml` before Phase 4 starts
- **Target:** VERA Pro v1.2 (Phase 4)

---

*See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) · [MARKETING_AND_ROADMAP.md](MARKETING_AND_ROADMAP.md)*
