# VERA update channels — release guide

Both VERA editions update themselves silently: the app checks its channel
file on launch, downloads the delta in the background, and applies it on
restart. Users never reinstall. Beta builds are opt-in and always badged
**Beta** in the app until promoted.

## Channel files (served from https://lexsort.com/api/)

| File | Edition | Channel |
|---|---|---|
| `freeware-stable-latest.json` | Freeware | stable (default endpoint in `vera-freeware/.../tauri.conf.json`) |
| `freeware-beta-latest.json` | Freeware | beta (checked only when the user enables it in Settings) |
| `pro-stable-latest.json` | Pro | stable (default endpoint in `lexsort-vera-pro/.../tauri.conf.json`) |
| `pro-beta-latest.json` | Pro | beta (checked only when the user enables it in Settings) |

Format is the Tauri v2 static-JSON updater schema: `version`, `notes`,
`pub_date` (RFC 3339), `platforms` map (`windows-x86_64`, `darwin-aarch64`,
`darwin-x86_64`, `linux-x86_64`) each with `url` + `signature` (contents of
the `.sig` file — never a path). An empty `platforms` object is valid and
means "no update".

## Publishing a release (stable example, Freeware)

1. Pre-tag gate (mandatory): `cargo check` + `npx tsc --noEmit` clean.
2. Tag + push: `git tag v1.2.1 && git push origin v1.2.1`
   (Windows stays manual-only: Actions → Build & Release → `windows-only`.)
3. CI (`tauri-action`) signs bundles with `TAURI_PRIVATE_KEY` and attaches
   `latest.json` + `.sig` files to the GitHub release.
4. Copy the new `version`, per-platform `url` + `signature`, and `notes`
   from the release's `latest.json` into `freeware-stable-latest.json`.
5. Deploy: `netlify deploy --prod --dir=website` (CLI only — never connect
   GitHub to Netlify).

Beta: same steps, but mark the GitHub release as prerelease and write to
`freeware-beta-latest.json`. Promoting = copying the beta entry to stable.

## Signing keys

- Public key: embedded in both `tauri.conf.json` files (`plugins.updater.pubkey`).
- Private key + password: **never in git.** GitHub secrets `TAURI_PRIVATE_KEY`
  / `TAURI_PRIVATE_KEY_PASSWORD` (both repos — workflows already reference
  them), plus Infisical when vault wiring lands. Lose the private key and
  shipped installs can never auto-update again — back it up offline.
- Local builds: `$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content ~/.tauri/vera-update.key -Raw).Trim()`
  and `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content ~/.tauri/vera-update.pw -Raw).Trim()`.
