use chrono::Utc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::quick_organizer::{get_due_tasks, save_task};
use crate::recurrence_parser::{compute_next_due, RecurrenceRule};

pub async fn run_scheduler(app: AppHandle) {
    eprintln!("[scheduler] started — checking every 60s");

    let mut tick = tokio::time::interval(Duration::from_secs(60));

    loop {
        tick.tick().await;
        if let Err(e) = check_and_fire(&app).await {
            eprintln!("[scheduler] error: {}", e);
        }
    }
}

async fn check_and_fire(app: &AppHandle) -> Result<(), String> {
    let conn = crate::quick_organizer::db_connection()?;
    crate::quick_organizer::init_db(&conn)?;

    let now = Utc::now();
    let due_tasks = get_due_tasks(&conn)?;

    if due_tasks.is_empty() {
        return Ok(());
    }

    eprintln!("[scheduler] {} task(s) due", due_tasks.len());

    for mut task in due_tasks {
        let _ = app.emit(
            "task:due",
            serde_json::json!({
                "id": task.id,
                "title": task.title,
                "list": task.list,
            }),
        );

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
                    eprintln!("[scheduler] task {} past recurrence_end — clearing", task.id);
                    task.next_due = None;
                    task.recurrence_rule = None;
                } else {
                    task.next_due = next.map(|n| n.to_rfc3339());
                    eprintln!("[scheduler] task {} next_due advanced to {:?}", task.id, task.next_due);
                }
            } else {
                eprintln!("[scheduler] task {} has invalid recurrence_rule — clearing", task.id);
                task.next_due = None;
                task.recurrence_rule = None;
            }
        } else {
            task.next_due = None;
        }

        save_task(&conn, &task)?;
    }

    Ok(())
}
