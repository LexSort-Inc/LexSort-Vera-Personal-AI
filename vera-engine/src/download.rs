use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tracing::{error, info};
use sha2::{Sha256, Digest};

#[derive(Debug, Clone)]
pub enum DownloadPhase {
    Idle,
    CheckingExisting,
    Downloading { bytes_downloaded: u64, total_bytes: u64 },
    Verifying,
    Complete,
    Failed(String),
}

#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub phase: DownloadPhase,
    pub model_name: String,
}

impl DownloadProgress {
    pub fn new(model_name: String) -> Self {
        Self { phase: DownloadPhase::Idle, model_name }
    }
}

pub struct ModelDownloader {
    pub url: String,
    pub target_path: PathBuf,
    pub expected_sha256: Option<String>,
    pub fallback_url: Option<String>,
    pub fallback_target_path: Option<PathBuf>,
    pub fallback_sha256: Option<String>,
}

impl ModelDownloader {
    pub fn new(
        url: String,
        target_path: PathBuf,
        expected_sha256: Option<String>,
        fallback_url: Option<String>,
        fallback_target_path: Option<PathBuf>,
        fallback_sha256: Option<String>,
    ) -> Self {
        Self { url, target_path, expected_sha256, fallback_url, fallback_target_path, fallback_sha256 }
    }

    pub async fn download(
        &self,
        progress: Arc<Mutex<DownloadProgress>>,
    ) -> anyhow::Result<()> {
        set_phase(&progress, DownloadPhase::CheckingExisting).await;

        // Check primary model existence
        if self.target_path.exists() {
            if let Some(expected) = &self.expected_sha256 {
                if !expected.is_empty() {
                    set_phase(&progress, DownloadPhase::Verifying).await;
                    match verify_sha256(&self.target_path, expected).await {
                        Ok(true) => {
                            info!("Model exists and SHA256 matches. Skipping download.");
                            set_phase(&progress, DownloadPhase::Complete).await;
                            return Ok(());
                        }
                        Ok(false) => {
                            info!("Existing model SHA256 mismatch. Re-downloading.");
                            tokio::fs::remove_file(&self.target_path).await.ok();
                        }
                        Err(e) => {
                            info!("Could not verify existing model ({}). Re-downloading.", e);
                            tokio::fs::remove_file(&self.target_path).await.ok();
                        }
                    }
                } else {
                    info!("Model exists, no SHA256 configured. Using existing file.");
                    set_phase(&progress, DownloadPhase::Complete).await;
                    return Ok(());
                }
            } else {
                info!("Model exists, no SHA256 configured. Using existing file.");
                set_phase(&progress, DownloadPhase::Complete).await;
                return Ok(());
            }
        }

        // Check fallback model existence
        if let Some(fb_target) = &self.fallback_target_path {
            if fb_target.exists() {
                if let Some(fb_sha) = &self.fallback_sha256 {
                    if !fb_sha.is_empty() {
                        set_phase(&progress, DownloadPhase::Verifying).await;
                        match verify_sha256(fb_target, fb_sha).await {
                            Ok(true) => {
                                info!("Fallback model exists and SHA256 matches. Skipping download.");
                                set_phase(&progress, DownloadPhase::Complete).await;
                                return Ok(());
                            }
                            _ => {
                                tokio::fs::remove_file(fb_target).await.ok();
                            }
                        }
                    }
                }
                info!("Fallback model exists (no SHA256). Using as-is.");
                set_phase(&progress, DownloadPhase::Complete).await;
                return Ok(());
            }
        }

        // ---- Disk space check ----
        let parent = self.target_path.parent()
            .or_else(|| self.fallback_target_path.as_ref().and_then(|p| p.parent()))
            .unwrap_or(&self.target_path);
        let min_required: u64 = 3_000_000_000;

        let free_bytes = fs2::available_space(parent)?;
        let primary_size: u64 = 2_500_000_000; // Q6_K ~2.5 GB

        let use_fallback = free_bytes < min_required
            && self.fallback_url.is_some()
            && self.fallback_target_path.is_some();

        if use_fallback {
            info!(
                "Insufficient space ({:.2} GB) for primary model. Falling back to Q4_K_M.",
                free_bytes as f64 / 1_073_741_824.0
            );
            let fb_url = self.fallback_url.as_ref().unwrap();
            let fb_path = self.fallback_target_path.as_ref().unwrap();
            let fb_sha = self.fallback_sha256.clone();
            // Set progress model name to fallback
            {
                let mut p = progress.lock().await;
                p.model_name = fb_path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
            }
            return self.do_download(fb_url, fb_path, fb_sha, progress).await;
        }

        if free_bytes < min_required {
            let msg = format!(
                "Insufficient disk space: {:.2} GB free, need at least {} GB.",
                free_bytes as f64 / 1_073_741_824.0,
                min_required / 1_073_741_824,
            );
            error!("{}", msg);
            set_phase(&progress, DownloadPhase::Failed(msg)).await;
            anyhow::bail!("Disk space check failed");
        }

        info!("Disk space OK: {:.2} GB free", free_bytes as f64 / 1_073_741_824.0);

        // Also check fallback size if primary is too big for free space
        if free_bytes < primary_size + 500_000_000
            && self.fallback_url.is_some()
            && self.fallback_target_path.is_some()
        {
            info!("Free space tight — using Q4_K_M fallback instead.");
            let fb_url = self.fallback_url.as_ref().unwrap();
            let fb_path = self.fallback_target_path.as_ref().unwrap();
            let fb_sha = self.fallback_sha256.clone();
            {
                let mut p = progress.lock().await;
                p.model_name = fb_path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
            }
            return self.do_download(fb_url, fb_path, fb_sha, progress).await;
        }

        self.do_download(&self.url, &self.target_path, self.expected_sha256.clone(), progress).await
    }

