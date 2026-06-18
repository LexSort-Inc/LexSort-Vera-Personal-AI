# LexSort Vera Freeware — Full Public Launch Plan

> **Launch Gate:** Windows version 100% tested and working → then go loud.  
> macOS is already stable (v1.1.6). This plan activates the moment Windows is confirmed.

---

## 🚦 Launch Gate Checklist (Must all be ✅ before going public)

- [ ] Windows CI build passes (GitHub spending limit unblocked — see MASTER_HANDOFF.md §4)
- [ ] Windows installer downloaded and installed on a real Windows machine
- [ ] Ollama auto-detected on Windows on first launch
- [ ] Hardware detection runs correctly — correct model selected
- [ ] Model downloads successfully on Windows
- [ ] First conversation works end-to-end on Windows (no hang, no crash)
- [ ] Windows app closes cleanly — no orphan processes
- [ ] Calendar import hang fix verified on device (macOS) — see MASTER_HANDOFF.md §3
- [ ] Linux AppImage tested (if available — not blocking if not ready)
- [ ] Download page updated: all platform badges show ✅ (remove "building" status)
- [ ] `website/download.html` download links updated with correct Windows `.msi` / `.exe` URL

---

## 📣 Launch Day — Go Loud

### 1. Website Updates
- [ ] Update `website/index.html` — remove any "in progress" language from platform badges
- [ ] Update `website/download.html` — all platforms active
- [ ] Update `website/vera.html` hero tagline to reflect all 3 platforms available
- [ ] `netlify deploy --prod --dir=website`

### 2. Social Media Blast (all at once)

**Twitter / X** — Post the liberation banner + thread:
```
🔓 LexSort Vera is now publicly available for macOS, Windows, and Linux.

No cloud. No token limits. No account. No subscription. Free forever.

Your AI runs 100% on your machine — not ours.

↓ Download free
lexsort.com/vera
```

**Reddit — r/LocalLLaMA** (high-signal audience):
```
Title: LexSort Vera — 100% local personal AI, free forever, now on macOS + Windows + Linux

We built Vera as the free open-source foundation of the LexSort ecosystem. 
It auto-detects your hardware and downloads the best model it can run.
No account. No cloud. No token limits. Apache 2.0.

lexsort.com/vera
```

**Reddit — r/privacy** (privacy-focused audience):
```
Title: We built a personal AI that physically cannot share your data (it never connects to our servers)

LexSort Vera — 100% local inference. No cloud. No telemetry. Not even a ping.
Free forever. Open source. macOS / Windows / Linux.

lexsort.com/vera
```

**Reddit — r/opensource** (OSS audience):
```
Title: LexSort Vera — Apache 2.0 local AI assistant, auto hardware detection, free forever

lexsort.com/vera | GitHub: Lexsort-Core/LexSort-Vera-Personal-AI
```

**Hacker News — Show HN:**
```
Title: Show HN: LexSort Vera – local-first personal AI, Apache 2.0, auto hardware detection
URL: https://lexsort.com/vera.html
```

**Discord (#announcements — @everyone ping):**
```
🔓 **LexSort Vera is officially public — macOS, Windows & Linux**

After months of building, testing, and refining — Vera is ready for everyone.

**What it is:** A 100% local personal AI that runs on your machine.
**What it costs:** $0. Free forever. No account. No catch.
**What it does with your data:** Nothing. It can't. It never connects out.

→ Download: lexsort.com/vera
→ GitHub: github.com/Lexsort-Core/LexSort-Vera-Personal-AI

If you've been waiting — this is the moment. Drop your platform in the chat ⬇
```

**Product Hunt submission:**
- Tagline: `"Your AI. Local. Unlimited. Free forever."`
- Description: Focus on the no-cloud, no-limits angle
- Use the liberation banner as the main image
- Schedule for 12:01 AM PST (Product Hunt resets at midnight)

---

## 📸 Social Media Assets Ready

| Asset | Use |
|---|---|
| `lexsort-grok-banner.jpg` | General LexSort brand share image |
| `lexsort-vera-liberation-banner.jpg` | Vera-specific posts ("no token limits") |
| `lexsort-twitter-banner.png` | Twitter/X header (already set) |

All in `website/assets/social/`.

---

## 🔧 Pre-Launch Technical Checklist

- [ ] Confirm `website/index.json` version matches the latest release tag
- [ ] Confirm GitHub Release has `.dmg` (macOS arm64 + x86_64), `.msi` (Windows), `.AppImage` (Linux)
- [ ] Confirm in-app updater works: install an older version → confirm update notification appears
- [ ] Run `curl -I https://lexsort.com` → confirm `access-control-allow-origin: *` (AI crawler fix active)
- [ ] Confirm `https://lexsort.com/llms.txt` is accessible (AI tools can read the site)
- [ ] Confirm `https://lexsort.com/sitemap.xml` is accessible (Google indexing)
- [ ] Submit sitemap to Google Search Console (if not already done)

---

## 📊 Post-Launch Monitoring (First 48 Hours)

- [ ] Watch Netlify function logs for download-attempt errors
- [ ] Watch GitHub Issues for Windows/Linux bug reports
- [ ] Watch Discord for user feedback and support requests
- [ ] Watch Reddit threads — respond to comments within 2 hours of posting
- [ ] Check download count via `https://lexsort.com/api/download-count`

---

## 🗒 Notes

- **Windows CI blocker:** Increase GitHub spending limit from $0 to ~$10 to unblock Actions
  - Settings → Billing & Plans → Spending Limits → set $10
  - Then re-run the existing tag or push a new one
- **Linux:** Not blocking launch if not ready — launch with macOS + Windows, add Linux as soon as CI confirms
- **Don't rush:** A broken Windows installer on launch day is worse than a delayed launch
