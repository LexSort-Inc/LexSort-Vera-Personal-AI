# VERA Engine

Standalone Rust binary that manages the local LLM lifecycle for VERA. Responsible for hardware detection, model download/verification, spawning llama-server, health monitoring, and proxying chat completions.

## Architecture

```
vera-engine/
├── src/
│   ├── main.rs        # Entry: init config, detect hardware, download model, spawn llama-server
│   ├── config.rs      # TOML config (~/.lexsort/vera-engine/config.toml), auto-created with defaults
│   ├── download.rs    # Model downloader with resume, SHA256 verification, Q6_K/Q4_K_M fallback
│   ├── router.rs      # Axum HTTP server: /v1/chat/completions, /v1/models, /v1/manifest, /v1/health, /v1/system
│   ├── system.rs      # Hardware detection: RAM, disk, CPU, GPU (nvidia-smi/rocminfo/macOS), model recommendation
│   ├── models.rs      # Capability manifest parser, model selection logic (tool_calling, context_window, etc.)
│   └── token.rs       # Session token generation (128-char alphanumeric)
├── Cargo.toml         # Dependencies: axum, tokio, reqwest, sysinfo, sha2, etc.
└── README.md
```

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/v1/chat/completions` | POST | Proxy to llama-server (model must be ready) |
| `/v1/models` | GET | List available models from llama-server |
| `/v1/manifest` | POST | Register module capability manifest, get model selection |
| `/v1/health` | GET | Engine status: starting/downloading/verifying/ready/error |
| `/v1/system` | GET | Hardware profile: RAM, disk, CPU, GPU, recommended model |

## How It Works

1. Loads config from `~/.lexsort/vera-engine/config.toml` (auto-created if missing)
2. Detects hardware (RAM, disk, GPU) and selects a target model (Q6_K for ≥16 GB RAM, Q4_K_M otherwise)
3. Downloads the model GGUF from `models.lexsort.com` if not present, with SHA256 verification
4. Spawns `llama-server` as a child process with the downloaded model
5. Monitors llama-server health with auto-restart (max 2 restarts per 5 min)
6. Proxies chat and model requests to llama-server via the `/v1/*` HTTP API

## Build & Run

```bash
cargo run
```

Config is auto-created at `~/.lexsort/vera-engine/config.toml` on first run. Edit to change port, model URLs, or llama-server binary path.

## Dependencies

Requires `llama-server` binary on `$PATH` (or configured in config.toml). Download from [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases).
