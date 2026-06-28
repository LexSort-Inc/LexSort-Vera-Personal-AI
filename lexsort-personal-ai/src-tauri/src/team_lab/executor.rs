// src-tauri/src/team_lab/executor.rs
//
// Agent loop: takes a ticket, calls local LLM via VERA Engine,
// writes code to repo, runs build/test, returns structured result.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tokio::time::timeout;
use tracing::{info, warn};

use crate::team_lab::ticket::Ticket;

// ============================================================================
// Result Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub diff: String,
    pub logs: String,
    pub errors: String,
    pub duration_ms: u64,
    pub file_path: Option<String>,
    pub model_used: String,
}

#[derive(Debug, Clone)]
enum BuildSystem {
    Npm,
    Cargo,
    Python,
    None,
}

// ============================================================================
// Main Executor
// ============================================================================

/// Execute a single ticket: LLM → write file → build → return result
pub async fn execute_ticket(
    ticket: &Ticket,
    repo_path: &Path,
    model: Option<&str>,
) -> Result<ExecutionResult> {
    let start = Instant::now();
    let model_used = model.unwrap_or("llama3.2:3b-freeware").to_string();

    info!("Executing ticket {} with model {}", ticket.id, model_used);

    // 1. Read session token for VERA Engine auth
    let token = read_vera_token()?;

    // 2. Build system prompts
    let build_system = detect_build_system(repo_path);
    let system_prompt = build_system_prompt(&build_system);
    let user_prompt = build_user_prompt(ticket, repo_path);

    // 3. Call VERA Engine
    let code = call_vera_engine(&token, &model_used, &system_prompt, &user_prompt).await?;

    // 4. Determine target file path
    let file_path = resolve_file_path(ticket, repo_path);

    // 5. Write code to file
    write_code_to_file(&file_path, &code)?;
    info!("Code written to {:?}", file_path);

    // 6. Run build/test
    let (build_logs, build_errors, build_success) =
        run_build(repo_path, &build_system).await;

    // 7. Compute diff
    let diff = compute_diff(repo_path, &file_path).await
        .unwrap_or_else(|_| format!("+ {}\n{}", file_path.display(), code));

    let duration_ms = start.elapsed().as_millis() as u64;
    info!(
        "Ticket {} completed in {}ms. Success: {}",
        ticket.id, duration_ms, build_success
    );

    Ok(ExecutionResult {
        success: build_success,
        diff,
        logs: build_logs,
        errors: build_errors,
        duration_ms,
        file_path: Some(file_path.to_string_lossy().to_string()),
        model_used,
    })
}

// ============================================================================
// VERA Engine Call
// ============================================================================

async fn call_vera_engine(
    token: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String> {
    let client = reqwest::Client::new();

    let payload = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.2,
        "max_tokens": 4096
    });

    let response = timeout(
        Duration::from_secs(120),
        client
            .post("http://127.0.0.1:8888/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send(),
    )
    .await
    .map_err(|_| anyhow!("VERA Engine request timed out after 120s"))?
    .map_err(|e| anyhow!("VERA Engine request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("VERA Engine returned {}: {}", status, text));
    }

    let data: serde_json::Value = response.json().await
        .map_err(|e| anyhow!("Failed to parse VERA Engine response: {}", e))?;

    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow!("VERA Engine response missing content field"))?
        .to_string();

    // Strip markdown code fences if present (```typescript ... ```)
    let code = strip_code_fences(&content);

    Ok(code)
}

fn strip_code_fences(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if lines.first().map(|l| l.starts_with("```")).unwrap_or(false)
        && lines.last().map(|l| l.trim() == "```").unwrap_or(false)
    {
        lines[1..lines.len() - 1].join("\n")
    } else {
        content.to_string()
    }
}

// ============================================================================
// Prompt Building
// ============================================================================

fn build_system_prompt(build_system: &BuildSystem) -> String {
    let lang = match build_system {
        BuildSystem::Npm => "TypeScript/React",
        BuildSystem::Cargo => "Rust",
        BuildSystem::Python => "Python",
        BuildSystem::None => "the appropriate language",
    };

    format!(
        r#"You are an expert {} software engineer working on a production codebase.
Your task is to write clean, production-ready code based on a ticket description.

Rules:
- Write ONLY the code, no explanations, no markdown fences, no preamble
- Follow best practices for {}
- Include appropriate error handling
- Add brief inline comments for complex logic
- The code must compile/run without modification"#,
        lang, lang
    )
}

fn build_user_prompt(ticket: &Ticket, _repo_path: &Path) -> String {
    let context = ticket.context.as_deref().unwrap_or("None");
    let file_hint = ticket
        .file_path
        .as_deref()
        .map(|p| format!("\nTarget file: {}", p))
        .unwrap_or_default();

    format!(
        "Ticket ID: {}\nDescription: {}\nPlatform: {:?}{}\nAdditional context: {}\n\nWrite the complete implementation:",
        ticket.id, ticket.description, ticket.platform, file_hint, context
    )
}

