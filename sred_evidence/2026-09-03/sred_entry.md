# SR&ED entry — 2026-09-03 (2.0h, 08:41–10:41 EDT, founder-declared)

## Problem (technical gap, not symptom)

VERA had no working update distribution across two builder machines:
the fallback downloader pointed at a retired GitHub org with stale
bundle filenames, the manifest parser required a field the live manifest
never sends, no updater plugin was wired, and no secure machine channel
existed to transfer the shared signing key for lockstep Freeware 1.3.0 /
Pro 1.0.13 releases without CI.

## Uncertainty (not known in advance)

Whether Tauri v2.11's single-line encrypted key format verifies against
older minisign-text embedded pubkeys; whether PowerShell-produced
CRLF/base64 payloads survive byte-identical; whether per-arch updater
tarballs can ride a static CDN given tauri's shared tarball filename;
whether cp1252-mojibake webpages repair byte-faithfully.

## Systematic work (files, algorithms, tests)

- Verified ThinkCentre branches macOS-side (tsc + cargo check + build),
  merged to both mains.
- age channel: keypair, handshake, updater-key receipt, shred protocol.
- `sigcheck` scratch verifier (minisign-verify 0.2.5, exact client path):
  keypair MATCH ×6 incl. production artifacts.
- Fallback repair: `get_installer_info` (both lib.rs), `RemoteManifest`
  serde default; bumps 1.3.0/1.0.13 (+Pro drift fix 1.0.5).
- 6 signed Mac builds, site-hosted DMGs + tarballs, beta feeds filled,
  2 Netlify prod deploys, all URLs curl-verified 200 byte-exact.
- download.html mojibake repair (roundtrip + node --check), Linux
  removal with guards, internal-build policy docs.
- Tester-allowlist review (6/6 conditions) + merge.
- Backup: 2 verified git bundles (refs/stash incl.) + keys/records to
  lexsort-central/m1/2026-09-03, 48/48 SHA-256 OK.
