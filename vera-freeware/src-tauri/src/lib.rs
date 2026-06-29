use tauri::{AppHandle, Emitter, State};
use std::sync::Mutex;
use std::process::{Child, Command};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sysinfo::{System, Disks};
pub mod quick_organizer;
pub mod calendar_bridge;
pub mod conversations;
pub mod recurrence_parser;
pub mod scheduler;
pub mod team_lab;
pub mod rest_api;

/// Run a command with a wall-clock timeout using Tokio.
/// Returns `Some(output)` if it finished in time and succeeded, else `None`.
async fn run_command_with_timeout(
    mut cmd: tokio::process::Command,
    timeout_secs: u64,
) -> Option<std::process::Output> {
    match tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        cmd.output(),
    )
    .await
    {
        Ok(Ok(out)) if out.status.success() => Some(out),
        _ => None,
    }
}

/// Build a tokio::process::Command that hides the console window on Windows.
fn silent_cmd(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        // tokio::process::Command uses its own CommandExt trait on Windows.
        use tokio::process::windows::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Synchronous variant used where async context is not available.
fn silent_cmd_sync(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

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
    #[serde(default)]
    pub approved_update_version: Option<String>,
    #[serde(default)]
    pub update_downloaded_path: Option<String>,
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
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&base) {
            let mut perms = meta.permissions();
            perms.set_mode(0o700);
            let _ = std::fs::set_permissions(&base, perms);
        }
    }

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
            approved_update_version: None,
            update_downloaded_path: None,
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
                    reg.approved_update_version = None;
                    reg.update_downloaded_path = None;
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
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let path = lexsort_dir();
        let mut path_w: Vec<u16> = path.as_os_str().encode_wide().collect();
        path_w.push(0); // null terminator

        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free_bytes: u64 = 0;

        extern "system" {
            fn GetDiskFreeSpaceExW(
                lpDirectoryName: *const u16,
                lpFreeBytesAvailableToCaller: *mut u64,
                lpTotalNumberOfBytes: *mut u64,
                lpTotalNumberOfFreeBytes: *mut u64,
            ) -> i32;
        }

        let res = unsafe {
            GetDiskFreeSpaceExW(
                path_w.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                &mut total_free_bytes,
            )
        };

        if res != 0 {
            free_bytes / (1024 * 1024 * 1024)
        } else {
            50 // fallback safe default
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
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
}

