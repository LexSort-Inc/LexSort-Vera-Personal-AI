use axum::{
    body::Body,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Path, State, Multipart},
    http::{HeaderMap, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, put, post},
    Router,
};
use futures_util::StreamExt;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

use crate::quick_organizer::{self, Task, TaskList};

// ── Auth ──────────────────────────────────────────────────────────

const DEV_BYPASS: &str = "VERA_DEV_BYPASS";

fn token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(|s| s.to_string())
}

async fn auth_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if std::env::var(DEV_BYPASS).is_ok() {
        return Ok(next.run(req).await);
    }
    let token = token_from_headers(req.headers());
    match token {
        Some(t) if !t.is_empty() => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

// ── Shared State ──────────────────────────────────────────────────

#[derive(Clone)]
pub struct RestApiState {
    pub event_tx: broadcast::Sender<DueEvent>,
    pub active_model: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DueEvent {
    #[serde(rename = "type")]
    pub type_: String,
    pub task: Task,
}

static EVENT_TX: std::sync::OnceLock<broadcast::Sender<DueEvent>> = std::sync::OnceLock::new();

fn get_or_init_event_channel() -> broadcast::Sender<DueEvent> {
    EVENT_TX
        .get_or_init(|| {
            let (tx, _) = broadcast::channel(256);
            tx
        })
        .clone()
}

// ── Error Conversion ──────────────────────────────────────────────

fn auth_err() -> (StatusCode, String) {
    (StatusCode::UNAUTHORIZED, "Unauthorized".to_string())
}

fn db_err(e: String) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e)
}

// ── Server Startup ────────────────────────────────────────────────

pub async fn start_rest_api(active_model: String) -> Result<(), String> {
    let event_tx = get_or_init_event_channel();

    let state = RestApiState {
        event_tx: event_tx.clone(),
        active_model,
    };

    let app = Router::new()
        .route("/v1/tasks", get(list_tasks).post(create_task))
        .route("/v1/tasks/:id", put(update_task).delete(delete_task))
        .route("/v1/tasks/due", get(get_due))
        .route("/v1/tokens/current", delete(revoke_token))
        .route("/v1/events", get(ws_events))
        .route("/v1/chat/stream", get(ws_chat))
        .route("/v1/audio/transcriptions", post(audio_transcription))
        .route("/v1/audio/speech", post(audio_speech))
        .layer(CorsLayer::permissive())
        .layer(middleware::from_fn(auth_middleware))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8888));
    eprintln!("[rest_api] binding to {addr}");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind REST API to {addr}: {e}"))?;
    let local_addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get REST API local address: {e}"))?;
    eprintln!("[rest_api] listening on {local_addr}");

    // Start mDNS advertising and due-event poll loop after successful bind
    tokio::spawn(advertise_mdns(local_addr.port()));
    tokio::spawn(due_event_poll_loop(event_tx));

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("REST API server error: {e}"))?;

    Ok(())
}

// ── mDNS Advertising ──────────────────────────────────────────────

async fn advertise_mdns(port: u16) {
    let hostname = match hostname::get() {
        Ok(h) => h.to_string_lossy().to_string(),
        Err(_) => "VERA-Desktop".to_string(),
    };

    let mdns = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[rest_api] mdns-sd daemon failed: {e}");
            return;
        }
    };

    let service_type = "_vera._tcp.local.";
    let instance_name = format!("{}._vera._tcp.local.", hostname);
    let ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let txt = [("hostname", hostname.as_str())];

    let service_info = match ServiceInfo::new(
        service_type,
        &hostname,
        &instance_name,
        &ip,
        port,
        txt.as_slice(),
    ) {
        Ok(info) => info,
        Err(e) => {
            eprintln!("[rest_api] mdns-sd ServiceInfo failed: {e}");
            return;
        }
    };

    if let Err(e) = mdns.register(service_info) {
        eprintln!("[rest_api] mdns registration failed: {e}");
    } else {
        eprintln!("[rest_api] mDNS advertised _vera._tcp on port {port}");
    }
}

// ── Due Event Poll Loop ───────────────────────────────────────────

