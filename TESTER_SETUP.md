# VERA Pro — Tester Setup Guide

**Last Updated:** June 30, 2026
**Current Beta Version:** v1.0.12

> [!IMPORTANT]
> **This is the LIVE tester flow as of June 30, 2026.**
> The old Stripe checkout flow is no longer used for beta testers. Testers get free keys via Discord.

---

## How Testers Get Access (Current Flow)

```
Tester joins LexSort Discord
        ↓
Types /register in any channel
        ↓
LexSort Bot DMs them a checkout link
  (Free beta — no credit card for beta testers)
        ↓
Bot DMs tester their VERA-PRO-... license key
        ↓
Tester downloads VERA from lexsort.com/download
        ↓
App launches → OnboardingWizard runs automatically
  Step 1: Detects + installs Ollama AI engine (~180MB, one-time)
  Step 2: Selects best AI model for their hardware + downloads it
  Step 3: Tester pastes their license key → verified offline instantly
  Step 4: Pro modules unlock → app ready
```

**Zero terminal commands required. Zero manual setup.**

---

## Discord Bot Commands (LexSort Server)

| Command | What it does |
|---|---|
| `/register` | Start beta registration — bot DMs download link + key |
| `/mykey` | Re-send your license key to your DMs |
| `/mystatus` | Check if your subscription/key is active |
| `/help` | Show all available commands |

**Bot is live on Railway.** If commands aren't responding, check Railway dashboard.

---

## Generating Beta Keys Manually (for manual distribution)

If you need to generate extra keys to DM testers directly:

```bash
# From VERA repo root — requires .env.local with LICENSE_SIGNING_PRIVATE_KEY
cd /Users/williamcommu/Desktop/JUST_ME_MEDIA_VAULT/LexSortInc/01_ACTIVE/VERA
node scripts/generate-test-keys.js 5   # generates 5 keys
```

Keys expire 30 days from generation. DM each key privately — never post in public channels.

---

## What Testers Need

| Requirement | Notes |
|---|---|
| macOS (Apple Silicon or Intel) | `.dmg` download from lexsort.com/download |
| Windows 64-bit | `.exe` from GitHub releases (once CI passes) |
| ~5 GB free disk space | For AI model download |
| Internet for first setup | Engine + model download (one-time) |
| **Nothing else** | Ollama is installed automatically by the app |

---

## Download Links

| Platform | Link |
|---|---|
| macOS Apple Silicon | [lexsort.com/download](https://lexsort.com/download) → auto-detected |
| macOS Intel | [lexsort.com/download](https://lexsort.com/download) → auto-detected |
| Windows | GitHub releases: github.com/Lexsort-Core/Lexsort-Vera-Pro/releases |

---

## What Testers Should Test

### ProMailer Module
1. Open VERA → Sidebar → ProMailer
2. Lead Finder tab → type: `"find 10 plumbers in Toronto"`
3. Click **Search** — results should appear within 30 seconds
4. Compose tab → draft a campaign email using AI
5. Send tab → test with a personal test inbox

### Guardian Watch Module
1. Sidebar → Guardian Watch
2. Confirm system metrics (CPU, RAM, disk) are displayed
3. Set a disk space alert threshold → confirm it triggers

### Research Lab Module
1. Sidebar → Research Lab
2. Run a Quick Prompt test
3. Run a benchmark suite → confirm results appear

### Chat (Core)
1. Chat → ask a question
2. Confirm streaming response works
3. Test conversation history (previous conversations in sidebar)

---

## Bug Reporting

Ask testers to post in **#pro-bug-reports** on Discord with:
- What they were doing
- What happened vs. what they expected
- OS version (macOS 14.x, Windows 11, etc.)
- Screenshot or error message if available

---

## Infrastructure Reference

| Service | Status | Notes |
|---|---|---|
| Discord Bot | ✅ Live on Railway | `/register`, `/mykey`, `/mystatus`, `/help` |
| License key validation | ✅ Offline Ed25519 | No internet needed after first setup |
| Stripe | ⏳ Not active for beta | Bypassed — free keys for all beta testers |
| GitHub CI | ✅ v1.0.12 building | check: github.com/Lexsort-Core/Lexsort-Vera-Pro/actions |

---

## Stripe Setup (for when paid flow goes live — not yet active)

When we're ready to charge users:

1. **Stripe Dashboard** → Products → VERA Pro Subscription → create two prices:
   - Monthly: **$5.99 CAD** recurring
   - Yearly: **$59.00 CAD** recurring

2. **Netlify Environment Variables** → add:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRO_PRICE_ID_MONTHLY=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   LICENSE_SIGNING_PRIVATE_KEY=302e020100...  (from .env.local)
   DISCORD_BOT_TOKEN=...
   DISCORD_GUILD_ID=...
   DISCORD_TESTER_ROLE_ID=...
   ```

3. Update Discord bot's `/register` command to point to real Stripe checkout instead of free beta flow.