// ============================================================================
// File Path Resolution
// ============================================================================

fn resolve_file_path(ticket: &Ticket, repo_path: &Path) -> PathBuf {
    if let Some(ref path) = ticket.file_path {
        // Use explicit path from ticket
        repo_path.join(path)
    } else {
        // Derive from ticket ID + platform
        let safe_name = ticket
            .id
            .replace(' ', "_")
            .replace('/', "_")
            .replace(':', "_");

        let ext = match ticket.platform {
            crate::team_lab::ticket::Platform::React => "tsx",
            crate::team_lab::ticket::Platform::Rust => "rs",
            crate::team_lab::ticket::Platform::Python => "py",
            _ => "ts",
        };

        repo_path.join("src").join(format!("{}.{}", safe_name, ext))
    }
}

fn write_code_to_file(file_path: &Path, code: &str) -> Result<()> {
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(file_path, code)?;
    Ok(())
}

// ============================================================================
// Build Execution
// ============================================================================

fn detect_build_system(repo_path: &Path) -> BuildSystem {
    if repo_path.join("Cargo.toml").exists() {
        BuildSystem::Cargo
    } else if repo_path.join("package.json").exists() {
        BuildSystem::Npm
    } else if repo_path.join("requirements.txt").exists()
        || repo_path.join("pyproject.toml").exists()
    {
        BuildSystem::Python
    } else {
        BuildSystem::None
    }
}

async fn run_build(repo_path: &Path, build_system: &BuildSystem) -> (String, String, bool) {
    let (cmd, args) = match build_system {
        BuildSystem::Cargo => ("cargo", vec!["build"]),
        BuildSystem::Npm => ("npm", vec!["run", "build"]),
        BuildSystem::Python => ("python", vec!["-m", "pytest", "--tb=short"]),
        BuildSystem::None => {
            info!("No build system detected, skipping build");
            return (String::new(), String::new(), true);
        }
    };

    info!("Running build: {} {:?}", cmd, args);

    let result = timeout(
        Duration::from_secs(120),
        tokio::task::spawn_blocking({
            let repo_path = repo_path.to_path_buf();
            let cmd = cmd.to_string();
            let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
            move || {
                Command::new(&cmd)
                    .args(&args)
                    .current_dir(&repo_path)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
            }
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(output))) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let success = output.status.success();

            if !success {
                warn!("Build failed with exit code: {:?}", output.status.code());
            }

            (stdout, stderr, success)
        }
        Ok(Ok(Err(e))) => (String::new(), format!("Build process error: {}", e), false),
        Ok(Err(e)) => (String::new(), format!("Build task error: {}", e), false),
        Err(_) => (String::new(), "Build timed out after 120s".to_string(), false),
    }
}

// ============================================================================
// Diff
// ============================================================================

async fn compute_diff(repo_path: &Path, file_path: &Path) -> Result<String> {
    let result = tokio::task::spawn_blocking({
        let repo_path = repo_path.to_path_buf();
        let file_path = file_path.to_path_buf();
        move || {
            Command::new("git")
                .args(["diff", "--", file_path.to_str().unwrap_or("")])
                .current_dir(&repo_path)
                .output()
        }
    })
    .await??;

    if result.stdout.is_empty() {
        // File is new (untracked) — show as full addition
        let content = std::fs::read_to_string(file_path)?;
        Ok(format!(
            "+++ {}\n{}",
            file_path.display(),
            content
                .lines()
                .map(|l| format!("+{}", l))
                .collect::<Vec<_>>()
                .join("\n")
        ))
    } else {
        Ok(String::from_utf8_lossy(&result.stdout).to_string())
    }
}

// ============================================================================
// Token Utility
// ============================================================================

fn read_vera_token() -> Result<String> {
    let token_path = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot find home directory"))?
        .join(".lexsort")
        .join("vera-engine.token");

    let token = std::fs::read_to_string(&token_path)
        .map_err(|_| anyhow!("VERA Engine token not found. Is the Engine running?"))?
        .trim()
        .to_string();

    if token.is_empty() {
        return Err(anyhow!("VERA Engine token is empty"));
    }

    Ok(token)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_code_fences_typescript() {
        let input = "```typescript\nconst x = 1;\n```";
        assert_eq!(strip_code_fences(input), "const x = 1;");
    }

    #[test]
    fn test_strip_code_fences_no_fences() {
        let input = "const x = 1;";
        assert_eq!(strip_code_fences(input), "const x = 1;");
    }

    #[test]
    fn test_detect_build_system_none() {
        let path = Path::new("/tmp/nonexistent_repo_xyz");
        assert!(matches!(detect_build_system(path), BuildSystem::None));
    }
}
