import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import "./app.css";
import veraLogo from "./assets/vera-logo.jpg";
import SupportPanel, { openExternalUrl } from "./SupportPanel";
import { UpdateStatusIndicator, UpdateStatus } from "./UpdateStatusIndicator";
import { QuickOrganizer } from "./components/QuickOrganizer";
import TeamLab from "./components/TeamLab";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useAudio } from "./hooks/useAudio";
import { useSettings } from "./hooks/useSettings";
import { useSwitching } from "./hooks/useSwitching";
import { useConversations } from "./hooks/useConversations";
import { useChat } from "./hooks/useChat";
import { useEngine, PHASE } from "./hooks/useEngine";
// useVoiceSession: reserved for future whisper.cpp backend integration (Amendment 03 Phase 3)
// import { useVoiceSession } from "./hooks/useVoiceSession";
import { VeraModule } from "./types/module";
import ModuleDrawer from "./components/ModuleDrawer";
import FeedbackBanner from "./components/FeedbackBanner";
import { ModuleErrorBoundary } from "./components/ModuleErrorBoundary";

// Expose React globally for dynamic modules
(window as any).React = React;
(window as any).ReactJSXRuntime = ReactJSXRuntime;

// Persistent chat diagnostics — mirrors the [chat] console lines into
// ~/.lexsort/logs/chat-debug.log so field builds (no DevTools) can be
// debugged by reading the file. Fire-and-forget: never blocks chat.
const logChat = (line: string) => {
  console.log(`[chat] ${line}`);
  invoke("append_chat_log", { line })
    .catch((err) => console.warn(`[chat] failed to write log file: ${err}`));
};

// Expose VERAApi for Pro modules
(window as any).VERAApi = {
  invoke: (cmd: string, args?: any) => {
    console.log(`[VERAApi] Invoking command ${cmd} with args:`, args);
    return invoke(cmd, args);
  },
  openExternal: (url: string) => {
    console.log(`[VERAApi] Opening external URL: ${url}`);
    return openExternalUrl(url);
  },
  listen: (event: string, handler: (payload: any) => void) => {
    console.log(`[VERAApi] Subscribing to event: ${event}`);
    return listen(event, handler);
  }
};

declare global {
  interface Window {
    registerVeraModule: (name: string, Component: React.ComponentType<any>) => void;
    React: any;
    ReactJSXRuntime: any;
    VERAApi: {
      invoke: (cmd: string, args?: any) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      listen: (event: string, handler: (payload: any) => void) => Promise<any>;
    };
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
    id: "promailer",
    name: "promailer",
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
  },
  {
    id: "team-lab",
    name: "team-lab",
    display_name: "Team Lab",
    status: "installed",
    icon: "🧬",
    description: "Distributed AI coding swarm. Multi-machine, git-based code generation lab."
  }
];

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  ollama_tag: string;
}

