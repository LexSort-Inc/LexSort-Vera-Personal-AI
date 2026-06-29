use std::path::Path;
use std::process::{Command, Stdio};
use anyhow::{Context, Result};

pub struct Sandbox {
    work_dir: std::path::PathBuf,
}

#[derive(Debug, Clone)]
pub struct SandboxConfig {
    pub timeout_secs: u64,
    pub max_memory_mb: u64,
    pub allowed_commands: Vec<String>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 300,
            max_memory_mb: 1024,
            allowed_commands: vec![
                "cargo".into(),
                "npm".into(),
                "node".into(),
                "python".into(),
                "python3".into(),
                "gcc".into(),
                "clang".into(),
                "make".into(),
                "cmake".into(),
                "rustc".into(),
                "go".into(),
                "dotnet".into(),
            ],
        }
    }
}

impl Sandbox {
    pub fn new(work_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(work_dir)
            .with_context(|| format!("Failed to create sandbox dir {:?}", work_dir))?;
        Ok(Self { work_dir: work_dir.to_path_buf() })
    }

    pub fn run_command(&self, program: &str, args: &[&str], config: &SandboxConfig) -> Result<SandboxOutput> {
        if !config.allowed_commands.iter().any(|c| program.ends_with(c)) {
            anyhow::bail!("Command '{}' is not in the allowed list", program);
        }

        let child = Command::new(program)
            .args(args)
            .current_dir(&self.work_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("Failed to spawn '{}'", program))?;

        let output = child
            .wait_with_output()
            .context("Failed to wait for command output")?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(SandboxOutput {
            exit_code: output.status.code().unwrap_or(-1),
            stdout,
            stderr,
        })
    }

    pub fn work_dir(&self) -> &Path {
        &self.work_dir
    }
}

#[derive(Debug, Clone)]
pub struct SandboxOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}
