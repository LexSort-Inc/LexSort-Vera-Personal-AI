use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::download::DownloadPhase;
use crate::models::{select_model, CapabilityManifest};
use crate::system::HardwareProfile;

pub struct AppState {
    pub installed_models: Vec<String>,
    pub llama_server_port: u16,
    pub model_ready: Arc<AtomicBool>,
    pub download_progress: Arc<Mutex<crate::download::DownloadProgress>>,
    pub hardware_profile: HardwareProfile,
}

pub fn build_routes(state: Arc<Mutex<AppState>>) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(proxy_chat))
        .route("/v1/models", get(list_models))
        .route("/v1/manifest", post(register_manifest))
        .route("/v1/health", get(health_check))
        .route("/v1/system", get(system_info))
        .with_state(state)
}

async fn system_info(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Json<serde_json::Value> {
    let state = state.lock().await;
    Json(json!(state.hardware_profile))
}

async fn health_check(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Json<serde_json::Value> {
    let state = state.lock().await;
    let progress = state.download_progress.lock().await;
    let ready = state.model_ready.load(Ordering::SeqCst);

    let (engine_status, details) = match &progress.phase {
        DownloadPhase::Idle => ("starting", json!({})),
        DownloadPhase::CheckingExisting => ("checking", json!({})),
        DownloadPhase::Downloading { bytes_downloaded, total_bytes } => {
            let pct = if *total_bytes > 0 {
                (*bytes_downloaded as f64 / *total_bytes as f64 * 100.0) as u32
            } else {
                0
            };
            (
                "downloading",
                json!({
                    "progress_pct": pct,
                    "bytes_downloaded": bytes_downloaded,
                    "total_bytes": total_bytes,
                }),
            )
        }
        DownloadPhase::Verifying => ("verifying", json!({})),
        DownloadPhase::Complete if ready => ("ready", json!({})),
        DownloadPhase::Complete => ("ready", json!({})),
        DownloadPhase::Failed(msg) => ("error", json!({"error": msg})),
    };

    Json(json!({
        "status": engine_status,
        "engine_version": "1.0.0",
        "model": progress.model_name,
        "recommended_model": state.hardware_profile.recommended_model,
        "llama_server_running": ready,
        "details": details,
    }))
}

async fn proxy_chat(
    State(state): State<Arc<Mutex<AppState>>>,
    body: String,
) -> impl IntoResponse {
    let state = state.lock().await;
    if !state.model_ready.load(Ordering::SeqCst) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error": "Model is still downloading. Check /v1/health for progress."}"#
                .to_string(),
        )
            .into_response();
    }

    let client = reqwest::Client::new();
    let url = format!(
        "http://127.0.0.1:{}/v1/chat/completions",
        state.llama_server_port
    );

    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            (status, body).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            format!(r#"{{"error": "llama-server unreachable: {}"}}"#, e),
        )
            .into_response(),
    }
}

async fn list_models(
    State(state): State<Arc<Mutex<AppState>>>,
) -> impl IntoResponse {
    let state = state.lock().await;
    if !state.model_ready.load(Ordering::SeqCst) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error": "Model is still downloading.", "models": []}"#.to_string(),
        )
            .into_response();
    }

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/v1/models", state.llama_server_port);

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            (status, body).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            format!(r#"{{"error": "{}"}}"#, e),
        )
            .into_response(),
    }
}

async fn register_manifest(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(manifest): Json<CapabilityManifest>,
) -> Json<serde_json::Value> {
    let state = state.lock().await;
    let installed = state.installed_models.clone();
    let response = select_model(&manifest, &installed);
    Json(json!(response))
}
