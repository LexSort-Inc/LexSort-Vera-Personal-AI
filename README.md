<div align="center">
  <img src="resources/logos/lexsort-personal-ai.jpg" width="120" alt="LexSort Personal AI" style="border-radius: 16px;" />

  <h1>LexSort Personal AI — VERA</h1>

  <p><strong>Your AI. Your Computer. Your Data. Free Forever.</strong></p>

  <p>
    <a href="https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases"><img src="https://img.shields.io/github/v/release/Lexsort-Core/LexSort-Vera-Personal-AI?color=2E5FA3&label=release&style=flat-square" alt="Release"></a>
    <a href="https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/Lexsort-Core/LexSort-Vera-Personal-AI/release.yml?label=CI%2FCD%20Build&style=flat-square" alt="CI/CD Status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-gold?style=flat-square" alt="License"></a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/badge/cloud-none-brightgreen?style=flat-square" alt="No Cloud">
    <img src="https://img.shields.io/badge/telemetry-zero-brightgreen?style=flat-square" alt="No Telemetry">
  </p>

  <p>
    <a href="https://lexsort.com">Website</a> ·
    <a href="https://discord.gg/kpZ3hWyAaq">Discord</a> ·
    <a href="https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/issues">Report a Bug</a> ·
    <a href="https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases">Download</a>
  </p>
</div>

---

## What is VERA?

