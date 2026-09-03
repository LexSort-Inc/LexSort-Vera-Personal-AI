import { useCallback, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export type UpdateChannel = "stable" | "beta";

export interface UpdaterMetadata {
  version: string;
  currentVersion: string;
  body: string | null;
  date: string | null;
  channel: UpdateChannel;
  isBeta: boolean;
}

type DownloadEvent =
  | { event: "started"; data: { contentLength?: number } }
  | { event: "progress"; data: { chunkLength: number } }
  | { event: "finished" };

const CHANNEL_KEY = "vera_update_channel";

export function loadUpdateChannel(): UpdateChannel {
  try {
    return localStorage.getItem(CHANNEL_KEY) === "beta" ? "beta" : "stable";
  } catch {
    return "stable";
  }
}

/**
 * Silent restart-to-apply updater (Tauri v2 updater plugin).
 * Stable is the default channel; beta is opt-in and always badged "Beta".
 * No full-installer download, no reinstall: the delta is staged by the
 * backend and applied when the user restarts the app.
 */
export function useUpdater() {
  const [phase, setPhase] = useState<UpdaterPhase>("idle");
  const [meta, setMeta] = useState<UpdaterMetadata | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannelState] = useState<UpdateChannel>(loadUpdateChannel);
  const autoCheckedRef = useRef(false);

  const setChannel = useCallback((next: UpdateChannel) => {
    setChannelState(next);
    try {
      localStorage.setItem(CHANNEL_KEY, next);
    } catch {
      /* ignore */
    }
    // Channel switch invalidates any staged metadata from the other channel.
    setMeta(null);
    setPercent(0);
    setError(null);
    setPhase("idle");
  }, []);

  const check = useCallback(
    async (which?: UpdateChannel, silent = false) => {
      const ch = which ?? loadUpdateChannel();
      if (!silent) {
        setPhase("checking");
        setError(null);
      }
      try {
        const found = await invoke<UpdaterMetadata | null>("fetch_update", {
          channel: ch,
        });
        if (found) {
          setMeta(found);
          setPercent(0);
          setPhase("available");
        } else if (!silent) {
          setMeta(null);
          setPhase("idle");
        }
        return found;
      } catch (err: any) {
        if (!silent) {
          setError(String(err?.message ?? err));
          setPhase("error");
        }
        return null;
      }
    },
    []
  );

  /** Auto-check once per launch (stable channel, silent unless an update exists). */
  const autoCheck = useCallback(async () => {
    if (autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    await check("stable", true);
  }, [check]);

  const download = useCallback(async () => {
    if (phase !== "available") return;
    setPhase("downloading");
    setPercent(0);
    setError(null);
    let total: number | undefined;
    let received = 0;
    const onEvent = new Channel<DownloadEvent>((msg) => {
      if (msg.event === "started") {
        total = msg.data?.contentLength;
      } else if (msg.event === "progress") {
        received += msg.data.chunkLength;
        if (total && total > 0) {
          setPercent(Math.min(99, Math.round((received / total) * 100)));
        }
      } else if (msg.event === "finished") {
        setPercent(100);
        setPhase("ready");
      }
    });
    try {
      await invoke("install_update", { onEvent });
      // Finished event arrives via channel; if the backend resolved without
      // emitting it (edge case), still mark ready so the user can restart.
      setPhase((prev) => (prev === "downloading" ? "ready" : prev));
      setPercent((prev) => (prev === 0 ? 100 : prev));
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setPhase("error");
    }
  }, [phase]);

  const restartToApply = useCallback(async () => {
    try {
      await relaunch();
    } catch (err: any) {
      setError(`Restart failed: ${String(err?.message ?? err)}`);
      setPhase("error");
    }
  }, []);

  return {
    phase,
    meta,
    percent,
    error,
    channel,
    setChannel,
    check,
    autoCheck,
    download,
    restartToApply,
  };
}
