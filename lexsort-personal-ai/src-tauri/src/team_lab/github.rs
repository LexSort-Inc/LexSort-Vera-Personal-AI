use std::path::{Path, PathBuf};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConfig {
    pub token: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub head: String,
    pub base: String,
    pub url: String,
    pub state: String,
}

pub struct GitRepo {
    repo: git2::Repository,
    _path: PathBuf,
    token: String,
}

#[derive(Debug, Deserialize)]
struct GitHubPRResponse {
    number: u64,
    html_url: String,
    state: String,
}

impl GitRepo {
    pub fn open(path: &Path, token: &str) -> Result<Self> {
        let repo = git2::Repository::open(path)
            .with_context(|| format!("Failed to open git repo at {:?}", path))?;
        Ok(Self { repo, _path: path.to_path_buf(), token: token.to_string() })
    }

    pub fn clone(url: &str, path: &Path, branch: &str, token: &str) -> Result<Self> {
        let mut callbacks = git2::RemoteCallbacks::new();
        let token_owned = token.to_string();
        callbacks.credentials(move |_url, username, _allowed| {
            git2::Cred::userpass_plaintext(
                username.unwrap_or("git"),
                &token_owned,
            )
        });

        let mut fo = git2::FetchOptions::new();
        fo.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fo);
        builder.branch(branch);

        let repo = builder
            .clone(url, path)
            .with_context(|| format!("Failed to clone {} to {:?}", url, path))?;

        Ok(Self { repo, _path: path.to_path_buf(), token: token.to_string() })
    }

    pub fn pull(&self, branch: &str) -> Result<()> {
        let mut remote = self.repo.find_remote("origin")?;
        let mut callbacks = git2::RemoteCallbacks::new();
        let token = self.token.clone();
        callbacks.credentials(move |_url, username, _allowed| {
            git2::Cred::userpass_plaintext(username.unwrap_or("git"), &token)
        });
        let mut fo = git2::FetchOptions::new();
        fo.remote_callbacks(callbacks);
        remote.fetch(&[branch], Some(&mut fo), None)?;

        let fetch_head = self.repo.find_reference("FETCH_HEAD")?;
        let fetch_commit = self.repo.reference_to_annotated_commit(&fetch_head)?;
        let analysis = self.repo.merge_analysis(&[&fetch_commit])?;
        if analysis.0.is_fast_forward() {
            let mut reference = self.repo.find_reference(&format!("refs/heads/{}", branch))?;
            reference.set_target(fetch_commit.id(), "Fast-forward")?;
            self.repo.set_head(&format!("refs/heads/{}", branch))?;
            self.repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
        }
        Ok(())
    }

    pub fn push(&self, branch: &str) -> Result<()> {
        let mut remote = self.repo.find_remote("origin")?;
        let mut callbacks = git2::RemoteCallbacks::new();
        let token = self.token.clone();
        callbacks.credentials(move |_url, username, _allowed| {
            git2::Cred::userpass_plaintext(username.unwrap_or("git"), &token)
        });
        let mut push_opts = git2::PushOptions::new();
        push_opts.remote_callbacks(callbacks);
        remote.push(
            &[&format!("refs/heads/{}:refs/heads/{}", branch, branch)],
            Some(&mut push_opts),
        )?;
        Ok(())
    }

    pub fn create_branch(&self, name: &str) -> Result<()> {
        let commit = self.repo.head()?.peel_to_commit()?;
        self.repo.branch(name, &commit, false)?;
        Ok(())
    }

    pub fn checkout(&self, name: &str) -> Result<()> {
        let obj = self.repo.revparse_single(name)?;
        self.repo.checkout_tree(&obj, None)?;
        self.repo.set_head(&format!("refs/heads/{}", name))?;
        Ok(())
    }

    pub fn commit_and_push(&self, branch: &str, message: &str) -> Result<()> {
        let mut index = self.repo.index()?;
        index.add_all(["."].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;
        let oid = index.write_tree()?;
        let tree = self.repo.find_tree(oid)?;
        let parent = self.repo.head()?.peel_to_commit()?;
        let sig = self.repo.signature()?;
        self.repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;
        self.push(branch)?;
        Ok(())
    }

    pub fn worktree(&self, name: &str, path: &Path) -> Result<()> {
        let branch = self.repo.find_branch(name, git2::BranchType::Local)?;
        let _commit = branch.get().peel_to_commit()?;
        let mut opts = git2::WorktreeAddOptions::new();
        let _wt = self.repo.worktree(name, path, Some(&mut opts))?;
        Ok(())
    }

    pub fn delete_remote_branch(&self, branch: &str) -> Result<()> {
        let mut remote = self.repo.find_remote("origin")?;
        let mut callbacks = git2::RemoteCallbacks::new();
        let token = self.token.clone();
        callbacks.credentials(move |_url, username, _allowed| {
            git2::Cred::userpass_plaintext(username.unwrap_or("git"), &token)
        });
        let mut push_opts = git2::PushOptions::new();
        push_opts.remote_callbacks(callbacks);
        remote.push(&[&format!(":refs/heads/{}", branch)], Some(&mut push_opts))?;
        Ok(())
    }
}

pub async fn create_pr_async(config: &GitHubConfig, title: &str, head: &str, body: &str) -> Result<PullRequest> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls",
        config.repo_owner, config.repo_name
    );
    let payload = json!({
        "title": title,
        "head": head,
        "base": config.base_branch,
        "body": body,
        "maintainer_can_modify": true,
    });
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "VERA-Team-Lab")
        .json(&payload)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .with_context(|| "Failed to send PR creation request")?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("GitHub API error {}: {}", status, text));
    }
    let data: GitHubPRResponse = response.json().await?;
    Ok(PullRequest {
        number: data.number,
        title: title.to_string(),
        head: head.to_string(),
        base: config.base_branch.clone(),
        url: data.html_url,
        state: data.state,
    })
}

pub async fn merge_pr_async(config: &GitHubConfig, pr_number: u64, method: &str) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/merge",
        config.repo_owner, config.repo_name, pr_number
    );
    let payload = json!({ "merge_method": method });
    let response = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "VERA-Team-Lab")
        .json(&payload)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .with_context(|| "Failed to send merge request")?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Merge API error {}: {}", status, text));
    }
    Ok(())
}

pub async fn list_open_prs(config: &GitHubConfig) -> Result<Vec<PullRequest>> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open",
        config.repo_owner, config.repo_name
    );
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "VERA-Team-Lab")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .with_context(|| "Failed to list PRs")?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("GitHub API error {}: {}", status, text));
    }
    let items: Vec<serde_json::Value> = response.json().await?;
    let prs = items.iter().map(|v| PullRequest {
        number: v["number"].as_u64().unwrap_or(0),
        title: v["title"].as_str().unwrap_or("").to_string(),
        head: v["head"]["ref"].as_str().unwrap_or("").to_string(),
        base: v["base"]["ref"].as_str().unwrap_or("").to_string(),
        url: v["html_url"].as_str().unwrap_or("").to_string(),
        state: v["state"].as_str().unwrap_or("").to_string(),
    }).collect();
    Ok(prs)
}
