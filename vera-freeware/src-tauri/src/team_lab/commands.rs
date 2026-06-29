use tauri::{Emitter, State};
use std::sync::Mutex;
use crate::team_lab::{
    self,
    ticket::{Ticket, TicketStatus, Platform},
    orchestrator::Orchestrator,
    worker::AgentPool,
    github::{self, GitRepo, GitHubConfig, PullRequest},
    executor,
    reviewer,
    LabConfig, LabStatus,
};

pub struct LabState {
    pub orchestrator: Mutex<Orchestrator>,
    pub pool: Mutex<Option<AgentPool>>,
    pub repo: Mutex<Option<GitRepo>>,
}

impl Default for LabState {
    fn default() -> Self {
        Self {
            orchestrator: Mutex::new(Orchestrator::new()),
            pool: Mutex::new(None),
            repo: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn lab_get_status(state: State<'_, LabState>) -> Result<LabStatus, String> {
    let config = team_lab::load_config();
    let tickets = team_lab::load_tickets();
    let pool_guard = state.pool.lock().map_err(|e| e.to_string())?;
    let repo_guard = state.repo.lock().map_err(|e| e.to_string())?;

    let open_count = tickets.iter().filter(|t| t.status == TicketStatus::Open).count();
    let claimed_count = tickets.iter().filter(|t| t.status == TicketStatus::Claimed || t.status == TicketStatus::InProgress).count();
    let completed_count = tickets.iter().filter(|t| t.status == TicketStatus::Done).count();
    let active = pool_guard.as_ref().map(|p| p.workers().iter().filter(|w| {
        use crate::team_lab::worker::WorkerStatus;
        matches!(w.status, WorkerStatus::Running)
    }).count()).unwrap_or(0);

    Ok(LabStatus {
        configured: !config.repo_url.is_empty(),
        connected: repo_guard.is_some(),
        agent_count: config.agent_count,
        active_agents: active,
        open_tickets: open_count,
        claimed_tickets: claimed_count,
        completed_tickets: completed_count,
    })
}

#[tauri::command]
pub fn lab_get_config() -> Result<LabConfig, String> {
    Ok(team_lab::load_config())
}

#[tauri::command]
pub fn lab_save_config(config: LabConfig) -> Result<(), String> {
    team_lab::save_config(&config)
}

#[tauri::command]
pub fn lab_list_tickets() -> Result<Vec<Ticket>, String> {
    let tickets = team_lab::load_tickets();
    Ok(tickets)
}

#[tauri::command]
pub fn lab_create_ticket(title: String, description: String, platform: String) -> Result<Ticket, String> {
    let plat = match platform.to_lowercase().as_str() {
        "windows" => Platform::Windows,
        "macos" => Platform::Macos,
        "linux" => Platform::Linux,
        "react" => Platform::React,
        "rust" => Platform::Rust,
        "python" => Platform::Python,
        _ => Platform::All,
    };
    let ticket = Ticket::new(title, description, plat);
    let mut tickets = team_lab::load_tickets();
    tickets.push(ticket.clone());
    team_lab::save_tickets(&tickets)?;
    Ok(ticket)
}

#[tauri::command]
pub fn lab_decompose_spec(title: String, description: String, platforms: Vec<String>) -> Result<Vec<Ticket>, String> {
    let plats: Vec<Platform> = platforms.iter().map(|p| match p.to_lowercase().as_str() {
        "windows" => Platform::Windows,
        "macos" => Platform::Macos,
        "linux" => Platform::Linux,
        "react" => Platform::React,
        "rust" => Platform::Rust,
        "python" => Platform::Python,
        _ => Platform::All,
    }).collect();

    let mut tickets = team_lab::load_tickets();
    let mut created = Vec::new();

    for platform in &plats {
        let label = match platform {
            Platform::All => "all",
            Platform::Windows => "windows",
            Platform::Macos => "macos",
            Platform::Linux => "linux",
            Platform::React => "react",
            Platform::Rust => "rust",
            Platform::Python => "python",
        };
        let ticket = Ticket::new(
            format!("[{}] {}", label, title),
            format!("{}\n\nPlatform: {}", description, label),
            platform.clone(),
        );
        created.push(ticket.clone());
        tickets.push(ticket);
    }
    team_lab::save_tickets(&tickets)?;
    Ok(created)
}

#[tauri::command]
pub fn lab_claim_ticket(ticket_id: String, state: State<'_, LabState>) -> Result<Ticket, String> {
    let config = team_lab::load_config();
    let mut tickets = team_lab::load_tickets();
    let ticket = tickets.iter_mut()
        .find(|t| t.id == ticket_id)
        .ok_or_else(|| format!("Ticket not found: {}", ticket_id))?;

    if ticket.status != TicketStatus::Open {
        return Err(format!("Ticket {} is not open (status: {:?})", ticket_id, ticket.status));
    }

    ticket.status = TicketStatus::Claimed;
    ticket.claimed_by = Some(config.machine_id.clone());
    ticket.updated_at = chrono::Utc::now().to_rfc3339();
    let result = ticket.clone();
    team_lab::save_tickets(&tickets)?;

    let mut guard = state.orchestrator.lock().map_err(|e| e.to_string())?;
    guard.claim_ticket(&ticket_id, &config.machine_id).ok();
    Ok(result)
}

#[tauri::command]
pub async fn lab_start_work(ticket_id: String, state: State<'_, LabState>) -> Result<String, String> {
    let mut tickets = team_lab::load_tickets();
    let ticket_idx = tickets.iter().position(|t| t.id == ticket_id)
        .ok_or_else(|| format!("Ticket not found: {}", ticket_id))?;

    if tickets[ticket_idx].status != TicketStatus::Claimed {
        return Err(format!("Ticket {} is not claimed", ticket_id));
    }

    tickets[ticket_idx].status = TicketStatus::InProgress;
    tickets[ticket_idx].updated_at = chrono::Utc::now().to_rfc3339();
    let ticket = tickets[ticket_idx].clone();
    team_lab::save_tickets(&tickets)?;

    {
        let mut guard = state.orchestrator.lock().map_err(|e| e.to_string())?;
        guard.start_work(&ticket_id).ok();
    }

    let work_dir = team_lab::lab_work_dir();
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    let repo_path = work_dir.join("repo");

    {
        let mut pool_guard = state.pool.lock().map_err(|e| e.to_string())?;
        if pool_guard.is_none() {
            let config = team_lab::load_config();
            let pool = AgentPool::new(&work_dir, config.agent_count).map_err(|e| e.to_string())?;
            *pool_guard = Some(pool);
        }
    }

    if repo_path.exists() {
        match executor::execute_ticket(&ticket, &repo_path, None).await {
            Ok(result) => {
                if result.success {
                    Ok(format!("Ticket {} completed in {}ms", ticket_id, result.duration_ms))
                } else {
                    Ok(format!("Ticket {} finished with build errors:\n{}", ticket_id, result.errors))
                }
            }
            Err(e) => Err(format!("Execution failed: {}", e)),
        }
    } else {
        Ok(format!("Started work on ticket {} (no repo cloned yet)", ticket_id))
    }
}

#[tauri::command]
pub fn lab_complete_ticket(ticket_id: String, state: State<'_, LabState>) -> Result<String, String> {
    let mut tickets = team_lab::load_tickets();
    let ticket = tickets.iter_mut()
        .find(|t| t.id == ticket_id)
        .ok_or_else(|| format!("Ticket not found: {}", ticket_id))?;

    ticket.status = TicketStatus::Done;
    ticket.updated_at = chrono::Utc::now().to_rfc3339();
    team_lab::save_tickets(&tickets)?;

    let mut guard = state.orchestrator.lock().map_err(|e| e.to_string())?;
    guard.complete_ticket(&ticket_id).ok();
    Ok(format!("Ticket {} completed", ticket_id))
}

#[tauri::command]
pub fn lab_init_repo(state: State<'_, LabState>) -> Result<String, String> {
    let config = team_lab::load_config();
    if config.repo_url.is_empty() {
        return Err("No repo URL configured. Save config first.".to_string());
    }

    let work_dir = team_lab::lab_work_dir();
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    let repo_path = work_dir.join("repo");

    let repo = GitRepo::clone(&config.repo_url, &repo_path, &config.branch, &config.github_token)
        .map_err(|e| format!("Failed to clone repo: {}", e))?;

    let mut guard = state.repo.lock().map_err(|e| e.to_string())?;
    *guard = Some(repo);
    Ok(format!("Cloned {} to {:?}", config.repo_url, repo_path))
}

#[tauri::command]
pub async fn lab_push_tickets() -> Result<String, String> {
    let tickets = team_lab::load_tickets();
    let config = team_lab::load_config();
    if config.repo_owner.is_empty() || config.repo_name.is_empty() {
        return Ok("Tickets saved locally. Configure repo_owner/repo_name for PR creation.".to_string());
    }

    let gh_config = GitHubConfig {
        token: config.github_token.clone(),
        repo_owner: config.repo_owner.clone(),
        repo_name: config.repo_name.clone(),
        base_branch: "main".to_string(),
    };

    let pr_title = format!("Team Lab: {} tickets ready for review", tickets.len());
    let body = tickets.iter()
        .map(|t| format!("- [x] {} ({:?})", t.title, t.status))
        .collect::<Vec<_>>()
        .join("\n");

    match github::create_pr_async(&gh_config, &pr_title, &config.branch, &body).await {
        Ok(pr) => Ok(format!("PR created: {}", pr.url)),
        Err(e) => Err(format!("Failed to create PR: {}", e)),
    }
}

#[tauri::command]
pub fn lab_stop_agents(state: State<'_, LabState>) -> Result<(), String> {
    let mut guard = state.pool.lock().map_err(|e| e.to_string())?;
    if let Some(pool) = guard.as_mut() {
        pool.stop_all();
    }
    Ok(())
}

#[tauri::command]
pub async fn lab_create_pr(job_title: String, job_body: Option<String>) -> Result<PullRequest, String> {
    let config = team_lab::load_config();
    if config.github_token.is_empty() || config.repo_owner.is_empty() || config.repo_name.is_empty() {
        return Err("GitHub config incomplete. Set token, repo_owner, and repo_name.".to_string());
    }
    let gh_config = GitHubConfig {
        token: config.github_token,
        repo_owner: config.repo_owner,
        repo_name: config.repo_name,
        base_branch: "main".to_string(),
    };
    let branch = if config.branch.is_empty() { "develop" } else { &config.branch };
    let body = job_body.unwrap_or_default();
    let pr = github::create_pr_async(&gh_config, &job_title, branch, &body)
        .await
        .map_err(|e| format!("PR creation failed: {}", e))?;
    Ok(pr)
}

#[tauri::command]
pub async fn lab_merge_pr(pr_number: u64, merge_method: Option<String>) -> Result<(), String> {
    let config = team_lab::load_config();
    let gh_config = GitHubConfig {
        token: config.github_token,
        repo_owner: config.repo_owner,
        repo_name: config.repo_name,
        base_branch: "main".to_string(),
    };
    let method = merge_method.unwrap_or_else(|| "squash".to_string());
    github::merge_pr_async(&gh_config, pr_number, &method)
        .await
        .map_err(|e| format!("Merge failed: {}", e))
}

#[tauri::command]
pub async fn lab_review_ticket(ticket_id: String) -> Result<reviewer::ReviewResult, String> {
    let tickets = team_lab::load_tickets();
    let ticket = tickets.iter()
        .find(|t| t.id == ticket_id)
        .ok_or_else(|| format!("Ticket not found: {}", ticket_id))?;

    let repo_path = team_lab::lab_work_dir().join("repo");
    let diff = compute_diff_for_ticket(&repo_path, ticket)
        .await
        .map_err(|e| format!("Failed to compute diff: {}", e))?;

    reviewer::review_ticket(ticket, &diff, None)
        .await
        .map_err(|e| format!("Review failed: {}", e))
}

async fn compute_diff_for_ticket(repo_path: &std::path::Path, _ticket: &Ticket) -> Result<String, String> {
    if !repo_path.exists() {
        return Err("No repo cloned yet".to_string());
    }
    let path = repo_path.to_path_buf();
    let diff = tokio::task::spawn_blocking(move || {
        use std::process::Command;
        let output = Command::new("git")
            .args(["diff", "HEAD"])
            .current_dir(&path)
            .output()
            .map_err(|e| format!("git diff failed: {}", e))?;
        Ok::<_, String>(String::from_utf8_lossy(&output.stdout).to_string())
    }).await.map_err(|e| format!("Task failed: {}", e))??;
    Ok(diff)
}

#[tauri::command]
pub async fn lab_approve_job(state: State<'_, LabState>, app: tauri::AppHandle) -> Result<reviewer::ReviewResult, String> {
    let tickets = team_lab::load_tickets();
    let repo_path = team_lab::lab_work_dir().join("repo");
    if !repo_path.exists() {
        return Err("No repo cloned. Run lab_init_repo first.".to_string());
    }

    let repo = GitRepo::open(&repo_path, "").map_err(|e| e.to_string())?;
    repo.commit_and_push("develop", "VERA Team Lab: auto-commit before review")
        .map_err(|e| format!("Commit failed: {}", e))?;

    let mut diffs = Vec::new();
    let ready_tickets: Vec<Ticket> = tickets.into_iter()
        .filter(|t| matches!(t.status, TicketStatus::InProgress | TicketStatus::Review | TicketStatus::Done))
        .collect();

    if ready_tickets.is_empty() {
        return Err("No tickets ready for review".to_string());
    }

    for ticket in &ready_tickets {
        let diff = compute_diff_for_ticket(&repo_path, ticket).await?;
        diffs.push(diff);
    }

    let all_passed = reviewer::run_final_check(&ready_tickets, &diffs)
        .await
        .map_err(|e| format!("Review failed: {}", e))?;

    {
        let mut scope = state.orchestrator.lock().map_err(|e| e.to_string())?;
        for ticket in &ready_tickets {
            if all_passed {
                scope.complete_ticket(&ticket.id).ok();
            }
        }
    }

    if all_passed {
        let config = team_lab::load_config();
        if !config.github_token.is_empty() {
            let gh_config = GitHubConfig {
                token: config.github_token,
                repo_owner: config.repo_owner,
                repo_name: config.repo_name,
                base_branch: "main".to_string(),
            };
            let branch = if config.branch.is_empty() { "develop" } else { &config.branch };
            let title = format!("VERA Team Lab: {} tickets", ready_tickets.len());
            let body = ready_tickets.iter()
                .map(|t| format!("- [x] {}", t.title))
                .collect::<Vec<_>>()
                .join("\n");
            if let Ok(pr) = github::create_pr_async(&gh_config, &title, branch, &body).await {
                let _ = app.emit("team_lab:pr_created", serde_json::json!({
                    "pr_number": pr.number,
                    "url": pr.url,
                }));
            }
        }
        Ok(reviewer::ReviewResult {
            passed: true,
            issues: vec![],
            summary: format!("All {} tickets passed review", ready_tickets.len()),
        })
    } else {
        Ok(reviewer::ReviewResult {
            passed: false,
            issues: vec![],
            summary: "Some tickets failed review. Check individual results.".to_string(),
        })
    }
}

#[tauri::command]
pub async fn lab_list_prs() -> Result<Vec<PullRequest>, String> {
    let config = team_lab::load_config();
    let gh_config = GitHubConfig {
        token: config.github_token,
        repo_owner: config.repo_owner,
        repo_name: config.repo_name,
        base_branch: "main".to_string(),
    };
    github::list_open_prs(&gh_config)
        .await
        .map_err(|e| format!("Failed to list PRs: {}", e))
}
