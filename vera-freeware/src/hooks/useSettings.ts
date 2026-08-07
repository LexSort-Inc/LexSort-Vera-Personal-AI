import { useState } from "react";
import { UpdateStatus } from "../UpdateStatusIndicator";
import type { UpdateCheckResult } from "../App";

export type SettingsTab = "model" | "updates" | "pro";

export function useSettings() {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "ready" | "not_running">("checking");
  const [appVersion, setAppVersion] = useState<string>("1.1.4");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("model");
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [checkingForUpdates, setCheckingForUpdates] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    phase: "idle",
    moduleId: null,
    percent: 0,
    message: "",
    errorDetail: null,
  });
  const [updateDownloadStatus, setUpdateDownloadStatus] = useState<"idle" | "downloading" | "downloaded" | "error">("idle");
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [approvedVersion, setApprovedVersion] = useState<string | null>(null);
  const [showExitPrompt, setShowExitPrompt] = useState<boolean>(false);
  const [isRunningFromDmg, setIsRunningFromDmg] = useState<boolean>(false);

  return {
    showSettings, setShowSettings,
    ollamaStatus, setOllamaStatus,
    appVersion, setAppVersion,
    settingsTab, setSettingsTab,
    updateCheckResult, setUpdateCheckResult,
    checkingForUpdates, setCheckingForUpdates,
    updateStatus, setUpdateStatus,
    updateDownloadStatus, setUpdateDownloadStatus,
    downloadProgress, setDownloadProgress,
    approvedVersion, setApprovedVersion,
    showExitPrompt, setShowExitPrompt,
    isRunningFromDmg, setIsRunningFromDmg,
  };
}
