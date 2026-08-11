# VERA Pro — Launch Runbook

**Target Launch Date:** July 1, 2026

---

## 📅 Pre-Launch (June 30)

### Infrastructure Check
- [ ] Connect `TOSHIBA EXT` drive → run `Backup_JustMeMedia_Vault.command` on Desktop → confirm `rsync` exits 0
- [ ] Verify Netlify is on latest production build (no styling issues)
- [ ] Run `node scripts/generate-test-keys.js` to verify license signature logic

### Final Release Build Verification
- [ ] Confirm GitHub Actions completed for both repos (check Actions tab)
- [ ] Confirm all 4 binary types are attached to the GitHub Release tag:
  - `.dmg` (Apple Silicon)
  - `.dmg` (Intel)
  - `.AppImage` / `.deb` (Linux)
  - `.msi` (Windows)
- [ ] Update `website/api/manifest.json` with current-version download URLs → deploy to Netlify
- [ ] Update `website/download.html` and `website/js/download-detector.js` with new URLs
- [ ] Update `netlify/functions/uptime-monitor.js` with new binary URLs

---

## 🚀 Launch Day (July 1, 2026)

### 8:00 AM — Stripe & Netlify Activation

- [x] Log into [dashboard.stripe.com](https://dashboard.stripe.com)
- [x] Switch to **Live mode** (toggle top right)
- [x] Verify LexSort Inc. account details (Settings → Account details)
- [x] Confirm VERA Pro prices are active in Live mode:
  - Monthly: $5.99/month
  - Yearly: $59.00/year
  - Copy both Price IDs
- [x] Add Stripe webhook endpoint: `https://lexsort.com/.netlify/functions/stripe-webhook`
  - Events: `customer.subscription.created`, `invoice.payment_succeeded`, `customer.subscription.deleted`
  - Copy `whsec_xxx` signing secret
- [x] Set Netlify production environment variables:
  - `STRIPE_SECRET_KEY` (Live: `sk_live_xxx`)
  - `STRIPE_PRO_PRICE_ID_MONTHLY`
  - `STRIPE_PRO_PRICE_ID_YEARLY`
  - `STRIPE_WEBHOOK_SECRET`
  - `LICENSE_SIGNING_PRIVATE_KEY` (96-char hex from `src-tauri/private_key.hex`)
  - `DISCORD_BOT_TOKEN`
  - `DISCORD_GUILD_ID`
  - `DISCORD_TESTER_ROLE_ID`
- [x] Trigger Netlify redeploy to pick up env vars

---

### 9:00 AM — Discord Bot Deploy

- [x] SSH into VPS / Railway / Fly.io
- [x] Set bot environment variables
- [x] Launch bot:
  ```bash
  cd discord-bot
  npm install
  node tester-manager.js
  ```
- [x] Confirm bot is online in Discord and slash commands are registered

---

### 10:00 AM — Live E2E Test

- [x] Use a test Discord account → run `/register` with billing option
- [x] Complete Stripe checkout with a live test card (or 100% off coupon)
- [x] Verify:
  - Discord account receives Pro role
  - DM with license key arrives
  - Key activates VERA Pro app locally

---

### 11:00 AM — Social Media Blast

- [ ] **Discord `#announcements`** — ping `@everyone` with launch post
- [ ] **Reddit r/LocalLLaMA** — submit announcement thread with links
- [ ] **X/Twitter** — post the countdown/launch thread (see [MARKETING_AND_ROADMAP.md](docs/MARKETING_AND_ROADMAP.md) for templates)

---

## 📈 Post-Launch — First Week

- [ ] Monitor `uptime-monitor` logs in Netlify for errors
- [ ] Check Stripe dashboard daily for transaction volume
- [ ] Run tester reward script to send free license keys to beta contributors
- [ ] Watch Discord `#bugs` and `#feedback` channels
- [ ] Check GitHub Issues for Windows / Linux install reports

---

*See also: [MARKETING_AND_ROADMAP.md](docs/MARKETING_AND_ROADMAP.md) · [BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md)*