async fn detect_nvidia_gpu_async() -> bool {
    #[cfg(target_os = "windows")]
    {
        let smi_paths = [
            std::path::Path::new(r"C:\Windows\System32\nvidia-smi.exe"),
            std::path::Path::new(r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe"),
        ];
        for p in &smi_paths {
            if p.exists() {
                return true;
            }
        }
        
        let mut cmd = silent_cmd("nvidia-smi");
        cmd.args(["--query-gpu=name", "--format=csv,noheader"]);
        
        match tokio::time::timeout(std::time::Duration::from_secs(2), cmd.output()).await {
            Ok(Ok(out)) => out.status.success(),
            _ => false,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = silent_cmd("which");
        cmd.arg("nvidia-smi");
        
        match tokio::time::timeout(std::time::Duration::from_secs(2), cmd.output()).await {
            Ok(Ok(out)) => out.status.success(),
            _ => false,
        }
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
    // Check local VERA bin directory first for portable installation
    let local_path = lexsort_dir().join("bin").join(if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" });
    if local_path.exists() {
        return local_path;
    }

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
    pub async fn detect_hardware(_app: AppHandle) -> Result<HardwareInfo, String> {
        let has_nvidia_gpu = detect_nvidia_gpu_async().await;

        // Run in a blocking thread so the async runtime is never starved.
        tokio::task::spawn_blocking(move || {
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
            let model = select_model(ram_gb, free_storage_gb, has_nvidia_gpu, unified);

            // NOTE: We intentionally skip the "ollama show" model-exists check here.
            // That check can take 10-30 s on Windows when Ollama hasn't started yet and
            // causes the "(Not Responding)" loading hang. The frontend boot sequence
            // checks model existence separately via list_installed_models() after
            // the engine is confirmed running.
            let model_exists = false;

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
        })
        .await
        .map_err(|e| format!("Hardware detection task panicked: {}", e))?
    }

    #[tauri::command]
    pub async fn download_model(
        model_id: String,
        app: AppHandle,
    ) -> Result<String, String> {
        use futures_util::StreamExt;
        let resolved = resolve_model_id(&model_id).await;

        // Check if model already exists
        let check = Command::new(ollama_path())
            .args(["show", &resolved])
            .output();
        if let Ok(out) = check {
            if out.status.success() {
                let _ = app.emit("download_progress", serde_json::json!({
                    "status": "success",
                    "percent": 100.0,
                    "downloaded": 100,
                    "total": 100
                }));
                return Ok(format!("Model {} already cached", resolved));
            }
        }

        let client = reqwest::Client::new();
        let res = client.post("http://127.0.0.1:11434/api/pull")
            .json(&serde_json::json!({ "name": resolved }))
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
    pub async fn start_inference_server(
        server: State<'_, ServerProcess>,
        model_id: String,
    ) -> Result<String, String> {
        let resolved = resolve_model_id(&model_id).await;
        let port: u16 = 11434;
        let mut guard = server.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok("Server already running".to_string());
        }
        // Check if ollama is already running on port 11434
        let check = silent_cmd_sync(ollama_path())
            .args(["list"])
            .output();
        if check.is_ok() {
            *guard = None; // ollama already running externally, don't manage it
            return Ok(format!("Ollama already running, using model {}", resolved));
        }
        let child = silent_cmd_sync(ollama_path())
            .args(["serve"])
            .env("OLLAMA_HOST", format!("127.0.0.1:{}", port))
            .env("OLLAMA_ORIGINS", format!("http://127.0.0.1:{}", port))
            .spawn()
            .map_err(|e| format!("Failed to start ollama: {}", e))?;
        *guard = Some(child);
        Ok(format!("Inference server started with model {}", resolved))
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
        let path = app_config_path();
        std::fs::write(&path, json).map_err(|e| e.to_string())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(&path) {
                let mut perms = meta.permissions();
                perms.set_mode(0o600);
                let _ = std::fs::set_permissions(&path, perms);
            }
        }
        Ok(())
    }

    #[tauri::command]
    pub fn get_active_model() -> Option<String> {
        load_app_config().active_model
    }

    #[tauri::command]
    pub async fn set_active_model(model_id: String) -> Result<(), String> {
        let resolved = resolve_model_id(&model_id).await;
        let mut config = load_app_config();
        config.active_model = Some(resolved);
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

    async fn resolve_model_id(model_id: &str) -> String {
        let path = super::ollama_path();
        
        // 1. Try running `ollama show <model_id>`
        let mut cmd = super::silent_cmd(&path);
        cmd.args(["show", model_id]);
        if super::run_command_with_timeout(cmd, 6).await.is_some() {
            return model_id.to_string();
        }

        // 2. If it failed, list all installed models and see if we have a match
        let mut installed = Vec::new();
        let mut cmd_list = super::silent_cmd(&path);
        cmd_list.arg("list");
        if let Some(out) = super::run_command_with_timeout(cmd_list, 6).await {
            let stdout_str = String::from_utf8_lossy(&out.stdout);
            let mut lines = stdout_str.lines();
            let _header = lines.next();
            for line in lines {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if !parts.is_empty() {
                    installed.push(parts[0].to_string());
                }
            }
        }

        // Search in installed
        // A. Match model prefix (e.g. "mistral" matches "mistral:7b-instruct-v0.3-q4_0")
        let prefix = format!("{}:", model_id);
        for m in &installed {
            if m.starts_with(&prefix) {
                return m.clone();
            }
        }

        // B. Match model name prefix before colon (e.g. "qwen2.5:14b" matches "qwen2.5-coder:7b" or similar starting with "qwen2.5")
        if model_id.contains(':') {
            let parts: Vec<&str> = model_id.split(':').collect();
            let main_part = parts[0];
            for m in &installed {
                if m.starts_with(main_part) {
                    return m.clone();
                }
            }
        }

        // C. General fallback matches
        if model_id == "mistral" {
            for m in &installed {
                if m.starts_with("mistral") {
                    return m.clone();
                }
            }
        }

        if model_id.starts_with("qwen2.5") {
            for m in &installed {
                if m.contains("qwen2.5") {
                    return m.clone();
                }
            }
        }

        model_id.to_string()
    }

    #[tauri::command]
    pub async fn check_model_exists(model_id: String) -> bool {
        let resolved = resolve_model_id(&model_id).await;
        let path = super::ollama_path();
        let mut cmd = super::silent_cmd(&path);
        cmd.args(["show", &resolved]);
        super::run_command_with_timeout(cmd, 10)
            .await
            .is_some()
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
    pub fn get_app_version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
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

    fn calculate_sha256(path: &std::path::Path) -> Result<String, String> {
        use sha2::{Sha256, Digest};
        use std::io::Read;

        let mut file = std::fs::File::open(path).map_err(|e| format!("Failed to open file for hashing: {}", e))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 65536];

        loop {
            let n = file.read(&mut buffer).map_err(|e| format!("Failed to read file for hashing: {}", e))?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    #[tauri::command]
    pub async fn check_engine_installed() -> bool {
        let path = super::ollama_path();
        if !path.exists() {
            return false;
        }
        // Use a timeout to avoid hanging on Windows when Defender/UAC inspects the binary.
        let mut cmd = super::silent_cmd(&path);
        cmd.arg("--version");
        super::run_command_with_timeout(cmd, 8)
            .await
            .is_some()
    }

    #[tauri::command]
    pub async fn setup_engine(app: AppHandle) -> Result<(), String> {
        let (url, filename, expected_sha) = match std::env::consts::OS {
            "macos" => (
                "https://github.com/ollama/ollama/releases/download/v0.1.48/Ollama-darwin.zip",
                "Ollama-darwin.zip",
                "56fd727e2c2cd7388bcb3ad10ea50482bf3f326143a18814d0de38cabd7c08dd"
            ),
            "windows" => (
                "https://github.com/ollama/ollama/releases/download/v0.1.48/ollama-windows-amd64.zip",
                "ollama-windows-amd64.zip",
                "a095dce6739c4635e7f4b856c08d1429598d3eae5c632995653f5339e15b5933"
            ),
            "linux" => (
                "https://github.com/ollama/ollama/releases/download/v0.1.48/ollama-linux-amd64",
                "ollama-linux-amd64",
                "7641b21e9d0822ba44e494f5ed3d3796d9e9fcdf4dbb66064f8c34c865bbec0b"
            ),
            os => return Err(format!("Unsupported operating system: {}", os)),
        };

        let downloads_dir = super::lexsort_dir().join("downloads");
        std::fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;
        let archive_path = downloads_dir.join(filename);

        let bin_dir = super::lexsort_dir().join("bin");
        std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
        let target_path = bin_dir.join(if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" });

        tokio::spawn(async move {
            let mut success = false;
            for attempt in 1..=3 {
                let _ = app.emit("engine_setup_progress", serde_json::json!({
                    "status": "downloading",
                    "percent": 0u8,
                    "attempt": attempt
                }));

                let client = match reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(300))
                    .build() {
                        Ok(c) => c,
                        Err(e) => {
                            if attempt == 3 {
                                let _ = app.emit("engine_setup_progress", serde_json::json!({
                                    "status": "error",
                                    "error": format!("Failed to build reqwest client: {}", e)
                                }));
                                return;
                            }
                            continue;
                        }
                    };

                let response = match client.get(url).send().await {
                    Ok(resp) => resp,
                    Err(e) => {
                        if attempt == 3 {
                            let _ = app.emit("engine_setup_progress", serde_json::json!({
                                "status": "error",
                                "error": format!("Failed to connect: {}", e)
                            }));
                            return;
                        }
                        continue;
                    }
                };

                if !response.status().is_success() {
                    if attempt == 3 {
                        let _ = app.emit("engine_setup_progress", serde_json::json!({
                            "status": "error",
                            "error": format!("Server returned status: {}", response.status())
                        }));
                        return;
                    }
                    continue;
                }

                let total_size = response.content_length().unwrap_or(0);
                let mut file = match tokio::fs::File::create(&archive_path).await {
                    Ok(f) => f,
                    Err(e) => {
                        let _ = app.emit("engine_setup_progress", serde_json::json!({
                            "status": "error",
                            "error": format!("Failed to create local file: {}", e)
                        }));
                        return;
                    }
                };

                use tokio::io::AsyncWriteExt;
                let mut stream = response.bytes_stream();
                let mut downloaded = 0u64;
                let mut last_progress = 0u8;
                let mut download_err = false;

                while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
                    let chunk = match chunk_result {
                        Ok(c) => c,
                        Err(_) => {
                            download_err = true;
                            break;
                        }
                    };

                    if let Err(_) = file.write_all(&chunk).await {
                        download_err = true;
                        break;
                    }

                    downloaded += chunk.len() as u64;
                    if total_size > 0 {
                        let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u8;
                        if progress != last_progress && progress % 5 == 0 {
                            last_progress = progress;
                            let _ = app.emit("engine_setup_progress", serde_json::json!({
                                "status": "downloading",
                                "percent": progress,
                                "attempt": attempt
                            }));
                        }
                    }
                }

                if download_err {
                    continue;
                }

                if let Err(_) = file.flush().await {
                    continue;
                }

                // Verify SHA-256
                let _ = app.emit("engine_setup_progress", serde_json::json!({
                    "status": "verifying",
                    "percent": 100u8,
                    "attempt": attempt
                }));

                match calculate_sha256(&archive_path) {
                    Ok(hash) => {
                        if hash == expected_sha {
                            success = true;
                            break;
                        } else {
                            eprintln!("SHA-256 mismatch on attempt {}: expected {}, got {}", attempt, expected_sha, hash);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to calculate hash on attempt {}: {}", attempt, e);
                    }
                }
            }

            if !success {
                let _ = app.emit("engine_setup_progress", serde_json::json!({
                    "status": "error",
                    "error": "Failed to verify signature after 3 attempts."
                }));
                let _ = std::fs::remove_file(&archive_path);
                return;
            }

            let _ = app.emit("engine_setup_progress", serde_json::json!({
                "status": "extracting",
                "percent": 100u8
            }));

            let setup_result = match std::env::consts::OS {
                "macos" => {
                    let extracted_dir = downloads_dir.join("extracted");
                    let _ = std::fs::remove_dir_all(&extracted_dir);
                    let unzip_status = std::process::Command::new("unzip")
                        .args(&["-q", "-o", "-d", extracted_dir.to_str().unwrap(), archive_path.to_str().unwrap()])
                        .status();
                    
                    match unzip_status {
                        Ok(status) if status.success() => {
                            let source_bin = extracted_dir.join("Ollama.app").join("Contents").join("Resources").join("ollama");
                            if source_bin.exists() {
                                if let Err(e) = std::fs::copy(&source_bin, &target_path) {
                                    Err(format!("Failed to copy binary: {}", e))
                                } else {
                                    #[cfg(target_family = "unix")]
                                    {
                                        use std::os::unix::fs::PermissionsExt;
                                        let mut perms = std::fs::metadata(&target_path).unwrap().permissions();
                                        perms.set_mode(0o755);
                                        let _ = std::fs::set_permissions(&target_path, perms);
                                    }
                                    Ok(())
                                }
                            } else {
                                Err("Extracted folder does not match Ollama bundle structure.".to_string())
                            }
                        }
                        Ok(status) => Err(format!("Unzip failed with status: {}", status)),
                        Err(e) => Err(format!("Failed to run unzip: {}", e)),
                    }
                }
                "windows" => {
                    let extracted_dir = downloads_dir.join("extracted");
                    let _ = std::fs::remove_dir_all(&extracted_dir);
                    let ps_status = std::process::Command::new("powershell")
                        .args(&[
                            "-Command",
                            &format!(
                                "Expand-Archive -Force -Path '{}' -DestinationPath '{}'",
                                archive_path.to_str().unwrap(),
                                extracted_dir.to_str().unwrap()
                            )
                        ])
                        .status();

                    match ps_status {
                        Ok(status) if status.success() => {
                            let source_bin = extracted_dir.join("ollama.exe");
                            if source_bin.exists() {
                                if let Err(e) = std::fs::copy(&source_bin, &target_path) {
                                    Err(format!("Failed to copy binary: {}", e))
                                } else {
                                    Ok(())
                                }
                            } else {
                                Err("Extracted contents do not contain ollama.exe.".to_string())
                            }
                        }
                        Ok(status) => Err(format!("Extraction failed: {}", status)),
                        Err(e) => Err(format!("Failed to run extraction command: {}", e)),
                    }
                }
                "linux" => {
                    if let Err(e) = std::fs::copy(&archive_path, &target_path) {
                        Err(format!("Failed to copy binary: {}", e))
                    } else {
                        #[cfg(target_family = "unix")]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let mut perms = std::fs::metadata(&target_path).unwrap().permissions();
                            perms.set_mode(0o755);
                            let _ = std::fs::set_permissions(&target_path, perms);
                        }
                        Ok(())
                    }
                }
                _ => Err("Unsupported OS".to_string()),
            };

            let _ = std::fs::remove_file(&archive_path);
            let _ = std::fs::remove_dir_all(downloads_dir.join("extracted"));
            let _ = std::fs::remove_dir_all(&downloads_dir);

            match setup_result {
                Ok(_) => {
                    let _ = app.emit("engine_setup_progress", serde_json::json!({
                        "status": "completed",
                        "percent": 100u8
                    }));
                }
                Err(e) => {
                    let _ = app.emit("engine_setup_progress", serde_json::json!({
                        "status": "error",
                        "error": e
                    }));
                }
            }
        });

        Ok(())
    }

    fn get_installer_info(version: &str) -> Result<(String, String), String> {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        
        let (filename, _ext) = match os {
            "macos" => {
                let suffix = if arch == "aarch64" { "aarch64" } else { "x64" };
                (format!("LexSort.Personal.AI_{}_{}.dmg", version, suffix), "dmg")
            }
            "windows" => {
                (format!("LexSort.Personal.AI_{}_x64_en-US.msi", version), "msi")
            }
            "linux" => {
                (format!("LexSort.Personal.AI_{}_amd64.AppImage", version), "AppImage")
            }
            _ => return Err(format!("Unsupported operating system: {}", os)),
        };
        
        let url = format!(
            "https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v{}/{}",
            version,
            filename
        );
        
        Ok((filename, url))
    }

    #[tauri::command]
    pub async fn approve_core_update(
        _edition: String,
        version: String,
        app: AppHandle,
    ) -> Result<(), String> {
        let registry_path = super::installed_registry_path();
        if !registry_path.exists() {
            return Err("Registry not initialized".to_string());
        }

        let (filename, url) = get_installer_info(&version)?;

        let content = std::fs::read_to_string(&registry_path).map_err(|e| e.to_string())?;
        let mut registry: super::InstalledRegistry = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        registry.approved_update_version = Some(version.clone());
        registry.update_downloaded_path = None;
        let json = serde_json::to_string_pretty(&registry).map_err(|e| e.to_string())?;
        std::fs::write(&registry_path, json).map_err(|e| e.to_string())?;

        let updates_dir = super::lexsort_dir().join("updates");
        std::fs::create_dir_all(&updates_dir).map_err(|e| e.to_string())?;
        let dest_path = updates_dir.join(&filename);

        tokio::spawn(async move {
            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build() {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = app.emit("core_update_progress", serde_json::json!({
                            "status": "error",
                            "percent": 0.0,
                            "error": format!("Failed to build reqwest client: {}", e)
                        }));
                        return;
                    }
                };

            let response = match client.get(&url).send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let _ = app.emit("core_update_progress", serde_json::json!({
                        "status": "error",
                        "percent": 0.0,
                        "error": format!("Failed to connect: {}", e)
                    }));
                    return;
                }
            };

            if !response.status().is_success() {
                let _ = app.emit("core_update_progress", serde_json::json!({
                    "status": "error",
                    "percent": 0.0,
                    "error": format!("Server returned status: {}", response.status())
                }));
                return;
            }

            let total_size = response.content_length().unwrap_or(0);
            let mut file = match tokio::fs::File::create(&dest_path).await {
                Ok(f) => f,
                Err(e) => {
                    let _ = app.emit("core_update_progress", serde_json::json!({
                        "status": "error",
                        "percent": 0.0,
                        "error": format!("Failed to create local file: {}", e)
                    }));
                    return;
                }
            };

            use tokio::io::AsyncWriteExt;
            let mut stream = response.bytes_stream();
            let mut downloaded = 0u64;
            let mut last_progress = 0u8;

            while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
                let chunk = match chunk_result {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = app.emit("core_update_progress", serde_json::json!({
                            "status": "error",
                            "percent": 0.0,
                            "error": format!("Error reading stream chunk: {}", e)
                        }));
                        return;
                    }
                };

                if let Err(e) = file.write_all(&chunk).await {
                    let _ = app.emit("core_update_progress", serde_json::json!({
                        "status": "error",
                        "percent": 0.0,
                        "error": format!("Failed to write to file: {}", e)
                    }));
                    return;
                }

                downloaded += chunk.len() as u64;
                if total_size > 0 {
                    let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u8;
                    if progress != last_progress && progress % 5 == 0 {
                        last_progress = progress;
                        let _ = app.emit("core_update_progress", serde_json::json!({
                            "percent": progress,
                            "bytes_downloaded": downloaded,
                            "total_bytes": total_size,
                            "status": "downloading"
                        }));
                    }
                }
            }

            if let Err(e) = file.flush().await {
                let _ = app.emit("core_update_progress", serde_json::json!({
                    "status": "error",
                    "percent": 0.0,
                    "error": format!("Failed to flush file: {}", e)
                }));
                return;
            }

            let content = match std::fs::read_to_string(&registry_path) {
                Ok(c) => c,
                Err(e) => {
                    let _ = app.emit("core_update_progress", serde_json::json!({
                        "status": "error",
                        "percent": 0.0,
                        "error": format!("Failed to read registry: {}", e)
                    }));
                    return;
                }
            };
            let mut registry: super::InstalledRegistry = match serde_json::from_str(&content) {
                Ok(r) => r,
                Err(e) => {
                    let _ = app.emit("core_update_progress", serde_json::json!({
                        "status": "error",
                        "percent": 0.0,
                        "error": format!("Failed to parse registry: {}", e)
                    }));
                    return;
                }
            };

            let path_str = dest_path.to_string_lossy().to_string();
            registry.update_downloaded_path = Some(path_str.clone());
            if let Ok(json) = serde_json::to_string_pretty(&registry) {
                let _ = std::fs::write(&registry_path, json);
            }

            let _ = app.emit("core_update_progress", serde_json::json!({
                "percent": 100,
                "status": "downloaded",
                "path": path_str
            }));
        });

        Ok(())
    }

    #[tauri::command]
    pub fn launch_installer_and_exit(_app: AppHandle) -> Result<(), String> {
        let registry_path = super::installed_registry_path();
        if !registry_path.exists() {
            return Err("Registry not initialized".to_string());
        }

        let content = std::fs::read_to_string(&registry_path).map_err(|e| e.to_string())?;
        let registry: super::InstalledRegistry = serde_json::from_str(&content).map_err(|e| e.to_string())?;

        let path_str = registry.update_downloaded_path.ok_or_else(|| "No update downloaded".to_string())?;
        let path = std::path::Path::new(&path_str);

        if !path.exists() {
            return Err(format!("Installer file does not exist at: {}", path_str));
        }

        let os = std::env::consts::OS;
        match os {
            "macos" => {
                Command::new("open")
                    .arg(path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch installer: {}", e))?;
            }
            "windows" => {
                Command::new("cmd")
                    .args(&["/c", "start", "", path.to_str().unwrap()])
                    .spawn()
                    .map_err(|e| format!("Failed to launch installer: {}", e))?;
            }
            "linux" => {
                Command::new("chmod")
                    .args(&["+x", path.to_str().unwrap()])
                    .spawn()
                    .map_err(|e| format!("Failed to make installer executable: {}", e))?;
                Command::new("xdg-open")
                    .arg(path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch installer: {}", e))?;
            }
            _ => return Err(format!("Unsupported OS: {}", os)),
        }

        std::process::exit(0);
    }

    #[tauri::command]
    pub fn get_pending_update_info() -> Result<Option<serde_json::Value>, String> {
        let registry_path = super::installed_registry_path();
        if !registry_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&registry_path).map_err(|e| e.to_string())?;
        let registry: super::InstalledRegistry = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        if let (Some(version), Some(path)) = (registry.approved_update_version, registry.update_downloaded_path) {
            if std::path::Path::new(&path).exists() {
                return Ok(Some(serde_json::json!({
                    "version": version,
                    "path": path,
                })));
            }
        }
        Ok(None)
    }

    #[tauri::command]
    pub async fn list_installed_models() -> Result<Vec<String>, String> {
        let path = super::ollama_path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        // First attempt: ask ollama to list models.
        let mut cmd = super::silent_cmd(&path);
        cmd.arg("list");
        let first_try = super::run_command_with_timeout(cmd, 6).await;

        let raw_output = if let Some(out) = first_try {
            out.stdout
        } else {
            // Ollama isn't running yet — spawn it quietly and retry once.
            let mut serve_cmd = super::silent_cmd_sync(&path);
            let _serve = serve_cmd
                .args(["serve"])
                .spawn();
            // Wait for the server to bind (non-blocking sleep on the async runtime).
            tokio::time::sleep(std::time::Duration::from_millis(1800)).await;
            let mut retry_cmd = super::silent_cmd(&path);
            retry_cmd.arg("list");
            match super::run_command_with_timeout(retry_cmd, 6).await {
                Some(out) => out.stdout,
                None => return Ok(Vec::new()),
            }
        };

        let stdout_str = String::from_utf8_lossy(&raw_output);
        let mut models = Vec::new();

        let mut lines = stdout_str.lines();
        let _header = lines.next();

        for line in lines {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if !parts.is_empty() {
                models.push(parts[0].to_string());
            }
        }

        Ok(models)
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

    #[tauri::command]
    pub fn factory_reset(server: State<'_, super::ServerProcess>) -> Result<(), String> {
        if let Ok(mut guard) = server.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        let base = super::lexsort_dir();
        if base.exists() {
            std::fs::remove_dir_all(&base)
                .map_err(|e| format!("Failed to delete config directory: {}", e))?;
        }
        std::process::exit(0);
    }

    #[tauri::command]
    pub fn exit_app(server: State<'_, super::ServerProcess>) {
        if let Ok(mut guard) = server.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        std::process::exit(0);
    }

    #[tauri::command]
    pub fn is_running_from_dmg() -> bool {
        #[cfg(target_os = "macos")]
        {
            if let Ok(current_exe) = std::env::current_exe() {
                let path_str = current_exe.to_string_lossy().to_lowercase();
                if path_str.contains("/volumes/lexsort vera") || path_str.contains("/volumes/lexsort.personal.ai") {
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(target_os = "macos")]
fn cleanup_unused_mounted_dmg_volumes() {
    // 1. Get current exe path
    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };

    // 2. Read contents of /Volumes
    let volumes_dir = std::path::Path::new("/Volumes");
    if let Ok(entries) = std::fs::read_dir(volumes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let name_lower = name.to_lowercase();
                    if name_lower.starts_with("lexsort vera") || name_lower.starts_with("lexsort.personal.ai") {
                        // Check if current exe is running from this volume path.
                        if current_exe.starts_with(&path) {
                            println!("[VERA] Running from mounted volume: {:?}. Skipping eject.", path);
                            continue;
                        }
                        
                        // Otherwise, eject it!
                        println!("[VERA] Detaching unused mounted volume: {:?}", path);
                        let _ = std::process::Command::new("hdiutil")
                            .args(&["detach", &path.to_string_lossy(), "-force"])
                            .output();
                    }
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    cleanup_unused_mounted_dmg_volumes();

    // Single-instance lock to prevent concurrent DB lock conflicts
    let _instance_lock = match std::net::TcpListener::bind("127.0.0.1:58737") {
        Ok(listener) => listener,
        Err(_) => {
            eprintln!("[LexSort VERA] Another instance of LexSort VERA is already running. Exiting.");
            std::process::exit(0);
        }
    };

    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .manage(team_lab::commands::LabState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                scheduler::run_scheduler(handle).await;
            });
            let active_model = std::env::var("VERA_MODEL")
                .ok()
                .or_else(|| commands::get_active_model())
                .unwrap_or_else(|| "llama3.2:3b".to_string());
            tauri::async_runtime::spawn(async move {
                rest_api::start_rest_api(active_model).await;
            });
            Ok(())
        })
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
            commands::get_app_version,
            commands::check_for_updates,
            commands::approve_core_update,
            commands::launch_installer_and_exit,
            commands::get_pending_update_info,
            commands::list_installed_models,
            commands::check_engine_installed,
            commands::setup_engine,
            commands::get_module_docs,
            commands::factory_reset,
            commands::exit_app,
            commands::is_running_from_dmg,
            team_lab::commands::lab_get_status,
            team_lab::commands::lab_get_config,
            team_lab::commands::lab_save_config,
            team_lab::commands::lab_list_tickets,
            team_lab::commands::lab_create_ticket,
            team_lab::commands::lab_decompose_spec,
            team_lab::commands::lab_claim_ticket,
            team_lab::commands::lab_start_work,
            team_lab::commands::lab_complete_ticket,
            team_lab::commands::lab_init_repo,
            team_lab::commands::lab_push_tickets,
            team_lab::commands::lab_stop_agents,
            team_lab::commands::lab_create_pr,
            team_lab::commands::lab_merge_pr,
            team_lab::commands::lab_review_ticket,
            team_lab::commands::lab_approve_job,
            team_lab::commands::lab_list_prs,
            quick_organizer::get_tasks,
            quick_organizer::create_task,
            quick_organizer::update_task,
            quick_organizer::complete_task,
            quick_organizer::delete_task,
            quick_organizer::move_task,
            quick_organizer::cache_ai_breakdown,
            quick_organizer::schedule_task,
            quick_organizer::get_recurring_tasks,
            quick_organizer::delete_recurrence,
            quick_organizer::get_due_tasks_now,
            quick_organizer::update_recurrence_rule,
            calendar_bridge::request_calendar_permission,
            calendar_bridge::import_calendar_events,
            calendar_bridge::refresh_calendar_events,
            conversations::get_conversations,
            conversations::create_conversation,
            conversations::save_messages,
            conversations::delete_conversation,
            conversations::rename_conversation,
            conversations::load_messages,
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

