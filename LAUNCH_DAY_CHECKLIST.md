# VERA Pro — Launch Day Runbook
*Scheduled Launch Date: July 1, 2026*

This document lists the exact hour-by-hour checklist for deploying, configuring, and verifying the production launch of VERA Pro.

---

## 📅 Pre-Launch Check (June 30)

### 1. External Media Backup
- [ ] Connect the external `TOSHIBA EXT` drive to your Mac.
- [ ] Double-click `Backup_JustMeMedia_Vault.command` on your Desktop.
- [ ] Confirm that `rsync` mirrors the vault folder structure correctly and exits with exit code 0.

### 2. Infrastructure Build Check
- [ ] Verify that Netlify is running the latest production build of the website with no styling issues.
- [ ] Run `node scripts/generate-test-keys.js` to verify license signature logic.

---

## 🚀 Launch Day (July 1, 2026)

### 🕗 8:00 AM — Stripe & Netlify Activation
- [x] **Log into Stripe**: Go to [dashboard.stripe.com](https://dashboard.stripe.com).
- [x] **Switch off Test Mode**: Toggle the live mode switch in the top right.
- [x] **LexSort Inc Verification**:
  - Go to **Settings → Account details**.
  - Verify and input the correct company registration & bank numbers.
- [x] **Active VERA Pro Prices**:
  - Go to **Products → VERA Pro**.
  - Ensure the Monthly Plan ($5.99) and Yearly Plan ($59.00) are active in Live mode.
  - Copy the two Price IDs (Monthly: `price_xxx_monthly`, Yearly: `price_xxx_yearly`).
- [x] **Active Webhook**:
  - Go to **Developers → Webhooks**.
  - Add an endpoint for: `https://lexsort.com/.netlify/functions/stripe-webhook`.
  - Enable events: `customer.subscription.created`, `invoice.payment_succeeded`, `customer.subscription.deleted`.
  - Reveal and copy the webhook signing secret (`whsec_xxx`).
- [x] **Configure Environment Variables**:
  - Log into the [Netlify Dashboard](https://app.netlify.com).
  - Go to **Site settings → Environment variables** for your project.
  - Set the following production variables:
    * `STRIPE_SECRET_KEY` (Live key: `sk_live_xxx`)
    * `STRIPE_PRO_PRICE_ID_MONTHLY` (`price_xxx_monthly`)
    * `STRIPE_PRO_PRICE_ID_YEARLY` (`price_xxx_yearly`)
    * `STRIPE_WEBHOOK_SECRET` (`whsec_xxx`)
    * `LICENSE_SIGNING_PRIVATE_KEY` (Use the 96-char hex private key from `src-tauri/private_key.hex`)
    * `DISCORD_BOT_TOKEN` (From Discord developer application portal)
    * `DISCORD_GUILD_ID` (Your Discord server ID)
    * `DISCORD_TESTER_ROLE_ID` (Role ID to grant upon subscription creation)
- [x] **Deploy Netlify Site**:
  - Go to **Deploys → Trigger deploy** in the Netlify UI to rebuild and deploy with new environment variables.

---

### 🕘 9:00 AM — Discord Bot Deploy
- [x] **Prepare Environment**:
  - Log into your VPS/Railway/Fly.io panel.
  - Set the application environment variables (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_TESTER_ROLE_ID`, `STRIPE_SECRET_KEY`, etc.).
- [x] **Launch Bot**:
  - Run the bot in production mode:
    ```bash
    cd discord-bot
    npm install
    node tester-manager.js
    ```
  - Verify that the bot is online on Discord and registers its slash commands.

---

### 🕙 10:00 AM — Live Testing
- [x] **E2E Transaction Test**:
  - Use a test account on Discord to execute `/register` with a billing option.
  - Follow the generated checkout URL.
  - Complete the checkout process using a live test card (or apply a 100% off coupon code).
  - Verify that the Discord account gets the role and a direct DM with the license key signature.
  - Copy/paste the key inside VERA app and confirm local activation works.

---

### 🕚 11:00 AM — Social Media Blast
- [ ] **Discord Announcement**:
  - Post the launch message in the `#announcements` channel (ping `@everyone`).
- [ ] **Reddit (r/LocalLLaMA)**:
  - Submit the announcement thread with links to `lexsort.com/vera-pro.html` and the Discord join link.
- [ ] **X/Twitter**:
  - Post the countdown thread highlighting the offline signature validation, $5.99/mo / $59/yr pricing, and lack of cloud data collection.

---

## 📈 Post-Launch (First Week)
- [ ] Monitor `uptime-monitor` logs in Netlify for errors.
- [ ] Check Stripe dashboard for transaction details.
- [ ] Run the tester reward script to send free license keys to beta contributors.
