import { useCallback, useEffect, useState } from "react";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Alt+Space (Option+Space on macOS — Tauri maps Alt to Option).
// Chosen over Cmd/Ctrl+Space: Spotlight and IME input switchers own those.
export const QUICK_LAUNCH_SHORTCUT = "Alt+Space";
const ENABLE_KEY = "vera_quick_launch_enabled";

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Global quick-launcher: toggles the main window from anywhere.
 * Off by default (global key listeners + macOS accessibility friction
 * are opt-in by design). Registration failures (e.g. shortcut taken by
 * another app) surface as status text, never throws.
 */
export function useGlobalShortcut() {
  const [enabled, setEnabledState] = useState<boolean>(loadEnabled);
  const [status, setStatus] = useState<string>("");

  const toggleWindow = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      if (await win.isVisible()) {
        await win.hide();
      } else {
        await win.show();
        await win.setFocus();
      }
    } catch (e: any) {
      setStatus(`Toggle failed: ${e?.message ?? e}`);
    }
  }, []);

  const applyEnabled = useCallback(
    async (next: boolean) => {
      try {
        if (next) {
          if (!(await isRegistered(QUICK_LAUNCH_SHORTCUT))) {
            await register(QUICK_LAUNCH_SHORTCUT, (event) => {
              if (event.state === "Pressed") void toggleWindow();
            });
          }
          setStatus(`Listening on ${QUICK_LAUNCH_SHORTCUT}`);
        } else {
          if (await isRegistered(QUICK_LAUNCH_SHORTCUT)) {
            await unregister(QUICK_LAUNCH_SHORTCUT);
          }
          setStatus("");
        }
        setEnabledState(next);
        try {
          localStorage.setItem(ENABLE_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      } catch (e: any) {
        setStatus(
          `Could not register ${QUICK_LAUNCH_SHORTCUT}: ${e?.message ?? e}. ` +
            `Another app may own it — disable that binding and retry.`
        );
      }
    },
    [toggleWindow]
  );

  // Re-apply persisted preference on boot (best-effort).
  useEffect(() => {
    if (loadEnabled()) void applyEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => void applyEnabled(next),
    [applyEnabled]
  );

  return { enabled, setEnabled, status, shortcut: QUICK_LAUNCH_SHORTCUT };
}
