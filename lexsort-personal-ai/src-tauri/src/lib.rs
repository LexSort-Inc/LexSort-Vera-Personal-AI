use tauri::{AppHandle, Emitter, State};
use std::sync::Mutex;
use std::process::{Child, Command};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sysinfo::{System, Disks};
pub mod quick_organizer;

pub struct ServerProcess(pub Mutex<Option<Child>>);

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ollama_tag: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BenchmarkResult {
    pub model_id: String,
    pub tokens_generated: u32,
    pub elapsed_secs: f64,
    pub tokens_per_sec: f64,
    pub first_token_ms: u128,   // time-to-first-token, useful for UX feel
    pub passed: bool,           // true if tokens_per_sec >= 3.0
    pub threshold_tokens_per_sec: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub platform: String,
    pub ram_gb: f64,
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub allocation_ceiling_bytes: u64,
    pub cpu_cores: u32,
    pub apple_chip: Option<String>,
    pub unified_memory: bool,
    pub free_storage_gb: u64,
    pub has_nvidia_gpu: bool,
    pub model: ModelInfo,
    pub model_exists: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteCoreEntry {
    pub version: String,
    pub min_os: std::collections::HashMap<String, String>,
    pub release_notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteCoreManifest {
    pub freeware: RemoteCoreEntry,
    pub pro: RemoteCoreEntry,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteModuleEntry {
    pub version: String,
    pub min_pro_version: String,
    pub size_bytes: u64,
    pub release_notes: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteManifest {
    pub manifest_version: String,
    pub generated_at: String,
    pub core: RemoteCoreManifest,
    pub modules: std::collections::HashMap<String, RemoteModuleEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledModuleEntry {
    pub version: String,
    pub status: String,
    pub installed_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledRegistry {
    pub edition: String,
    pub core_version: String,
    pub installed_at: String,
    pub modules: std::collections::HashMap<String, InstalledModuleEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModuleUpdateInfo {
    pub module_id: String,
    pub installed_version: Option<String>,
    pub remote_version: String,
    pub size_bytes: u64,
    pub release_notes: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateCheckResult {
    pub success: bool,
    pub error: Option<String>,
    pub core_update_available: bool,
    pub current_core_version: String,
    pub remote_core_version: String,
    pub core_release_notes: Option<String>,
    pub modules: Vec<ModuleUpdateInfo>,
}

pub fn lexsort_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lexsort")
}

pub fn installed_registry_path() -> PathBuf {
    lexsort_dir().join("installed.json")
}

pub fn module_dir(module_id: &str) -> PathBuf {
    lexsort_dir().join("modules").join(module_id)
}

pub fn data_dir() -> PathBuf {
    lexsort_dir().join("data")
}

fn is_newer_version(current: &str, remote: &str) -> bool {
    let current_parts: Vec<&str> = current.split('.').collect();
    let remote_parts: Vec<&str> = remote.split('.').collect();

    for i in 0..std::cmp::max(current_parts.len(), remote_parts.len()) {
        let curr_val = current_parts.get(i).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
        let rem_val = remote_parts.get(i).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
        if rem_val > curr_val {
            return true;
        } else if curr_val > rem_val {
            return false;
        }
    }
    false
}

fn ensure_lexsort_dirs(edition: &str) -> Result<(), String> {
    let base = lexsort_dir();
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("modules")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("data")).map_err(|e| e.to_string())?;

    let module_ids = vec!["promailer", "organizer", "taxmate", "guardian_watch"];
    for id in &module_ids {
        std::fs::create_dir_all(base.join("modules").join(id).join("current")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(base.join("modules").join(id).join("backup")).map_err(|e| e.to_string())?;
    }

    std::fs::create_dir_all(base.join("data").join("chat_history")).map_err(|e| e.to_string())?;
    if edition == "pro" {
        for id in &module_ids {
            std::fs::create_dir_all(base.join("data").join(*id)).map_err(|e| e.to_string())?;
        }
    }

    let registry_path = installed_registry_path();
    if !registry_path.exists() {
        let registry = InstalledRegistry {
            edition: edition.to_string(),
            core_version: env!("CARGO_PKG_VERSION").to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            modules: std::collections::HashMap::new(),
        };
        let json = serde_json::to_string_pretty(&registry).map_err(|e| e.to_string())?;
        std::fs::write(registry_path, json).map_err(|e| e.to_string())?;
    } else {
        if let Ok(content) = std::fs::read_to_string(&registry_path) {
            if let Ok(mut reg) = serde_json::from_str::<InstalledRegistry>(&content) {
                let current_version = env!("CARGO_PKG_VERSION").to_string();
                let mut changed = false;
                if reg.core_version != current_version {
                    reg.core_version = current_version;
                    changed = true;
                }
                if reg.edition != edition {
                    reg.edition = edition.to_string();
                    changed = true;
                }
                if changed {
                    if let Ok(json) = serde_json::to_string_pretty(&reg) {
                        let _ = std::fs::write(&registry_path, json);
                    }
                }
            }
        }
    }

    Ok(())
}

fn get_free_storage_gb() -> u64 {
    let disks = Disks::new_with_refreshed_list();
    let mut largest_disk_avail: u64 = 0;
    let mut max_total_space: u64 = 0;
    
    for disk in &disks {
        if !disk.is_removable() {
            let total = disk.total_space();
            if total > max_total_space {
                max_total_space = total;
                largest_disk_avail = disk.available_space();
            }
        }
    }
    
    if max_total_space == 0 {
        50
    } else {
        largest_disk_avail / (1024 * 1024 * 1024)
    }
}

fn detect_nvidia_gpu() -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "where nvidia-smi"])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("which")
            .arg("nvidia-smi")
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }
}

fn select_model(
    ram_gb: f64,
    free_storage_gb: u64,
    has_nvidia_gpu: bool,
    is_apple_silicon: bool,
) -> ModelInfo {

    // ── Storage override tier (highest priority, applies before hardware) ──

    if free_storage_gb < 10 {
        return ModelInfo {
            id: "phi3:mini".to_string(),
            name: "Phi-3 Mini".to_string(),
            description: "Ultra-lightweight model — selected due to low available storage (<10 GB). \
                          Free up space to unlock better models.".to_string(),
            ollama_tag: "phi3:mini".to_string(),
        };
    }

    if free_storage_gb < 30 {
        if ram_gb >= 8.0 {
            return ModelInfo {
                id: "llama3.2:3b".to_string(),
                name: "Llama 3.2 3B".to_string(),
                description: "Lightweight 3B model — selected due to limited storage (<30 GB).".to_string(),
                ollama_tag: "llama3.2:3b".to_string(),
            };
        }
        return ModelInfo {
            id: "phi3:mini".to_string(),
            name: "Phi-3 Mini".to_string(),
            description: "Ultra-lightweight model — limited storage and RAM.".to_string(),
            ollama_tag: "phi3:mini".to_string(),
        };
    }

    if free_storage_gb < 60 {
        if ram_gb >= 16.0 {
            return ModelInfo {
                id: "mistral".to_string(),
                name: "Mistral 7B".to_string(),
                description: "Balanced 7B model — moderate storage available (<60 GB).".to_string(),
                ollama_tag: "mistral".to_string(),
            };
        }
        return ModelInfo {
            id: "llama3.2:3b".to_string(),
            name: "Llama 3.2 3B".to_string(),
            description: "Lightweight 3B model — moderate storage and RAM.".to_string(),
            ollama_tag: "llama3.2:3b".to_string(),
        };
    }

    // ── Hardware selection matrix (storage >= 60 GB) ──
    //
    //  Tier        Apple Silicon       NVIDIA GPU          CPU Only
    //  ─────────────────────────────────────────────────────────────
    //  32 GB+      qwen2.5:14b         llama3.1:8b         mistral
    //  16 GB       llama3.1:8b         llama3.1:8b         mistral
    //  8 GB        llama3.2:3b         llama3.2:3b         llama3.2:3b
    //  <8 GB       phi3:mini           phi3:mini           phi3:mini

    if is_apple_silicon {
        if ram_gb >= 32.0 {
            return ModelInfo {
                id: "qwen2.5:14b".to_string(),
                name: "Qwen 2.5 14B".to_string(),
                description: "Maximum quality — 14B model running on Apple Silicon unified memory \
                              with Metal acceleration. (~9 GB)".to_string(),
                ollama_tag: "qwen2.5:14b".to_string(),
            };
        }
        if ram_gb >= 16.0 {
            return ModelInfo {
                id: "llama3.1:8b".to_string(),
                name: "Llama 3.1 8B".to_string(),
                description: "High performance — 8B model with Metal acceleration on Apple Silicon. \
                              (~5 GB)".to_string(),
                ollama_tag: "llama3.1:8b".to_string(),
            };
        }
        if ram_gb >= 8.0 {
            return ModelInfo {
                id: "llama3.2:3b".to_string(),
                name: "Llama 3.2 3B".to_string(),
                description: "Efficient 3B model — optimised for Apple Silicon with 8 GB RAM. \
                              (~2 GB)".to_string(),
                ollama_tag: "llama3.2:3b".to_string(),
            };
        }
        return ModelInfo {
            id: "phi3:mini".to_string(),
            name: "Phi-3 Mini".to_string(),
            description: "Ultra-lightweight model for low-RAM Apple Silicon systems.".to_string(),
            ollama_tag: "phi3:mini".to_string(),
        };
    }

    if has_nvidia_gpu {
        if ram_gb >= 16.0 {
            // Cap at 8B regardless of RAM — consumer GPU VRAM (8-12 GB) is
            // the real bottleneck, not system RAM. 70B/32B would OOM.
            return ModelInfo {
                id: "llama3.1:8b".to_string(),
                name: "Llama 3.1 8B".to_string(),
                description: "High performance — 8B model with CUDA acceleration. (~5 GB)".to_string(),
                ollama_tag: "llama3.1:8b".to_string(),
            };
        }
        if ram_gb >= 8.0 {
            return ModelInfo {
                id: "llama3.2:3b".to_string(),
                name: "Llama 3.2 3B".to_string(),
                description: "Efficient 3B model with CUDA acceleration. (~2 GB)".to_string(),
                ollama_tag: "llama3.2:3b".to_string(),
            };
        }
        return ModelInfo {
            id: "phi3:mini".to_string(),
            name: "Phi-3 Mini".to_string(),
            description: "Ultra-lightweight model for low-RAM GPU systems.".to_string(),
            ollama_tag: "phi3:mini".to_string(),
        };
    }

    // CPU only
    if ram_gb >= 16.0 {
        return ModelInfo {
            id: "mistral".to_string(),
            name: "Mistral 7B".to_string(),
            description: "Solid 7B model for CPU-only inference on 16 GB+ RAM. (~4.5 GB)".to_string(),
            ollama_tag: "mistral".to_string(),
        };
    }
    if ram_gb >= 8.0 {
        return ModelInfo {
            id: "llama3.2:3b".to_string(),
            name: "Llama 3.2 3B".to_string(),
            description: "Lightweight 3B model optimised for CPU inference on 8 GB RAM. (~2 GB)".to_string(),
            ollama_tag: "llama3.2:3b".to_string(),
        };
    }
    ModelInfo {
        id: "phi3:mini".to_string(),
        name: "Phi-3 Mini".to_string(),
        description: "Ultra-lightweight model for low-spec CPU systems. (~1.5 GB)".to_string(),
        ollama_tag: "phi3:mini".to_string(),
    }
}

/// Resolve the absolute path to the ollama binary in a cross-platform way.
fn ollama_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local_app_data).join("Programs").join("Ollama").join("ollama.exe");
            if p.exists() {
                return p;
            }
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            let p = PathBuf::from(program_files).join("Ollama").join("ollama.exe");
            if p.exists() {
                return p;
            }
        }
        PathBuf::from("ollama.exe")
    }

    #[cfg(not(target_os = "windows"))]
    {
        let candidates = [
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            "/usr/bin/ollama",
            "/bin/ollama",
        ];
        for p in &candidates {
            let path = PathBuf::from(p);
            if path.exists() {
                return path;
            }
        }
        PathBuf::from("ollama")
    }
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn detect_hardware(_app: AppHandle) -> Result<HardwareInfo, String> {
        let platform = std::env::consts::OS.to_string();

        let mut sys = System::new_all();
        sys.refresh_all();

        let total = sys.total_memory();
        let cores = sys.cpus().len() as u32;

        let cpu_brand = if !sys.cpus().is_empty() {
            sys.cpus()[0].brand().trim().to_string()
        } else {
            "".to_string()
        };

        let apple_chip = if platform == "macos" && cpu_brand.contains("Apple") {
            Some(cpu_brand.clone())
        } else {
            None
        };

        let unified = apple_chip.is_some();
        let available = (total as f64 * 0.6) as u64;
        let ceiling = (available as f64 * 0.70) as u64;
        let ram_gb = (total as f64 / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;

        let free_storage_gb = get_free_storage_gb();
        let has_nvidia_gpu = detect_nvidia_gpu();
        let model = select_model(ram_gb, free_storage_gb, has_nvidia_gpu, unified);

        let model_exists = if model.id.is_empty() {
            false
        } else {
            Command::new(ollama_path())
                .args(["show", &model.id])
                .output()
                .map(|out| out.status.success())
                .unwrap_or(false)
        };

        Ok(HardwareInfo {
            platform,
            ram_gb,
            total_memory_bytes: total,
            available_memory_bytes: available,
            allocation_ceiling_bytes: ceiling,
            cpu_cores: cores,
            apple_chip,
            unified_memory: unified,
            free_storage_gb,
            has_nvidia_gpu,
            model,
            model_exists,
        })
    }

    #[tauri::command]
    pub async fn download_model(
        model_id: String,
        app: AppHandle,
    ) -> Result<String, String> {
        use futures_util::StreamExt;

        // Check if model already exists
        let check = Command::new(ollama_path())
            .args(["show", &model_id])
            .output();
        if let Ok(out) = check {
            if out.status.success() {
                let _ = app.emit("download_progress", serde_json::json!({
                    "status": "success",
                    "percent": 100.0,
                    "downloaded": 100,
                    "total": 100
                }));
                return Ok(format!("Model {} already cached", model_id));
            }
        }

        let client = reqwest::Client::new();
        let res = client.post("http://127.0.0.1:11434/api/pull")
            .json(&serde_json::json!({ "name": model_id }))
            .send()
            .await
            .map_err(|e| format!("Failed to send pull request to Ollama: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("Ollama pull failed with status: {}", res.status()));
        }

        let mut stream = res.bytes_stream();
        let mut buffer = Vec::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Error reading stream chunk: {}", e))?;
            buffer.extend_from_slice(&chunk);

            // Process complete lines in buffer
            while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.drain(..=pos).collect::<Vec<u8>>();
                let line_str = String::from_utf8_lossy(&line_bytes);
                let line_trimmed = line_str.trim();
                if line_trimmed.is_empty() {
                    continue;
                }

                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line_trimmed) {
                    let status = json.get("status").and_then(|v| v.as_str()).unwrap_or("");
                    let completed = json.get("completed").and_then(|v| v.as_u64()).unwrap_or(0);
                    let total = json.get("total").and_then(|v| v.as_u64()).unwrap_or(0);

                    let percent = if total > 0 {
                        (completed as f64 / total as f64) * 100.0
                    } else if status == "success" {
                        100.0
                    } else {
                        0.0
                    };

                    let payload = serde_json::json!({
                        "status": status,
                        "percent": percent,
                        "downloaded": completed,
                        "total": total,
                    });

                    let _ = app.emit("download_progress", payload);
                }
            }
        }

        Ok(format!("Model {} downloaded successfully", model_id))
    }

    #[tauri::command]
    pub fn start_inference_server(
        server: State<'_, ServerProcess>,
        model_id: String,
    ) -> Result<String, String> {
        let port: u16 = 11434;
        let mut guard = server.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok("Server already running".to_string());
        }
        // Check if ollama is already running on port 11434
        let check = Command::new(ollama_path())
            .args(["list"])
            .output();
        if check.is_ok() {
            *guard = None; // ollama already running externally, don't manage it
            return Ok(format!("Ollama already running, using model {}", model_id));
        }
        let child = Command::new(ollama_path())
            .args(["serve"])
            .env("OLLAMA_HOST", format!("127.0.0.1:{}", port))
            .env("OLLAMA_ORIGINS", format!("http://127.0.0.1:{}", port))
            .spawn()
            .map_err(|e| format!("Failed to start ollama: {}", e))?;
        *guard = Some(child);
        Ok(format!("Inference server started with model {}", model_id))
    }

    #[tauri::command]
    pub fn stop_inference_server(server: State<'_, ServerProcess>) -> Result<String, String> {
        let mut guard = server.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            child.kill().map_err(|e| e.to_string())?;
            Ok("Inference server stopped".to_string())
        } else {
            Ok("No server running".to_string())
        }
    }

    #[tauri::command]
    pub fn get_server_port() -> u16 {
        11434
    }

    #[tauri::command]
    pub async fn benchmark_model(
        model_id: String,
        app: AppHandle,
    ) -> Result<BenchmarkResult, String> {
        use std::time::Instant;

        const BENCHMARK_PROMPT: &str =
            "Describe the water cycle in exactly three sentences.";
        const MAX_TOKENS: u32 = 50;
        const MIN_TOKENS_PER_SEC: f64 = 3.0;

        // Emit "starting" so the UI can show a spinner immediately
        let _ = app.emit(
            "benchmark_status",
            serde_json::json!({ "phase": "starting", "model_id": model_id }),
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        let body = serde_json::json!({
            "model": model_id,
            "prompt": BENCHMARK_PROMPT,
            "stream": true,
            "options": {
                "num_predict": MAX_TOKENS,
                "temperature": 0.1  // low temperature = stable, reproducible timing
            }
        });

        let start = Instant::now();

        let response = client
            .post("http://127.0.0.1:11434/api/generate")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Benchmark request failed — is Ollama running? ({})", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Ollama returned HTTP {} during benchmark",
                response.status()
            ));
        }

        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut buffer = Vec::new();
        let mut token_count: u32 = 0;
        let mut first_token_ms: Option<u128> = None;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Stream read error: {}", e))?;
            buffer.extend_from_slice(&chunk);

            while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes: Vec<u8> = buffer.drain(..=pos).collect();
                let line = String::from_utf8_lossy(&line_bytes);
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    // Each streaming chunk contains one generated token in "response"
                    let has_token = json
                        .get("response")
                        .and_then(|v| v.as_str())
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);

                    if has_token {
                        if first_token_ms.is_none() {
                            first_token_ms = Some(start.elapsed().as_millis());
                        }
                        token_count += 1;
                    }

                    let done = json
                        .get("done")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if done {
                        break;
                    }
                }
            }
        }

        let elapsed_secs = start.elapsed().as_secs_f64();

        // Avoid division by zero on very fast machines
        let tokens_per_sec = if elapsed_secs > 0.0 && token_count > 0 {
            token_count as f64 / elapsed_secs
        } else {
            0.0
        };

        let passed = tokens_per_sec >= MIN_TOKENS_PER_SEC;

        let result = BenchmarkResult {
            model_id: model_id.clone(),
            tokens_generated: token_count,
            elapsed_secs: (elapsed_secs * 10.0).round() / 10.0,
            tokens_per_sec: (tokens_per_sec * 10.0).round() / 10.0,
            first_token_ms: first_token_ms.unwrap_or(0),
            passed,
            threshold_tokens_per_sec: MIN_TOKENS_PER_SEC,
        };

        // Emit final result so the frontend can react without polling
        let _ = app.emit("benchmark_result", serde_json::to_value(&result).unwrap());

        Ok(result)
    }

    #[derive(Debug, Serialize, Deserialize, Clone, Default)]
    pub struct AppConfig {
        pub active_model: Option<String>,
        pub last_benchmark_tps: Option<f64>,
        pub module_models: Option<std::collections::HashMap<String, String>>,
        pub module_benchmark_tps: Option<std::collections::HashMap<String, f64>>,
    }

    fn app_config_path() -> PathBuf {
        super::lexsort_dir().join("config.json")
    }

    fn load_app_config() -> AppConfig {
        std::fs::read_to_string(app_config_path())
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save_app_config(config: &AppConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        std::fs::write(app_config_path(), json).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_active_model() -> Option<String> {
        load_app_config().active_model
    }

    #[tauri::command]
    pub fn set_active_model(model_id: String) -> Result<(), String> {
        let mut config = load_app_config();
        config.active_model = Some(model_id);
        save_app_config(&config)
    }

    #[tauri::command]
    pub fn get_last_benchmark() -> Option<f64> {
        load_app_config().last_benchmark_tps
    }

    #[tauri::command]
    pub fn set_last_benchmark(tps: f64) -> Result<(), String> {
        let mut config = load_app_config();
        config.last_benchmark_tps = Some(tps);
        save_app_config(&config)
    }

    #[tauri::command]
    pub fn get_module_model(module_id: String) -> Option<String> {
        load_app_config().module_models.and_then(|m| m.get(&module_id).cloned())
    }

    #[tauri::command]
    pub fn set_module_model(module_id: String, model_id: String) -> Result<(), String> {
        let mut config = load_app_config();
        let mut modules = config.module_models.unwrap_or_default();
        modules.insert(module_id, model_id);
        config.module_models = Some(modules);
        save_app_config(&config)
    }

    #[tauri::command]
    pub fn check_model_exists(model_id: String) -> bool {
        std::process::Command::new(ollama_path())
            .args(["show", &model_id])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }

    #[tauri::command]
    pub fn init_lexsort_dirs(edition: String) -> Result<(), String> {
        super::ensure_lexsort_dirs(&edition)
    }

    #[tauri::command]
    pub fn get_installed_registry() -> Result<super::InstalledRegistry, String> {
        let registry_path = super::installed_registry_path();
        if !registry_path.exists() {
            return Err("Registry not initialized".to_string());
        }
        let content = std::fs::read_to_string(registry_path).map_err(|e| e.to_string())?;
        let registry: super::InstalledRegistry = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(registry)
    }

    #[tauri::command]
    pub async fn check_for_updates(edition: String) -> Result<super::UpdateCheckResult, String> {
        let _ = super::ensure_lexsort_dirs(&edition);

        let local_reg = match get_installed_registry() {
            Ok(reg) => reg,
            Err(e) => {
                return Ok(super::UpdateCheckResult {
                    success: false,
                    error: Some(format!("Failed to load installed registry: {}", e)),
                    core_update_available: false,
                    current_core_version: env!("CARGO_PKG_VERSION").to_string(),
                    remote_core_version: "".to_string(),
                    core_release_notes: None,
                    modules: Vec::new(),
                });
            }
        };

        let current_version = local_reg.core_version.clone();

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build() {
                Ok(c) => c,
                Err(e) => {
                    return Ok(super::UpdateCheckResult {
                        success: false,
                        error: Some(format!("Failed to build client: {}", e)),
                        core_update_available: false,
                        current_core_version: current_version,
                        remote_core_version: "".to_string(),
                        core_release_notes: None,
                        modules: Vec::new(),
                    });
                }
            };

        let url = "https://lexsort.com/api/manifest.json";
        let response = match client.get(url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                return Ok(super::UpdateCheckResult {
                    success: false,
                    error: Some(format!("Network error: {}", e)),
                    core_update_available: false,
                    current_core_version: current_version,
                    remote_core_version: "".to_string(),
                    core_release_notes: None,
                    modules: Vec::new(),
                });
            }
        };

        if !response.status().is_success() {
            return Ok(super::UpdateCheckResult {
                success: false,
                error: Some(format!("Server returned status: {}", response.status())),
                core_update_available: false,
                current_core_version: current_version,
                remote_core_version: "".to_string(),
                core_release_notes: None,
                modules: Vec::new(),
            });
        }

        let remote_manifest: super::RemoteManifest = match response.json().await {
            Ok(m) => m,
            Err(e) => {
                return Ok(super::UpdateCheckResult {
                    success: false,
                    error: Some(format!("Failed to parse remote manifest: {}", e)),
                    core_update_available: false,
                    current_core_version: current_version,
                    remote_core_version: "".to_string(),
                    core_release_notes: None,
                    modules: Vec::new(),
                });
            }
        };

        let remote_core = if edition == "pro" {
            &remote_manifest.core.pro
        } else {
            &remote_manifest.core.freeware
        };

        let core_update_available = super::is_newer_version(&current_version, &remote_core.version);

        let mut module_updates = Vec::new();
        if edition == "pro" {
            for (module_id, remote_mod) in &remote_manifest.modules {
                let installed_mod = local_reg.modules.get(module_id);
                let installed_version = installed_mod.map(|m| m.version.clone());
                
                let is_incompatible = super::is_newer_version(&current_version, &remote_mod.min_pro_version);

                let status = if is_incompatible {
                    "incompatible".to_string()
                } else {
                    match &installed_version {
                        Some(inst_ver) => {
                            if super::is_newer_version(inst_ver, &remote_mod.version) {
                                "update_available".to_string()
                            } else {
                                "up_to_date".to_string()
                            }
                        }
                        None => "not_installed".to_string(),
                    }
                };

                module_updates.push(super::ModuleUpdateInfo {
                    module_id: module_id.clone(),
                    installed_version,
                    remote_version: remote_mod.version.clone(),
                    size_bytes: remote_mod.size_bytes,
                    release_notes: remote_mod.release_notes.clone(),
                    status,
                });
            }
            module_updates.sort_by(|a, b| a.module_id.cmp(&b.module_id));
        }

        Ok(super::UpdateCheckResult {
            success: true,
            error: None,
            core_update_available,
            current_core_version: current_version,
            remote_core_version: remote_core.version.clone(),
            core_release_notes: Some(remote_core.release_notes.clone()),
            modules: module_updates,
        })
    }

    const QUICK_ORGANIZER_DOCS: &str = include_str!("docs/quick_organizer.md");

    #[tauri::command]
    pub fn get_module_docs(module_name: String) -> Result<String, String> {
        let name_lower = module_name.to_lowercase();
        if name_lower == "quick_organizer" || name_lower == "quick-organizer" || name_lower == "organizer" {
            Ok(QUICK_ORGANIZER_DOCS.to_string())
        } else {
            Err(format!("Documentation for module '{}' not found", module_name))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Single-instance lock to prevent concurrent DB lock conflicts
    let _instance_lock = match std::net::TcpListener::bind("127.0.0.1:58737") {
        Ok(listener) => listener,
        Err(_) => {
            eprintln!("[LexSort Personal AI] Another instance of LexSort Personal AI is already running. Exiting.");
            std::process::exit(0);
        }
    };

    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::detect_hardware,
            commands::download_model,
            commands::start_inference_server,
            commands::stop_inference_server,
            commands::get_server_port,
            commands::benchmark_model,
            commands::get_active_model,
            commands::set_active_model,
            commands::get_last_benchmark,
            commands::set_last_benchmark,
            commands::get_module_model,
            commands::set_module_model,
            commands::check_model_exists,
            commands::init_lexsort_dirs,
            commands::get_installed_registry,
            commands::check_for_updates,
            commands::get_module_docs,
            quick_organizer::get_tasks,
            quick_organizer::create_task,
            quick_organizer::update_task,
            quick_organizer::complete_task,
            quick_organizer::delete_task,
            quick_organizer::move_task,
            quick_organizer::cache_ai_breakdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_compare() {
        assert!(is_newer_version("1.0.0", "1.0.1"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("1.0.1", "1.0.0"));
        assert!(is_newer_version("1.0.0", "1.1.0"));
        assert!(!is_newer_version("1.1.0", "1.0.9"));
    }

    #[test]
    fn test_dir_creation() {
        let _ = std::fs::remove_dir_all(lexsort_dir());
        assert!(ensure_lexsort_dirs("pro").is_ok());
        assert!(lexsort_dir().exists());
        assert!(installed_registry_path().exists());
        assert!(lexsort_dir().join("data").join("promailer").exists());
        assert!(lexsort_dir().join("modules").join("promailer").join("current").exists());
        
        let content = std::fs::read_to_string(installed_registry_path()).unwrap();
        let reg: InstalledRegistry = serde_json::from_str(&content).unwrap();
        assert_eq!(reg.core_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(reg.edition, "pro");
    }
}

