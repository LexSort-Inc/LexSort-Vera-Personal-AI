use std::path::Path;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct HardwareProfile {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub free_disk_gb: f64,
    pub cpu_count: usize,
    pub recommended_model: String,
    pub recommendation_reason: String,
    pub gpu_available: bool,
    pub can_run_q6_k: bool,
    pub can_run_q4_k_m: bool,
}

pub fn detect_hardware(models_dir: &Path) -> HardwareProfile {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let total_ram = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let available_ram = sys.available_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let cpu_count = sys.cpus().len();

    let free_disk = fs2::available_space(models_dir)
        .map(|b| b as f64 / 1_073_741_824.0)
        .unwrap_or(0.0);

    // GPU detection (best-effort — probe for common indicators)
    let gpu_available = std::process::Command::new("nvidia-smi")
        .output()
        .is_ok()
        || std::process::Command::new("rocminfo")
            .output()
            .is_ok()
        || cfg!(target_os = "macos"); // Apple Silicon has unified GPU

    // RAM thresholds (3B parameter models)
    let can_run_q6_k = total_ram >= 16.0 && available_ram >= 4.0 && free_disk >= 4.0;
    let can_run_q4_k_m = total_ram >= 8.0 && available_ram >= 2.5 && free_disk >= 3.0;

    let (recommended_model, reason) = if can_run_q6_k {
        ("Llama-3.2-3B-Instruct-Q6_K".to_string(), "Hardware supports standard-quality model (≥16 GB RAM, ≥4 GB free disk)".to_string())
    } else if can_run_q4_k_m {
        ("Llama-3.2-3B-Instruct-Q4_K_M".to_string(), "System meets minimum requirements. Using lightweight model (≥8 GB RAM).".to_string())
    } else {
        ("Llama-3.2-3B-Instruct-Q4_K_M".to_string(), format!(
            "Low-resource system ({:.0} GB RAM, {:.1} GB free disk). The Q4_K_M model may still run but performance is not guaranteed.",
            total_ram, free_disk
        ))
    };

    HardwareProfile {
        total_ram_gb: (total_ram * 10.0).round() / 10.0,
        available_ram_gb: (available_ram * 10.0).round() / 10.0,
        free_disk_gb: (free_disk * 10.0).round() / 10.0,
        cpu_count,
        recommended_model,
        recommendation_reason: reason,
        gpu_available,
        can_run_q6_k,
        can_run_q4_k_m,
    }
}