**VERA** is a private, local-first AI assistant built by [LexSort Inc.](https://lexsort.com) as the free open-source entry point to the LexSort local ecosystem.

It runs **entirely on your own machine**. No account. No subscription. No data ever leaves your computer — not even a ping.

### 💼 Product Positioning & Ecosystem
LexSort Inc. develops independent, local-first software programs tailored to specific audiences:

* **VERA & VERA Pro (General Public)**:
  Our local-first personal AI assistant for general productivity, privacy-focused chat, and local email automation (VERA Pro).
* **LexSort Core (Founders & Sole Proprietors)**:
  A private financial and tax workstation containing the local Finance Organizer and CRA Tax Preparation engines.
* **LexSort Legal (Lawyers & Law Firms)**:
  **A completely separate, independent program** built specifically to meet the evidentiary, regulatory, and practice guidelines of the Law Society of Ontario (LSO) for active law firms (matter intelligence, disclosure analysis, court timeline assembly, and trust ledgers). It is *not* part of the VERA or VERA Pro software packages.

We built VERA because we believe that AI tools for legal, financial, and personal use should be held to a higher standard of privacy. Cloud AI creates real liability when you paste confidential information. VERA eliminates that risk by design.

> *"Subpoena our servers. You'll get nothing."*

---

## 🔒 Privacy Guarantees

| Property | Detail |
|---|---|
| **Execution** | 100% local — runs on your processor |
| **Network** | Hard-locked to `127.0.0.1` loopback only |
| **Telemetry** | Zero. No analytics. No crash reports. No pings. |
| **Account** | None required. No email. No sign-up. |
| **Memory** | Conversations live in volatile RAM. Close the app — they're gone. |
| **Storage** | Your model files are stored locally. Nothing is uploaded. |

---

## ⚡ Auto Hardware Detection

On first launch, VERA reads your available system RAM and automatically selects and downloads the highest-quality open-source AI model your hardware can run:

| Available RAM | Model Selected |
|---|---|
| 17 GB+ | Qwen 2.5 32B — Maximum fidelity |
| 9.5 GB+ | Gemma 4 E4B — High performance |
| 5.5 GB+ | Llama 3.2 3B — Standard |
| 3.5 GB+ | Qwen 2.5 1.5B — Efficient |

Zero configuration required. VERA handles it automatically.

---

## 🚀 Getting Started

### Option 1 — Download the Installer (Recommended)

Go to **[lexsort.com](https://lexsort.com)** and download the installer for your platform.

| Platform | Status |
|---|---|
| ✅ macOS Apple Silicon (arm64) | Available now |
| ✅ macOS Intel (x86_64) | Available now |
| 🔄 Windows (x64) | CI/CD build in progress — check [Releases](https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases) |
| 🔄 Linux (deb / AppImage) | CI/CD build in progress — check [Releases](https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases) |

### Option 2 — Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) v20+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Ollama](https://ollama.com/) installed and running
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

```bash
# Clone the repository
git clone https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI.git
cd LexSort-Vera-Personal-AI/lexsort-personal-ai

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build production release
npm run tauri build
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | [Tauri v2](https://tauri.app/) (Rust) |
| **Frontend** | React 19 + TypeScript |
| **Inference** | [Ollama](https://ollama.com/) local HTTP API |
| **Models** | Apache 2.0 licensed open-source LLMs |
| **Build Tool** | Vite 7 |
| **CI/CD** | GitHub Actions (matrix: macOS arm64 + x86_64, Windows x64, Linux Ubuntu) |

---

## 🗺 Roadmap

### ✅ v1.0.0 — Freeware Foundation (Released June 2026)
- [x] Hardware detection & auto model selection
- [x] Local Ollama HTTP API streaming
- [x] Persistent chat with ephemeral (RAM-only) memory
- [x] Save transcript to local file
- [x] Cross-platform Rust backend (macOS, Windows, Linux)
- [x] GitHub Actions CI/CD release pipeline (macOS Apple Silicon + Intel, Windows, Linux)
- [x] VERA product page live at [lexsort.com](https://lexsort.com)

### 🔄 In Progress
- [ ] Windows & Linux installers published on GitHub Releases *(building now)*
- [ ] macOS Notarization & App Store submission

### 🗓 Upcoming — VERA Pro (Q4 2026)
- [ ] Markdown rendering in chat
- [ ] Conversation history (optional, local-only)
- [ ] Auto Emailer module
- [ ] Guardian Watch module
- [ ] LexSort-GO Mobile companion app

### 🗓 Upcoming — LexSort Core Add-Ons (Pro subscribers only)
- [ ] **Finance Module** — Personal & Business Organizer with local OCR receipt ingestion
- [ ] **Tax Module** — CRA Tax Preparation & Credit Discovery Engine (T2125, T776, T4, CCA)

---

## 🤝 Contributing

VERA is open-source and we welcome contributions.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please open an issue first for major changes so we can discuss the approach.

---

## 📡 Community

Join the LexSort community — we build in public and share everything.

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/kpZ3hWyAaq)
[![Reddit](https://img.shields.io/badge/Reddit-r%2FLexSort-FF4500?style=flat-square&logo=reddit&logoColor=white)](https://www.reddit.com/r/LexSort/)
[![X](https://img.shields.io/badge/X-@LexSortAI-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/LexSortAI)
[![YouTube](https://img.shields.io/badge/YouTube-@LexSort-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://www.youtube.com/@LexSort)
[![TikTok](https://img.shields.io/badge/TikTok-@lexsort-000000?style=flat-square&logo=tiktok&logoColor=white)](https://www.tiktok.com/@lexsort)
[![Instagram](https://img.shields.io/badge/Instagram-@lexsort-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/lexsort/)
[![Product Hunt](https://img.shields.io/badge/Product%20Hunt-@lexsort-DA552F?style=flat-square&logo=producthunt&logoColor=white)](https://www.producthunt.com/@lexsort)

---

## 📄 License

Copyright © 2026 LexSort Inc.

Licensed under the [Apache License 2.0](LICENSE). Free to use, modify, and distribute — including commercially — with attribution.

---

<div align="center">
  <sub>Built by <a href="https://lexsort.com">LexSort Inc.</a> — The future of local-first intelligence.</sub><br>
  <sub><em>Last updated: June 10, 2026 — v1.0.0 released. CI/CD pipeline active for all platforms.</em></sub>
</div>
