# VERA — Security & Licensing

---

## 1. Tauri Webview Sandbox

Tauri v2 sandboxes the webview and blocks `<a target="_blank">` tags from navigating externally. Every external link must be explicitly intercepted.

### The Fix — `openExternalUrl` helper

Defined in [SupportPanel.tsx](../lexsort-personal-ai/src/SupportPanel.tsx) and re-exported for use across the app:

```typescript
export async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // Fallback: synthesized anchor click
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
```

Usage in JSX — always intercept the default click:

```tsx
<a
  href="https://lexsort.com/vera-pro.html"
  onClick={(e) => { e.preventDefault(); openExternalUrl("https://lexsort.com/vera-pro.html"); }}
>
  Upgrade to Pro
</a>
```

---

## 2. Tauri Capability Whitelisting

[capabilities/default.json](../lexsort-personal-ai/src-tauri/capabilities/default.json) explicitly permits `plugin-opener` only for approved domains:

```json
{
  "permissions": [
    "core:default",
    "opener:default",
    {
      "identifier": "opener:allow-open-url",
      "scope": {
        "allow": [
          { "url": "https://lexsort.com/*" },
          { "url": "https://discord.gg/*" },
          { "url": "https://www.reddit.com/*" },
          { "url": "https://github.com/*" },
          { "url": "https://buy.stripe.com/*" }
        ]
      }
    }
  ]
}
```

> **To add a new allowed domain:** add an entry to the `allow` array and rebuild. Navigation to unlisted domains will silently fail inside the webview.

---

## 3. Ed25519 License Gate (Pro)

### How it works

1. **Purchase:** User subscribes via Stripe. The webhook fires → `stripe-webhook.js` creates an Ed25519-signed license key and DMs it to the user via the Discord bot.
2. **Activation:** User pastes the key in VERA Pro's license gate screen. The key is verified 100% offline against a **compiled-in public key** inside the Rust binary.
3. **No network call on verify:** `get_license_status` reads from a local database (`~/.lexsort/license.json`). Internet is only required for the initial activation POST.

### Pricing (keep in sync across all docs + website)

| Plan | Price | Stripe Price ID env var |
|---|---|---|
| Monthly | $5.99 / month | `STRIPE_PRO_PRICE_ID_MONTHLY` |
| Yearly | $59.00 / year | `STRIPE_PRO_PRICE_ID_YEARLY` |

### Key generation (testing)

```bash
cd scripts
node generate-test-keys.js
```

### Required Netlify env vars

| Variable | Value source |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe dashboard → API keys |
| `STRIPE_PRO_PRICE_ID_MONTHLY` | Stripe → Products → VERA Pro |
| `STRIPE_PRO_PRICE_ID_YEARLY` | Stripe → Products → VERA Pro |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks |
| `LICENSE_SIGNING_PRIVATE_KEY` | `src-tauri/private_key.hex` (96-char hex) |
| `DISCORD_BOT_TOKEN` | Discord developer portal |
| `DISCORD_GUILD_ID` | Your Discord server ID |
| `DISCORD_TESTER_ROLE_ID` | Role ID granted on subscription |

---

*See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md)*
