# SR&ED Entry — 2026-08-11

- **ID:** 1786582000000
- **Date:** 2026-08-11
- **Time:** 10:30 – [Active / In Progress]
- **Hours:** [Pending — to be finalized at session end]
- **Area:** Capability Grounding of Chat System Prompt / Documentation Accuracy Audit
- **Outcome:** VERA Freeware chat system prompt rebuilt from a capability-grounding source of truth; full repo accuracy audit completed (versions, SR&ED log, docs)
- **Agent:** OpenCode

> [!NOTE]
> This entry REPLACES a draft from an earlier 8-minute agent session (10:07–10:15 EDT,
> agent "Antigravity") that claimed VERA-01..05 changes (Windows Job Objects, purge
> command, VRAM gating, dynamic model metadata). A grep of the **Freeware** tree
> confirmed none of that work exists in Freeware — the draft was therefore replaced with
> this record of the work actually performed today.
>
> **UPDATE (Aug 11, 17:45 EDT):** VERA-01..05 was subsequently located **in the Pro repo**
> (`Lexsort-Vera-Pro`) as uncommitted WIP — Job Objects + VRAM gating + lifecycle logging
> in `lib.rs`, `purge_local_user_data`, `/api/show` dynamic model metadata — and committed
> with the Guardian Watch + Smart Inbox scope as `9ce5392` (pushed to
> `LexSort-Inc/Lexsort-Vera-Pro`). The original draft mis-attributed repo and state; the
> engineering work itself was real. The draft date (Aug 11, 10:07) predates this session's
> work; the Pro features were authored in prior sessions and are logged under their own
> entries where applicable.

## Problem

Two technical gaps were identified:

1. **Chat model hallucinates app features.** VERA's chat system prompt was a single
   hard-coded line ("You are Vera, a private personal AI counsel built by LexSort Inc...")
   with no grounding in what the installed build actually ships. The model therefore
   improvises feature claims (e.g. web search, cloud sync, purchases, external device
   control) and invents support links — a correctness and trust problem for a privacy
   product where users legitimately ask "can it do X?".
2. **Repository documentation and evidence had drifted from reality.** README.md and
   AGENTS.md still stated v1.1.7 and "Windows CI in progress" after the v1.1.11 Windows
   chat verification; docs/ARCHITECTURE.md described a dual-binary feature-flag layout that
   no longer exists; and a stray SR&ED evidence folder (2026-08-11) claimed completed work
   that was never implemented.

## Uncertainty

- It was not known in advance whether a single module registry (`MODULES_LIST`, the same
  array the Module Store UI renders) could serve as the source of truth for the chat
  system prompt, such that the prompt scales automatically as modules ship without a
  hand-maintained capability string drifting out of sync.
- It was not known in advance whether the Windows Ollama lifecycle fixes from the Aug 6–7
  arc (exit-code checks, single spawn site, CORS origin sanitization) were the complete
  set of fixes, or whether a full repo-wide version/evidence audit would surface further
  drift (it did — a phantom SR&ED entry describing nonexistent work).

## Work

- Replaced the hard-coded one-line system prompt with `buildSystemPrompt()` in
  `vera-freeware/src/App.tsx` (~line 155–200): derives the module list by filtering
  `MODULES_LIST` (the same registry the Module Store UI renders) to `status ===
  "installed"`, and emits an explicit `VERA_CORE_CAPABILITIES` list, an explicit
  `VERA_NOT_AVAILABLE` list (no web search, no cloud, no purchases, no external device
  control, no file/app writes, no inventory), edition framing ("This is VERA Freeware..."),
  canonical community links only (Discord `discord.gg/kpZ3hWyAaq`, Reddit
  `r/LexSort`, `support@lexsort.com`, `lexsort.com/faq.html`), and a closing rule: "If you
  are not certain this app has a feature, assume it does not." Verified `npx tsc --noEmit`
  clean (commit `c25b592`).
- Docs accuracy audit + refresh (commit `7e79c6c`): README.md → v1.1.11 with Windows
  "built & tested on real hardware" status and new v1.1.x stability section; AGENTS.md
  version line → v1.1.11 (Aug 11, 2026); `docs/ARCHITECTURE.md` rewritten to the current
  single-binary layout (no feature flags); `docs/MARKETING_AND_ROADMAP.md` Voice Input
  status → Design (Amendment 03); `website/download.html` macOS first-launch prompt
  wording; `src-tauri/Cargo.lock` synced to 1.1.11; added `docs/AMENDMENT_03_AUDIO_PIPELINE.md`
  and `scripts/session-log.sh`.
- Confirmed `cargo check` (dev profile) passes cleanly post-commit.
- Replaced the phantom 2026-08-11 SR&ED draft with this record; prepared real evidence
  snapshot in `sred_evidence/2026-08-11/` and committed the previously-untracked real
  snapshots `2026-07-02/` and `2026-08-06/`.
- **Pro repo scope resolution (same session):** committed the Guardian Watch + Smart
  Inbox v1.0.13 scope (`9ce5392`) — `guardian_watch.rs` process supervision, Windows Job
  Object binding (`KILL_ON_JOB_CLOSE`) so `ollama.exe` dies with the app, VRAM-aware
  model gating (<6 GB → `qwen2.5:3b`), dynamic model metadata via `/api/show`,
  `purge_local_user_data`, `ollama-lifecycle` logging, port-11434 collision UI,
  `smart_inbox.rs` (rusqlite-backed calendar-events queue + VERA Engine extraction).
  Verified `cargo check` + `npx tsc --noEmit` clean. Business-organizer backend WIP
  (ingest.py/alembic) intentionally left uncommitted for a later release.
