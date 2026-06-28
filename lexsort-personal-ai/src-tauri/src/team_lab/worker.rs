use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use anyhow::Result;
use crate::team_lab::sandbox::{Sandbox, SandboxConfig, SandboxOutput};

#[derive(Debug, Clone, PartialEq)]
pub enum WorkerStatus {
    Idle,
    Running,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone)]
pub struct Worker {
    pub id: String,
    pub name: String,
    pub status: WorkerStatus,
}

pub struct AgentPool {
    workers: Vec<Worker>,
    sandbox: Sandbox,
    sandbox_config: SandboxConfig,
    running: Arc<AtomicBool>,
}

impl AgentPool {
    pub fn new(work_dir: &std::path::Path, count: usize) -> Result<Self> {
        let sandbox = Sandbox::new(work_dir)?;
        let workers = (0..count)
            .map(|i| Worker {
                id: uuid::Uuid::new_v4().to_string(),
                name: format!("agent-{}", i + 1),
                status: WorkerStatus::Idle,
            })
            .collect();

        Ok(Self {
            workers,
            sandbox,
            sandbox_config: SandboxConfig::default(),
            running: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn workers(&self) -> &[Worker] {
        &self.workers
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn execute_task(&mut self, agent_index: usize, task_description: &str) -> Result<SandboxOutput> {
        if agent_index >= self.workers.len() {
            anyhow::bail!("Agent index {} out of range (max {})", agent_index, self.workers.len() - 1);
        }

        self.workers[agent_index].status = WorkerStatus::Running;
        self.running.store(true, Ordering::Relaxed);

        let result = self.sandbox.run_command(
            "python3",
            &["-c", &format!("print('Agent {} processing: {}')", agent_index, task_description)],
            &self.sandbox_config,
        );

        match &result {
            Ok(_) => self.workers[agent_index].status = WorkerStatus::Completed,
            Err(e) => self.workers[agent_index].status = WorkerStatus::Failed(e.to_string()),
        }

        self.running.store(false, Ordering::Relaxed);
        result
    }

    pub fn stop_all(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        for worker in &mut self.workers {
            worker.status = WorkerStatus::Idle;
        }
    }
}