export interface HardwareInfo {
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

export interface Message {
  id: number;
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DownloadProgress {
  status: string;
  percent: number;
  downloaded: number;
  total: number;
}

export interface ModuleUpdateInfo {
  module_id: string;
  installed_version: string | null;
  remote_version: string;
  size_bytes: number;
  release_notes: string;
  status: string;
}

export interface UpdateCheckResult {
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
    id: "qwen2.5-coder:14b",
    name: "Qwen 2.5 Coder 14B",
    tier: "Quality",
    size: "9.0 GB",
    minRam: 16,
    minStorage: 60,
    // Real-world tested: 12.4 tok/sec on Apple M1 Pro 16GB — runs well.
    // 32GB+ gives optimal speed (~20+ tok/sec). Unlocked for 16GB+ Apple Silicon.
    desc: "Best quality local model. Tested at 12.4 tok/sec on Apple M1 Pro 16GB. Ideal for 32GB+ systems — fully usable on 16GB Apple Silicon."
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    tier: "Quality / Balanced",
    size: "4.7 GB",
    minRam: 16,
    minStorage: 30,
    // Real-world tested: 24.3 tok/sec on Apple M1 Pro 16GB — smooth and fast.
    desc: "High quality code-optimised model. Tested at 24.3 tok/sec on Apple M1 Pro 16GB. Great balance of quality and speed for 16GB+ Apple Silicon."
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
    minRam: 8,
    minStorage: 30,
    // Real-world tested: 33.9 tok/sec on Apple M1 Pro 16GB — fast and responsive.
    desc: "Excellent balanced model. Tested at 33.9 tok/sec on Apple M1 Pro 16GB. Fast and responsive. Works on 8GB+ systems."
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    tier: "Balanced / Fast",
    size: "2.0 GB",
    minRam: 4,
    minStorage: 10,
    // Real-world tested: 45.5 tok/sec on Apple M1 Pro 16GB — extremely fast.
    desc: "Ultra-fast lightweight model. Tested at 45.5 tok/sec on Apple M1 Pro 16GB. Instant responses. Works great on any system with 4GB+ RAM."
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

export default function App() {
  const {
    messages, setMessages,
    input, setInput,
    streaming, setStreaming,
    bottomRef,
    abortRef,
    inputRef,
    initialTextRef,
    speakText,
    autoSaveChat,
  } = useChat();

  const {
    phase, setPhase,
    localModels, setLocalModels,
    selectedOnboardingModelId, setSelectedOnboardingModelId,
    hardware, setHardware,
    dlProgress, setDlProgress,
    engineSetupStatus,
    engineSetupProgress,
    engineSetupAttempt,
    engineSetupError,
    handleStartEngineSetup,
  } = useEngine(bootSequence);
  const {
    conversations,
    activeConversationId, setActiveConversationId,
    editingRenameId,
    renameValue, setRenameValue,
    renameInputRef,
    showHistory, setShowHistory,
    loadConversationsList,
    handleRenameStart, handleRenameSubmit, handleRenameCancel,
  } = useConversations();
  const [error,            setError]            = useState<string>("");
  const [serverPort,       setServerPort]       = useState<number>(11434);
  const [showSupport,      setShowSupport]      = useState<boolean>(false);
  const [activeModule,     setActiveModule]     = useState<string>("chat");
  const [showModulesDrawer, setShowModulesDrawer] = useState<boolean>(false);
  const [dynamicComponents, setDynamicComponents] = useState<Record<string, React.ComponentType<any>>>({});
  const [searchLogs,        setSearchLogs]        = useState<string[]>([]);
  const [isSearching,       setIsSearching]       = useState<boolean>(false);
  const searchLogRef = useRef<string[]>([]);

  // Settings and Switcher States
  const {
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
  } = useSettings();

  const [isPro, setIsPro] = useState<boolean>(() => localStorage.getItem("vera_is_pro") === "true");
  const {
    switchingModelId, setSwitchingModelId,
    switchingPhase, setSwitchingPhase,
    switchingDlProgress, setSwitchingDlProgress,
    lastBenchmarkTps, setLastBenchmarkTps,
    alternativeModelCached, setAlternativeModelCached,
    runningManualBenchmark, setRunningManualBenchmark,
  } = useSwitching();

  const pendingUpdateRef = useRef<{ version: string; path: string } | null>(null);
  const allowCloseRef = useRef<boolean>(false);

  const [showFallbackReport, setShowFallbackReport] = useState(false);
  const [fallbackReportText, setFallbackReportText] = useState('');

  // Voice Input (Speech to Text) Logic
  const speech = useSpeechRecognition({
    onResult: (transcript) => {
      if (audioModeRef.current) {
        // Audio mode: each new mic session starts fresh — just replace with live transcript
        setInput(transcript);
      } else {
        // Text-hybrid mode: preserve any text the user typed before clicking mic
        const base = initialTextRef.current;
        const space = base && !base.endsWith(" ") ? " " : "";
        setInput(base + space + transcript);
      }
    },
    onError: (err) => {
      console.error("Speech Recognition Error in Main Chat:", err);
    }
  });

  const { audioMode, setAudioMode, audioModeRef } = useAudio();

  const toggleSpeech = () => {
    if (audioModeRef.current) {
      setAudioMode(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      speech.stop();
    } else {
      setAudioMode(true);
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
    window.registerVeraModule("team-lab", TeamLab);

    // Listen for real-time search progress from ProMailer lead finder
    let unlistenSearch: (() => void) | undefined;
    (async () => {
      unlistenSearch = await listen<string>("search_log", (event) => {
        const msg = event.payload;
        setIsSearching(true);
        searchLogRef.current = [...searchLogRef.current.slice(-19), msg];
        setSearchLogs([...searchLogRef.current]);
        if (msg.includes("Complete") || msg.includes("found")) {
          setTimeout(() => {
            setIsSearching(false);
            searchLogRef.current = [];
            setSearchLogs([]);
          }, 3000);
        }
      });
    })();

    return () => {
      abortRef.current?.abort();
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      if (unlistenSearch) unlistenSearch();
    };
  }, []);

  // Load module bundles dynamically from local files if needed
  useEffect(() => {
    if (activeModule !== 'chat' && !dynamicComponents[activeModule]) {
      console.log(`[VERA] Attempting to dynamically load bundle for module: ${activeModule}`);
      invoke<string>("get_module_bundle", { moduleId: activeModule })
        .then((jsCode) => {
          try {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.text = jsCode;
            document.head.appendChild(script);
            console.log(`[VERA] Dynamically evaluated bundle for module: ${activeModule}`);
          } catch (err) {
            console.error(`[VERA] Failed to evaluate bundle for module: ${activeModule}`, err);
          }
        })
        .catch((err) => {
          console.error(`[VERA] Failed to load bundle for module: ${activeModule}`, err);
        });
    }
  }, [activeModule, dynamicComponents]);

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

  interface ModelInfo {
    id: string; display_name: string; quantization: string; size_gb: number;
    family: string | null; parameter_count: string | null;
    context_length: number | null; template: string | null;
  }

  // Check which models are cached in Ollama
  const checkAllModelsCache = async () => {
    try {
      const installed = await invoke<ModelInfo[]>("list_installed_models");
      const modelIds = installed.map(m => typeof m === 'string' ? m : (m as any).id ?? '');
      setLocalModels(modelIds);
      
      // Pre-select a local model matching hardware recommendation
      if (modelIds.length > 0 && hardware) {
        const hwPrefix = hardware.model.id.split(':')[0];
        const match = modelIds.find(m => m.startsWith(hwPrefix));
        // Use matching installed, first installed, or default hardware ID
        const selected = match || modelIds[0] || hardware.model.id;
        setSelectedOnboardingModelId(selected);
      }

      const cachedMap: Record<string, boolean> = {};
      for (const m of MODELS_LIST) {
        const isLocal = modelIds.includes(m.id) ||
          modelIds.some(local => local.startsWith(m.id + ":") || m.id.startsWith(local + ":"));
        cachedMap[m.id] = isLocal;
      }
      setAlternativeModelCached(cachedMap);
    } catch (err) {
      console.error("Error checking cache via list_installed_models:", err);
      const cachedMap: Record<string, boolean> = {};
      for (const m of MODELS_LIST) {
        cachedMap[m.id] = false;
      }
      setAlternativeModelCached(cachedMap);
    }
  };

  const checkOllamaHealth = async () => {
    try {
      const health = await invoke<{ running: boolean; version: string | null }>("ollama_health_check") as any;
      if (health.running) {
        setOllamaStatus("ready");
        // Populates localModels list asynchronously when health becomes ready
        checkAllModelsCache();
      } else {
        setOllamaStatus("not_running");
      }
    } catch (e) {
      setOllamaStatus("not_running");
    }
  };

  useEffect(() => {
    if (phase === PHASE.MODEL_SELECTION) {
      checkOllamaHealth();
    }
  }, [phase]);

  useEffect(() => {
    let unlisten: any = null;
    const setupListener = async () => {
      unlisten = await listen("models_updated", () => {
        checkAllModelsCache();
      });
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

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
    if (targetModel) {
      if (hardware && hardware.ram_gb < targetModel.minRam) {
        const confirmed = await confirm(
          `${targetModel.name} requires at least ${targetModel.minRam} GB RAM. Your system has ${hardware.ram_gb} GB RAM.\n\nRunning this model may cause severe lag or Out of Memory (OOM) errors. Do you want to proceed anyway?`,
          { title: 'Warning', kind: 'warning' }
        );
        if (!confirmed) return;
      }

      if (hardware && hardware.free_storage_gb < targetModel.minStorage) {
        alert(`❌ Error: Insufficient storage. ${targetModel.name} requires ~${targetModel.minStorage} GB free space, but you only have ${hardware.free_storage_gb} GB.`);
        return;
      }
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

      // Reset frontend chat states to clear mismatched tokenizer contexts
      setMessages([]);
      setActiveConversationId(null);

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
    const confirmed = await confirm(
      "This will permanently delete all your task lists, notes, and local app configuration. This action cannot be undone.\n\nAre you sure you want to perform a Factory Reset?",
      { title: 'Factory Reset', kind: 'warning' }
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
        const catalogEntry = MODELS_LIST.find(m => m.id === overrideModelId);
        hw.model.id = overrideModelId;
        hw.model.name = catalogEntry?.name || overrideModelId;
        // Per-model description from the same catalog the selection UI uses —
        // otherwise the Rust recommended-default description is shown instead.
        hw.model.description = catalogEntry?.desc || `Custom model: ${overrideModelId}`;
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
        const installed = await invoke<ModelInfo[]>("list_installed_models");
        const modelIds = installed.map(m => typeof m === 'string' ? m : (m as any).id ?? '');
        setLocalModels(modelIds);
        const isLocal = modelIds.includes(overrideModelId) ||
          modelIds.some(m => m.startsWith(overrideModelId + ":") || overrideModelId.startsWith(m + ":"));
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

            if (hw.model.id === "qwen2.5-coder:14b") {
              lighterModelId = "qwen2.5-coder:7b";
              lighterModelName = "Qwen 2.5 Coder 7B";
            } else if (hw.model.id === "qwen2.5-coder:7b" || hw.model.id === "llama3.1:8b" || hw.model.id === "mistral") {
              lighterModelId = "llama3.2:3b";
              lighterModelName = "Llama 3.2 3B";
            } else if (hw.model.id === "llama3.2:3b") {
              lighterModelId = "phi3:mini";
              lighterModelName = "Phi-3 Mini";
            }

            if (lighterModelId) {
              const confirmSwap = await confirm(
                `Recommended model runs at ${res.tokens_per_sec.toFixed(1)} tokens/sec (below target 3.0 threshold).\n\nWould you like VERA to automatically swap and download the lighter model (${lighterModelName}) for optimal performance?`,
                { title: 'Speed Test', kind: 'info' }
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

  const selectConversation = async (id: string) => {
    if (streaming) abortRef.current?.abort();
    setStreaming(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setMessages([]);
    setActiveConversationId(null);
    inputRef.current?.focus();
  };

  const handleDeleteConversation = async (id: string) => {
    const confirmed = await confirm("Are you sure you want to delete this conversation?", { title: 'Delete', kind: 'warning' });
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

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || streaming) return;

    if (speech.isListening) {
      speech.stop();
    }

    setInput("");
    initialTextRef.current = "";
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

      const modelId = hardware?.model?.id ?? "llama3.2:3b";
      const chatUrl = `http://127.0.0.1:${serverPort}/v1/chat/completions`;
      const requestBody = {
        model:       modelId,
        messages:    history,
        stream:      true,
        temperature: 0.7,
        max_tokens:  2048,
      };
      logChat(`sending to ${chatUrl} model=${modelId} origin=${window.location.origin}`);

      // Retry up to 3 times with backoff on connection-level failures, so a
      // single transient refusal (e.g. daemon still starting) isn't fatal.
      let response: Response | null = null;
      let lastError: any = null;
      for (let attempt = 0; attempt < 3 && response === null; attempt++) {
        try {
          response = await fetch(chatUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ctrl.signal,
            body: JSON.stringify(requestBody),
          });
        } catch (fetchErr: any) {
          lastError = fetchErr;
          if (fetchErr.name === "AbortError") throw fetchErr;
          if (attempt < 2) {
            const waitMs = 750 * (attempt + 1);
            logChat(`request attempt ${attempt + 1} failed (${fetchErr.message}), retrying in ${waitMs}ms`);
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      }
      if (!response) throw lastError || new Error("Request failed");

      if (!response.ok) {
        // Capture the real Ollama error body instead of a bare status.
        let bodyDetail = "";
        try { bodyDetail = (await response.text()).slice(0, 300); } catch { /* ignore */ }
        logChat(`HTTP ${response.status} for model=${modelId}: ${bodyDetail}`);
        throw new Error(`Server error: ${response.status} ${bodyDetail}`);
      }

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
      await autoSaveChat(activeConversationId, updatedMessages, text, setActiveConversationId, loadConversationsList);

      // If audio mode is on, speak the response then re-arm the mic
      if (audioModeRef.current && assistantResponse) {
        setStreaming(false);
        speakText(assistantResponse, () => {
          if (audioModeRef.current) {
            initialTextRef.current = "";
            speech.start();
          }
        });
        inputRef.current?.focus();
        return; // skip the finally setStreaming(false) duplicate — already done
      }

    } catch (e: any) {
      if (e.name !== "AbortError") {
        const msg = String(e?.message ?? e ?? "Unknown error");
        const isConnFailure =
          msg.includes("Failed to fetch") ||
          msg.includes("fetch failed") ||
          msg.includes("NetworkError") ||
          msg.includes("connection") ||
          msg.includes("ECONNREFUSED");
        logChat(`error: ${msg}`);
        // Diagnostic: compare the requested model against what is actually
        // installed so the next reproduction tells us definitively whether the
        // request model matches the downloaded model list.
        try {
          const installed = await invoke<ModelInfo[]>("list_installed_models");
          const installedIds = installed.map(m => typeof m === 'string' ? m : (m as any).id ?? '');
          const requested = hardware?.model?.id ?? "llama3.2:3b";
          logChat(`requested model="${requested}" installed=[${installedIds.join(", ")}] match=${installedIds.some(i => i === requested || i.startsWith(requested + ":") || requested.startsWith(i + ":"))}`);
        } catch (diagErr) {
          logChat(`verbose diagnostic fail: ${diagErr}`);
        }
        // Surface the real failure (e.g. 404 model not found, 403 CORS) so
        // it's diagnosable from the UI instead of a generic catch-all.
        const errorMsg = isConnFailure
          ? "⚠ Connection to local inference server lost. Please restart."
          : `⚠ ${msg}`;
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
        await autoSaveChat(activeConversationId, updatedMessages, text, setActiveConversationId, loadConversationsList);
      }
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, messages, streaming, serverPort, hardware, activeModule, speech, activeConversationId, audioMode, speakText]);

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
          <img src={veraLogo} alt="LexSort VERA" className="boot-logo-img" />
        </div>
        <p className="boot-product">LexSort <span className="boot-product-sub">VERA</span></p>

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

            {/* Ollama Health Status Warning */}
            {ollamaStatus === "not_running" && (
              <div className="capacity-warning warning-label error-label" style={{ marginBottom: "16px", padding: "12px", background: "rgba(235, 87, 87, 0.1)", border: "1px solid var(--red)", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "13px" }}>🚫 <strong>Ollama Daemon not running:</strong> Start Ollama on your system or download it from <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>Ollama.com</a>.</span>
                  <button onClick={checkOllamaHealth} className="hdr-btn" style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}>
                    🔄 Retry
                  </button>
                </div>
              </div>
            )}

            {/* Model Selection List */}
            <div className="onboarding-model-selector">
              {/* Local Models Section (if any detected) */}
              {(() => {
                const customLocalModels = localModels.filter(tag => {
                  return !MODELS_LIST.some(m => m.id === tag || tag.startsWith(m.id + ":") || m.id.startsWith(tag + ":"));
                });
                if (customLocalModels.length === 0) return null;
                
                return (
                  <div className="onboarding-section">
                    <label className="section-label">Detected Custom Local Models</label>
                    <div className="local-models-list">
                      {customLocalModels.map((modelTag) => {
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
                );
              })()}

              {/* Downloadable Models Dropdown */}
              <div className="onboarding-section">
                <label className="section-label">Download a Recommended Model — Matched to Your {hardware.ram_gb} GB Hardware</label>
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
                    <optgroup label={`✅ Compatible with your ${hardware.ram_gb} GB system`}>
                      {MODELS_LIST.filter(model => model.minRam <= hardware.ram_gb).map((model) => {
                        const isLocal = localModels.includes(model.id) ||
                                        localModels.some(m => m.startsWith(model.id + ":") || model.id.startsWith(m + ":"));
                        return (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.size}){isLocal ? " — Already Local" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                    {MODELS_LIST.some(model => model.minRam > hardware.ram_gb) && (
                      <optgroup label={`⚠️ Needs more RAM than your ${hardware.ram_gb} GB (not recommended)`}>
                        {MODELS_LIST.filter(model => model.minRam > hardware.ram_gb).map((model) => (
                          <option key={model.id} value={model.id} disabled>
                            {model.name} — needs {model.minRam} GB RAM
                          </option>
                        ))}
                      </optgroup>
                    )}
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
              
              const isBlocked = (selectedModel && hardware.ram_gb < selectedModel.minRam && !isLocalSelected) || ollamaStatus === "not_running";
              
              return (
                <div className="onboarding-actions">
                  <button
                    className={`update-btn-active confirm-selection-btn ${isBlocked ? "disabled" : ""}`}
                    disabled={isBlocked}
                    onClick={() => handleConfirmOnboardingModel(selectedOnboardingModelId)}
                  >
                    {isLocalSelected ? "Launch VERA" : "Download & Launch"}
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
            appName={isPro ? "VERA Pro" : "VERA Freeware"}
            diagnosticText={generateDiagnosticText()}
            isPro={isPro}
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
          <img src={veraLogo} alt="LexSort VERA" className="header-logo-img" />
          <div className="header-title-block">
            <span className="header-title">LexSort <span style={{fontWeight:300}}>VERA</span></span>
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
            v{appVersion} {isPro ? "Pro" : "Freeware"}
          </div>
        </aside>

        {showModulesDrawer && (
          <ModuleDrawer
            modulesList={MODULES_LIST}
            activeModule={activeModule}
            isPro={isPro}
            onSelectModule={(modId) => {
              const modObj = MODULES_LIST.find(m => m.id === modId);
              if (!isPro && !modObj?.isFree) {
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
                          onClick={() => editingRenameId !== c.id && selectConversation(c.id)}
                          className={`history-item ${activeConversationId === c.id ? "active" : ""}`}
                        >
                          {editingRenameId === c.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                              <input
                                ref={renameInputRef}
                                className="chat-history-rename-input"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRenameSubmit(c.id);
                                  else if (e.key === 'Escape') handleRenameCancel();
                                }}
                                onBlur={() => handleRenameSubmit(c.id)}
                                autoFocus
                                style={{ flex: 1 }}
                              />
                              <button className="history-action-btn" onClick={() => handleRenameSubmit(c.id)} title="Save">💾</button>
                              <button className="history-action-btn" onClick={handleRenameCancel} title="Cancel">✕</button>
                            </div>
                          ) : (
                            <>
                              <span className="history-item-label">{c.title}</span>
                              <div className="history-actions">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRenameStart(c.id, c.title);
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
                            </>
                          )}
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
                    id="vera-mic-btn"
                    className={`chat-mic-btn${audioMode ? " active" : ""}`}
                    onClick={toggleSpeech}
                    disabled={streaming && !audioMode}
                    title={audioMode ? "Turn off voice mode" : "Turn on voice mode"}
                    type="button"
                    aria-label={audioMode ? "Turn off voice mode" : "Turn on voice mode"}
                    aria-pressed={audioMode}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {audioMode ? (
                        /* Filled mic = audio mode on */
                        <>
                          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="currentColor" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </>
                      ) : (
                        /* Outline mic = off */
                        <>
                          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </>
                      )}
                    </svg>
                  </button>
                )}
                <button
                  className={`send-btn ${streaming ? "sending" : ""}`}
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || streaming}
                  aria-label="Send"
                >
                  {streaming ? <StopIcon /> : <><SendIcon /><span className="send-btn-label">Send</span></>}
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
              {isSearching && searchLogs.length > 0 && (
                <div style={{
                  padding: "6px 16px",
                  background: "var(--bg-surface)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  overflow: "hidden"
                }}>
                  <span className="spinner" style={{
                    width: "10px", height: "10px",
                    border: "2px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    flexShrink: 0
                  }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {searchLogs[searchLogs.length - 1]}
                  </span>
                </div>
              )}
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
          appName={isPro ? "VERA Pro" : "VERA Freeware"}
          diagnosticText={generateDiagnosticText()}
          isPro={isPro}
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

                    {/* Other Installed Local Models */}
                    {(() => {
                      const isPredefined = (tag: string) => {
                        return MODELS_LIST.some(m => m.id === tag || tag.startsWith(m.id + ":") || m.id.startsWith(tag + ":"));
                      };
                      const otherInstalled = localModels.filter(tag => !isPredefined(tag));
                      if (otherInstalled.length === 0) return null;
                      
                      return (
                        <div className="settings-section" style={{ marginTop: "24px" }}>
                          <span className="settings-section-title">Other Installed Local Models</span>
                          <div className="model-list">
                            {otherInstalled.map((tag) => {
                              const isActive = hardware?.model.id === tag;
                              return (
                                <div 
                                  key={tag} 
                                  className={`model-card ${isActive ? "active" : ""}`}
                                  onClick={() => handleSwitchModel(tag)}
                                >
                                  <div className="model-card-left">
                                    <div className="model-card-title-row">
                                      <span className="model-card-name">{tag}</span>
                                      <span className="model-card-badge local" style={{ background: "rgba(62, 207, 106, 0.12)", color: "var(--green)", border: "1px solid rgba(62, 207, 106, 0.25)", padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 600, textTransform: "uppercase" }}>
                                        Local
                                      </span>
                                    </div>
                                    <span className="model-card-desc">Custom local model detected from your system Ollama.</span>
                                  </div>
                                  <div className="model-card-right">
                                    <span className="model-status-badge cached">
                                      Downloaded
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Use Custom Model Tag in Settings */}
                    <div className="settings-section" style={{ marginTop: "24px" }}>
                      <span className="settings-section-title">Use Custom Model Tag</span>
                      <span className="model-card-desc" style={{ display: "block", marginBottom: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                        Enter any valid Ollama model tag (e.g. gemma2:9b or deepseek-coder:6.7b) to download or hot-swap to it.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          className="onboarding-input"
                          placeholder="e.g. gemma2:9b"
                          id="custom-model-settings-input"
                          style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: "8px",
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "var(--text)",
                            fontSize: "13px",
                          }}
                        />
                        <button
                          className="hdr-btn"
                          style={{ border: "1px solid var(--accent)", color: "var(--text)", padding: "10px 16px" }}
                          onClick={() => {
                            const input = document.getElementById("custom-model-settings-input") as HTMLInputElement;
                            if (input && input.value.trim()) {
                              handleSwitchModel(input.value.trim());
                            }
                          }}
                        >
                          Use Model
                        </button>
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

                    {isPro ? (
                      <div className="pro-preview__upgrade" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div className="pro-preview__upgrade-text" style={{ textAlign: "left" }}>
                          <strong style={{ color: "#10b981" }}>✓ VERA Pro Active</strong>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>License Key: Developer Preview active</div>
                        </div>
                        <button 
                          className="hdr-btn" 
                          onClick={() => {
                            setIsPro(false);
                            localStorage.setItem("vera_is_pro", "false");
                          }}
                          style={{ border: "1px solid var(--red)", color: "var(--red)", padding: "6px 12px", borderRadius: "6px", background: "transparent", cursor: "pointer" }}
                        >
                          Deactivate Pro
                        </button>
                      </div>
                    ) : (
                      <div className="pro-preview__upgrade" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", padding: "16px", borderRadius: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "14px", fontWeight: 600 }}>Activate License Key</span>
                          <a 
                            href="https://lexsort.com/vera-pro.html"
                            onClick={(e) => { e.preventDefault(); openExternalUrl("https://lexsort.com/vera-pro.html"); }}
                            style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "underline" }}
                          >
                            Get a Key
                          </a>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            type="text"
                            className="onboarding-input"
                            placeholder="Enter your VERA Pro license key"
                            id="pro-license-key-input"
                            style={{
                              flex: 1,
                              padding: "10px 14px",
                              borderRadius: "8px",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              color: "var(--text)",
                              fontSize: "13px"
                            }}
                          />
                          <button
                            className="hdr-btn"
                            style={{ border: "1px solid var(--accent)", color: "var(--text)", padding: "10px 16px", cursor: "pointer", background: "transparent" }}
                            onClick={() => {
                              const input = document.getElementById("pro-license-key-input") as HTMLInputElement;
                              if (input && input.value.trim()) {
                                setIsPro(true);
                                localStorage.setItem("vera_is_pro", "true");
                              } else {
                                alert("Please enter a license key to activate.");
                              }
                            }}
                          >
                            Activate
                          </button>
                        </div>
                      </div>
                    )}
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
