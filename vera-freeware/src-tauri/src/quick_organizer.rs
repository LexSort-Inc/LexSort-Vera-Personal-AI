use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskList {
    Today,
    ThisWeek,
    Someday,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: Option<String>,
    pub list: TaskList,
    pub completed: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub ai_breakdown: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub category: Option<String>,
    pub all_day: Option<bool>,
    pub recurrence_rule: Option<String>,
    pub next_due: Option<String>,
    pub recurrence_end: Option<String>,
}

pub fn db_connection() -> Result<Connection, String> {
    let db_path = crate::data_dir().join("conversations.db");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Connection::open(&db_path).map_err(|e| format!("Failed to open tasks database: {}", e))
}

pub fn init_db(conn: &Connection) -> Result<(), String> {
    crate::schema::init_db(conn)
}

fn task_from_row(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    let list_str: String = row.get(3)?;
    let list = match list_str.as_str() {
        "today" => TaskList::Today,
        "this_week" => TaskList::ThisWeek,
        "someday" => TaskList::Someday,
        _ => TaskList::Today,
    };
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        list,
        completed: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        completed_at: row.get(6)?,
        ai_breakdown: row.get(7)?,
        start_time: row.get(8)?,
        end_time: row.get(9)?,
        category: row.get(10)?,
        all_day: row.get::<_, Option<i64>>(11)?.map(|v| v != 0),
        recurrence_rule: row.get(12)?,
        next_due: row.get(13)?,
        recurrence_end: row.get(14)?,
    })
}

pub fn load_tasks(conn: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, notes, list, completed, created_at, completed_at,
                    ai_breakdown, start_time, end_time, category, all_day,
                    recurrence_rule, next_due, recurrence_end
             FROM tasks
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let tasks = stmt
        .query_map([], task_from_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tasks)
}