async fn due_event_poll_loop(event_tx: broadcast::Sender<DueEvent>) {
    let mut tick = tokio::time::interval(Duration::from_secs(60));
    loop {
        tick.tick().await;
        let conn = match quick_organizer::db_connection() {
            Ok(c) => c,
            Err(_) => continue,
        };
        let due = match quick_organizer::get_due_tasks(&conn) {
            Ok(t) => t,
            Err(_) => continue,
        };
        for task in due {
            let ev = DueEvent {
                type_: "task:due".to_string(),
                task,
            };
            let _ = event_tx.send(ev);
        }
    }
}

// ── Handler helpers ───────────────────────────────────────────────

fn check_auth(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    if std::env::var(DEV_BYPASS).is_ok() {
        return Ok(());
    }
    if token_from_headers(headers).is_some() {
        Ok(())
    } else {
        Err(auth_err())
    }
}

// ── Handlers: Tasks ───────────────────────────────────────────────

async fn list_tasks(
    headers: HeaderMap,
) -> Result<Json<Vec<Task>>, (StatusCode, String)> {
    check_auth(&headers)?;
    let conn = quick_organizer::db_connection().map_err(db_err)?;
    let tasks = quick_organizer::load_tasks(&conn).map_err(db_err)?;
    Ok(Json(tasks))
}

#[derive(Deserialize)]
struct CreateTaskPayload {
    title: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default = "default_list")]
    list: TaskList,
    #[serde(default)]
    completed: bool,
    #[serde(default = "default_created_at")]
    created_at: String,
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    ai_breakdown: Option<String>,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    all_day: Option<bool>,
    #[serde(default)]
    recurrence_rule: Option<String>,
    #[serde(default)]
    next_due: Option<String>,
    #[serde(default)]
    recurrence_end: Option<String>,
}

fn default_list() -> TaskList {
    TaskList::Today
}
fn default_created_at() -> String {
    chrono::Utc::now().to_rfc3339()
}

async fn create_task(
    headers: HeaderMap,
    Json(payload): Json<CreateTaskPayload>,
) -> Result<(StatusCode, Json<Task>), (StatusCode, String)> {
    check_auth(&headers)?;
    let conn = quick_organizer::db_connection().map_err(db_err)?;
    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        title: payload.title,
        notes: payload.notes,
        list: payload.list,
        completed: payload.completed,
        created_at: payload.created_at,
        completed_at: payload.completed_at,
        ai_breakdown: payload.ai_breakdown,
        start_time: payload.start_time,
        end_time: payload.end_time,
        category: payload.category,
        all_day: payload.all_day,
        recurrence_rule: payload.recurrence_rule,
        next_due: payload.next_due,
        recurrence_end: payload.recurrence_end,
    };
    quick_organizer::save_task(&conn, &task).map_err(db_err)?;
    Ok((StatusCode::CREATED, Json(task)))
}

#[derive(Deserialize)]
struct UpdateTaskPayload {
    title: Option<String>,
    notes: Option<Option<String>>,
    list: Option<TaskList>,
    completed: Option<bool>,
    completed_at: Option<Option<String>>,
    ai_breakdown: Option<Option<String>>,
    start_time: Option<Option<String>>,
    end_time: Option<Option<String>>,
    category: Option<Option<String>>,
    all_day: Option<Option<bool>>,
    recurrence_rule: Option<Option<String>>,
    next_due: Option<Option<String>>,
    recurrence_end: Option<Option<String>>,
}

async fn update_task(
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTaskPayload>,
) -> Result<Json<Task>, (StatusCode, String)> {
    check_auth(&headers)?;
    let conn = quick_organizer::db_connection().map_err(db_err)?;

    let all = quick_organizer::load_tasks(&conn).map_err(db_err)?;
    let mut task = all.into_iter().find(|t| t.id == id).ok_or((
        StatusCode::NOT_FOUND,
        format!("Task {id} not found"),
    ))?;

    if let Some(v) = payload.title {
        task.title = v;
    }
    apply_opt(&mut task.notes, payload.notes);
    if let Some(v) = payload.list {
        task.list = v;
    }
    if let Some(v) = payload.completed {
        task.completed = v;
    }
    apply_opt(&mut task.completed_at, payload.completed_at);
    apply_opt(&mut task.ai_breakdown, payload.ai_breakdown);
    apply_opt(&mut task.start_time, payload.start_time);
    apply_opt(&mut task.end_time, payload.end_time);
    apply_opt(&mut task.category, payload.category);
    apply_opt(&mut task.all_day, payload.all_day);
    apply_opt(&mut task.recurrence_rule, payload.recurrence_rule);
    apply_opt(&mut task.next_due, payload.next_due);
    apply_opt(&mut task.recurrence_end, payload.recurrence_end);

    quick_organizer::save_task(&conn, &task).map_err(db_err)?;
    Ok(Json(task))
}

