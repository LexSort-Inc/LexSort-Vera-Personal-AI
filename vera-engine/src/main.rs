mod config;
mod download;
mod models;
mod router;
mod system;
mod token;

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{error, info};
use tracing_subscriber;

use crate::config::Config;
use crate::download::{DownloadPhase, DownloadProgress, ModelDownloader};
use crate::token::generate_token;
use crate::router::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    info!("Starting VERA Engine v1.0.0");

    let config = Config::load()?;
    info!("Config loaded: port={}", config.engine.port);

    // ---- Hardware detection ----
    let hw = system::detect_hardware(&config.model.models_dir);
    info!(
        "Hardware: {:.1} GB RAM, {:.1} GB free disk, {} CPUs. Recommended: {}",
        hw.total_ram_gb, hw.free_disk_gb, hw.cpu_count, hw.recommended_model
    );
    if hw.recommended_model != config.model.default
        && !config.model_path().exists()
    {
        info!(
            "Config specifies '{}' but hardware recommends '{}'. Will use recommended model.",
            config.model.default, hw.recommended_model
        );
    }

    let _session_token = generate_token();
    token::write_token(&_session_token, &config.engine.token_path)?;

    // ---- Determine target model based on hardware ----
    let use_q6_k = hw.can_run_q6_k;
    let target_model_name = if use_q6_k {
        info!("Hardware supports standard model (Q6_K).");
        config.model.default.clone()
    } else {
        info!("Hardware recommends lightweight model (Q4_K_M).");
        config.model.fallback_name.clone()
    };
    let target_model_path = config.model.models_dir.join(&target_model_name).with_extension("gguf");

    // ---- Model readiness state ----
    let model_ready = Arc::new(AtomicBool::new(target_model_path.exists()));
    let download_progress = Arc::new(Mutex::new(DownloadProgress::new(target_model_name.clone())));

    if target_model_path.exists() {
        info!("Model file found at {:?}", target_model_path);
        let mut p = download_progress.lock().await;
        p.phase = DownloadPhase::Complete;
    }

    // ---- App state (shared) — created early so background tasks can use it ----
    let state = Arc::new(Mutex::new(AppState {
        installed_models: discover_models(&config).await,
        llama_server_port: config.engine.port,
        model_ready: model_ready.clone(),
        download_progress: download_progress.clone(),
        hardware_profile: hw.clone(),
    }));

    // ---- Download model in background if needed ----
    if !target_model_path.exists() {
        if use_q6_k {
            info!("Downloading Q6_K model from {}", config.model.download_url);
            let downloader = ModelDownloader::new(
                config.model.download_url.clone(),
                target_model_path.clone(),
                if config.model.sha256.is_empty() {
                    None
                } else {
                    Some(config.model.sha256.clone())
                },
                if config.model.fallback_url.is_empty() {
                    None
                } else {
                    Some(config.model.fallback_url.clone())
                },
                if config.model.fallback_name.is_empty() {
                    None
                } else {
                    Some(config.model.models_dir.join(&config.model.fallback_name).with_extension("gguf"))
                },
                if config.model.fallback_sha256.is_empty() {
                    None
                } else {
                    Some(config.model.fallback_sha256.clone())
                },
            );
            let dp = download_progress.clone();
            let mr = model_ready.clone();
            let c = config.clone();
            let s = state.clone();
            tokio::spawn(async move {
                match downloader.download(dp).await {
                    Ok(()) => {
                        mr.store(true, Ordering::SeqCst);
                        let installed = discover_models(&c).await;
                        let mut app_state = s.lock().await;
                        app_state.installed_models = installed;
                        info!("Q6_K model download complete.");
                    }
                    Err(e) => {
                        error!("Q6_K model download failed: {}", e);
                    }
                }
            });
        } else {
            info!("Downloading Q4_K_M model from {}", config.model.fallback_url);
            let downloader = ModelDownloader::new(
                config.model.fallback_url.clone(),
                target_model_path.clone(),
                if config.model.fallback_sha256.is_empty() {
                    None
                } else {
                    Some(config.model.fallback_sha256.clone())
                },
                None,
                None,
                None,
            );
            let dp = download_progress.clone();
            let mr = model_ready.clone();
            let c = config.clone();
            let s = state.clone();
            tokio::spawn(async move {
                match downloader.download(dp).await {
                    Ok(()) => {
                        mr.store(true, Ordering::SeqCst);
                        let installed = discover_models(&c).await;
                        let mut app_state = s.lock().await;
                        app_state.installed_models = installed;
                        info!("Q4_K_M model download complete.");
                    }
                    Err(e) => {
                        error!("Q4_K_M model download failed: {}", e);
                    }
                }
            });
        }
    }

    // ---- Background: wait for model, then spawn llama-server ----
    let bg_config = config.clone();
    let bg_ready = model_ready.clone();
    let bg_model_path = target_model_path.clone();
    tokio::spawn(async move {
        model_lifecycle(bg_config, bg_ready, bg_model_path).await;
    });

    // ---- HTTP server ----
    let app = router::build_routes(state);
    let addr = format!("{}:{}", config.engine.host, config.engine.port);
    info!("VERA Engine listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn model_lifecycle(config: Config, model_ready: Arc<AtomicBool>, model_path: PathBuf) {
    loop {
        if model_ready.load(Ordering::SeqCst) {
            break;
        }
        sleep(Duration::from_secs(2)).await;
    }

    info!("Model ready. Spawning llama-server...");
    let llama_child = spawn_llama_server(&config, &model_path).await.unwrap_or_else(|e| {
        error!("Fatal: could not start llama-server: {}", e);
        std::process::exit(1);
    });

    let child_wrapper: Arc<Mutex<Option<Child>>> =
        Arc::new(Mutex::new(Some(llama_child)));
    let attempts: Arc<Mutex<Vec<Instant>>> = Arc::new(Mutex::new(Vec::new()));

    monitor_llama_server(child_wrapper, attempts, config, model_path).await;
}

