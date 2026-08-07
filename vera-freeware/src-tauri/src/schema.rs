use rusqlite::Connection;

pub fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

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
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tasks (
            id              TEXT PRIMARY KEY NOT NULL,
            title           TEXT NOT NULL,
            notes           TEXT,
            list            TEXT NOT NULL DEFAULT 'today',
            completed       INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            completed_at    TEXT,
            ai_breakdown    TEXT,
            start_time      TEXT,
            end_time        TEXT,
            category        TEXT,
            all_day         INTEGER,
            recurrence_rule TEXT,
            next_due        TEXT,
            recurrence_end  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_next_due
            ON tasks (next_due)
            WHERE completed = 0 AND next_due IS NOT NULL;",
    )
    .map_err(|e| e.to_string())
}
