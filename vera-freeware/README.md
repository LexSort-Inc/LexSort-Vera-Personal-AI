# VERA Freeware — Desktop Client (Tauri v2)

The desktop shell client for VERA. Built with Tauri v2 (Rust backend + React/TypeScript frontend).

For full setup, install instructions, and community links, see the [main README](../README.md).

## Tech Stack

- **Shell:** Tauri v2 (Rust)
- **Frontend:** React 19 + TypeScript
- **Backend:** Rust (`src-tauri/src/commands/`, `team_lab/`)
- **Inference proxy:** Ollama (managed child process) → eventually embedded llama.cpp

## Dev

```bash
npm run tauri dev
```

## Notable

- `src-tauri/src/docs/quick_organizer.md` — feature doc
- `docs/architectural-debt.md` — known debt items
- Pre-commit hooks run contract tests (skip gracefully if targets missing)
