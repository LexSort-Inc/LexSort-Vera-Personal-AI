import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./app.css";
import veraLogo from "./assets/vera-logo.jpg";
import SupportPanel, { openExternalUrl } from "./SupportPanel";
import { UpdateStatusIndicator, UpdateStatus } from "./UpdateStatusIndicator";
import { QuickOrganizer } from "./components/QuickOrganizer";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { VeraModule } from "./types/module";
import ModuleDrawer from "./components/ModuleDrawer";
import FeedbackBanner from "./components/FeedbackBanner";
import { ModuleErrorBoundary } from "./components/ModuleErrorBoundary";

declare global {
  interface Window {
    registerVeraModule: (name: string, Component: React.ComponentType<any>) => void;
  }
}

const MODULES_LIST: VeraModule[] = [
  {
    id: "quick-organizer",
    name: "quick-organizer",
    display_name: "Quick Organizer",
    status: "installed",
    icon: "📋",
    description: "AI-assisted task management, daily scheduling, and voice quick-add. Included free.",
    isFree: true
  },
  {
    id: "emailer",
    name: "emailer",
    display_name: "ProMailer",
    status: "installed",
    icon: "✉️",
    description: "Automated cold email outreach campaigns and lead generation engine."
  },
  {
    id: "research-lab",
    name: "research-lab",
    display_name: "Research Lab",
    status: "installed",
    icon: "🧪",
    description: "Local model benchmark, latency instrumentation, and semantic testbed."
  },
  {
    id: "guardian-watch",
    name: "guardian-watch",
    display_name: "Guardian Watch",
    status: "installed",
    icon: "🛡️",
    description: "Real-time system health monitor and AI diagnostic assistant."
  },
  {
    id: "lexsort-go",
    name: "lexsort-go",
    display_name: "LexSort-GO",
    status: "design",
    icon: "📱",
    description: "LAN Mobile Bridge. Scan QR code to chat with VERA from your mobile browser."
  },
  {
    id: "business-organizer",
    name: "business-organizer",
    display_name: "Business Organizer",
    status: "design",
    icon: "💼",
    description: "Personal and business ledger, receipt scanning, and tax worksheets."
  },
  {
    id: "finance-tax",
    name: "finance-tax",
    display_name: "Wealth & Tax Intel",
    status: "soon",
    icon: "📈",
    description: "Automated tax matches, wealth planning, and portfolio optimization."
  }
];

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  ollama_tag: string;
}

interface HardwareInfo {
  platform: string;
  ram_gb: number;
  total_memory_bytes: number;
  available_memory_bytes: number;
  allocation_ceiling_bytes: number;
  cpu_cores: number;
  apple_chip: string | null;
  unified_memory: boolean;
  free_storage_gb: number;
  has_nvidia_gpu: boolean;
  model: ModelInfo;
  model_exists: boolean;
}

interface Message {
  id: number;
  role: "system" | "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface DownloadProgress {
  status: string;
  percent: number;
  downloaded: number;
  total: number;
}

interface ModuleUpdateInfo {
  module_id: string;
  installed_version: string | null;
  remote_version: string;
  size_bytes: number;
  release_notes: string;
  status: string;
}

interface UpdateCheckResult {
  success: boolean;
  error: string | null;
  core_update_available: boolean;
  current_core_version: string;
  remote_core_version: string;
  core_release_notes: string | null;
  modules: ModuleUpdateInfo[];
}

const MODELS_LIST = [
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 14B",
    tier: "Quality",
    size: "9.0 GB",
    minRam: 32,
    minStorage: 60,
    desc: "Highest quality local model. Requires Apple Silicon with 32GB+ unified memory or NVIDIA GPU."
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B",
    tier: "Balanced",
    size: "4.7 GB",
    minRam: 16,
    minStorage: 30,
    desc: "Standard high-performance model for machines with 16GB+ RAM."
  },
  {
    id: "mistral",
    name: "Mistral 7B",
    tier: "Balanced",
    size: "4.1 GB",
    minRam: 16,
    minStorage: 30,
    desc: "Excellent open-source 7B model for CPU-only or GPU machines with 16GB+ RAM."
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    tier: "Balanced / Fast",
    size: "2.0 GB",
    minRam: 8,
    minStorage: 10,
    desc: "Efficient lightweight model for machines with 8GB+ RAM."
  },
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    tier: "Fast",
    size: "2.2 GB",
    minRam: 0,
    minStorage: 10,
    desc: "Ultra-fast lightweight model. Compatible with all systems, including older or lower-spec hardware."
  }
];

const FREEWARE_GREETING = {
    title: "Hi, I'm VERA",
    subtitle: "Your private AI assistant — everything stays on this device.",
    description:
        "No internet required after setup. No account. " +
        "No data leaving your machine. Ever.",
    capabilities: [
        { icon: "✉", label: "Draft emails, letters, and documents" },
        { icon: "📄", label: "Summarize and explain complex text" },
        { icon: "💡", label: "Answer questions and brainstorm ideas" },
        { icon: "📋", label: "Organize your thoughts and plans" },
    ],
    chips: [
        "Help me write a professional email",
        "Summarize this for me: [paste text here]",
        "Help me plan my week",
        "What can you help me with?",
    ],
    footer: "Type 'help' anytime · Community support at discord.gg/kpZ3hWyAaq",
};

const PRO_MODULES_PREVIEW = [
    {
        id: "quick_organizer",
        name: "Quick Organizer",
        description: "AI-assisted task management. Included free.",
        badge: "FREE",
        badgeClass: "badge--free",
        included: true,
    },
    {
        id: "promailer",
        name: "Auto Emailer",
        description: "Draft and send email campaigns with local AI.",
        badge: "PRO",
        badgeClass: "badge--pro",
        included: false,
    },
    {
        id: "organizer",
        name: "Business Organizer",
        description: "Track expenses, scan receipts, and find grants.",
        badge: "PRO",
        badgeClass: "badge--pro",
        included: false,
    },
    {
        id: "taxmate",
        name: "TaxMate",
        description: "Find government grants and tax programs for your area.",
        badge: "PRO",
        badgeClass: "badge--pro",
        included: false,
    },
    {
        id: "guardian_watch",
        name: "Guardian Watch",
        description: "System health monitoring and integrity checks.",
        badge: "PRO",
        badgeClass: "badge--pro",
        included: false,
    },
    {
        id: "research_lab",
        name: "Research Lab",
        description: "Benchmark and compare local AI models.",
        badge: "PRO",
        badgeClass: "badge--pro",
        included: false,
    },
];

// ─── States ──────────────────────────────────────────────────────────────────
const PHASE = {
  DETECTING:   "detecting",
  ENGINE_SETUP: "engine_setup",
  MODEL_SELECTION: "model_selection",
  DOWNLOADING: "downloading",
  BOOTING:     "booting",
  BENCHMARKING: "benchmarking",
  READY:       "ready",
  ERROR:       "error",
};

