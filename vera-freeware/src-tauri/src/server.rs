use std::process::{Command, Stdio};
use std::time::Duration;

fn ollama_path() -> std::path::PathBuf {
    let candidates = vec![
        dirs::home_dir()
            .unwrap_or_default()
            .join(".lexsort/bin/ollama"),
        "/usr/local/bin/ollama".into(),
        "/opt/homebrew/bin/ollama".into(),
        "/usr/bin/ollama".into(),
    ];
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    "ollama".into()
}

fn lifecycle_log(line: &str) {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".lexsort/logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("ollama-lifecycle.log"))
    {
        let _ = writeln!(f, "[{}] {}", ts, line);
    }
    eprintln!("[server][ollama-lifecycle] {}", line);
}

fn start_ollama() -> Result<Option<std::process::Child>, String> {
    // NOTE: status() returns Ok(()) even when the process exits non-zero,
    // so inspecting .is_ok() alone would ALWAYS conclude "already running"
    // even when no daemon is reachable. Only exit code 0 (daemon answers)
    // means we can safely reuse an existing daemon.
    let status = Command::new(ollama_path())
        .args(["list"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if matches!(&status, Ok(s) if s.success()) {
        lifecycle_log("vera-server: external daemon answers (ollama list exit 0) — reusing, NOT spawning");
        return Ok(None);
    }
    lifecycle_log("vera-server: no daemon reachable — spawning managed daemon");
    let mut cmd = Command::new(ollama_path());
    cmd.args(["serve"])
        .env("OLLAMA_HOST", "127.0.0.1:11434")
        .env("OLLAMA_ORIGINS", "http://localhost,http://localhost:1420,http://tauri.localhost,http://127.0.0.1:*");
    // Note: v0.9.6 does NOT read OLLAMA_RUNNERS_DIR; backends are discovered
    // via discover.LibOllamaPath = <exe_dir>/lib/ollama.
    // OLLAMA_ORIGINS must never contain non-http(s) schemes: gin-contrib/cors
    // v1.7.2 (bundled in v0.9.6) panics on them and kills Ollama at startup.
    let child = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {e}"))?;
    lifecycle_log(&format!("vera-server: daemon spawned PID={}", child.id()));
    eprintln!("[server] Ollama started (PID {})", child.id());
    Ok(Some(child))
}

fn init_database() {
    if let Ok(conn) = lexsort_personal_ai_lib::quick_organizer::db_connection() {
        if let Err(e) = lexsort_personal_ai_lib::quick_organizer::init_db(&conn) {
            eprintln!("[server] WARNING: DB init failed: {e}");
        }
    }
}

#[tokio::main]
async fn main() {
    eprintln!("[server] VERA headless server starting...");

    init_database();

    let _ollama_child = match start_ollama() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[server] WARNING: Could not start Ollama: {e}");
            None
        }
    };

    let active_model = std::env::var("VERA_MODEL")
        .ok()
        .or_else(|| lexsort_personal_ai_lib::commands::get_active_model())
        .unwrap_or_else(|| "llama3.2:3b".to_string());
    eprintln!("[server] Active model: {active_model}");

    let rest_handle = tokio::spawn(async move {
        if let Err(e) = lexsort_personal_ai_lib::rest_api::start_rest_api(active_model).await {
            eprintln!("[server] REST API failed to start: {e}");
        }
    });

    let sched_handle = tokio::spawn(scheduler_loop());

    eprintln!("[server] All services started. Press Ctrl-C to stop.");
    eprintln!("[server] REST API : http://localhost:8888/v1/tasks");
    eprintln!("[server] Ollama    : http://localhost:11434/api/tags");

    tokio::select! {
        _ = rest_handle => eprintln!("[server] REST API stopped (unexpected)"),
        _ = sched_handle => eprintln!("[server] Scheduler stopped (unexpected)"),
        _ = tokio::signal::ctrl_c() => eprintln!("[server] Shutting down..."),
    }

    if let Some(mut child) = _ollama_child {
        let pid = child.id();
        lifecycle_log(&format!("vera-server: shutdown — killing managed daemon PID={}", pid));
        let _ = child.kill();
        let _ = child.wait();
        lifecycle_log("vera-server: daemon exited, port released");
    }

    eprintln!("[server] Goodbye.");
}

async fn scheduler_loop() {
    eprintln!("[scheduler] started — checking every 60s");
    let mut tick = tokio::time::interval(Duration::from_secs(60));
    loop {
        tick.tick().await;
        if let Err(e) = advance_recurring_tasks().await {
            eprintln!("[scheduler] error: {e}");
        }
    }
}

async fn advance_recurring_tasks() -> Result<usize, String> {
    use chrono::Utc;
    use lexsort_personal_ai_lib::quick_organizer::{get_due_tasks, save_task};
    use lexsort_personal_ai_lib::recurrence_parser::{compute_next_due, RecurrenceRule};

    let conn = lexsort_personal_ai_lib::quick_organizer::db_connection()?;
    let now = Utc::now();
    let due_tasks = get_due_tasks(&conn)?;
    let count = due_tasks.len();

    for mut task in due_tasks {
        if let Some(ref rule_json) = task.recurrence_rule.clone() {
            if let Some(rule) = RecurrenceRule::from_json(rule_json) {
                let current_due = task
                    .next_due
                    .as_deref()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or(now);

                let next = compute_next_due(&rule, &current_due);

                let past_end = task
                    .recurrence_end
                    .as_deref()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|end| next.map(|n| n > end.with_timezone(&Utc)).unwrap_or(true))
                    .unwrap_or(false);

                if past_end {
                    task.next_due = None;
                    task.recurrence_rule = None;
                } else {
                    task.next_due = next.map(|n| n.to_rfc3339());
                }
            } else {
                task.next_due = None;
                task.recurrence_rule = None;
            }
        } else {
            task.next_due = None;
        }
        save_task(&conn, &task)?;
    }

    if count > 0 {
        eprintln!("[scheduler] {count} recurring task(s) advanced");
    }
    Ok(count)
}
