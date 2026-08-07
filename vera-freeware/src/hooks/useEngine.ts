import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress, HardwareInfo } from "../App";

export const PHASE = {
  DETECTING: "detecting",
  ENGINE_SETUP: "engine_setup",
  MODEL_SELECTION: "model_selection",
  DOWNLOADING: "downloading",
  BOOTING: "booting",
  BENCHMARKING: "benchmarking",
  READY: "ready",
  ERROR: "error",
} as const;

export function useEngine(onSetupComplete?: () => void) {
  const [phase, setPhase] = useState<string>(PHASE.DETECTING);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [selectedOnboardingModelId, setSelectedOnboardingModelId] = useState<string>("");
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [dlProgress, setDlProgress] = useState<DownloadProgress>({ status: "", percent: 0, downloaded: 0, total: 0 });
  const [engineSetupStatus, setEngineSetupStatus] = useState<"idle" | "downloading" | "verifying" | "extracting" | "completed" | "error">("idle");
  const [engineSetupProgress, setEngineSetupProgress] = useState<number>(0);
  const [engineSetupAttempt, setEngineSetupAttempt] = useState<number>(1);
  const [engineSetupError, setEngineSetupError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen("engine_setup_progress", (event) => {
          const payload = event.payload as any;
          if (payload.status === "downloading") {
            setEngineSetupStatus("downloading");
            setEngineSetupProgress(payload.percent);
            if (payload.attempt) setEngineSetupAttempt(payload.attempt);
          } else if (payload.status === "verifying") {
            setEngineSetupStatus("verifying");
            setEngineSetupProgress(100);
          } else if (payload.status === "extracting") {
            setEngineSetupStatus("extracting");
            setEngineSetupProgress(100);
          } else if (payload.status === "completed") {
            setEngineSetupStatus("completed");
            setEngineSetupProgress(100);
            if (onSetupComplete) setTimeout(onSetupComplete, 1000);
          } else if (payload.status === "error") {
            setEngineSetupStatus("error");
            setEngineSetupError(payload.error || "An unknown error occurred during engine setup.");
          }
        });
      } catch (err) {
        console.error("Failed to listen to engine_setup_progress:", err);
      }
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleStartEngineSetup = async () => {
    setEngineSetupStatus("downloading");
    setEngineSetupProgress(0);
    setEngineSetupAttempt(1);
    setEngineSetupError(null);
    try {
      await invoke("setup_engine");
    } catch (err: any) {
      setEngineSetupStatus("error");
      setEngineSetupError(err.toString());
    }
  };

  return {
    phase, setPhase,
    localModels, setLocalModels,
    selectedOnboardingModelId, setSelectedOnboardingModelId,
    hardware, setHardware,
    dlProgress, setDlProgress,
    engineSetupStatus, setEngineSetupStatus,
    engineSetupProgress, setEngineSetupProgress,
    engineSetupAttempt, setEngineSetupAttempt,
    engineSetupError, setEngineSetupError,
    handleStartEngineSetup,
  };
}
