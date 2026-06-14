# VERA Pro — Tester Infrastructure Setup Guide

This document walks through setting up the complete VERA Pro beta tester pipeline:
**Stripe → Netlify Webhook → License Key → Discord DM + Role Grant**

---

## Architecture Overview

```
User clicks /register in Discord
        ↓
Discord Bot → POST /api/create-tester-checkout
        ↓
Netlify Function → Create Stripe Checkout Session
        ↓
User completes $5.99/mo checkout (14-day free trial)
        ↓
Stripe fires webhook → POST /api/stripe-webhook
        ↓
Netlify Function:
  1. Generates Ed25519-signed license key
  2. Calls Discord API → grants "Beta Tester" role
  3. Sends DM with license key embed
        ↓
User pastes key into VERA → local verification → Pro unlocked ✅
```

---

## Step 1: Stripe Setup (Edit Existing LexSort Account)

> ✅ You already have a Stripe account for LexSort. You only need to add the missing pieces below.

### 1.1 Confirm Mode
- Go to [dashboard.stripe.com](https://dashboard.stripe.com)
- Top-right toggle: start in **Test Mode** for initial testing, switch to **Live** when ready to charge real cards

### 1.2 Create the VERA Pro Product & Prices
> If a VERA Pro product already exists, you can just add the second pricing plan (Yearly) to it.

1. Stripe Dashboard → **Products** → **+ Add Product**
2. Name: `VERA Pro Subscription`
3. Pricing model: **Recurring**
4. Create **two prices** under this product:
   * **Monthly Plan:** **$5.99 CAD** (or USD) · Billing: **Monthly**
   * **Yearly Plan:** **$59.00 CAD** (or USD) · Billing: **Yearly**
5. Click **Save product**
6. Copy the **Price IDs** from the product page — they look like `price_1ABC...`
   - Copy the Monthly Price ID. This is your `STRIPE_PRO_PRICE_ID_MONTHLY`
   - Copy the Yearly Price ID. This is your `STRIPE_PRO_PRICE_ID_YEARLY`
   - *(Note: `STRIPE_PRO_PRICE_ID` is supported as a fallback for the Monthly plan)*

### 1.3 Add the Webhook Endpoint
> Check **Developers → Webhooks** first — if a lexsort.com webhook already exists, just add the missing events.

1. Stripe Dashboard → **Developers** → **Webhooks** → **+ Add endpoint**
2. Endpoint URL: `https://lexsort.com/.netlify/functions/stripe-webhook`
3. Events to listen for (select these 3):
   - `customer.subscription.created`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. Click **Reveal** under Signing Secret → copy it (`whsec_...`)
   - This is your `STRIPE_WEBHOOK_SECRET`

### 1.4 Get Your API Keys
1. Stripe Dashboard → **Developers** → **API Keys**
2. Copy the **Secret key** (`sk_live_...` or `sk_test_...`)
   - This is your `STRIPE_SECRET_KEY`
   - Use `sk_test_...` for testing, `sk_live_...` for production

### 1.5 Keys Summary
| Netlify Env Variable | Where to find it |
|---|---|
| `STRIPE_SECRET_KEY` | Developers → API Keys → Secret key |
| `STRIPE_PRO_PRICE_ID_MONTHLY` | Products → VERA Pro → Monthly Price ID |
| `STRIPE_PRO_PRICE_ID_YEARLY` | Products → VERA Pro → Yearly Price ID |
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks → your endpoint → Signing secret |

---

## Step 2: Discord Bot Setup

### 2.1 Create the Discord Application
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name it `VERA Pro Bot`
3. Go to **Bot** tab → Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
4. Copy the **Bot Token**

### 2.2 Set Bot Permissions
Under **OAuth2 → URL Generator**:
- Scopes: `bot`, `applications.commands`
- Bot Permissions:
  - ✅ Manage Roles
  - ✅ Send Messages
  - ✅ Use Slash Commands
  - ✅ Read Message History

Copy the generated URL and use it to invite the bot to your server.

### 2.3 Create the Beta Tester Role
1. Discord Server Settings → **Roles** → Create Role
2. Name: `Beta Tester` (or `VERA Pro Tester`)
3. Give it access to your `#pro-pre-release`, `#pro-feedback`, `#pro-bug-reports` channels
4. **Right-click the role** → Copy Role ID

### 2.4 Collect your Discord IDs
| Variable | How to get it |
|---|---|
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Token |
| `DISCORD_CLIENT_ID` | Developer Portal → General Information → Application ID |
| `DISCORD_GUILD_ID` | Right-click your server → Copy Server ID |
| `DISCORD_TESTER_ROLE_ID` | Right-click the Beta Tester role → Copy Role ID |

> **Enable Developer Mode**: Discord Settings → Advanced → Developer Mode ON (required to copy IDs)

---

## Step 3: Netlify Environment Variables

In your Netlify dashboard → **Site Configuration** → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | From Step 1.4 |
| `STRIPE_PRO_PRICE_ID` | From Step 1.4 |
| `STRIPE_WEBHOOK_SECRET` | From Step 1.4 |
| `DISCORD_BOT_TOKEN` | From Step 2.4 |
| `DISCORD_GUILD_ID` | From Step 2.4 |
| `DISCORD_TESTER_ROLE_ID` | From Step 2.4 |
| `LICENSE_SIGNING_SECRET` | Generate: `openssl rand -hex 32` |

> **Security**: `LICENSE_SIGNING_SECRET` must be a strong random secret — minimum 32 characters. Keep it safe; changing it invalidates all existing keys.

---

## Step 4: Deploy the Discord Bot

The bot needs to run 24/7 on a server. Options:

### Option A: Railway (Recommended — Free tier available)
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B: Fly.io
```bash
fly launch
fly deploy
```

### Option C: VPS (DigitalOcean, etc.)
```bash
cd discord-bot
npm install
# Add your .env values
cp .env.example .env
nano .env  # Fill in your values
node tester-manager.js
# Use PM2 to keep it alive:
npm install -g pm2
pm2 start tester-manager.js --name vera-pro-bot
pm2 save
pm2 startup
```

---

## Step 5: Set Up Discord Channels

Create these channels in your VERA Pro Discord server:

| Channel | Purpose | Who Can See |
|---|---|---|
| `#pro-announcements` | Official news from LexSort | Everyone (read-only) |
| `#pro-pre-release` | Early builds & changelog | Beta Tester role only |
| `#pro-feedback` | Feature requests & ideas | Beta Tester role only |
| `#pro-bug-reports` | Bug reports & tracking | Beta Tester role only |
| `#bot-commands` | Where users run /register | Everyone |

---

## Step 6: Test the Full Flow

### Local Testing
```bash
# Generate test license keys
node scripts/generate-test-keys.js 3

# Test Stripe webhook locally (install Stripe CLI)
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

### End-to-End Test
1. In Discord, type `/register` in `#bot-commands`
2. Click the checkout button (use Stripe test card: `4242 4242 4242 4242`)
3. Complete checkout
4. Verify:
   - ✅ You received a DM with a license key
   - ✅ You got the "Beta Tester" role
   - ✅ You can now see `#pro-pre-release` channel
5. Paste the license key into VERA → Pro modules should unlock

---

## Environment Variables Quick Reference

### Netlify (via Dashboard)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRO_PRICE_ID_MONTHLY=price_...
STRIPE_PRO_PRICE_ID_YEARLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_TESTER_ROLE_ID=...
LICENSE_SIGNING_SECRET=<32+ char random string>
```

### Discord Bot (.env file)
```
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
DISCORD_TESTER_ROLE_ID=...
NETLIFY_SITE_URL=https://lexsort.com
```

---

## Files Reference

| File | Purpose |
|---|---|
| `netlify/functions/create-tester-checkout.js` | Creates Stripe checkout session |
| `netlify/functions/stripe-webhook.js` | Handles payment events, issues keys + roles |
| `netlify/functions/verify-tester-status.js` | Checks if Discord user has active sub |
| `discord-bot/tester-manager.js` | Discord bot with `/register`, `/mystatus`, `/mykey`, `/help` |
| `discord-bot/package.json` | Bot dependencies (discord.js, dotenv) |
| `discord-bot/.env.example` | Template for bot environment variables |
| `scripts/generate-test-keys.js` | Generate test keys for local dev |
