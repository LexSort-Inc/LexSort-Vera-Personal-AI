# VERA Freeware v1.1.0 — Social Media & Announcement Drafts
*For Review & Approval*

---

## 📢 Discord announcement (For #announcements channel)

**Pings:** `@everyone`

🚀 **VERA Freeware v1.1.0 is now live!** 🚀

We've just pushed a major update to VERA Freeware. This release focuses on bringing you closer to technical sovereignty and expanding your offline capabilities:

✨ **What's New in v1.1.0:**
* 🗂️ **Quick Organizer Module**: A private, fully offline task manager with AI assistance. Break down tasks, prioritize, and estimate times directly on your CPU/GPU without sending data to the cloud.
* 👋 **Onboarding Welcome Greeting**: An updated welcome experience to help new users set up their local hardware detection and download the best local model automatically.
* ⚙️ **Pro Features Preview**: Added a preview tab in Settings to show upcoming Pro features (Auto Emailer, Guardian Watch, LexSort-GO).
* 🔄 **Factory Reset / Clean Removal**: A clean reset button in settings to remove local database tables, settings, and cached models safely.

🔒 **Our Promise:** 100% local execution, zero cloud dependencies, zero data telemetry, zero account required.

📦 **Download Now:**
Download the v1.1.0 installer matching your chip architecture (Apple Silicon vs Intel) directly from our website:
👉 https://lexsort.com/download.html
Or check out the release assets on GitHub:
👉 https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/tag/v1.1.0

Join our community and let's keep building a sovereign future together! 🌐

---

## 🟥 Reddit Build Story Post (For r/LocalLLaMA, r/privacy, r/SideProject)

**Title:** How a 58-Year-Old "Vibe Coder" Built a Privacy-First Local AI Task Manager (Fully Offline, Tauri + React)

**Body:**

Hey r/LocalLLaMA (and privacy enthusiasts),

I'm William. I'm 58, a solo founder of Just Me Media, and a proud "vibe coder." A few months ago, I couldn't write a line of code. Today, I'm shipping version 1.1.0 of VERA (LexSort Personal AI) — a fully offline, local-first productivity assistant.

If you're tired of cloud AI services tracking your data, reading your copy-pasted text, or gating features behind subscriptions, I built this for you. 

### What is VERA?
VERA is a desktop app (built with Tauri v2, React, and TypeScript) that acts as a private interface for local LLMs (powered by Ollama). 

When you launch VERA, it auto-detects your system RAM and pulls the highest-quality open-source model your hardware can run:
* 17 GB+ RAM → Qwen 2.5 32B
* 9.5 GB+ RAM → Gemma 4 E4B (Gemma 2 9B)
* 5.5 GB+ RAM → Llama 3.2 3B
* 3.5 GB+ RAM → Qwen 2.5 1.5B

Everything is processed 100% locally on your chip. No account, no signup, zero telemetry.

### What's New in v1.1.0 (The Freeware Upgrade)
In this release, I wanted to add real utility while keeping the offline privacy promise intact:

1. 🗂️ **The Quick Organizer**: A fully local task manager with local AI assistance. You can ask VERA to prioritize your day, estimate task durations, or break complex tasks down into concrete steps. No data is sent to OpenAI or Anthropic — it's all handled by your local model.
2. 👋 **Onboarding welcome greeting**: To guide new users on hardware requirements and model downloads.
3. 🔄 **Factory Reset / Clean Removal**: A simple button in Settings to completely purge local database tables, configuration files, and downloaded model files so you can start fresh or clean uninstall with zero leftover data footprint.
4. ⚙️ **Pro Settings Preview**: A peek into the upcoming Pro features (Auto Emailer, Guardian Watch, LexSort-GO Mobile WiFi bridge) that I'm launching in July.

### The Build Journey (Vibe Coding at 3 AM)
I build this app at 3:00 AM in my house coat, arguing with Claude. I call it "vibe coding" because I describe the UX and database schema, and let the LLM do the heavy syntax lifting. I test, fail, iterate, and learn. 

My first project, Sports Prophecy (sports prediction tracker), got almost no users, which taught me to focus on solving actual, painful problems. People want offline privacy and local control of their workflows — that's why VERA exists.

### Try it out (100% Free)
The macOS Apple Silicon (ARM) and Intel (x86_64) binaries are signed, notarized by Apple, and live on GitHub:
* **GitHub Release & Code**: https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/tag/v1.1.0
* **Direct Download Page**: https://lexsort.com/download.html

I'd love your honest feedback, bug reports, and suggestions. 

— William
