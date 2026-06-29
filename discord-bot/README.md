# VERA Discord Bot — Pro Beta Tester Management

Node.js Discord bot for VERA Pro beta tester onboarding, subscription management, and release publishing.

## Components

- **`tester-manager.js`** — Main entry point. Discord slash commands: `/register`, `/mystatus`, `/mykey`, `/help`. Verifies subscriptions via Netlify site API, assigns beta tester role, and integrates Stripe checkout.
- **`approval-bot.js`** — GitHub webhook listener (HTTP server on port 8080). Handles release approval via Discord buttons, auto-publishes to r/LexSort on Reddit.
- **`health.js`** — Health endpoint for Railway deployment.

## Commands

| Command | Description |
|---|---|
| `/register` | Start VERA Pro subscription (monthly $5.99 / yearly $59.00) |
| `/mystatus` | Check subscription status (active/expired) |
| `/mykey` | Request license key be resent via DM |
| `/help` | Show available commands |

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_BOT_TOKEN` — from Discord Developer Portal
   - `DISCORD_CLIENT_ID` — from Developer Portal > General Information
   - `DISCORD_GUILD_ID` — right-click server > Copy Server ID
   - `DISCORD_TESTER_ROLE_ID` — right-click role > Copy Role ID
   - `NETLIFY_SITE_URL` — e.g. `https://lexsort.com`
2. `npm install`
3. `npm start`

## Deployment

Deployed on Railway (`railway.json`). Health check at `/health`.
