# VERA Personal AI – Integration Contracts

This file lists every integration point that must remain stable across versions.  
If you change any of these without updating all consumers (and updating this file), you will break production.

## 1. Public Key Embedded in Binary

- **Location**: `lexsort-personal-ai/src-tauri/lexsort_public_key.bin`
- **Fingerprint (first 8 bytes)**: `3183e9e4a95b99b3`
- **Consumers**:
  - Tauri binary startup check
- **Change requires**: Re‑build every binary.

## 2. AppConfig Serialization
- **Rust struct**: `AppConfig` in `lexsort-personal-ai/src-tauri/src/lib.rs` (under `commands` module).
- **Fields**: `active_model`, `last_benchmark_tps`, `module_models`, `module_benchmark_tps`.
- **Consumers**: Settings UI, chat page.
- **Change requires**: Write a migration for existing config files.

## 3. File System Permissions
- `~/.lexsort/`: `0700` (`drwx------`)
- `~/.lexsort/*.json`: `0600` (`-rw-------`)
- `~/.lexsort/modules/`: `0700`
