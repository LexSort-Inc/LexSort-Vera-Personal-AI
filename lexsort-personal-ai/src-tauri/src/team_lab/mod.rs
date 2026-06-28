pub mod commands;
pub mod executor;
pub mod github;
pub mod orchestrator;
pub mod reviewer;
pub mod sandbox;
pub mod ticket;
pub mod worker;

pub use ticket::{Ticket, TicketStatus, Platform};
pub use orchestrator::Orchestrator;
pub use worker::{Worker, WorkerStatus, AgentPool};

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabConfig {
    pub repo_url: String,
    pub branch: String,
    pub agent_count: usize,
    pub github_token: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub machine_id: String,
}

impl Default for LabConfig {
    fn default() -> Self {
        Self {
            repo_url: String::new(),
            branch: "develop".into(),
            agent_count: 3,
            github_token: String::new(),
            repo_owner: String::new(),
            repo_name: String::new(),
            machine_id: whoami::fallible::hostname().unwrap_or_else(|_| "unknown".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabStatus {
    pub configured: bool,
    pub connected: bool,
    pub agent_count: usize,
    pub active_agents: usize,
    pub open_tickets: usize,
    pub claimed_tickets: usize,
    pub completed_tickets: usize,
}

fn lab_config_path() -> PathBuf {
    crate::lexsort_dir().join("modules").join("team_lab").join("config.json")
}

fn lab_tickets_path() -> PathBuf {
    crate::lexsort_dir().join("modules").join("team_lab").join("tickets.json")
}

fn lab_work_dir() -> PathBuf {
    crate::lexsort_dir().join("modules").join("team_lab").join("work")
}

pub fn load_config() -> LabConfig {
    let path = lab_config_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(config: &LabConfig) -> Result<(), String> {
    let path = lab_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn load_tickets() -> Vec<Ticket> {
    let path = lab_tickets_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_tickets(tickets: &[Ticket]) -> Result<(), String> {
    let path = lab_tickets_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(tickets).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
