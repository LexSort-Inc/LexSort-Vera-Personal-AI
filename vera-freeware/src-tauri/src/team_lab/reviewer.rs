use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

use crate::team_lab::ticket::Ticket;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResult {
    pub passed: bool,
    pub issues: Vec<ReviewIssue>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewIssue {
    pub severity: String,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,
}

pub async fn review_ticket(ticket: &Ticket, diff: &str, model: Option<&str>) -> Result<ReviewResult> {
    let model_used = model.unwrap_or("llama3.2:3b-freeware");
    let token = read_vera_token()?;

    let system_prompt = r#"
You are a code reviewer. Given a git diff, analyze the code changes and flag any issues.

Rules:
- Look for syntax errors, logic bugs, style violations, and security concerns.
- Provide a summary and a list of issues with severity (error/warning/suggestion).
- Return ONLY valid JSON with the following structure:
  { "passed": bool, "issues": [ { "severity": "error|warning|suggestion", "file": "path", "line": 123, "message": "..." } ], "summary": "..." }
- If the diff is empty or trivial, return passed=true with empty issues.
- Be strict about security issues and code correctness.
"#;

    let user_prompt = format!(
        "Ticket: {}\nDescription: {}\nDiff:\n```diff\n{}\n```\n\nReview this diff and return structured JSON.",
        ticket.id, ticket.description, diff
    );

    let client = reqwest::Client::new();
    let payload = json!({
        "model": model_used,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
    });

    let response = tokio::time::timeout(
        Duration::from_secs(60),
        client
            .post("http://127.0.0.1:8888/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send(),
    )
    .await
    .map_err(|_| anyhow!("Reviewer request timed out"))?
    .map_err(|e| anyhow!("Reviewer request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Reviewer LLM returned {}: {}", status, text));
    }

    let data: serde_json::Value = response.json().await?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow!("Reviewer response missing content"))?;

    let cleaned = content
        .trim()
        .strip_prefix("```json")
        .or_else(|| content.trim().strip_prefix("```"))
        .map(|s| s.trim_end().strip_suffix("```").unwrap_or(s).trim())
        .unwrap_or(content.trim());

    let review: ReviewResult = serde_json::from_str(cleaned)
        .map_err(|e| anyhow!("Failed to parse reviewer JSON: {}. Response: {}", e, content))?;

    Ok(review)
}

pub async fn run_final_check(tickets: &[Ticket], diffs: &[String]) -> Result<bool> {
    let mut all_passed = true;
    for (ticket, diff) in tickets.iter().zip(diffs.iter()) {
        let result = review_ticket(ticket, diff, None).await?;
        if !result.passed {
            all_passed = false;
        }
    }
    Ok(all_passed)
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_review_result_serialization() {
        let result = ReviewResult {
            passed: false,
            issues: vec![ReviewIssue {
                severity: "error".to_string(),
                file: Some("src/main.ts".to_string()),
                line: Some(42),
                message: "Missing null check".to_string(),
            }],
            summary: "Fix error".to_string(),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("Missing null check"));
    }
}
