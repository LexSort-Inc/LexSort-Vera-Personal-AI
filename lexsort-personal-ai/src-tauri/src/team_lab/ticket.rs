use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatus {
    Open,
    Claimed,
    InProgress,
    Review,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    All,
    Windows,
    Macos,
    Linux,
    React,
    Rust,
    Python,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TicketStatus,
    pub platform: Platform,
    pub claimed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub context: Option<String>,
    pub file_path: Option<String>,
}

impl Ticket {
    pub fn new(title: String, description: String, platform: Platform) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            description,
            status: TicketStatus::Open,
            platform,
            claimed_by: None,
            created_at: now.clone(),
            updated_at: now,
            context: None,
            file_path: None,
        }
    }
}