pub fn save_task(conn: &Connection, task: &Task) -> Result<(), String> {
    let list_str = match task.list {
        TaskList::Today => "today",
        TaskList::ThisWeek => "this_week",
        TaskList::Someday => "someday",
    };
    conn.execute(
        "INSERT INTO tasks
            (id, title, notes, list, completed, created_at, completed_at,
             ai_breakdown, start_time, end_time, category, all_day,
             recurrence_rule, next_due, recurrence_end)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
         ON CONFLICT(id) DO UPDATE SET
            title           = excluded.title,
            notes           = excluded.notes,
            list            = excluded.list,
            completed       = excluded.completed,
            completed_at    = excluded.completed_at,
            ai_breakdown    = excluded.ai_breakdown,
            start_time      = excluded.start_time,
            end_time        = excluded.end_time,
            category        = excluded.category,
            all_day         = excluded.all_day,
            recurrence_rule = excluded.recurrence_rule,
            next_due        = excluded.next_due,
            recurrence_end  = excluded.recurrence_end",
        params![
            task.id,
            task.title,
            task.notes,
            list_str,
            task.completed as i64,
            task.created_at,
            task.completed_at,
            task.ai_breakdown,
            task.start_time,
            task.end_time,
            task.category,
            task.all_day.map(|v| v as i64),
            task.recurrence_rule,
            task.next_due,
            task.recurrence_end,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_task_from_db(conn: &Connection, task_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_due_tasks(conn: &Connection) -> Result<Vec<Task>, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, notes, list, completed, created_at, completed_at,
                    ai_breakdown, start_time, end_time, category, all_day,
                    recurrence_rule, next_due, recurrence_end
             FROM tasks
             WHERE completed = 0
               AND next_due IS NOT NULL
               AND next_due <= ?1
             ORDER BY next_due ASC",
        )
        .map_err(|e| e.to_string())?;
    let tasks = stmt
        .query_map(params![now], task_from_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tasks)
}

fn migrate_json_to_sqlite(conn: &Connection) -> Result<(), String> {
    let json_path = crate::data_dir().join("quick_organizer").join("tasks.json");
    if !json_path.exists() {
        return Ok(());
    }
    let json_str = std::fs::read_to_string(&json_path).map_err(|e| e.to_string())?;

    #[derive(Deserialize)]
    struct OldTask {
        id: String,
        title: String,
        notes: Option<String>,
        #[serde(rename = "list")]
        list: TaskList,
        completed: bool,
        created_at: String,
        completed_at: Option<String>,
        ai_breakdown: Option<String>,
        start_time: Option<String>,
        end_time: Option<String>,
        category: Option<String>,
        all_day: Option<bool>,
    }
    #[derive(Deserialize)]
    struct OldTaskStore {
        tasks: Vec<OldTask>,
    }

    let _count = match serde_json::from_str::<OldTaskStore>(&json_str) {
        Ok(store) => {
            for t in &store.tasks {
                let task = Task {
                    id: t.id.clone(),
                    title: t.title.clone(),
                    notes: t.notes.clone(),
                    list: t.list.clone(),
                    completed: t.completed,
                    created_at: t.created_at.clone(),
                    completed_at: t.completed_at.clone(),
                    ai_breakdown: t.ai_breakdown.clone(),
                    start_time: t.start_time.clone(),
                    end_time: t.end_time.clone(),
                    category: t.category.clone(),
                    all_day: t.all_day,
                    recurrence_rule: None,
                    next_due: None,
                    recurrence_end: None,
                };
                save_task(conn, &task)?;
            }
            store.tasks.len()
        }
        Err(_) => return Ok(()),
    };
    let done_path = json_path.with_extension("json.migrated");
    std::fs::rename(&json_path, &done_path).ok();
    Ok(())
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let conn = db_connection()?;
    init_db(&conn)?;
    migrate_json_to_sqlite(&conn)?;
    f(&conn)
}

// ── Existing Tauri commands (ported to SQLite) ──

#[tauri::command]
pub fn get_tasks() -> Result<Vec<Task>, String> {
    with_db(|conn| load_tasks(conn))
}

#[tauri::command]
pub fn create_task(
    title: String,
    list: TaskList,
    start_time: Option<String>,
    end_time: Option<String>,
    category: Option<String>,
    all_day: Option<bool>,
) -> Result<Task, String> {
    with_db(|conn| {
        let task = Task {
            id: format!("task_{}", chrono::Utc::now().timestamp_millis()),
            title,
            notes: None,
            list,
            completed: false,
            created_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
            ai_breakdown: None,
            start_time,
            end_time,
            category,
            all_day,
            recurrence_rule: None,
            next_due: None,
            recurrence_end: None,
        };
        save_task(conn, &task)?;
        Ok(task)
    })
}

#[tauri::command]
pub fn update_task(task: Task) -> Result<(), String> {
    with_db(|conn| save_task(conn, &task))
}

#[tauri::command]
pub fn complete_task(task_id: String) -> Result<(), String> {
    with_db(|conn| {
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.completed = true;
        task.completed_at = Some(chrono::Utc::now().to_rfc3339());
        save_task(conn, task)
    })
}

#[tauri::command]
pub fn delete_task(task_id: String) -> Result<(), String> {
    with_db(|conn| {
        let before = load_tasks(conn)?.len();
        delete_task_from_db(conn, &task_id)?;
        if load_tasks(conn)?.len() == before {
            return Err(format!("Task {} not found", task_id));
        }
        Ok(())
    })
}

#[tauri::command]
pub fn move_task(task_id: String, new_list: TaskList) -> Result<(), String> {
    with_db(|conn| {
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.list = new_list;
        save_task(conn, task)
    })
}

#[tauri::command]
pub fn cache_ai_breakdown(task_id: String, breakdown: String) -> Result<(), String> {
    with_db(|conn| {
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.ai_breakdown = Some(breakdown);
        save_task(conn, task)
    })
}

// ── New: Recurring task commands ──

use crate::recurrence_parser::{compute_next_due, parse_recurrence};

#[tauri::command]
pub fn schedule_task(
    task_id: String,
    natural_language: String,
    recurrence_end: Option<String>,
) -> Result<Task, String> {
    with_db(|conn| {
        let rule =
            parse_recurrence(&natural_language).ok_or_else(|| {
                format!("Could not parse recurrence from: '{}'", natural_language)
            })?;
        let now = chrono::Utc::now();
        let next_due = compute_next_due(&rule, &now)
            .ok_or("Failed to compute next due date")?;
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.recurrence_rule = Some(rule.to_json());
        task.next_due = Some(next_due.to_rfc3339());
        task.recurrence_end = recurrence_end;
        save_task(conn, task)?;
        Ok(task.clone())
    })
}

#[tauri::command]
pub fn get_recurring_tasks() -> Result<Vec<Task>, String> {
    with_db(|conn| {
        let all = load_tasks(conn)?;
        Ok(all.into_iter().filter(|t| t.recurrence_rule.is_some()).collect())
    })
}

#[tauri::command]
pub fn delete_recurrence(task_id: String) -> Result<Task, String> {
    with_db(|conn| {
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.recurrence_rule = None;
        task.next_due = None;
        task.recurrence_end = None;
        save_task(conn, task)?;
        Ok(task.clone())
    })
}

#[tauri::command]
pub fn get_due_tasks_now() -> Result<Vec<Task>, String> {
    with_db(|conn| get_due_tasks(conn))
}

#[tauri::command]
pub fn update_recurrence_rule(
    task_id: String,
    natural_language: String,
) -> Result<Task, String> {
    with_db(|conn| {
        let rule =
            parse_recurrence(&natural_language).ok_or_else(|| {
                format!("Could not parse: '{}'", natural_language)
            })?;
        let now = chrono::Utc::now();
        let next_due =
            compute_next_due(&rule, &now).ok_or("Failed to compute next due date")?;
        let mut tasks = load_tasks(conn)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task {} not found", task_id))?;
        task.recurrence_rule = Some(rule.to_json());
        task.next_due = Some(next_due.to_rfc3339());
        save_task(conn, task)?;
        Ok(task.clone())
    })
}