    async fn do_download(
        &self,
        url: &str,
        target: &PathBuf,
        sha: Option<String>,
        progress: Arc<Mutex<DownloadProgress>>,
    ) -> anyhow::Result<()> {
        let tmp_path = target.with_extension("gguf.tmp");
        tokio::fs::remove_file(&tmp_path).await.ok();
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        info!("Downloading model from {}", url);
        set_phase(&progress, DownloadPhase::Downloading {
            bytes_downloaded: 0,
            total_bytes: 0,
        }).await;

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(7200))
            .build()?;

        let mut response = client.get(url).send().await?;
        if !response.status().is_success() {
            let msg = format!("HTTP {} when fetching model", response.status());
            error!("{}", msg);
            set_phase(&progress, DownloadPhase::Failed(msg.clone())).await;
            anyhow::bail!(msg);
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut file = tokio::fs::File::create(&tmp_path).await?;
        let mut downloaded: u64 = 0;
        let mut hasher = Sha256::new();
        let mut last_log_pct: u32 = 0;

        loop {
            let chunk = response.chunk().await?;
            let Some(chunk) = chunk else { break };
            file.write_all(&chunk).await?;
            hasher.update(&chunk);
            downloaded += chunk.len() as u64;

            let pct = if total_size > 0 {
                (downloaded as f64 / total_size as f64 * 100.0) as u32
            } else {
                0
            };
            if pct >= last_log_pct + 5 {
                info!("Download: {}% ({} / {} MB)",
                    pct, downloaded / (1024 * 1024), total_size / (1024 * 1024));
                last_log_pct = pct;
            }

            set_phase(&progress, DownloadPhase::Downloading {
                bytes_downloaded: downloaded,
                total_bytes: total_size,
            }).await;
        }

        file.flush().await?;
        drop(file);

        if let Some(expected) = sha {
            if !expected.is_empty() {
                set_phase(&progress, DownloadPhase::Verifying).await;
                let actual = format!("{:x}", hasher.finalize());
                if actual != expected {
                    tokio::fs::remove_file(&tmp_path).await.ok();
                    let msg = format!(
                        "SHA256 mismatch: expected {}...{}",
                        &expected[..8.min(expected.len())],
                        &expected[expected.len().saturating_sub(8)..]
                    );
                    error!("{}", msg);
                    set_phase(&progress, DownloadPhase::Failed(msg.clone())).await;
                    anyhow::bail!(msg);
                }
                info!("SHA256 verification passed.");
            }
        }

        tokio::fs::rename(&tmp_path, target).await?;
        set_phase(&progress, DownloadPhase::Complete).await;
        info!("Model ready at {:?}", target);
        Ok(())
    }
}

async fn verify_sha256(path: &PathBuf, expected: &str) -> anyhow::Result<bool> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = format!("{:x}", hasher.finalize());
    Ok(actual == expected)
}

async fn set_phase(progress: &Arc<Mutex<DownloadProgress>>, phase: DownloadPhase) {
    let mut guard = progress.lock().await;
    guard.phase = phase;
}