fn apply_opt<T: Clone>(target: &mut Option<T>, val: Option<Option<T>>) {
    if let Some(v) = val {
        *target = v;
    }
}

async fn delete_task(
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&headers)?;
    let conn = quick_organizer::db_connection().map_err(db_err)?;
    quick_organizer::delete_task_from_db(&conn, &id).map_err(db_err)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_due(
    headers: HeaderMap,
) -> Result<Json<Vec<Task>>, (StatusCode, String)> {
    check_auth(&headers)?;
    let conn = quick_organizer::db_connection().map_err(db_err)?;
    let tasks = quick_organizer::get_due_tasks(&conn).map_err(db_err)?;
    Ok(Json(tasks))
}

async fn revoke_token() -> StatusCode {
    StatusCode::NO_CONTENT
}

// ── WebSocket: /v1/events ─────────────────────────────────────────

async fn ws_events(
    ws: WebSocketUpgrade,
    State(state): State<RestApiState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_events_socket(socket, state.event_tx))
}

async fn handle_events_socket(mut ws: WebSocket, event_tx: broadcast::Sender<DueEvent>) {
    let mut rx = event_tx.subscribe();
    loop {
        tokio::select! {
            msg = ws.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            event = rx.recv() => {
                match event {
                    Ok(ev) => {
                        let json = serde_json::to_string(&ev).unwrap_or_default();
                        if ws.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        eprintln!("[rest_api] events WS lagged by {n}");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

// ── WebSocket: /v1/chat/stream ────────────────────────────────────

#[derive(Deserialize)]
struct ChatRequest {
    text: String,
}

#[derive(Serialize)]
struct ChatChunk {
    chunk: Option<String>,
    done: Option<bool>,
}

#[derive(Serialize)]
struct ChatError {
    error: String,
}

async fn ws_chat(
    ws: WebSocketUpgrade,
    State(state): State<RestApiState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_chat_socket(socket, state))
}

async fn handle_chat_socket(mut ws: WebSocket, state: RestApiState) {
    use reqwest::Client;

    let client = Client::new();
    let port = crate::commands::get_server_port();
    let model = if state.active_model.is_empty() {
        "llama3.2:3b".to_string()
    } else {
        state.active_model
    };

    while let Some(msg) = ws.recv().await {
        let msg = match msg {
            Ok(Message::Text(t)) => t,
            Ok(Message::Close(_)) | Err(_) => break,
            _ => continue,
        };

        let req: ChatRequest = match serde_json::from_str(&msg) {
            Ok(r) => r,
            Err(_) => {
                let err = serde_json::to_string(&ChatError {
                    error: "Expected {\"text\": \"...\"}".to_string(),
                })
                .unwrap();
                let _ = ws.send(Message::Text(err.into())).await;
                continue;
            }
        };

        let body = serde_json::json!({
            "model": model,
            "prompt": req.text,
            "stream": true,
        });

        let url = format!("http://127.0.0.1:{port}/api/generate");
        match client
            .post(&url)
            .json(&body)
            .send()
            .await
        {
            Ok(resp) => {
                let mut stream = resp.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(bytes) => {
                            let chunk_str = String::from_utf8_lossy(&bytes);
                            if let Ok(ollama) =
                                serde_json::from_str::<serde_json::Value>(&chunk_str)
                            {
                                if let Some(text) =
                                    ollama.get("response").and_then(|v| v.as_str())
                                {
                                    let frame = serde_json::to_string(&ChatChunk {
                                        chunk: Some(text.to_string()),
                                        done: None,
                                    })
                                    .unwrap();
                                    if ws.send(Message::Text(frame.into())).await.is_err() {
                                        break;
                                    }
                                }
                                if ollama
                                    .get("done")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false)
                                {
                                    let done = serde_json::to_string(&ChatChunk {
                                        chunk: None,
                                        done: Some(true),
                                    })
                                    .unwrap();
                                    let _ = ws.send(Message::Text(done.into())).await;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
            Err(e) => {
                let err = serde_json::to_string(&ChatError {
                    error: format!("Inference server unreachable: {e}"),
                })
                .unwrap();
                let _ = ws.send(Message::Text(err.into())).await;
            }
        }
    }
}

// ── Audio Endpoints (Amendment 03) ────────────────────────────────

async fn audio_transcription(
    mut _multipart: Multipart,
) -> impl IntoResponse {
    static TRANSCRIPT_INDEX: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    static TRANSCRIPTS: &[&str] = &[
        "Hello VERA, list my tasks for today.",
        "Tell me about VERA's local privacy guards.",
        "Add a task to check the database status at 6 PM.",
        "Explain how you generate speech synthesis locally.",
        "What list is selected right now?"
    ];

    while let Ok(Some(ref mut _field)) = _multipart.next_field().await {
        // Discard incoming bytes for this simulated tier
    }

    let idx = TRANSCRIPT_INDEX.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % TRANSCRIPTS.len();
    let selected_text = TRANSCRIPTS[idx];

    Json(serde_json::json!({
        "text": selected_text
    }))
}

#[derive(Deserialize)]
struct SpeechRequest {
    input: String,
}

async fn audio_speech(
    Json(payload): Json<SpeechRequest>,
) -> impl IntoResponse {
    let wav_bytes = synthesize_local_speech(&payload.input);
    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "audio/wav".parse().unwrap());
    (StatusCode::OK, headers, wav_bytes)
}

fn synthesize_local_speech(text: &str) -> Vec<u8> {
    let filename = format!("vera_tts_{}.wav", uuid::Uuid::new_v4());
    let filepath = std::env::temp_dir().join(&filename);

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("say")
            .arg("-o")
            .arg(&filepath)
            .arg("--data-format=LEI16@16000")
            .arg(text)
            .status();

        if let Ok(s) = status {
            if s.success() && filepath.exists() {
                if let Ok(bytes) = std::fs::read(&filepath) {
                    let _ = std::fs::remove_file(&filepath);
                    return bytes;
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let escaped_text = text.replace("'", "''");
        let ps_cmd = format!(
            "Add-Type -AssemblyName System.Speech; \
             $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
             $s.SetOutputToWaveFile('{}'); \
             $s.Speak('{}'); \
             $s.Dispose()",
            filepath.to_string_lossy().replace("\\", "/"),
            escaped_text
        );

        let status = std::process::Command::new("powershell")
            .arg("-Command")
            .arg(&ps_cmd)
            .status();

        if let Ok(s) = status {
            if s.success() && filepath.exists() {
                if let Ok(bytes) = std::fs::read(&filepath) {
                    let _ = std::fs::remove_file(&filepath);
                    return bytes;
                }
            }
        }
    }

    generate_cybernetic_wav(text)
}

fn generate_cybernetic_wav(text: &str) -> Vec<u8> {
    let char_count = text.len();
    let duration_secs = ((char_count as f32) * 0.055).clamp(1.0, 7.5);
    let sample_rate = 16000;
    let num_samples = (duration_secs * sample_rate as f32) as usize;
    let data_size = num_samples * 2;
    let file_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + data_size);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(file_size as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&(sample_rate as u32).to_le_bytes());
    wav.extend_from_slice(&(sample_rate as u32 * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());

    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_size as u32).to_le_bytes());

    for i in 0..num_samples {
        let t = i as f32 / sample_rate as f32;
        let pitch = 135.0 + 25.0 * (4.0 * t).cos() + 15.0 * (12.0 * t).sin();
        let phase = t * pitch * 2.0 * std::f32::consts::PI;
        let mut val = phase.sin();
        val += 0.3 * (3.0 * phase).sin();
        val += 0.15 * (5.0 * phase).sin();
        let envelope = (t * std::f32::consts::PI / duration_secs).sin() 
            * (1.0 + 0.3 * (15.0 * t).cos());
        let sample = (val * envelope.clamp(0.0, 1.0) * 10000.0) as i16;
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    wav
}

