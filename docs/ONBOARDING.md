# ONBOARDING — New Developer Guide (VERA)

Welcome. VERA is two desktop apps (Freeware + Pro) built by two machines
with no CI releases. This page gets you productive in 30 minutes.

## 1. Read in order (15 min)

1. `AGENTS.md` (repo root) — session briefing: internal-build policy,
   SR&ED logging, repo map, dev commands. Non-negotiable first read.
2. `MASTER_HANDOFF.md` — current versions, state table, release flows.
3. `docs/ARCHITECTURE.md` — system design + directory map.
4. `docs/UPDATE_SYSTEM.md` — how silent auto-update works + publishing.
5. `docs/BUILD_AND_RELEASE.md` — build matrix, signing, feeds, deploys.
6. Pro repo `handoffs/BOARD.md` (tail first) — live coordination state.

## 2. The two machines (know which you are)

| Machine | Builds | Owns |
|---|---|---|
| ThinkCentre (Windows 11) | `.msi` / `-setup.exe` | Windows code, bot hosting, Windows smoke tests |
| M1 Pro (macOS) | `aarch64` + `x64` `.dmg` + updater `.sig` | macOS code, signing, feeds, Netlify deploys, verification |

Full ownership map: Pro repo `handoffs/2026-09-03-28-*`. Rule: never
edit the other platform's exclusive lines; shared files need a board
note first. Never push a `v*` tag (would trigger retired CI).

## 3. Repos & remotes (verify before anything)

- Freeware (public): `git@github.com:LexSort-Inc/LexSort-Vera-Personal-AI.git`
- Pro (private): `git@github.com:LexSort-Inc/Lexsort-Vera-Pro.git`
- Anything pointing at `Lexsort-Core/*` is a stale pre-migration remote —
  fix with `git remote set-url origin <above>`. Then `git fetch origin`
  (new branches are invisible until you fetch).

## 4. Everyday commands

```bash
cd vera-freeware && npm run tauri dev     # Freeware dev (hot reload)
cd vera-freeware/src-tauri && cargo check # Rust gate (run before any push)
npx tsc --noEmit                          # TypeScript gate (frontend dir)
LEXSORT_DIR_OVERRIDE=/tmp/x cargo test -- test_version_compare test_dir_creation
netlify deploy --prod --dir=website       # Site deploy (repo root, CLI only)
```

## 5. How work flows between machines

- **Code:** branches, fetch-first, merge (FF preferred), push. Pre-commit
  hook runs contract checks.
- **Talk:** Pro repo `handoffs/` — ID-numbered notes (`YYYY-MM-DD-NN`),
  one topic each, reply with a NEW note, index row in `BOARD.md`.
  If it isn't on the board, it wasn't said.
- **Secrets:** age-encrypted files in `handoffs/inbox/<machine>/`
  (Pro repo only, never public). See `SECURE-CHANNEL.md`. Plaintext
  secrets in git = incident. Windows payloads must be LF-only (strip
  `\r`); UTF-8 + LF enforced by `.gitattributes`.
- **Releases:** local signed builds → host payloads → fill beta feeds →
  deploy → verify → soak → founder promotes to stable. Never reinstall
  is the product promise; the beta channel proves it first.

## 6. Gotchas that burned us (read: don't repeat)

- Force-moving a release tag orphans every download URL permanently.
- Tauri emits one shared `.app.tar.gz` filename per build — rename per
  arch when staging or one overwrites the other.
- `signer sign --private-key` takes key CONTENT, not a path.
- PowerShell writes CRLF/BOM: verify with `file` + `node --check`
  before pushing website or secret files.
- Linux has no builder — never ship Linux links, feeds, or promises.
