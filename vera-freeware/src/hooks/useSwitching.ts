import { useState } from "react";
import type { DownloadProgress } from "../App";

export function useSwitching() {
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [switchingPhase, setSwitchingPhase] = useState<string | null>(null);
  const [switchingDlProgress, setSwitchingDlProgress] = useState<DownloadProgress>({ status: "", percent: 0, downloaded: 0, total: 0 });
  const [lastBenchmarkTps, setLastBenchmarkTps] = useState<number | null>(null);
  const [alternativeModelCached, setAlternativeModelCached] = useState<Record<string, boolean>>({});
  const [runningManualBenchmark, setRunningManualBenchmark] = useState(false);

  const resetSwitching = () => {
    setSwitchingModelId(null);
    setSwitchingPhase(null);
    setSwitchingDlProgress({ status: "", percent: 0, downloaded: 0, total: 0 });
  };

  return {
    switchingModelId, setSwitchingModelId,
    switchingPhase, setSwitchingPhase,
    switchingDlProgress, setSwitchingDlProgress,
    lastBenchmarkTps, setLastBenchmarkTps,
    alternativeModelCached, setAlternativeModelCached,
    runningManualBenchmark, setRunningManualBenchmark,
    resetSwitching,
  };
}
