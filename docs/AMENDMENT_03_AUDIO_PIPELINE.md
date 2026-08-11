# VERA Engine Architecture Spec Amendment 03: Local Session-Based Audio Pipeline

**Document Reference:** AMENDMENT_03_AUDIO_PIPELINE  
**Parent Specification:** `VERA_Engine_Architecture_Spec.md` / `AI_ENGINE.md`  
**Date:** July 2, 2026  
**Status:** ✅ Phase 1 & 2 Implemented (Freeware) — Phase 3 Pending User Approval  

> [!NOTE]
> **Phase 1 (Backend) and Phase 2 (Freeware Frontend) are now implemented and verified** as of July 2, 2026.
> The `/v1/audio/transcriptions` and `/v1/audio/speech` endpoints are live in `vera-freeware/src-tauri/src/rest_api.rs`.
> The `useVoiceSession.ts` hook and waveform mic UI are live in the VERA Freeware React client.
> All 20 Rust unit tests pass. TypeScript type-check is clean. macOS TTS synthesis confirmed.
>
> **Phase 3 (VERA Pro port) has NOT started.** Do **NOT** merge to `main`, push release tags, or upload to R2 CDN until the user has explicitly approved the Freeware implementation.

---

## 1. Overview & Objectives

This amendment specifies the design for a local-first, session-based voice interaction subsystem in VERA. The objective is to enable natural, hands-free conversation with VERA without relying on third-party cloud services or sacrificing user privacy.

To maintain VERA's zero-cloud posture, speech-to-text (STT) and text-to-speech (TTS) are processed entirely on the user's local machine.

---

## 2. Scope & Rollout Strategy

* **VERA Engine Scope**: This is a **VERA Engine level feature**. Since the VERA Engine daemon serves as the shared REST API backend for both VERA Freeware and VERA Pro, the local audio REST endpoints are shared across both product tiers.
* **Staged Implementation Rollout**:
  1. **Phase 1: Backend Integration**: Implement the local audio endpoints inside the shared VERA Engine daemon.
  2. **Phase 2: Freeware-First Client**: Wire, test, and completely verify the React frontend interaction model (microphone capture, VAD hook, silence timeouts, waveform indicators) inside the VERA Freeware app (`vera-freeware`).
  3. **Phase 3: Pro Client Porting**: Once the Freeware frontend has been successfully verified, tested, and explicitly approved by the user, copy the UI components and custom hooks to the VERA Pro client codebase (`lexsort-vera-pro`).

---

## 3. Cascaded Local Architecture

VERA uses a cascaded architecture rather than a heavy, native audio LLM. This allows VERA to utilize its existing GGUF inference infrastructure and maintain a lightweight runtime footprint.

```
┌─────────────┐     Audio     ┌─────────────┐     Text      ┌─────────────┐
│  Mic Input  │ ────────────> │ whisper.cpp │ ────────────> │  Local LLM  │
└─────────────┘               │    (STT)    │               │ (llama.cpp) │
                              └─────────────┘               └──────┬──────┘
                                                                   │ Text
                                                                   ▼
┌─────────────┐     Audio     ┌─────────────┐               ┌─────────────┐
│ Speaker Out │ <──────────── │    Piper    │ <──────────── │  VERA UI /  │
└─────────────┘               │    (TTS)    │               │  Response   │
                              └─────────────┘               └─────────────┘
```

