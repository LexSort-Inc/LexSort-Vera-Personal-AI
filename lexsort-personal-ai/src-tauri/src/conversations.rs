use serde::{Deserialize, Serialize};
use rusqlite::{params, Connection, Result};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: i64,
    pub role: String,
    pub content: String,
}

fn db_connection() -> std::result::Result<Connection, String> {
    let db_path = crate::data_dir().join("conversations.db");
    
    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open conversations database: {}", e))?;
        
    Ok(conn)
}

fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER NOT NULL,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_conversations() -> std::result::Result<Vec<Conversation>, String> {
    let conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
        
    let rows = stmt
        .query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
        
    let mut list = Vec::new();
    for r in rows {
        if let Ok(conv) = r {
            list.push(conv);
        }
    }
    
    Ok(list)
}

#[tauri::command]
pub fn create_conversation(id: String, title: String) -> std::result::Result<(), String> {
    let conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, title, now, now],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn save_messages(conversation_id: String, messages: Vec<Message>) -> std::result::Result<(), String> {
    let mut conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Clear old messages for this conversation
    tx.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|e| e.to_string())?;
    
    // Insert new messages
    let now = chrono::Utc::now().to_rfc3339();
    for msg in messages {
        tx.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![msg.id, conversation_id, msg.role, msg.content, now],
        )
        .map_err(|e| e.to_string())?;
    }
    
    // Update the updated_at timestamp on the conversation
    tx.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn delete_conversation(id: String) -> std::result::Result<(), String> {
    let conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
        
    Ok(())
}

#[tauri::command]
pub fn rename_conversation(id: String, title: String) -> std::result::Result<(), String> {
    let conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn load_messages(conversation_id: String) -> std::result::Result<Vec<Message>, String> {
    let conn = db_connection()?;
    init_db(&conn).map_err(|e| format!("Database initialization failed: {}", e))?;
    
    let mut stmt = conn
        .prepare("SELECT id, role, content FROM messages WHERE conversation_id = ?1 ORDER BY rowid ASC")
        .map_err(|e| e.to_string())?;
        
    let rows = stmt
        .query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
        
    let mut list = Vec::new();
    for r in rows {
        if let Ok(msg) = r {
            list.push(msg);
        }
    }
    
    Ok(list)
}