export default function App() {
  const [phase,            setPhase]            = useState<string>(PHASE.DETECTING);
  const [localModels,      setLocalModels]      = useState<string[]>([]);
  const [selectedOnboardingModelId, setSelectedOnboardingModelId] = useState<string>("");
  const [hardware,         setHardware]         = useState<HardwareInfo | null>(null);
  const [dlProgress,       setDlProgress]       = useState<DownloadProgress>({ status: "", percent: 0, downloaded: 0, total: 0 });
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [conversations,    setConversations]    = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showHistory,      setShowHistory]      = useState<boolean>(true);
  const [input,            setInput]            = useState<string>("");
  const [streaming,        setStreaming]        = useState<boolean>(false);
  const [error,            setError]            = useState<string>("");
  const [serverPort,       setServerPort]       = useState<number>(11434);
  const [showSupport,      setShowSupport]      = useState<boolean>(false);
  const [activeModule,     setActiveModule]     = useState<string>("chat");
  const [showModulesDrawer, setShowModulesDrawer] = useState<boolean>(false);
  const [dynamicComponents, setDynamicComponents] = useState<Record<string, React.ComponentType<any>>>({});

  // Settings and Switcher States
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [switchingPhase, setSwitchingPhase] = useState<string | null>(null);
  const [switchingDlProgress, setSwitchingDlProgress] = useState<DownloadProgress>({ status: "", percent: 0, downloaded: 0, total: 0 });
  const [lastBenchmarkTps, setLastBenchmarkTps] = useState<number | null>(null);
  const [alternativeModelCached, setAlternativeModelCached] = useState<Record<string, boolean>>({});
  const [runningManualBenchmark, setRunningManualBenchmark] = useState(false);

  // Update check states
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [appVersion, setAppVersion] = useState<string>("1.1.4");
  const [checkingForUpdates, setCheckingForUpdates] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<"model" | "updates" | "pro" | "calendar">("model");
  const [calendarImported, setCalendarImported] = useState<string | null>(() => localStorage.getItem('vera_calendar_imported'));
  const [calendarLastImport, setCalendarLastImport] = useState<string | null>(() => localStorage.getItem('vera_calendar_last_import'));
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
      phase: 'idle',
      moduleId: null,
      percent: 0,
      message: '',
      errorDetail: null,
  });

  const [updateDownloadStatus, setUpdateDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [approvedVersion, setApprovedVersion] = useState<string | null>(null);
  const [showExitPrompt, setShowExitPrompt] = useState<boolean>(false);
  const [isRunningFromDmg, setIsRunningFromDmg] = useState<boolean>(false);

  const [engineSetupStatus, setEngineSetupStatus] = useState<'idle' | 'downloading' | 'verifying' | 'extracting' | 'completed' | 'error'>('idle');
  const [engineSetupProgress, setEngineSetupProgress] = useState<number>(0);
  const [engineSetupAttempt, setEngineSetupAttempt] = useState<number>(1);
  const [engineSetupError, setEngineSetupError] = useState<string | null>(null);

  const pendingUpdateRef = useRef<{ version: string; path: string } | null>(null);
  const allowCloseRef = useRef<boolean>(false);

  const [showFallbackReport, setShowFallbackReport] = useState(false);
  const [fallbackReportText, setFallbackReportText] = useState('');

  // Voice Input (Speech to Text) Logic
  const initialTextRef = useRef("");
  const speech = useSpeechRecognition({
    onResult: (transcript) => {
      const base = initialTextRef.current;
      const space = base && !base.endsWith(" ") ? " " : "";
      setInput(base + space + transcript);
    },
    onError: (err) => {
      console.error("Speech Recognition Error in Main Chat:", err);
    }
  });

  const toggleSpeech = () => {
    if (speech.isListening) {
      speech.stop();
    } else {
      initialTextRef.current = input;
      speech.start();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (speech.isListening) {
      initialTextRef.current = val;
      speech.restart();
    }
  };

  const runUpdateCheck = async () => {
    setCheckingForUpdates(true);
    setUpdateStatus(prev => ({
      ...prev,
      phase: 'checking',
      message: 'Checking for updates...',
    }));
    try {
      const res = await invoke<UpdateCheckResult>("check_for_updates", { edition: "freeware" });
      setUpdateCheckResult(res);
      setUpdateStatus(prev => {
        if (prev.phase === 'checking') {
          return { ...prev, phase: 'idle' };
        }
        return prev;
      });
    } catch (err: any) {
      console.error("Failed to check for updates:", err);
      setUpdateStatus(prev => {
        if (prev.phase === 'checking') {
          return { ...prev, phase: 'idle' };
        }
        return prev;
      });
      setUpdateCheckResult({
        success: false,
        error: err.toString(),
        core_update_available: false,
        current_core_version: appVersion,
        remote_core_version: "",
        core_release_notes: null,
        modules: []
      });
    } finally {
      setCheckingForUpdates(false);
    }
  };

  async function sendUpdateBugReport(
      status: UpdateStatus,
      hw: HardwareInfo | null
  ): Promise<void> {
      const platform = hw?.platform ?? 'unknown';
      const ram = hw?.ram_gb ?? 0;
      const storage = hw?.free_storage_gb ?? 0;
      const apple_chip = hw?.apple_chip ?? 'No';
      const nvidia = hw?.has_nvidia_gpu ?? false;

      // Build diagnostic string — NO license keys, NO personal data
      const diagnostics = [
          `VERA Edition: Freeware`,
          `Core Version: ${platform}`,
          `RAM: ${ram} GB`,
          `Free Storage: ${storage} GB`,
          `Apple Silicon: ${apple_chip}`,
          `NVIDIA GPU: ${nvidia ? 'Yes' : 'No'}`,
          `Failed Module: ${status.moduleId ?? 'core'}`,
          `Update Phase: ${status.phase}`,
          `Error: ${status.errorDetail ?? 'Unknown'}`,
      ].join('\n');

      const payload = {
          title: `Update failure — ${status.moduleId ?? 'core'} (${status.phase})`,
          description: status.errorDetail ?? 'Update process failed at an unknown stage.',
          category: 'Update / Install',
          os: platform,
          ramSize: `${ram} GB`,
          freeStorageGb: storage,
          hasNvidiaGpu: nvidia,
          diagnostics,
          // Never include: license key, email, name, API keys
      };

      try {
          const response = await fetch(
              'https://lexsort.com/.netlify/functions/submit-bug-report',
              {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json',
                      'X-Vera-Token': 'vera-sovereign-intelligence-v1-token-2026'
                  },
                  body: JSON.stringify(payload),
              }
          );

          if (response.ok) {
              setUpdateStatus(prev => ({
                  ...prev,
                  message: 'Report sent — thank you',
                  phase: 'success',
              }));
              setTimeout(() => setUpdateStatus(prev => ({ ...prev, phase: 'idle' })), 3000);
          } else {
              setShowFallbackReport(true);
              setFallbackReportText(diagnostics);
          }
      } catch {
          setShowFallbackReport(true);
          setFallbackReportText(diagnostics);
      }
  }

  const bottomRef     = useRef<HTMLDivElement | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const inputRef      = useRef<HTMLTextAreaElement | null>(null);

  // ── Boot sequence ──────────────────────────────────────────────────────────
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    bootSequence();
    
    // Register the global dynamic module mounting function
    window.registerVeraModule = (name: string, Component: React.ComponentType<any>) => {
      console.log(`[VERA Freeware] Dynamically registered module component: ${name}`);
      setDynamicComponents(prev => ({
        ...prev,
        [name]: Component
      }));
    };

    // Pre-register built-in core modules for Freeware
    window.registerVeraModule("quick-organizer", QuickOrganizer);

    return () => {
      abortRef.current?.abort();
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  // Listen to local AI engine setup progress
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
            setTimeout(() => {
              bootSequence();
            }, 1000);
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

  const handleConfirmOnboardingModel = async (modelId: string) => {
    try {
      await invoke("set_active_model", { modelId });

      if (hardware) {
        const matchingModel = MODELS_LIST.find(m => m.id === modelId);
        const updatedHw = { ...hardware };
        updatedHw.model = {
          id: modelId,
          name: matchingModel?.name || modelId,
          description: matchingModel?.desc || `Custom model: ${modelId}`,
          ollama_tag: modelId
        };
        
        const isLocal = localModels.includes(modelId) || localModels.some(m => m.startsWith(modelId + ":") || modelId.startsWith(m + ":"));
        updatedHw.model_exists = isLocal;
        setHardware(updatedHw);
      }

      bootSequence();
    } catch (err: any) {
      setError(String(err));
      setPhase(PHASE.ERROR);
    }
  };

  const handleSkipOnboarding = async () => {
    try {
      await invoke("set_active_model", { modelId: "phi3:mini" });
      bootSequence();
    } catch (err: any) {
      console.error("Failed to skip onboarding:", err);
      setError(String(err));
      setPhase(PHASE.ERROR);
    }
  };

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

  // Listen to update download progress
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupListener = async () => {
      try {
        unlisten = await listen("core_update_progress", (event) => {
          const payload = event.payload as any;
          if (payload.status === "downloading") {
            setUpdateDownloadStatus("downloading");
            setDownloadProgress(payload.percent);
          } else if (payload.status === "downloaded") {
            setUpdateDownloadStatus("downloaded");
            setDownloadProgress(100);
            
            setApprovedVersion(prev => {
              const ver = prev || "New Version";
              pendingUpdateRef.current = { version: ver, path: payload.path };
              return ver;
            });
          } else if (payload.status === "error") {
            setUpdateDownloadStatus("error");
            alert(`Core update download failed: ${payload.error}`);
          }
        });
      } catch (err) {
        console.error("Failed to listen to core_update_progress:", err);
      }
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Intercept Close Requests to show update prompt
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupCloseListener = async () => {
      try {
        const currentWindow = getCurrentWindow();
        unlisten = await currentWindow.onCloseRequested((event) => {
          if (allowCloseRef.current) {
            return;
          }
          if (pendingUpdateRef.current) {
            event.preventDefault();
            setApprovedVersion(pendingUpdateRef.current.version);
            setShowExitPrompt(true);
          }
        });
      } catch (err) {
        console.error("Failed to setup close requested listener:", err);
      }
    };

    setupCloseListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleApproveUpdate = async () => {
    if (!updateCheckResult || !updateCheckResult.remote_core_version) return;
    
    const version = updateCheckResult.remote_core_version;
    setApprovedVersion(version);
    setUpdateDownloadStatus("downloading");
    setDownloadProgress(0);
    
    try {
      await invoke("approve_core_update", { edition: "freeware", version });
    } catch (err: any) {
      setUpdateDownloadStatus("error");
      alert(`Failed to approve core update: ${err.toString()}`);
    }
  };

  const handleInstallNow = async () => {
    try {
      await invoke("launch_installer_and_exit");
    } catch (e: any) {
      alert(`Failed to launch installer: ${e.toString()}`);
      setShowExitPrompt(false);
    }
  };

  const handleInstallLater = async () => {
    setShowExitPrompt(false);
    try {
      await invoke("exit_app");
    } catch (e) {
      console.error("Failed to exit app:", e);
    }
  };

  const handleCancelClose = () => {
    setShowExitPrompt(false);
  };

  const checkPendingUpdate = async () => {
    try {
      const info = await invoke<{ version: string; path: string } | null>("get_pending_update_info");
      if (info) {
        pendingUpdateRef.current = info;
        setApprovedVersion(info.version);
        setUpdateDownloadStatus("downloaded");
      }
    } catch (e) {
      console.error("Failed to check pending update:", e);
    }
  };

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check which models are cached in Ollama
  const checkAllModelsCache = async () => {
    const cachedMap: Record<string, boolean> = {};
    for (const m of MODELS_LIST) {
      try {
        const exists = await invoke<boolean>("check_model_exists", { modelId: m.id });
        cachedMap[m.id] = exists;
      } catch (err) {
        console.error(`Error checking cache for ${m.id}:`, err);
        cachedMap[m.id] = false;
      }
    }
    setAlternativeModelCached(cachedMap);
  };

  useEffect(() => {
    if (showSettings) {
      checkAllModelsCache();
      invoke<number | null>("get_last_benchmark").then(tps => setLastBenchmarkTps(tps));
    }
  }, [showSettings]);

  const handleManualBenchmark = async () => {
    if (!hardware?.model.id) return;
    setRunningManualBenchmark(true);
    try {
      const benchmarkResultPromise = new Promise<any>(async (resolve, reject) => {
        const unlistenResult = await listen("benchmark_result", (event) => {
          unlistenResult();
          resolve(event.payload);
        });
        setTimeout(() => {
          unlistenResult();
          reject(new Error("Benchmark timed out"));
        }, 60000);
      });

      await invoke("benchmark_model", { modelId: hardware.model.id });
      const res = await benchmarkResultPromise;

      await invoke("set_last_benchmark", { tps: res.tokens_per_sec });
      setLastBenchmarkTps(res.tokens_per_sec);
    } catch (err: any) {
      alert(`Benchmark failed: ${err}`);
    } finally {
      setRunningManualBenchmark(false);
    }
  };

  const handleSwitchModel = async (modelId: string) => {
    if (modelId === hardware?.model.id) return;
    
    const targetModel = MODELS_LIST.find(m => m.id === modelId);
    if (!targetModel) return;

    if (hardware && hardware.ram_gb < targetModel.minRam) {
      const confirmWarning = window.confirm(
        `⚠️ Warning: ${targetModel.name} requires at least ${targetModel.minRam} GB RAM. Your system has ${hardware.ram_gb} GB RAM.\n\nRunning this model may cause severe lag or Out of Memory (OOM) errors. Do you want to proceed anyway?`
      );
      if (!confirmWarning) return;
    }

    if (hardware && hardware.free_storage_gb < targetModel.minStorage) {
      alert(`❌ Error: Insufficient storage. ${targetModel.name} requires ~${targetModel.minStorage} GB free space, but you only have ${hardware.free_storage_gb} GB.`);
      return;
    }

    setSwitchingModelId(modelId);
    setSwitchingPhase("checking");

    try {
      const isCached = await invoke<boolean>("check_model_exists", { modelId });
      
      if (!isCached) {
        setSwitchingPhase("downloading");
        const unlistenDl = await listen("download_progress", (e: any) => {
          setSwitchingDlProgress(e.payload as DownloadProgress);
        });
        
        try {
          await invoke("download_model", { modelId });
        } finally {
          unlistenDl();
        }
      }

      setSwitchingPhase("booting");
      await invoke("start_inference_server", { modelId });
      await delay(1000);

      setSwitchingPhase("benchmarking");
      const benchmarkResultPromise = new Promise<any>(async (resolve, reject) => {
        const unlistenResult = await listen("benchmark_result", (event) => {
          unlistenResult();
          resolve(event.payload);
        });
        setTimeout(() => {
          unlistenResult();
          reject(new Error("Benchmark timed out"));
        }, 60000);
      });

      await invoke("benchmark_model", { modelId });
      const res = await benchmarkResultPromise;

      await invoke("set_active_model", { modelId });
      await invoke("set_last_benchmark", { tps: res.tokens_per_sec });
      
      setLastBenchmarkTps(res.tokens_per_sec);
      localStorage.setItem("vera_benchmark_run", "true");

      setSwitchingModelId(null);
      setSwitchingPhase(null);
      setShowSettings(false);
      bootSequence();

    } catch (err: any) {
      console.error("Model switch failed:", err);
      alert(`Failed to switch model: ${err}`);
      setSwitchingModelId(null);
      setSwitchingPhase(null);
    }
  };

  const handleFactoryReset = async () => {
    const confirmed = window.confirm(
      "⚠️ WARNING: This will permanently delete all your task lists, notes, and local app configuration. This action cannot be undone.\n\nAre you sure you want to perform a Factory Reset?"
    );
    if (!confirmed) return;

    try {
      await invoke("factory_reset");
    } catch (err: any) {
      alert(`Factory reset failed: ${err}`);
    }
  };

  async function bootSequence() {
    try {
      // Initialize directories for freeware
      try {
        await invoke("init_lexsort_dirs", { edition: "freeware" });
        // Fetch app version from backend
        try {
          const ver = await invoke<string>("get_app_version");
          setAppVersion(ver);
        } catch (verErr) {
          console.error("Failed to load app version:", verErr);
        }
        
        // Check if AI engine (Ollama) is installed
        setPhase(PHASE.DETECTING);
        const engineInstalled = await invoke<boolean>("check_engine_installed");
        if (!engineInstalled) {
          setPhase(PHASE.ENGINE_SETUP);
          return;
        }
        await checkPendingUpdate();
        try {
          const isDmg = await invoke<boolean>("is_running_from_dmg");
          setIsRunningFromDmg(isDmg);
        } catch (dmgErr) {
          console.error("Failed to check DMG execution:", dmgErr);
        }
        // Kick off update check in background (non-blocking)
        runUpdateCheck();
      } catch (e) {
        console.error("Directory initialization failed:", e);
      }

      // 0. One-time migration from localStorage to backend config
      const legacyOverride = localStorage.getItem("vera_model_override");
      if (legacyOverride) {
        try {
          await invoke('set_active_model', { modelId: legacyOverride });
          localStorage.removeItem("vera_model_override");
        } catch (e) {
          console.error("Migration failed:", e);
        }
      }

      // 1. Detect hardware → select model
      // NOTE: detect_hardware no longer checks model existence (was causing Windows hang).
      // model_exists is always false here; it is resolved after the engine starts below.
      setPhase(PHASE.DETECTING);
      const hw = await invoke("detect_hardware") as HardwareInfo;

      // Apply local model override if user stepped down previously (or selected via onboarding)
      const overrideModelId = await invoke<string | null>("get_active_model");
      if (overrideModelId) {
        const names: Record<string, string> = {
          "qwen2.5:14b": "Qwen 2.5 14B",
          "llama3.1:8b": "Llama 3.1 8B",
          "llama3.2:3b": "Llama 3.2 3B",
          "mistral": "Mistral 7B",
          "phi3:mini": "Phi-3 Mini"
        };
        hw.model.id = overrideModelId;
        hw.model.name = names[overrideModelId] || overrideModelId;
        // model_exists will be resolved after engine starts — do NOT call list_installed_models
        // here because Ollama may not be running yet, which could cause a 6-8 s delay.
        hw.model_exists = false;
      } else {
        // First launch onboarding — go straight to model selection.
        // list_installed_models is intentionally skipped here so we don't block on Ollama.
        // The onboarding screen shows an empty local-models list on first run, which is correct.
        setHardware(hw);
        setSelectedOnboardingModelId(hw.model.id);
        setPhase(PHASE.MODEL_SELECTION);
        return;
      }

      setHardware(hw);

      const port = await invoke("get_server_port") as number;
      setServerPort(port);

      // 2. Start inference server (ensures Ollama is active on the local port)
      setPhase(PHASE.BOOTING);
      await invoke("start_inference_server", { modelId: hw.model.id });

      // Give the server a moment to bind before the UI hits it
      await delay(1000);

      // 3. Now that the engine is running, check whether the model is already cached.
      //    We deferred this from detect_hardware to avoid a Windows hang.
      try {
        const installed = await invoke<string[]>("list_installed_models") as string[];
        const isLocal = installed.includes(overrideModelId) ||
          installed.some(m => m.startsWith(overrideModelId + ":") || overrideModelId.startsWith(m + ":"));
        hw.model_exists = isLocal;
        // Push the update so the rest of the boot sequence uses the real value.
        setHardware({ ...hw });
      } catch (e) {
        console.error("Error checking installed models post-engine-start:", e);
        // Assume not cached → will trigger download below (safe default).
        hw.model_exists = false;
      }

      // 4. Download model if needed
      let isFirstLaunch = !hw.model_exists;
      if (!hw.model_exists) {
        setPhase(PHASE.DOWNLOADING);

        const unlistenProgress = await listen("download_progress", (e: any) => {
          setDlProgress(e.payload as DownloadProgress);
        });
        unlistenRef.current = unlistenProgress;

        try {
          await invoke("download_model", { modelId: hw.model.id });
        } finally {
          unlistenProgress();
          unlistenRef.current = null;
        }
      }

      // 4. Run benchmarking if this is the first launch or benchmark flag hasn't been set
      const benchmarkRun = localStorage.getItem("vera_benchmark_run");
      if (!benchmarkRun || isFirstLaunch) {
        setPhase(PHASE.BENCHMARKING);
        try {
          const benchmarkResultPromise = new Promise<any>(async (resolve, reject) => {
            const unlistenResult = await listen("benchmark_result", (event) => {
              unlistenResult();
              resolve(event.payload);
            });
            setTimeout(() => {
              unlistenResult();
              reject(new Error("Benchmark timed out after 60 seconds"));
            }, 60000);
          });

          await invoke("benchmark_model", { modelId: hw.model.id });
          const res = await benchmarkResultPromise;

          localStorage.setItem("vera_benchmark_run", "true");

          if (!res.passed) {
            // Speed fell below 3.0 tokens/sec threshold
            let lighterModelId = "";
            let lighterModelName = "";

            if (hw.model.id === "qwen2.5:14b") {
              lighterModelId = "llama3.1:8b";
              lighterModelName = "Llama 3.1 8B";
            } else if (hw.model.id === "llama3.1:8b" || hw.model.id === "mistral") {
              lighterModelId = "llama3.2:3b";
              lighterModelName = "Llama 3.2 3B";
            } else if (hw.model.id === "llama3.2:3b") {
              lighterModelId = "phi3:mini";
              lighterModelName = "Phi-3 Mini";
            }

            if (lighterModelId) {
              const confirmSwap = window.confirm(
                `VERA Speed Test: Recommended model runs at ${res.tokens_per_sec.toFixed(1)} tokens/sec (below target 3.0 threshold).\n\nWould you like VERA to automatically swap and download the lighter model (${lighterModelName}) for optimal performance?`
              );
              if (confirmSwap) {
                localStorage.setItem("vera_model_override", lighterModelId);
                setTimeout(() => {
                  bootSequence();
                }, 100);
                return;
              }
            }
          }
        } catch (err) {
          console.error("Benchmarking failed:", err);
        }
      }

      setPhase(PHASE.READY);
      inputRef.current?.focus();
      loadConversationsList();

    } catch (e) {
      setError(String(e));
      setPhase(PHASE.ERROR);
    }
  }

  const loadConversationsList = async () => {
    try {
      const list = await invoke<Conversation[]>("get_conversations");
      setConversations(list);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const selectConversation = async (id: string) => {
    if (streaming) abortRef.current?.abort();
    setStreaming(false);
    setActiveConversationId(id);
    try {
      const dbMessages = await invoke<Message[]>("load_messages", { conversationId: id });
      setMessages(dbMessages);
    } catch (err) {
      console.error("Failed to load messages for conversation:", err);
    }
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    if (streaming) abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setActiveConversationId(null);
    inputRef.current?.focus();
  };

  const handleDeleteConversation = async (id: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this conversation?");
    if (!confirmed) return;
    try {
      await invoke("delete_conversation", { id });
      await loadConversationsList();
      if (activeConversationId === id) {
        setMessages([]);
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleRenameConversation = async (id: string, currentTitle: string) => {
    const newTitle = window.prompt("Rename conversation topic:", currentTitle);
    if (newTitle === null || !newTitle.trim()) return;
    try {
      await invoke("rename_conversation", { id, title: newTitle.trim() });
      await loadConversationsList();
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const handleSaveActiveChat = async () => {
    if (!messages.length) return;
    let currentId = activeConversationId;
    
    try {
      if (!currentId) {
        currentId = `conv_${Date.now()}`;
        const autoTitle = messages[0]?.content.slice(0, 30) || "Saved Conversation";
        await invoke("create_conversation", { id: currentId, title: autoTitle });
        setActiveConversationId(currentId);
      }
      
      await invoke("save_messages", { conversationId: currentId, messages });
      await loadConversationsList();
      alert("Conversation saved successfully!");
    } catch (err) {
      console.error("Failed to save chat:", err);
      alert("Failed to save conversation.");
    }
  };

  const autoSaveChat = async (convId: string | null, msgList: Message[], firstUserText: string) => {
    try {
      let id = convId;
      if (!id) {
        id = `conv_${Date.now()}`;
        const autoTitle = firstUserText.slice(0, 30) || "New Conversation";
        await invoke("create_conversation", { id, title: autoTitle });
        setActiveConversationId(id);
      }
      await invoke("save_messages", { conversationId: id, messages: msgList });
      await loadConversationsList();
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || streaming) return;

    if (speech.isListening) {
      speech.stop();
    }

    setInput("");
    setStreaming(true);

    const userMsg: Message = { role: "user",      content: text,  id: Date.now() };
    const assistMsg: Message = { role: "assistant", content: "",    id: Date.now() + 1 };

    setMessages(prev => [...prev, userMsg, assistMsg]);

    const baseSystemPromptText = "You are Vera, a private personal AI counsel built by LexSort Inc. You run entirely on this device — no cloud, no internet, no data leaves this machine. Be direct, honest, and concise. Never mention other AI companies or models. Never claim to be ChatGPT, Claude, or any other AI. You are Vera.";
    let systemPromptContent = baseSystemPromptText;

    // Help Intent Interceptor
    const helpKeywords = ['how do', 'what is', 'help me', 'help with', 
                          'walk me through', 'how to', "i can't", 'not working',
                          'explain', 'show me how'];
    const moduleKeywords = ['vera', 'organizer', 'quick organizer', 'module',
                            'setting', 'install', 'download', 'tasks', 'todo'];
    
    const lowerMsg = text.toLowerCase();
    const cleanMsg = lowerMsg.trim();
    const isExactHelp = cleanMsg === "help" || cleanMsg === "?";
    const hasHelpKeyword = isExactHelp || helpKeywords.some(k => lowerMsg.includes(k));
    const hasModuleKeyword = moduleKeywords.some(k => lowerMsg.includes(k));
    const isInModule = activeModule === 'quick-organizer';

    if (hasHelpKeyword && (hasModuleKeyword || isInModule)) {
      try {
        const docs = await invoke<string>('get_module_docs', { moduleName: "quick_organizer" });
        const truncatedDocs = docs.length > 4000
            ? docs.slice(0, 4000) + '\n\n[Documentation truncated]'
            : docs;
        
        systemPromptContent = `${baseSystemPromptText}\n\nYou are currently helping the user with quick_organizer.\nUse this documentation to answer their question accurately:\n---\n${truncatedDocs}\n---\nIf the answer is not in the documentation above, say so clearly and suggest the user visit discord.gg/kpZ3hWyAaq for support.`;
      } catch (err) {
        console.warn("Failed to fetch documentation:", err);
      }
    }

    const systemPrompt: Message = {
      id: 0,
      role: "system",
      content: systemPromptContent
    };
    const history = [systemPrompt, ...messages, userMsg].map(m => ({
      role:    m.role,
      content: m.content,
    }));

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const response = await fetch(`http://127.0.0.1:${serverPort}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model:       hardware?.model?.id ?? "llama3.2:3b",
          messages:    history,
          stream:      true,
          temperature: 0.7,
          max_tokens:  2048,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      if (!response.body) throw new Error("Response body is null");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const json   = JSON.parse(data);
            const token  = json.choices?.[0]?.delta?.content ?? "";
            if (!token) continue;

            assistantResponse += token;
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + token };
              }
              return next;
            });
          } catch { /* partial chunk — skip */ }
        }
      }

      const finalAssistMsg: Message = { ...assistMsg, content: assistantResponse };
      const updatedMessages = [...messages, userMsg, finalAssistMsg];
      await autoSaveChat(activeConversationId, updatedMessages, text);

    } catch (e: any) {
      if (e.name !== "AbortError") {
        const errorMsg = "⚠ Connection to local inference server lost. Please restart.";
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content || errorMsg,
            };
          }
          return next;
        });
        
        const finalAssistMsg: Message = { ...assistMsg, content: errorMsg };
        const updatedMessages = [...messages, userMsg, finalAssistMsg];
        await autoSaveChat(activeConversationId, updatedMessages, text);
      }
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, messages, streaming, serverPort, hardware, activeModule, speech, activeConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };



  // ── Diagnostics Generator ──────────────────────────────────────────────────
  const generateDiagnosticText = () => {
    return [
      `### VERA Personal AI — Diagnostic Report`,
      `- **VERA Version**: ${appVersion} (Freeware)`,
      `- **OS Platform**: ${hardware?.platform || "Detecting..."}`,
      `- **RAM Detected**: ${hardware?.ram_gb !== undefined ? `${hardware.ram_gb} GB` : "Detecting..."}`,
      `- **Free Storage**: ${hardware?.free_storage_gb !== undefined ? `${hardware.free_storage_gb} GB` : "Detecting..."}`,
      `- **NVIDIA GPU**: ${hardware?.has_nvidia_gpu ? "Yes" : "No"}`,
      `- **CPU Cores**: ${hardware?.cpu_cores || "Detecting..."}`,
      `- **Apple Silicon**: ${hardware?.apple_chip || "No"}`,
      `- **Unified Memory**: ${hardware?.unified_memory ? "Yes" : "No"}`,
      `- **Selected Model**: ${hardware?.model?.name || "None"} (ID: ${hardware?.model?.id || "None"})`,
      `- **Model Cached**: ${hardware?.model_exists ? "Yes" : "No"}`,
      `- **Local Port Binding**: ${serverPort}`,
      `- **Current Phase**: ${phase}`,
      `- **Startup Error**: ${error || "None"}`,
      `\n*Generated on: ${new Date().toUTCString()}*`
    ].join("\n");
  };

  // Support & Diagnostics are now fully managed by the SupportPanel component.

  // ── Render: Loading phases ─────────────────────────────────────────────────
  if (phase !== PHASE.READY) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <img src={veraLogo} alt="LexSort Personal AI" className="boot-logo-img" />
        </div>
        <p className="boot-product">LexSort <span className="boot-product-sub">Personal AI</span></p>

        {phase === PHASE.DETECTING && (
          <div className="boot-status">
            <Spinner />
            <p>Detecting hardware…</p>
          </div>
        )}

        {phase === PHASE.ENGINE_SETUP && (
          <div className="boot-status engine-setup-card glassmorphism" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", borderRadius: "16px", border: "1px solid var(--border)", background: "rgba(22, 22, 26, 0.8)", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
            <div className="engine-setup-icon" style={{ fontSize: "44px", background: "rgba(91, 106, 245, 0.15)", width: "80px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "1px solid rgba(91, 106, 245, 0.3)", boxShadow: "0 8px 24px rgba(91, 106, 245, 0.15)", marginBottom: "16px" }}>🧠</div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "var(--text)" }}>Set Up Local AI Engine</h3>
            <p className="engine-setup-desc" style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 20px 0", maxWidth: "420px" }}>
              VERA runs entirely on your local machine to protect your privacy. 
              To begin, we need to download and set up the local AI inference engine (Ollama).
            </p>
            
            {engineSetupStatus === "idle" && (
              <>
                <button className="update-btn-active engine-setup-btn" onClick={handleStartEngineSetup} style={{ width: "auto", minWidth: "260px" }}>
                  Download & Configure Engine (~180MB)
                </button>
                <p className="boot-note" style={{ marginTop: "12px", fontSize: "11px", color: "var(--text-muted)" }}>One-time download. No account required. Zero cloud dependencies.</p>
              </>
            )}

            {engineSetupStatus === "downloading" && (
              <div className="engine-setup-progress-block" style={{ width: "100%", maxWidth: "360px" }}>
                <p style={{ fontSize: "13px", marginBottom: "8px", color: "var(--text)" }}>Downloading AI Engine...</p>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${engineSetupProgress}%` }} />
                </div>
                <p className="progress-label" style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
                  Attempt {engineSetupAttempt} of 3 · {engineSetupProgress}% Complete
                </p>
              </div>
            )}

            {engineSetupStatus === "verifying" && (
              <div className="engine-setup-progress-block">
                <Spinner />
                <p style={{ marginTop: "10px", fontSize: "13px", color: "var(--text)" }}>Verifying binary signatures (SHA-256)...</p>
              </div>
            )}

            {engineSetupStatus === "extracting" && (
              <div className="engine-setup-progress-block">
                <Spinner />
                <p style={{ marginTop: "10px", fontSize: "13px", color: "var(--text)" }}>Extracting and configuring portable engine...</p>
              </div>
            )}

            {engineSetupStatus === "completed" && (
              <div className="engine-setup-progress-block completed">
                <p style={{ color: "var(--green)", fontWeight: 700 }}>✓ Local AI Engine Configured Successfully!</p>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>Resuming VERA boot sequence...</p>
              </div>
            )}

            {engineSetupStatus === "error" && (
              <div className="engine-setup-progress-block error">
                <p style={{ color: "var(--red)", fontWeight: 700 }}>⚠️ Engine Setup Failed</p>
                <p className="error-detail" style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px", maxWidth: "340px", wordBreak: "break-word" }}>
                  {engineSetupError}
                </p>
                <button className="retry-btn" onClick={handleStartEngineSetup} style={{ marginTop: "16px" }}>
                  Retry Installation
                </button>
              </div>
            )}
          </div>
        )}

        {phase === PHASE.MODEL_SELECTION && hardware && (
          <div className="model-selection-card glassmorphism">
            <div className="onboarding-header">
              <div className="onboarding-icon">🔮</div>
              <h3>Choose Your AI Model</h3>
              <p className="onboarding-subtitle">
                Select a model to power VERA. All processing remains 100% local and private.
              </p>
            </div>

            {/* Hardware Profile Summary */}
            <div className="hardware-profile">
              <span className="profile-title">Hardware Profile</span>
              <div className="profile-row">
                <span className="profile-label">System RAM:</span>
                <span className="profile-val">{hardware.ram_gb} GB</span>
              </div>
              <div className="profile-row">
                <span className="profile-label">CPU Cores:</span>
                <span className="profile-val">{hardware.cpu_cores} Cores</span>
              </div>
              {hardware.apple_chip && (
                <div className="profile-row">
                  <span className="profile-label">Processor:</span>
                  <span className="profile-val">{hardware.apple_chip}</span>
                </div>
              )}
              {hardware.has_nvidia_gpu && (
                <div className="profile-row">
                  <span className="profile-label">Graphics:</span>
                  <span className="profile-val">NVIDIA GPU Detected</span>
                </div>
              )}
            </div>

            {/* Model Selection List */}
            <div className="onboarding-model-selector">
              {/* Local Models Section (if any detected) */}
              {localModels.length > 0 && (
                <div className="onboarding-section">
                  <label className="section-label">Detected Local Models</label>
                  <div className="local-models-list">
                    {localModels.map((modelTag) => {
                      const isSelected = selectedOnboardingModelId === modelTag;
                      return (
                        <div
                          key={modelTag}
                          className={`model-option-card local-option ${isSelected ? "selected" : ""}`}
                          onClick={() => setSelectedOnboardingModelId(modelTag)}
                        >
                          <span className="model-name-text">{modelTag}</span>
                          <span className="badge-local">Local</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Downloadable Models Dropdown */}
              <div className="onboarding-section">
                <label className="section-label">Download a Recommended Model</label>
                <div className="select-wrapper">
                  <select
                    className="onboarding-select"
                    value={MODELS_LIST.some(m => m.id === selectedOnboardingModelId) ? selectedOnboardingModelId : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedOnboardingModelId(e.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>-- Select a model to download --</option>
                    {MODELS_LIST.map((model) => {
                      const isLocal = localModels.includes(model.id) ||
                                      localModels.some(m => m.startsWith(model.id + ":") || model.id.startsWith(m + ":"));
                      return (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.size}){isLocal ? " - Already Local" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                
                {/* Details of the selected recommended model if selected */}
                {(() => {
                  const recommended = MODELS_LIST.find(m => m.id === selectedOnboardingModelId);
                  if (recommended) {
                    return (
                      <div className="recommended-detail-card">
                        <div className="recommended-desc">{recommended.desc}</div>
                        <div className="recommended-meta">
                          <span>Size: {recommended.size}</span>
                          <span>·</span>
                          <span>Min RAM: {recommended.minRam === 0 ? "Any" : `${recommended.minRam} GB`}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Capacity Warnings */}
            {(() => {
              const selectedModel = MODELS_LIST.find(m => m.id === selectedOnboardingModelId);
              const isLocalSelected = localModels.includes(selectedOnboardingModelId) || 
                                      localModels.some(m => m.startsWith(selectedOnboardingModelId + ":") || selectedOnboardingModelId.startsWith(m + ":"));
              
              if (selectedModel && hardware.ram_gb < selectedModel.minRam) {
                if (isLocalSelected) {
                  return (
                    <div className="capacity-warning warning-label">
                      ⚠️ This model recommends at least {selectedModel.minRam} GB RAM. It may run slowly or crash on your {hardware.ram_gb} GB RAM system.
                    </div>
                  );
                } else {
                  return (
                    <div className="capacity-warning warning-label error-label">
                      🚫 Selected model requires {selectedModel.minRam} GB RAM. Your system only has {hardware.ram_gb} GB RAM. Please choose a lighter model.
                    </div>
                  );
                }
              }
              
              return null;
            })()}

            {/* Confirmation Action */}
            {(() => {
              const selectedModel = MODELS_LIST.find(m => m.id === selectedOnboardingModelId);
              const isLocalSelected = localModels.includes(selectedOnboardingModelId) || 
                                      localModels.some(m => m.startsWith(selectedOnboardingModelId + ":") || selectedOnboardingModelId.startsWith(m + ":"));
              
              const isBlocked = selectedModel && hardware.ram_gb < selectedModel.minRam && !isLocalSelected;
              
              return (
                <div className="onboarding-actions">
                  <button
                    className="update-btn-active confirm-selection-btn"
                    disabled={isBlocked}
                    onClick={() => handleConfirmOnboardingModel(selectedOnboardingModelId)}
                  >
                    {isLocalSelected ? "Confirm & Launch" : "Confirm & Download"}
                  </button>

                  <button className="skip-onboarding-link" onClick={handleSkipOnboarding}>
                    Skip Onboarding / Use Lightweight Default
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {phase === PHASE.DOWNLOADING && hardware && (
          <div className="boot-status">
            <p className="boot-model-name">Downloading {hardware.model.name}</p>
            <p className="boot-model-desc">{hardware.model.description}</p>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${dlProgress.percent.toFixed(1)}%` }}
              />
            </div>
            <p className="progress-label">
              {formatBytes(dlProgress.downloaded)} / {formatBytes(dlProgress.total)}
              &nbsp;·&nbsp;{dlProgress.percent.toFixed(1)}%
            </p>
            <p className="boot-note">One-time download. Stored privately on your machine.</p>
          </div>
        )}

        {phase === PHASE.BOOTING && (
          <div className="boot-status">
            <Spinner />
            <p>Starting private inference engine…</p>
            {hardware && (
              <p className="boot-model-desc">{hardware.model.name} · {hardware.ram_gb} GB RAM detected</p>
            )}
          </div>
        )}

        {phase === PHASE.BENCHMARKING && (
          <div className="boot-status">
            <Spinner />
            <p>Running hardware speed test…</p>
            {hardware && (
              <p className="boot-model-desc">Testing local performance of {hardware.model.name}…</p>
            )}
          </div>
        )}

        {phase === PHASE.ERROR && (
          <div className="boot-status error">
            <p>⚠ Startup failed</p>
            <p className="error-detail">{error}</p>
            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
              <button onClick={bootSequence} className="retry-btn">Retry Boot</button>
              <button
                onClick={() => setShowSupport(true)}
                className="retry-btn"
                style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Diagnostic Report
              </button>
            </div>
            <p style={{ marginTop: "20px", fontSize: "12px" }}>
              Need help? Open our{" "}
              <span onClick={() => setShowSupport(true)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>
                Support & Community Portal
              </span>.
            </p>
          </div>
        )}

        {/* Support Panel in boot screen */}
        {showSupport && (
          <SupportPanel
            onClose={() => setShowSupport(false)}
            appName="VERA Freeware"
            diagnosticText={generateDiagnosticText()}
            isPro={false}
          />
        )}
      </div>
    );
  }

  // ── Render: Chat ───────────────────────────────────────────────────────────
  return (
    <div className="app">
      {isRunningFromDmg && (
        <div className="dmg-warning-banner">
          ⚠️ VERA is running directly from a mounted disk image. To prevent duplicate disks and issues, please drag VERA to your Applications folder and open it from there.
        </div>
      )}
      <header className="header">
        <div className="header-left">
          <img src={veraLogo} alt="LexSort Personal AI" className="header-logo-img" />
          <div className="header-title-block">
            <span className="header-title">LexSort <span style={{fontWeight:300}}>Personal AI</span></span>
            <span className="header-subtitle">by LexSort Inc.</span>
          </div>
        </div>
        <div className="header-right">
          {hardware && (
            <span className="header-model">
              {hardware.model.name} · {hardware.ram_gb} GB
            </span>
          )}
          <span className="privacy-badge">● Private</span>
          <UpdateStatusIndicator
            status={updateStatus}
            onDismiss={() => setUpdateStatus(prev => ({ ...prev, phase: 'idle' }))}
            onSendBugReport={() => sendUpdateBugReport(updateStatus, hardware)}
          />
          <button
            onClick={() => setShowSupport(true)}
            className="hdr-btn"
            style={{ borderColor: "var(--accent)", color: "var(--text)", fontWeight: 600 }}
          >
            Support
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="hdr-btn"
            style={{ borderColor: "var(--accent)", color: "var(--text)", fontWeight: 600, position: "relative" }}
            title="Settings"
          >
            ⚙️ Settings
            {(updateCheckResult?.core_update_available || updateDownloadStatus === "downloaded") && (
              <span className="settings-badge-dot" />
            )}
          </button>
          {messages.length > 0 && activeModule === 'chat' && (
            <>
              <button onClick={handleSaveActiveChat} className="hdr-btn" title="Save to local database">Save</button>
              <button onClick={handleNewChat} className="hdr-btn hdr-btn-clear" title="Clear chat screen">Clear</button>
            </>
          )}
        </div>
      </header>

      <div className="app-container" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Brand mark */}
          <div className="sidebar-brand">
            <img src={veraLogo} alt="VERA" className="sidebar-logo" />
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">LexSort VERA</span>
              <span className="sidebar-brand-tier">FREEWARE</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`sidebar-item ${activeModule === 'chat' && !showHistory ? 'sidebar-item--active' : ''}`}
              onClick={() => {
                setActiveModule('chat');
                setShowHistory(false);
                setShowModulesDrawer(false);
              }}
            >
              <span className="sidebar-icon">💬</span>
              <span className="sidebar-label">VERA Chat</span>
            </button>

            {/* Saved Chats Sidebar Item */}
            <button
              className={`sidebar-item ${activeModule === 'chat' && showHistory ? 'sidebar-item--active' : ''}`}
              onClick={() => {
                setActiveModule('chat');
                setShowHistory(true);
                setShowModulesDrawer(false);
              }}
            >
              <span className="sidebar-icon">📜</span>
              <span className="sidebar-label">Saved Chats</span>
            </button>

            {/* Modules Trigger */}
            <button
              className={`sidebar-item ${showModulesDrawer ? 'sidebar-item--active' : ''}`}
              onClick={() => {
                setShowModulesDrawer(prev => !prev);
                if (!showModulesDrawer) {
                  setShowHistory(false);
                }
              }}
            >
              <span className="sidebar-icon">🧩</span>
              <span className="sidebar-label">Modules</span>
            </button>
          </nav>

          <button 
            className="sidebar-item sidebar-exit-item"
            onClick={async () => {
              if (pendingUpdateRef.current) {
                setApprovedVersion(pendingUpdateRef.current.version);
                setShowExitPrompt(true);
              } else {
                try {
                  await invoke("exit_app");
                } catch (e) {
                  console.error("Failed to exit app:", e);
                }
              }
            }}
            style={{ 
              margin: "0 12px 12px 12px", 
              borderRadius: "8px", 
              border: "1px solid rgba(240, 82, 82, 0.2)", 
              background: "rgba(240, 82, 82, 0.04)", 
              color: "#ff6b6b",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              width: "calc(100% - 24px)"
            }}
          >
            <span className="sidebar-icon">🚪</span>
            <span className="sidebar-label" style={{ fontWeight: 600 }}>Exit VERA</span>
          </button>

          <div className="sidebar-footer" style={{ padding: "16px 12px", borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--text-muted)", textAlign: "center", fontStyle: "normal", fontWeight: 500, letterSpacing: "0.5px" }}>
            v{appVersion} Freeware
          </div>
        </aside>

        {showModulesDrawer && (
          <ModuleDrawer
            modulesList={MODULES_LIST}
            activeModule={activeModule}
            isPro={false}
            onSelectModule={(modId) => {
              const modObj = MODULES_LIST.find(m => m.id === modId);
              if (!modObj?.isFree) {
                alert("VERA Pro Suite is required to run workspace modules. Upgrade now to unlock ProMailer, Research Lab, and local-first diagnostics.");
                setSettingsTab("pro");
                setShowSettings(true);
                return;
              }
              setActiveModule(modId);
              setShowModulesDrawer(false);
            }}
            onClose={() => setShowModulesDrawer(false)}
          />
        )}

        {/* Viewport */}
        <div className="viewport" style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {activeModule === 'chat' && (
            <div style={{ display: "flex", flexDirection: "row", height: "100%", width: "100%", overflow: "hidden" }}>
              {showHistory && (
                <aside className="chat-history-sidebar">
                  <div className="chat-history-header">
                    <span className="chat-history-title">Saved Chats</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button onClick={handleNewChat} className="chat-history-new-btn" title="New Chat">
                        ＋ New
                      </button>
                      <button 
                        className="history-close-toggle-btn"
                        onClick={() => setShowHistory(false)}
                        title="Close History"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M9 3v18" />
                          <path d="m16 15-3-3 3-3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="chat-history-list">
                    {conversations.length === 0 ? (
                      <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "12px", marginTop: "24px" }}>
                        No saved chats.
                      </p>
                    ) : (
                      conversations.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => selectConversation(c.id)}
                          className={`history-item ${activeConversationId === c.id ? "active" : ""}`}
                        >
                          <span className="history-item-label">{c.title}</span>
                          <div className="history-actions">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameConversation(c.id, c.title);
                              }}
                              className="history-action-btn"
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConversation(c.id);
                              }}
                              className="history-action-btn"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </aside>
              )}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden" }}>
                <main className="chat-area">
                {messages.length === 0 && (
                  <div className="vera-greeting">
                    <div className="vera-greeting__header">
                      <div className="vera-greeting__logo-wrap">
                        <img src={veraLogo} alt="VERA" className="vera-greeting__logo" />
                      </div>
                      <h1 className="vera-greeting__title">{FREEWARE_GREETING.title}</h1>
                      <p className="vera-greeting__subtitle">{FREEWARE_GREETING.subtitle}</p>
                      <p className="vera-greeting__description">{FREEWARE_GREETING.description}</p>
                    </div>

                    <div className="vera-greeting__capabilities">
                      {FREEWARE_GREETING.capabilities.map((cap, i) => (
                        <div key={i} className="vera-greeting__capability-item">
                          <span className="vera-greeting__capability-icon">{cap.icon}</span>
                          <span className="vera-greeting__capability-label">{cap.label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="vera-greeting__chips">
                      {FREEWARE_GREETING.chips.map((chip, i) => (
                        <button
                          key={i}
                          className="vera-greeting__chip"
                          onClick={() => sendMessage(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <p className="vera-greeting__footer">{FREEWARE_GREETING.footer}</p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="message-content">
                      {msg.content || (msg.role === "assistant" && streaming
                        ? <span className="cursor-blink">▋</span>
                        : null
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </main>

              <footer className="input-area">
                <textarea
                  ref={inputRef}
                  className="input-box"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Vera..."
                  rows={1}
                  disabled={streaming}
                />
                {speech.supported && (
                  <button
                    className={`chat-mic-btn ${speech.isListening ? "active" : ""}`}
                    onClick={toggleSpeech}
                    disabled={streaming}
                    title={speech.isListening ? "Stop Voice Input" : "Start Voice Input"}
                    type="button"
                  >
                    {speech.isListening ? (
                      <span className="mic-icon-active">🔴 🎤</span>
                    ) : (
                      <span className="mic-icon-inactive">🎤</span>
                    )}
                  </button>
                )}
                <button
                  className={`send-btn ${streaming ? "sending" : ""}`}
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || streaming}
                  aria-label="Send"
                >
                  {streaming ? <StopIcon /> : <><SendIcon /><span style={{marginLeft:"6px",fontSize:"13px",fontWeight:600}}>Send</span></>}
                </button>
              </footer>
            </div>
          </div>
        )}

          {activeModule !== 'chat' && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              flexGrow: 1,
              overflow: "hidden"
            }}>
              {(() => {
                const activeModObj = MODULES_LIST.find(m => m.id === activeModule);
                return (
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px",
                    background: "var(--bg-surface)",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>{activeModObj?.icon || "🧩"}</span>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                        {activeModObj?.display_name || "Module"}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveModule("chat")}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text)";
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                      }}
                    >
                      ✕ Close Tab
                    </button>
                  </div>
                );
              })()}
              <FeedbackBanner activeModule={activeModule} modulesList={MODULES_LIST} />
              <div style={{ flexGrow: 1, height: "100%", overflow: "hidden", position: "relative" }}>
                <ModuleErrorBoundary moduleName={activeModule}>
                  {(() => {
                    const DynComp = dynamicComponents[activeModule];
                    if (DynComp) {
                      return <DynComp />;
                    }
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
                        <div className="spinner" style={{ width: "32px", height: "32px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "16px" }} />
                        <p>Loading module interface…</p>
                      </div>
                    );
                  })()}
                </ModuleErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Support Panel in Chat */}
      {showSupport && (
        <SupportPanel
          onClose={() => setShowSupport(false)}
          appName="VERA Freeware"
          diagnosticText={generateDiagnosticText()}
          isPro={false}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-modal-overlay">
          <div className="settings-modal-card">
            <header className="settings-header">
              <h3 className="settings-title">⚙️ VERA Settings</h3>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)} disabled={switchingModelId !== null}>✕</button>
            </header>

            {switchingModelId ? (
              <div className="settings-switching-overlay">
                <Spinner />
                {switchingPhase === "checking" && <p>Checking local cache for model...</p>}
                {switchingPhase === "downloading" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%" }}>
                    <p>Downloading new model. This may take several minutes...</p>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${switchingDlProgress.percent}%` }} />
                    </div>
                    <span className="progress-label">
                      {formatBytes(switchingDlProgress.downloaded)} / {formatBytes(switchingDlProgress.total)} ({switchingDlProgress.percent.toFixed(1)}%)
                    </span>
                  </div>
                )}
                {switchingPhase === "booting" && <p>Initializing inference server with new model...</p>}
                {switchingPhase === "benchmarking" && <p>Running hardware speed test on new model...</p>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Tabs */}
                <div className="settings-tabs">
                  <button 
                    className={`settings-tab-btn ${settingsTab === "model" ? "active" : ""}`} 
                    onClick={() => setSettingsTab("model")}
                  >
                    Model
                  </button>
                  <button 
                    className={`settings-tab-btn ${settingsTab === "updates" ? "active" : ""}`} 
                    onClick={() => setSettingsTab("updates")}
                    style={{ position: "relative" }}
                  >
                    Updates
                    {(updateCheckResult?.core_update_available || updateDownloadStatus === "downloaded") && (
                      <span className="settings-badge-dot" style={{ top: "4px", right: "4px" }} />
                    )}
                  </button>
                  <button 
                    className={`settings-tab-btn ${settingsTab === "pro" ? "active" : ""}`} 
                    onClick={() => setSettingsTab("pro")}
                  >
                    Pro Features
                  </button>
                  <button 
                    className={`settings-tab-btn ${settingsTab === "calendar" ? "active" : ""}`} 
                    onClick={() => setSettingsTab("calendar")}
                  >
                    Calendar
                  </button>
                </div>

                {settingsTab === "model" && (
                  <>
                    {/* Active Model Summary */}
                    <div className="settings-section">
                      <span className="settings-section-title">Active local model</span>
                      <div className="active-model-summary">
                        <div className="active-model-info">
                          <span className="active-model-name">{hardware?.model.name}</span>
                          <span className="active-model-meta">{hardware?.model.ollama_tag} · Cached: Yes</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {lastBenchmarkTps !== null ? (
                            <div className={`benchmark-badge ${lastBenchmarkTps < 3.0 ? "low" : ""}`}>
                              ⚡ {lastBenchmarkTps.toFixed(1)} tok/sec
                            </div>
                          ) : (
                            <span className="active-model-meta">No benchmark run yet</span>
                          )}
                          <button 
                            className="hdr-btn" 
                            onClick={handleManualBenchmark} 
                            disabled={runningManualBenchmark}
                            style={{ border: "1px solid var(--accent)", color: "var(--text)" }}
                          >
                            {runningManualBenchmark ? "Testing..." : "Run Speed Test"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Available models list */}
                    <div className="settings-section">
                      <span className="settings-section-title">Select Local AI Model</span>
                      <div className="model-list">
                        {MODELS_LIST.map((m) => {
                          const isActive = hardware?.model.id === m.id;
                          const isCached = alternativeModelCached[m.id];
                          const isLowRam = !!(hardware && hardware.ram_gb < m.minRam);
                          const isLowStorage = !!(hardware && hardware.free_storage_gb < m.minStorage);
                          
                          return (
                            <div 
                              key={m.id} 
                              className={`model-card ${isActive ? "active" : ""} ${isLowStorage && !isCached ? "disabled" : ""}`}
                              onClick={() => {
                                if (isLowStorage && !isCached) return;
                                handleSwitchModel(m.id);
                              }}
                            >
                              <div className="model-card-left">
                                <div className="model-card-title-row">
                                  <span className="model-card-name">{m.name}</span>
                                  <span className={`model-card-badge ${m.tier.toLowerCase().replace(/ \/ .*/, "").replace(/ .*/, "")}`}>
                                    {m.tier}
                                  </span>
                                  {isLowRam && (
                                    <span style={{ fontSize: "10px", color: "var(--red)", fontWeight: 600 }}>
                                      ⚠️ Low RAM
                                    </span>
                                  )}
                                  {isLowStorage && !isCached && (
                                    <span style={{ fontSize: "10px", color: "var(--red)", fontWeight: 600 }}>
                                      ⚠️ Low Storage
                                    </span>
                                  )}
                                </div>
                                <span className="model-card-desc">{m.desc}</span>
                              </div>
                              <div className="model-card-right">
                                <span className="model-card-size">{m.size}</span>
                                <span className={`model-status-badge ${isCached ? "cached" : "download"}`}>
                                  {isActive ? "Active" : isCached ? "Downloaded" : "Needs Pull"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {settingsTab === "updates" && (
                  <div className="updates-container">
                    {checkingForUpdates ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px", gap: "12px" }}>
                        <Spinner />
                        <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>Checking for updates...</span>
                      </div>
                    ) : updateCheckResult ? (
                      <>
                        {updateCheckResult.success ? (
                          <>
                            {updateCheckResult.core_update_available ? (
                              <div className="updates-status-card update-available">
                                <span className="updates-status-title">Core Update Available</span>
                                <span className="updates-status-desc">
                                  A new version of VERA is available (v{updateCheckResult.remote_core_version}). You are currently running v{updateCheckResult.current_core_version}.
                                </span>
                                {updateCheckResult.core_release_notes && (
                                  <div className="release-notes-box">
                                    <h4>Release Notes:</h4>
                                    <p>{updateCheckResult.core_release_notes}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="updates-status-card">
                                <span className="updates-status-title">VERA is Up to Date</span>
                                <span className="updates-status-desc">
                                  You are running the latest version of VERA (v{updateCheckResult.current_core_version}).
                                </span>
                              </div>
                            )}

                            <div className="updates-list">
                              <div className="update-row">
                                <div className="update-row-info">
                                  <span className="update-row-name">VERA Core</span>
                                  <span className="update-row-meta">
                                    {updateCheckResult.core_update_available 
                                      ? `Update available: v${updateCheckResult.current_core_version} → v${updateCheckResult.remote_core_version}`
                                      : `v${updateCheckResult.current_core_version} · Up to date`}
                                  </span>
                                </div>
                                <div className="update-btn-container">
                                  {!updateCheckResult.core_update_available ? (
                                    <button className="update-btn-disabled" disabled>
                                      Up to date
                                    </button>
                                  ) : updateDownloadStatus === "idle" ? (
                                    <button className="update-btn-active" onClick={handleApproveUpdate}>
                                      Approve & Download
                                    </button>
                                  ) : updateDownloadStatus === "downloading" ? (
                                    <button className="update-btn-disabled" disabled>
                                      Downloading...
                                    </button>
                                  ) : updateDownloadStatus === "downloaded" ? (
                                    <button className="btn-update-install" onClick={handleInstallNow}>
                                      Restart & Install
                                    </button>
                                  ) : (
                                    <button className="update-btn-active" onClick={handleApproveUpdate}>
                                      Retry Download
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Download Progress Bar */}
                              {updateDownloadStatus === "downloading" && (
                                <div className="updates-progress-container">
                                  <div className="updates-progress-label-row">
                                    <span>Downloading update package...</span>
                                    <span className="updates-progress-percent">{downloadProgress}%</span>
                                  </div>
                                  <div className="updates-progress-bar-track">
                                    <div className="updates-progress-bar-fill" style={{ width: `${downloadProgress}%` }} />
                                  </div>
                                </div>
                              )}

                              {/* Download Completed Message & Quick Install */}
                              {updateDownloadStatus === "downloaded" && (
                                <div className="updates-progress-container" style={{ borderColor: "var(--green)" }}>
                                  <div className="updates-progress-label-row">
                                    <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ Download Complete</span>
                                    <span>Ready to Install</span>
                                  </div>
                                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                                    VERA {approvedVersion} is staged. You can install it now or it will install automatically next time you close the application.
                                  </p>
                                  <div className="update-ready-actions">
                                    <button className="btn-update-install" onClick={handleInstallNow}>
                                      Install & Restart Now
                                    </button>
                                    <button className="btn-update-later" onClick={() => setShowSettings(false)}>
                                      Install Later
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="updates-offline-warning">
                            <p style={{ fontWeight: 700 }}>⚠️ Update Check Failed</p>
                            <p>{updateCheckResult.error || "Could not check for updates. Please check your network connection."}</p>
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                          <button 
                            className="hdr-btn" 
                            onClick={runUpdateCheck}
                            style={{ border: "1px solid var(--accent)", color: "var(--text)" }}
                            disabled={updateDownloadStatus === "downloading"}
                          >
                            Check Again
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px" }}>
                        <button 
                          className="hdr-btn" 
                          onClick={runUpdateCheck}
                          style={{ border: "1px solid var(--accent)", color: "var(--text)" }}
                        >
                          Check for Updates
                        </button>
                      </div>
                    )}

                    {/* Factory Reset Section */}
                    <div className="settings-divider" style={{ height: "1px", background: "var(--border)", margin: "24px 0 12px" }} />
                    <div className="settings-section">
                      <span className="settings-section-title">Factory Reset</span>
                      <div className="factory-reset-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(240, 82, 82, 0.05)", border: "1px solid rgba(240, 82, 82, 0.2)", borderRadius: "12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Reset Application Data</span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                            This will permanently delete all task lists, notes, and app configurations. Local models downloaded to Ollama will not be affected.
                          </span>
                        </div>
                        <button 
                          className="hdr-btn"
                          onClick={handleFactoryReset}
                          style={{ border: "1px solid var(--red)", color: "var(--red)", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap", marginLeft: "16px" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(240, 82, 82, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          Reset App
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === "pro" && (
                  <div className="pro-preview">
                    <div className="pro-preview__header">
                      <h2 className="pro-preview__title">VERA Modules</h2>
                      <p className="pro-preview__subtitle">
                        Extend VERA with purpose-built tools for business and professional work.
                      </p>
                    </div>

                    <div className="pro-preview__list">
                      {PRO_MODULES_PREVIEW.map(mod => (
                        <div
                          key={mod.id}
                          className={`pro-preview__row ${!mod.included ? 'pro-preview__row--locked' : ''}`}
                        >
                          <div className="pro-preview__row-body">
                            <span className="pro-preview__row-name">{mod.name}</span>
                            <span className="pro-preview__row-desc">{mod.description}</span>
                          </div>
                          <span className={`pro-preview__badge ${mod.badgeClass}`}>
                            {mod.badge}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pro-preview__upgrade">
                      <div className="pro-preview__upgrade-text">
                        <strong>VERA Pro</strong> — monthly subscription, no commitment.
                      </div>
                      <a
                        href="https://lexsort.com/vera-pro.html"
                        onClick={(e) => {
                          e.preventDefault();
                          openExternalUrl("https://lexsort.com/vera-pro.html");
                        }}
                        className="pro-preview__upgrade-btn"
                      >
                        Upgrade to Pro — $5.99 / month
                      </a>
                    </div>
                  </div>
                )}

                {settingsTab === "calendar" && (
                  <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <span className="settings-section-title">System Calendar Integration</span>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Connection Status</span>
                        <span className={`model-status-badge ${calendarImported === 'approved' ? 'cached' : 'download'}`} style={{ textTransform: 'uppercase' }}>
                          {calendarImported === 'approved' ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>

                      {calendarImported === 'approved' && calendarLastImport && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last Import</span>
                          <span style={{ fontSize: '12px', color: 'var(--text)' }}>{calendarLastImport}</span>
                        </div>
                      )}

                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4', margin: '4px 0 8px 0', textAlign: 'left' }}>
                        VERA imports events from your local system calendar (macOS Calendar.app or Windows Calendar) to help you view and plan around your schedules. VERA never sends your calendar data online.
                      </p>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        {calendarImported === 'approved' ? (
                          <>
                            <button className="hdr-btn" onClick={() => {
                              localStorage.setItem('vera_calendar_imported', 'declined');
                              localStorage.removeItem('vera_calendar_last_import');
                              setCalendarImported('declined');
                              setCalendarLastImport(null);
                              window.dispatchEvent(new CustomEvent('vera-calendar-disconnect'));
                            }} style={{ border: '1px solid var(--red)', color: 'var(--red)', cursor: 'pointer', background: 'transparent' }}>
                              Disconnect Calendar
                            </button>
                            <button className="hdr-btn" onClick={async () => {
                              try {
                                const allowed = await invoke<boolean>('request_calendar_permission');
                                if (allowed) {
                                  localStorage.setItem('vera_calendar_imported', 'approved');
                                  const nowStr = new Date().toLocaleString();
                                  localStorage.setItem('vera_calendar_last_import', nowStr);
                                  setCalendarImported('approved');
                                  setCalendarLastImport(nowStr);
                                  window.dispatchEvent(new CustomEvent('vera-calendar-refresh'));
                                }
                              } catch (e) {
                                console.error('Failed to refresh calendar:', e);
                              }
                            }} style={{ border: '1px solid var(--accent)', color: 'var(--text)', cursor: 'pointer', background: 'transparent' }}>
                              Refresh Now
                            </button>
                          </>
                        ) : (
                          <button className="hdr-btn" onClick={async () => {
                            try {
                              const allowed = await invoke<boolean>('request_calendar_permission');
                              if (allowed) {
                                localStorage.setItem('vera_calendar_imported', 'approved');
                                const nowStr = new Date().toLocaleString();
                                localStorage.setItem('vera_calendar_last_import', nowStr);
                                setCalendarImported('approved');
                                setCalendarLastImport(nowStr);
                                window.dispatchEvent(new CustomEvent('vera-calendar-refresh'));
                              } else {
                                localStorage.setItem('vera_calendar_imported', 'declined');
                                setCalendarImported('declined');
                              }
                            } catch (e) {
                              console.error('Failed to connect calendar:', e);
                              localStorage.setItem('vera_calendar_imported', 'declined');
                              setCalendarImported('declined');
                            }
                          }} style={{ border: '1px solid var(--accent)', color: 'var(--text)', cursor: 'pointer', background: 'transparent' }}>
                            Connect Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showFallbackReport && (
          <div className="fallback-report-overlay" role="dialog" aria-modal="true">
              <div className="fallback-report-card">
                  <h2>Update failed — copy this report</h2>
                  <p>Paste it in <strong>#bug-reports</strong> on Discord or Reddit.</p>
                  <textarea
                      readOnly
                      value={fallbackReportText}
                      className="fallback-report-text"
                      rows={10}
                  />
                  <div className="fallback-report-actions">
                      <button onClick={() => {
                          navigator.clipboard.writeText(fallbackReportText);
                      }}>
                          Copy to clipboard
                      </button>
                      <button onClick={() => setShowFallbackReport(false)}>
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}
      {showExitPrompt && (
        <div className="exit-modal-overlay">
          <div className="exit-modal">
            <div className="exit-modal-icon">⬆️</div>
            <h2>Update Ready to Install</h2>
            <p>
              VERA <strong>{approvedVersion}</strong> has been downloaded and is ready to install.
              <br />
              Would you like to install it now before exiting?
            </p>
            <div className="exit-modal-actions">
              <button className="exit-install-btn" onClick={handleInstallNow}>
                Install & Restart
              </button>
              <button className="exit-later-btn" onClick={handleInstallLater}>
                Later (Exit App)
              </button>
              <button className="exit-cancel-btn" onClick={handleCancelClose}>
                Cancel Exit
              </button>
            </div>
            <p className="exit-modal-footnote">
              Your tasks and configurations will be saved safely.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const formatBytes = (b: number) => {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

const Spinner = () => <div className="spinner" aria-label="Loading" />;

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);
