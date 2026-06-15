# VERA Personal AI – Cryptographic Key Manifest

## Active Keys

| Purpose | Fingerprint (first 8 bytes) | File Location | Status |
|---------|-----------------------------|---------------|--------|
| Embedded public key | `3183e9e4a95b99b3` | `lexsort-personal-ai/src-tauri/lexsort_public_key.bin` | Active (v1.0.0+) |

**These keys are active as of June 2026. Do not rotate without following the procedure below.**

## Rotation Procedure (DANGER: Breaks all existing installs)

Rotating the key will **brick every existing VERA installation** because the binary contains the old public key.

To rotate safely:

1. **Announce** a mandatory update 30 days in advance.
2. Replace `lexsort-personal-ai/src-tauri/lexsort_public_key.bin` with the new public key file.
3. Rebuild the Tauri binary for all platforms (macOS, Windows, Linux).
4. Update the fingerprint in `lexsort-personal-ai/src-tauri/tests/contracts.rs` to the new key's first 8 bytes.
5. Publish new binaries.

## Verification
To verify the embedded public key fingerprint:
```bash
hexdump -n 8 -v -e '8/1 "%02x"' lexsort-personal-ai/src-tauri/lexsort_public_key.bin
```
