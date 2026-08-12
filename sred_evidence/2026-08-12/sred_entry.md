# SR&ED Entry — 2026-08-12 (id 1786571520000)

**Hours:** 1.5 · **Area:** Software Development · **Agent:** OpenCode

## Problem
Developer-workstation bottlenecks on the VERA compile-verify-test loop:
1. Eager `nvm.sh` sourcing added 0.66–0.74s to every interactive shell start (measured via `time zsh -i -c 'exit'`), taxing every Tauri/React/npm/cargo command.
2. No shared Rust compile cache across vera-freeware (8.3GB target), vera-engine (539MB target) and the Pro repo — each pre-tag `cargo check` validation rebuilt dependencies from scratch on a 10-core/16GB machine.
3. Background infrastructure contention: Logitech G HUB agent (~800 accumulated CPU-hours, 13% sustained), Folding@Home LaunchDaemon auto-started Jul 30, contactsd reindex loop at 24% CPU, SteamClean + updater daemons, three concurrent Electron IDEs, and an idle Ollama server.

## Uncertainty
- Whether lazy-loading nvm via self-redefining shell function shims preserves identical node/npm resolution in non-interactive and CI-shell contexts, or whether the retained `NVM_DIR` export alone breaks npm-script PATH resolution.
- Whether sccache 0.17.0 as `rustc-wrapper` in `~/.cargo/config.toml` remains compatible with Tauri v2's build.rs environment probing (macOS code-signing, platform cfg probes) or corrupts incremental crate artifacts.
- Whether `launchctl bootout/disable` of the root-owned Folding@Home and G HUB updater daemons is fully reversible, and whether launchd-restarted contactsd exits the reindex loop with a fresh state.

## Work
- Profiled `~/.zshrc`; rewrote it with lazy nvm shims (`nvm/node/npm/npx`); verified 0.66s → 0.015s shell startup with npm resolution intact.
- Installed sccache 0.17.0 (Homebrew) and wrote `~/.cargo/config.toml` (`rustc-wrapper = "sccache"`, `jobs = 10`); validated via real `cargo check` on vera-engine: 12.04s, 147 compile requests routed through the wrapper, 143 crates cached.
- Daemon/process audit and mitigation: G HUB agent killed + updater disabled, `com.valvesoftware.steamclean` relocated from `~/Library/LaunchAgents/` to `~/Library/LaunchAgents-disabled/`, contactsd restarted, user executed the sudo `launchctl bootout system/org.foldingathome.fahclient` and `launchctl disable system/com.logi.ghub.updater` commands (verified disabled in system domain).
- Reclaimed ~3GB disk (`npm cache clean --force`, `~/Library/Caches/Google`, `brew cleanup`) and ~0.7–1GB RAM (quit Antigravity IDE, Ollama).
- No source files modified; all changes environment-level and reversible.