use serde::{Serialize, Deserialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskList {
    Today,
    ThisWeek,
    Someday,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: Option<String>,
    pub list: TaskList,
    pub completed: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub ai_breakdown: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TaskStore {
    pub tasks: Vec<Task>,
    pub last_modified: String,
}

fn quick_organizer_path() -> PathBuf {
    crate::lexsort_dir()
        .join("data")
        .join("quick_organizer")
        .join("tasks.json")
}

fn load_task_store() -> TaskStore {
    let path = quick_organizer_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_task_store(store: &TaskStore) -> Result<(), String> {
    let path = quick_organizer_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create organizer dir: {}", e))?;
    }

    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Serialization error: {}", e))?;

    std::fs::write(&path, &json)
        .map_err(|e| format!("Failed to save tasks: {}", e))?;

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
pub fn get_tasks() -> Result<Vec<Task>, String> {
    Ok(load_task_store().tasks)
}

#[tauri::command]
pub fn create_task(title: String, list: TaskList) -> Result<Task, String> {
    let mut store = load_task_store();
    let task = Task {
        id: format!("task_{}", chrono::Utc::now().timestamp_millis()),
        title,
        notes: None,
        list,
        completed: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
        ai_breakdown: None,
    };
    store.tasks.push(task.clone());
    store.last_modified = chrono::Utc::now().to_rfc3339();
    save_task_store(&store)?;
    Ok(task)
}

#[tauri::command]
pub fn update_task(task: Task) -> Result<(), String> {
    let mut store = load_task_store();
    if let Some(existing) = store.tasks.iter_mut().find(|t| t.id == task.id) {
        *existing = task;
    } else {
        return Err(format!("Task {} not found", task.id));
    }
    store.last_modified = chrono::Utc::now().to_rfc3339();
    save_task_store(&store)
}

#[tauri::command]
pub fn complete_task(task_id: String) -> Result<(), String> {
    let mut store = load_task_store();
    if let Some(task) = store.tasks.iter_mut().find(|t| t.id == task_id) {
        task.completed = true;
        task.completed_at = Some(chrono::Utc::now().to_rfc3339());
    } else {
        return Err(format!("Task {} not found", task_id));
    }
    store.last_modified = chrono::Utc::now().to_rfc3339();
    save_task_store(&store)
}

#[tauri::command]
pub fn delete_task(task_id: String) -> Result<(), String> {
    let mut store = load_task_store();
    let before = store.tasks.len();
    store.tasks.retain(|t| t.id != task_id);
    if store.tasks.len() == before {
        return Err(format!("Task {} not found", task_id));
    }
    store.last_modified = chrono::Utc::now().to_rfc3339();
    save_task_store(&store)
}

#[tauri::command]
pub fn move_task(task_id: String, new_list: TaskList) -> Result<(), String> {
    let mut store = load_task_store();
    if let Some(task) = store.tasks.iter_mut().find(|t| t.id == task_id) {
        task.list = new_list;
    } else {
        return Err(format!("Task {} not found", task_id));
    }
    store.last_modified = chrono::Utc::now().to_rfc3339();
    save_task_store(&store)
}

#[tauri::command]
pub fn cache_ai_breakdown(task_id: String, breakdown: String) -> Result<(), String> {
    let mut store = load_task_store();
    if let Some(task) = store.tasks.iter_mut().find(|t| t.id == task_id) {
        task.ai_breakdown = Some(breakdown);
    } else {
        return Err(format!("Task {} not found", task_id));
    }
    save_task_store(&store)
}
