# VERA — In-App Update System

VERA uses a custom-built update flow that bypasses GitHub API rate limits, preserves the UI style, and safely launches installers without file-lock collisions.

---

## Flow Overview

```
App Launch
    │
    ▼
check_for_updates (Rust)
    │  fetches https://lexsort.com/api/manifest.json
    │  compares manifest.version vs current app version
    │
    ├── No update → idle, nothing shown
    │
    └── Update available
            │
            ▼
        UI shows banner / Settings badge dot
            │
        User clicks "Download Update"
            │
            ▼
        approve_core_update(edition, version)   ← Rust
            │  spawns Tokio background task
            │  downloads platform installer → ~/.lexsort/updates/
            │  streams core_update_progress events to React
            │
            ├── status: "downloading"  → progress bar updates
            ├── status: "downloaded"   → "Install & Restart" shown
            └── status: "error"        → "Retry" shown
                    │
                    ▼ (on "Install & Restart")
                launch_installer_and_exit()     ← Rust
                    │  runs platform shell command (open/msiexec/xdg-open)
                    │  calls std::process::exit(0) — drops all locks
                    │
                    ▼
                Native installer runs
```

---

## Stage 1 — Update Discovery

- Called on every app boot (non-blocking, after hardware detection)
- **Freeware:** calls `check_for_updates({ edition: "freeware" })`
- **Pro:** calls `check_for_updates({ edition: "pro" })`, fires 3s after license check

The manifest endpoint: `https://lexsort.com/api/manifest.json`  
**Why not GitHub API?** GitHub enforces 60 unauthenticated requests/hour. A static manifest avoids rate-limits and is deployable to Netlify's CDN in milliseconds.

### manifest.json structure

```json
{
  "version": "1.1.5",
  "freeware_download": {
    "windows": "https://github.com/.../v1.1.5/...x64-setup.msi",
    "macos_arm": "https://github.com/.../v1.1.5/...aarch64.dmg",
    "macos_x64": "https://github.com/.../v1.1.5/...x64.dmg",
    "linux": "https://github.com/.../v1.1.5/...amd64.AppImage"
  },
  "notes": "Changelog text shown in the update banner."
}
```

---

## Stage 2 — Background Download & Staging

- `approve_core_update(edition, version)` spawns a Tokio task
- Download destination: `~/.lexsort/updates/<filename>`
- Path stored in `~/.lexsort/installed.json` under `update_downloaded_path`
- Progress events emitted: `core_update_progress` → `{ status, percent, path }`

---

## Stage 3 — Install on Exit (Freeware)

The freeware intercepts close events via `onCloseRequested`:

```typescript
const currentWindow = getCurrentWindow();
currentWindow.onCloseRequested((event) => {
  if (pendingUpdateRef.current) {
    event.preventDefault();    // block the close
    setShowExitPrompt(true);   // show install modal
  }
});
```

User options in the modal:
1. **Install & Restart** → `launch_installer_and_exit()` → opens native installer → `exit(0)`
2. **Later** → `allowCloseRef.current = true` → close without installing
3. **Cancel** → dismiss modal, continue using app

---

## Stage 3 — Floating Banner (Pro)

Pro shows a dismissable bottom-right banner instead of an exit intercept:

- **Update available** → "Download Update" button
- **Downloading** → animated progress bar
- **Ready** → "Install & Restart" button
- **Error** → "Retry" button

The banner is dismissed via the `✕` button. It reappears next launch.

---

## Platform Installer Commands (Rust)

| Platform | Command used to launch installer |
|---|---|
| macOS | `open /path/to/installer.dmg` |
| Windows | `msiexec /i C:\path\to\installer.msi` |
| Linux | `xdg-open /path/to/installer.AppImage` |

`exit(0)` is called immediately after spawning the installer. This is critical — it releases the SQLite write lock and port 11434, allowing the installer to replace the binary cleanly.

---

## Testing Updates Locally

1. Bump `website/api/manifest.json` to a version higher than the current app build
2. Deploy the manifest to Netlify (or serve locally and update the manifest URL in `lib.rs`)
3. Launch the app — the update banner should appear within 3 seconds

---

*See also: [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)*