async fn spawn_llama_server(config: &Config, model_path: &std::path::Path) -> anyhow::Result<Child> {
    let binary = &config.engine.llama_server_binary;
    if !binary.exists() {
        anyhow::bail!("llama-server binary not found at {:?}", binary);
    }

    if !model_path.exists() {
        anyhow::bail!("Model file not found at {:?}", model_path);
    }

    info!("Spawning llama-server...");
    let child = Command::new(binary)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(config.engine.port.to_string())
        .arg("--model")
        .arg(&model_path)
        .arg("--num-ctx")
        .arg("4096")
        .arg("--threads")
        .arg(num_cpus::get().to_string())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .spawn()?;

    sleep(Duration::from_secs(2)).await;
    info!("llama-server started (PID {})", child.id());
    Ok(child)
}

async fn monitor_llama_server(
    process: Arc<Mutex<Option<Child>>>,
    attempts: Arc<Mutex<Vec<Instant>>>,
    config: Config,
    model_path: PathBuf,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        let mut child_guard = process.lock().await;
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => {}
                Ok(Some(status)) => {
                    error!("llama-server exited with status: {:?}", status);
                    let should_restart = {
                        let mut attempt_log = attempts.lock().await;
                        let now = Instant::now();
                        attempt_log.retain(|t| now.duration_since(*t) < Duration::from_secs(300));
                        attempt_log.push(now);
                        attempt_log.len() <= 2
                    };

                    if should_restart {
                        info!("Attempting to restart llama-server...");
                        match spawn_llama_server(&config, &model_path).await {
                            Ok(new_child) => {
                                *child_guard = Some(new_child);
                                info!("llama-server restarted successfully.");
                            }
                            Err(e) => {
                                error!("Failed to restart llama-server: {}", e);
                                *child_guard = None;
                            }
                        }
                    } else {
                        error!("llama-server crashed twice within 5 minutes. Entering degraded state.");
                        *child_guard = None;
                    }
                }
                Err(e) => {
                    error!("Error checking llama-server status: {}", e);
                }
            }
        } else {
            info!("llama-server not running – attempting to start...");
            match spawn_llama_server(&config, &model_path).await {
                Ok(new_child) => {
                    *child_guard = Some(new_child);
                }
                Err(e) => {
                    error!("Failed to start llama-server: {}", e);
                }
            }
        }
    }
}

async fn discover_models(config: &Config) -> Vec<String> {
    let models_dir = &config.model.models_dir;
    let mut models = Vec::new();

    if let Ok(entries) = std::fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "gguf" {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        models.push(name.to_string());
                    }
                }
            }
        }
    }

    if models.is_empty() {
        models.push(config.model.default.clone());
    }

    info!("Discovered models: {:?}", models);
    models
}
