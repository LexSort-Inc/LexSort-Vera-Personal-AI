# VERA Website — lexsort.com

Static marketing site for VERA (Freeware, Pro, and iOS Go). Hosted on Netlify.

## Structure

```
website/
├── index.html            # Landing page
├── freeware.html         # Freeware edition
├── vera-pro.html         # Pro edition
├── vera.html             # iOS Go companion
├── download.html         # Download page
├── faq.html              # FAQ / troubleshooting
├── partner.html          # Partner program
├── privacy.html          # Privacy policy
├── tos.html              # Terms of service
├── pro-activated.html    # Post-activation redirect
├── api/                  # REST API manifest
├── assets/               # Images, social media drafts
├── core/                 # Core CSS/JS
├── demo/                 # Demo assets
├── downloads/            # Version manifests (index.json + index.json.sig)
├── js/                   # Client-side JS
├── legal/                # Legal docs
├── modules/              # Module store index.json + signatures
├── .netlify/             # Netlify deployment state + serverless functions
└── robots.txt / sitemap.xml / llms.txt
```

## Deploy

```bash
netlify deploy --prod --dir=website
```

## Serverless Functions

`.netlify/v1/functions/` — Stripe checkout, license validation, uptime monitoring.
