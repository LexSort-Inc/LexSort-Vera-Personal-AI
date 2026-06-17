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

*See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md)*
