# VERA — Cryptographic Key Manifest

> [!CAUTION]
> **Read this before generating, rotating, or using ANY signing key.**
> There are TWO separate key systems. They are different formats and different purposes.

---

## Key System Overview

| Key | Purpose | Format | Location |
|---|---|---|---|
| **License Signing Key** | Signs license tokens distributed to Pro users | Ed25519 PKCS8 DER (48 bytes) | `.env.local` → `LICENSE_SIGNING_PRIVATE_KEY` |
| **Module Signing Key** | Signs `.vera-module` ZIP bundles for CDN | Ed25519 raw hex (96 chars / 48 bytes) | `.env.local` → `MODULE_SIGNING_PRIVATE_KEY` |

---

## Active Keys (as of Jun 30, 2026)

### License Signing Key — ROTATED Jun 30, 2026

Used by `scripts/generate-test-keys.js` and the Stripe webhook to sign `VERA-PRO-...` license tokens.
Verified offline by the Rust `validate_license` command inside the Pro binary.

| Field | Value |
|---|---|
| **Rotated** | June 30, 2026 |
| **Format** | Ed25519 PKCS8 DER — hex-encoded (48 bytes = 96 hex chars) |
| **Private key** | In `.env.local` as `LICENSE_SIGNING_PRIVATE_KEY=302e020100...` (do not share) |
| **Public key (hex)** | `c8d9021c26d9254c073bbd2d25f7ce2aeec0189f8c5283cf25156dbcf7081663` |
| **Public key file** | `02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/lexsort-vera-pro/src-tauri/lexsort_public_key.bin` |
| **Pro binary** | Public key embedded — any binary built after Jun 30 2026 uses this key |
| **Netlify env var** | `LICENSE_SIGNING_PRIVATE_KEY` — must be set for Stripe webhook to generate keys |

> [!WARNING]
> **Rotating this key again will invalidate ALL existing beta keys.** Coordinate with testers before rotating.

### Module Signing Key — Active since Jun 17, 2026

Used by `scripts/sign-module.js` and `build-module.sh --sign` to sign `.vera-module` ZIPs.
Verified by the Rust module loader in the Pro binary before installing any module.

| Field | Value |
|---|---|
| **Rotated** | June 17, 2026 |
| **Format** | Ed25519 raw hex (96 chars / 48 bytes) |
| **Private key** | In `.env.local` as `MODULE_SIGNING_PRIVATE_KEY=<96-char hex>` (do not share) |
| **Public key (hex)** | `fc3c7bdc8c24f0afdf93624ae48d4fb81323301b425293eae99cf63bd50299d1` |
| **Public key file** | `vera-freeware/src-tauri/lexsort_public_key.bin` (Freeware uses module key) |
| **Netlify env var** | `MODULE_SIGNING_PRIVATE_KEY` — set for CDN index signing |

---

## Verify Embedded Keys

```bash
# Check which public key is embedded in the Pro binary:
hexdump -C 02_ACTIVE_PROJECTS/Lexsort-Vera-Pro/lexsort-vera-pro/src-tauri/lexsort_public_key.bin | head -3

# Check which public key is embedded in the Freeware binary:
hexdump -C vera-freeware/src-tauri/lexsort_public_key.bin | head -3

# Generate test license keys (uses LICENSE_SIGNING_PRIVATE_KEY from .env.local):
node scripts/generate-test-keys.js 5
```

---

## GitHub Actions / Netlify Secrets Reference

| Variable | Used In | Value Source |
|---|---|---|
| `LICENSE_SIGNING_PRIVATE_KEY` | Netlify stripe-webhook + Netlify generate-test-keys | `.env.local` |
| `MODULE_SIGNING_PRIVATE_KEY` | Netlify index signing, `build-module.sh --sign` | `.env.local` |
| `APPLE_ID` | GitHub Actions Pro CI | Your Apple Developer email |
| `APPLE_CERTIFICATE_BASE64` | GitHub Actions Pro CI | `.p12` exported from keychain, base64 |
| `APPLE_CERTIFICATE_PASSWORD` | GitHub Actions Pro CI | Password set at .p12 export time |
| `APPLE_TEAM_ID` | GitHub Actions Pro CI | `C76T5D27A2` |
| `APPLE_SIGNING_IDENTITY` | GitHub Actions Pro CI | `Developer ID Application: William Commu (C76T5D27A2)` |
| `APPLE_APP_SPECIFIC_PASSWORD` | GitHub Actions Pro CI (notarization) | appleid.apple.com → App-Specific Passwords |
| `TAURI_PRIVATE_KEY` | GitHub Actions Pro CI (updater signing) | May need to add if CI fails on update step |
| `TAURI_PRIVATE_KEY_PASSWORD` | GitHub Actions Pro CI | Leave blank |

---

## Key Rotation Procedure

### Rotating the License Signing Key (affects all existing Pro licenses)

> [!CAUTION]
> Rotating this key **invalidates all existing beta keys**. Do not rotate during active tester period without re-issuing keys.

1. Generate a new key: `node -e "const c=require('crypto'); const {privateKey, publicKey} = c.generateKeyPairSync('ed25519'); console.log('PRIV:', privateKey.export({format:'der',type:'pkcs8'}).toString('hex')); console.log('PUB:', publicKey.export({format:'der',type:'spki'}).slice(-32).toString('hex'));"`
2. Write the 32-byte public key to `lexsort-vera-pro/src-tauri/lexsort_public_key.bin`
3. Update `LICENSE_SIGNING_PRIVATE_KEY` in `.env.local` and in Netlify dashboard
4. Update this document with new fingerprint and rotation date
5. Commit and push → CI builds new binary with new public key embedded
6. Re-issue all existing license keys using `node scripts/generate-test-keys.js`

### Rotating the Module Signing Key (affects all installed module bundles)

> [!CAUTION]
> Rotating this key means all previously signed `.vera-module` ZIPs on the CDN will fail verification.

1. Generate a new key: `node -e "const c=require('crypto'); const {privateKey,publicKey}=c.generateKeyPairSync('ed25519'); console.log(privateKey.export({format:'der',type:'pkcs8'}).toString('hex')); console.log(publicKey.export({format:'der',type:'spki'}).slice(-32).toString('hex'));"`
2. Write 32-byte public key to `vera-freeware/src-tauri/lexsort_public_key.bin`
3. Update `MODULE_SIGNING_PRIVATE_KEY` in `.env.local` and Netlify
4. Rebuild all modules: `./scripts/build-module.sh promailer --sign` etc.
5. Re-upload all `.vera-module` ZIPs to CDN
6. Update fingerprint in `vera-freeware/src-tauri/tests/contracts.rs`
7. Update this document
