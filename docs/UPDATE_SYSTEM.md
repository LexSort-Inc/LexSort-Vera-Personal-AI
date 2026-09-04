# VERA — In-App Update System (silent updater, Sep 2026)

VERA updates itself silently: the app checks its channel file on launch,
downloads the new version in the background, and applies it on restart.
Users never reinstall. One shared Ed25519 keypair signs both editions.

> Historical note: before Sep 2026 VERA used a custom downloader
> (`check_for_updates` → download DMG → `open *.dmg`, manual drag to
> install). That flow is now the **legacy fallback** only. This document
> describes the current official updater.

---

## Flow overview

```
App launch
    │
    ▼
useUpdater.check() — fetches channel feed (stable default, beta opt-in)
    │  https://lexsort.com/api/{freeware,pro}-{stable,beta}-latest.json
    │  compares feed.version vs installed version (semver)
    │
    ├── No update → idle, nothing shown
    │
    └── Update available → banner (badged [Beta] on beta channel)
            │
        User clicks Download (or auto-downloads) → progress bar
            │
        Ready → "Restart to apply" → install + relaunch, silent
```

Beta is opt-in in Settings. Whenever the beta channel is selected, a
persistent amber **Beta pill** shows next to the brand (Pro sidebar /
Freeware footer) — testers always know what track they're on.

## Channel feeds (Tauri v2 static-JSON schema)

| File | Edition | Channel |
|---|---|---|
| `freeware-stable-latest.json` | Freeware | stable (default endpoint) |
| `freeware-beta-latest.json` | Freeware | beta (Settings opt-in) |
| `pro-stable-latest.json` | Pro | stable (default endpoint) |
| `pro-beta-latest.json` | Pro | beta (Settings opt-in) |

Each file: `version`, `notes`, `pub_date` (RFC 3339), `platforms` map
(`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` — **no Linux**: no
builder exists under internal-build policy, never publish `linux`
entries) with `url` + `signature` (contents of the `.sig` file).
Empty `platforms` = no update (valid state).

## Frontend (`useUpdater.ts`, both apps)

- `channel` state persisted in `localStorage` (`vera_update_channel`).
- `check()` invokes the Rust `fetch_update` command for the channel.
- Progress events drive the banner; `relaunch()` applies.
- Edition toggle (Pro tester builds): sidebar Pro ⇄ Freeware flip,
  persisted — display-only downgrade, never grants Pro without a key.

## Backend (Tauri plugin)

- `tauri-plugin-updater` initialized in `lib.rs`; `plugins.updater` in
  `tauri.conf.json` holds the minisign **public** key + endpoint.
- `createUpdaterArtifacts: true` makes CI/local builds emit
  `.app.tar.gz` + `.sig` (Mac) alongside `.dmg` / `.msi` + `-setup.exe`.
- Gotcha (learned 2026-09-03): tauri emits ONE shared tarball filename
  per build — staging MUST rename per arch or one overwrites the other.

## Signing keys

- One shared keypair, both editions. Public key embedded in both
  `tauri.conf.json` files (public by design).
- Private key + password: **never in git**. ThinkCentre holds
  `~/.tauri/vera-update.key` / `.pw`; M1 holds copies at the same path
  (received via age channel 2026-09-03). GitHub secrets
  `TAURI_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` exist but
  release CI is retired — local builds read env vars of the same names.
- PowerShell lesson: strip `\r` (`.Trim()`) — the CLI chokes on CR
  (`Invalid symbol 13`). Send LF-only payloads machine to machine.
- CLI lesson: `signer sign --private-key` takes key CONTENT, not a path
  (path → `Invalid symbol 46`, offset = the dot in the filename).

## Publishing (internal builds — no CI)

1. Gates: `cargo check` + `npx tsc --noEmit` clean, both apps.
2. ThinkCentre builds Windows (`.msi` + `-setup.exe` + `.sig`, shared
   key); M1 builds macOS (`aarch64` + `x64` `.dmg` + `.app.tar.gz` +
   `.sig`). NEVER push a `v*` tag — release workflows are retired.
3. Host payloads where feed URLs point (`website/downloads/` or GitHub
   Releases — Mac `.app.tar.gz` files renamed per arch on staging).
4. Fill channel feeds (beta first), `netlify deploy --prod --dir=website`
   (CLI only), curl-verify every URL 200, announce with the deploy ID.
5. Soak on both machines → founder promotes beta→stable (copy entry).

## Legacy fallback (kept, not primary)

`check_for_updates` / `approve_core_update` /
`launch_installer_and_exit` still exist for manual full-installer
download. Its `get_installer_info` targets LexSort-Inc org URLs with
verified bundle names (`%20`-encoded); `RemoteManifest.modules` is
optional. Windows MSI names per tauri convention — ThinkCentre owns
them. Do not build new features on this path.

---

*See also: [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [ONBOARDING.md](ONBOARDING.md)*