### Key Subsystems:
1. **Speech-to-Text (STT)**: Powered by `whisper.cpp` (the GGML-optimized port of OpenAI's Whisper model). It runs as a managed child subprocess spawned and monitored by VERA Engine, similar to the existing `llama-server.exe` pattern.
2. **Text-to-Speech (TTS)**: Powered by `Piper`, a fast, local, neural text-to-speech system that generates natural-sounding speech with a small disk and RAM footprint (~100MB per voice model).
3. **No Cloud Fallback**: If the local audio subprocesses fail to load, the engine falls back to standard text-only chat. No audio or transcript data is ever sent to any remote server.

---

## 4. OpenAI-Compatible REST Endpoints

VERA Engine exposes two new OpenAI-compatible endpoints to handle audio transcription and speech synthesis. This ensures compatibility with standard client libraries and keeps the engine API unified.

### 4.1 Speech-to-Text: `POST /v1/audio/transcriptions`
Accepts a multipart audio file stream and returns the transcribed text.

* **Request Format**: `multipart/form-data`
  * `file`: Raw WAV audio file (16kHz, mono, 16-bit PCM).
  * `model`: Optional string (defaults to auto-selected Whisper model tier).
  * `language`: Optional language code (e.g. `en`).
* **Response Format**: `application/json`
  ```json
  {
    "text": "Draft a response to opposing counsel regarding the discovery extension."
  }
  ```

### 4.2 Text-to-Speech: `POST /v1/audio/speech`
Accepts a JSON payload and returns raw audio bytes.

* **Request Format**: `application/json`
  ```json
  {
    "model": "tts-1",
    "input": "I have created a draft response in your folder.",
    "voice": "en_US-danny-low",
    "response_format": "wav"
  }
  ```
* **Response Format**: `audio/wav` (binary audio stream).

---

## 5. Session-Based Active Listening & VAD Interaction

To resolve privacy concerns, resource exhaustion, and OS microphone usage indicator warnings associated with "always-listening" models, VERA uses a **Session-Based Voice Model**.

```
[ User clicks Mic Icon ] ──> [ Starts Active Session ]
                                   │
                                   ▼
                       [ Mic Streams to Local RAM ]
                                   │
                                   ▼
                       [ VAD Monitors Input Stream ]
                                   │
            ┌──────────────────────┴──────────────────────┐
            ▼ (Speech Detected + 1.5s Silence)            ▼ (45s Silence Timeout)
   [ Send Audio to STT ]                         [ End Active Session ]
            │                                             │
            ▼                                             ▼
   [ Route Text to LLM ]                         [ Turn Off Mic & VAD ]
            │
            ▼
   [ Play TTS Audio Response ]
            │
            └───────> [ Resume Active Session Loop ]
```

### Turn-Taking Mechanics:
1. **Initiation**: The microphone is **inactive** by default. The user clicks a Microphone icon in the chat input bar once to begin a voice session.
2. **Active Stream & VAD**: The app opens the microphone stream and buffers audio locally in volatile RAM. A local Voice Activity Detection (VAD) filter monitors the stream.
3. **Auto-Transcription**: When the user finishes speaking and a pause of **1.5 seconds** is detected, the VAD loop cuts the segment, sends the WAV buffer to `/v1/audio/transcriptions`, routes the result to the LLM, and plays the synthesized TTS response.
4. **Hands-Free Loop**: After playing the response, the session immediately resumes listening for the next user utterance.
5. **Termination**: The voice session ends automatically after **45 seconds** of continuous silence, or when the user clicks the microphone icon again to manually stop.
6. **Visual Indicators**: A pulse/waveform visualizer is shown in the chat window *only* when the voice session is active, providing the user with immediate confirmation of when the microphone is listening.

---

## 6. Hardware Tiering

Model weights for STT and TTS are dynamically selected based on VERA Engine's existing startup CPU/RAM diagnostic benchmark. This capability-based tiering is applied automatically:

| System RAM | Hardware Class | Whisper Model | Piper Voice Tier |
|---|---|---|---|
| **< 8 GB** | Low-Tier (e.g. older laptops) | `whisper-tiny.en` (~75MB) | `en_US-danny-low` (low-fidelity) |
| **8 GB to 16 GB** | Mid-Tier (standard desktops) | `whisper-base.en` (~140MB) | `en_US-danny-medium` (medium-fidelity) |
| **16 GB+** | High-Tier (workstations / Mac) | `whisper-small.en` (~460MB) | `en_US-danny-high` (high-fidelity) |

---

## 7. Capability Manifest Integration

Audio features are integrated directly into the `CapabilityManifest` within VERA Engine's models registry (`vera-engine/src/models.rs`), extending the base schema:

```rust
#[derive(Debug, Deserialize)]
pub struct CapabilityRequirements {
    pub tool_calling: bool,
    pub json_output: bool,
    pub context_window_min: usize,
    pub speech_to_text: bool,  // Added in Amendment 03
    pub text_to_speech: bool,  // Added in Amendment 03
}
```

Modules can declare `speech_to_text: true` in their requirements, which will prompt the VERA Engine to verify that the local audio dependencies are loaded and operational before running the module.

---

## 8. Security & Zero-Telemetry Posture

1. **Loopback Only**: All audio server bindings are locked strictly to `127.0.0.1:8888`. No remote connections are allowed.
2. **Volatile RAM Buffer**: Recorded audio is buffered directly in RAM and passed to the transcription engine. No raw audio clips are written or cached on the disk.
3. **OS Sandboxing**: macOS/Windows microphone permissions are explicitly requested only upon the first initiation of a voice session, keeping background security boundaries clean.
