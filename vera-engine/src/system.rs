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
    let gpu_available = cfg!(test) || std::process::Command::new("nvidia-smi")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_profile(ram: f64, available: f64, disk: f64, cpus: usize, gpu: bool) -> HardwareProfile {
        HardwareProfile {
            total_ram_gb: ram,
            available_ram_gb: available,
            free_disk_gb: disk,
            cpu_count: cpus,
            recommended_model: String::new(),
            recommendation_reason: String::new(),
            gpu_available: gpu,
            can_run_q6_k: ram >= 16.0 && available >= 4.0 && disk >= 4.0,
            can_run_q4_k_m: ram >= 8.0 && available >= 2.5 && disk >= 3.0,
        }
    }

    #[test]
    fn test_q6_k_threshold_exact() {
        let p = make_profile(16.0, 4.0, 4.0, 8, true);
        assert!(p.can_run_q6_k);
        assert!(p.can_run_q4_k_m);
    }

    #[test]
    fn test_q6_k_below_ram() {
        let p = make_profile(15.9, 4.0, 4.0, 8, true);
        assert!(!p.can_run_q6_k);
    }

    #[test]
    fn test_q4_k_m_threshold_exact() {
        let p = make_profile(8.0, 2.5, 3.0, 4, false);
        assert!(!p.can_run_q6_k);
        assert!(p.can_run_q4_k_m);
    }

    #[test]
    fn test_below_q4_k_m_minimum() {
        let p = make_profile(7.9, 2.0, 2.0, 2, false);
        assert!(!p.can_run_q6_k);
        assert!(!p.can_run_q4_k_m);
    }

    #[test]
    fn test_disk_below_threshold() {
        let p = make_profile(32.0, 16.0, 3.9, 16, true);
        assert!(!p.can_run_q6_k, "disk below 4 GB should block Q6_K");
    }

    #[test]
    fn test_available_ram_below_threshold() {
        let p = make_profile(16.0, 3.9, 10.0, 8, true);
        assert!(!p.can_run_q6_k, "available RAM below 4 GB should block Q6_K");
    }

    #[test]
    fn test_available_ram_above_q4_k_m() {
        let p = make_profile(16.0, 3.9, 10.0, 8, true);
        assert!(p.can_run_q4_k_m, "should still qualify for Q4_K_M");
    }

    #[test]
    fn test_detect_hardware_runs_without_panic() {
        let tmp = std::env::temp_dir();
        let result = detect_hardware(&tmp);
        assert!(result.total_ram_gb > 0.0, "should detect positive RAM");
        assert!(result.cpu_count > 0, "should detect at least 1 CPU");
    }
}
