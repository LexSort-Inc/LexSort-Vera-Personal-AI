import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./app.css";
import veraLogo from "./assets/vera-logo.jpg";
import SupportPanel from "./SupportPanel";
import { UpdateStatusIndicator, UpdateStatus } from "./UpdateStatusIndicator";
import { QuickOrganizer } from "./components/QuickOrganizer";

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
  DOWNLOADING: "downloading",
  BOOTING:     "booting",
  BENCHMARKING: "benchmarking",
  READY:       "ready",
  ERROR:       "error",
};

export default function App() {
  const [phase,            setPhase]            = useState<string>(PHASE.DETECTING);
  const [hardware,         setHardware]         = useState<HardwareInfo | null>(null);
  const [dlProgress,       setDlProgress]       = useState<DownloadProgress>({ status: "", percent: 0, downloaded: 0, total: 0 });
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [input,            setInput]            = useState<string>("");
  const [streaming,        setStreaming]        = useState<boolean>(false);
  const [error,            setError]            = useState<string>("");
  const [serverPort,       setServerPort]       = useState<number>(11434);
  const [showSupport,      setShowSupport]      = useState<boolean>(false);
  const [activeView,       setActiveView]       = useState<"chat" | "organizer">("chat");

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
  const [checkingForUpdates, setCheckingForUpdates] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<"model" | "updates" | "pro">("model");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
      phase: 'idle',
      moduleId: null,
      percent: 0,
      message: '',
      errorDetail: null,
  });

  const [showFallbackReport, setShowFallbackReport] = useState(false);
  const [fallbackReportText, setFallbackReportText] = useState('');

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
        current_core_version: "1.0.0",
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
                  headers: { 'Content-Type': 'application/json' },
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
    return () => {
      abortRef.current?.abort();
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

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
      setPhase(PHASE.DETECTING);
      const hw = await invoke("detect_hardware") as HardwareInfo;

      // Apply local model override if user stepped down previously
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
        
        // Check if the overridden model actually exists cached in Ollama
        try {
          await invoke<string>("download_model", { modelId: overrideModelId });
          hw.model_exists = true;
        } catch {
          hw.model_exists = false;
        }
      }

      setHardware(hw);

      const port = await invoke("get_server_port") as number;

      setServerPort(port);

      // 2. Start inference server (ensures Ollama is active on the local port)
      setPhase(PHASE.BOOTING);
      await invoke("start_inference_server", { modelId: hw.model.id });

      // Give the server a moment to bind before the UI hits it
      await delay(1000);

      // 3. Download model if needed
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

    } catch (e) {
      setError(String(e));
      setPhase(PHASE.ERROR);
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || streaming) return;

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
    const isInModule = activeView === 'organizer';

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
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content || "⚠ Connection to local inference server lost. Please restart.",
            };
          }
          return next;
        });
      }
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, messages, streaming, serverPort, hardware, activeView]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    inputRef.current?.focus();
  };

  // ── Save transcript ────────────────────────────────────────────────────────
  const saveChat = () => {
    if (!messages.length) return;
    const text = messages
      .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `lexsort-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Diagnostics Generator ──────────────────────────────────────────────────
  const generateDiagnosticText = () => {
    return [
      `### VERA Personal AI — Diagnostic Report`,
      `- **VERA Version**: 1.1.0 (Freeware)`,
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
            style={{ borderColor: "var(--accent)", color: "var(--text)", fontWeight: 600 }}
            title="Settings"
          >
            ⚙️ Settings
          </button>
          {messages.length > 0 && activeView === 'chat' && (
            <>
              <button onClick={saveChat}  className="hdr-btn" title="Save transcript">Save</button>
              <button onClick={clearChat} className="hdr-btn hdr-btn-clear" title="Clear chat">Clear</button>
            </>
          )}
        </div>
      </header>

      <div className="app-container" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-item ${activeView === 'chat' ? 'sidebar-item--active' : ''}`}
              onClick={() => setActiveView('chat')}
            >
              <span className="sidebar-icon">💬</span>
              <span className="sidebar-label">VERA Chat</span>
            </button>

            <button
              className={`sidebar-item ${activeView === 'organizer' ? 'sidebar-item--active' : ''}`}
              onClick={() => setActiveView('organizer')}
            >
              <span className="sidebar-icon">📋</span>
              <span className="sidebar-label">Quick Organizer</span>
              <span className="sidebar-item-badge sidebar-item-badge--free">Free</span>
            </button>

            <div className="sidebar-divider" />

            <button 
              className="sidebar-add-modules" 
              onClick={() => { 
                setSettingsTab("pro"); 
                setShowSettings(true); 
              }}
            >
              + Add Modules
            </button>
          </nav>
        </aside>

        {/* Viewport */}
        <div className="viewport" style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {activeView === 'chat' && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
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
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Vera..."
                  rows={1}
                  disabled={streaming}
                />
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
          )}

          {activeView === 'organizer' && (
            <QuickOrganizer 
              activeModel={hardware?.model?.id || "llama3.2:3b"}
              serverPort={serverPort}
            />
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
                  >
                    Updates
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
                                  <button className="update-btn-disabled" disabled>
                                    {updateCheckResult.core_update_available ? "Update Core" : "Up to date"}
                                  </button>
                                  <div className="tooltip-box">Coming soon — update system in progress</div>
                                </div>
                              </div>
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
                        <strong>VERA Pro</strong> — one-time purchase, no subscription.
                      </div>
                      <a
                        href="https://lexsort.com/vera-pro"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pro-preview__upgrade-btn"
                      >
                        Upgrade to Pro — $49
                      </a>
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
