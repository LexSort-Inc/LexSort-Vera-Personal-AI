use tauri::{AppHandle, Emitter, State};
use std::sync::Mutex;
use std::process::{Child, Command};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sysinfo::System;

pub struct ServerProcess(pub Mutex<Option<Child>>);

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ollama_tag: String,
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
    pub model: ModelInfo,
    pub model_exists: bool,
}

fn select_model(ceiling_bytes: u64) -> ModelInfo {
    let gb = ceiling_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    if gb >= 17.0 {
        ModelInfo {
            id: "qwen2.5:32b".to_string(),
            name: "Qwen 2.5 32B".to_string(),
            description: "Maximum fidelity — best reasoning and quality".to_string(),
            ollama_tag: "qwen2.5:32b".to_string(),
        }
    } else if gb >= 9.5 {
        ModelInfo {
            id: "mistral".to_string(),
            name: "Mistral 7B".to_string(),
            description: "High performance — fast and capable".to_string(),
            ollama_tag: "mistral".to_string(),
        }
    } else if gb >= 5.5 {
        ModelInfo {
            id: "llama3.2:3b".to_string(),
            name: "Llama 3.2 3B".to_string(),
            description: "Standard — solid performance on most hardware".to_string(),
            ollama_tag: "llama3.2:3b".to_string(),
        }
    } else if gb >= 3.5 {
        ModelInfo {
            id: "qwen2.5:1.5b".to_string(),
            name: "Qwen 2.5 1.5B".to_string(),
            description: "Efficient — optimised for limited resources".to_string(),
            ollama_tag: "qwen2.5:1.5b".to_string(),
        }
    } else {
        ModelInfo {
            id: "".to_string(),
            name: "Insufficient RAM".to_string(),
            description: "Please close other applications and restart".to_string(),
            ollama_tag: "".to_string(),
        }
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

mod commands {
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
        let model = select_model(ceiling);

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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
