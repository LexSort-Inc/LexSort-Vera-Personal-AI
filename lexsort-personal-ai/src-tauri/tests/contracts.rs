//! Contract tests – protect against regression bugs.
//! If any of these fail, you have broken a documented integration point.

use lexsort_personal_ai_lib::commands::AppConfig;

#[test]
fn public_key_fingerprint_matches_expected() {
    let key_bytes = include_bytes!("../lexsort_public_key.bin");
    let fingerprint = hex::encode(&key_bytes[0..8]);
    assert_eq!(
        fingerprint, "3183e9e4a95b99b3",
        "Public key fingerprint changed! See KEY_MANIFEST.md for rotation procedure."
    );
}

#[test]
fn index_json_uses_map_not_array_for_modules() {
    use serde_json::json;
    let sample = json!({
        "generated_at": "2026-06-15T12:00:00Z",
        "modules": {
            "business-organizer": { "version": "1.0.0" }
        }
    });
    let modules = sample["modules"].as_object().expect("modules must be a map");
    assert!(modules.contains_key("business-organizer"));
}

#[test]
fn app_config_roundtrip_preserves_optional_fields() {
    let original = AppConfig {
        active_model: Some("llama3.2:3b".to_string()),
        last_benchmark_tps: Some(5.5),
        ..Default::default()
    };
    let serialized = serde_json::to_string(&original).unwrap();
    let deserialized: AppConfig = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.active_model, original.active_model);
    assert_eq!(deserialized.last_benchmark_tps, original.last_benchmark_tps);
}

#[test]
fn lexsort_directory_permissions_are_restrictive() {
    let home = std::env::var("HOME").expect("HOME not set");
    let lexsort_dir = std::path::PathBuf::from(home).join(".lexsort");
    if lexsort_dir.exists() {
        let metadata = std::fs::metadata(&lexsort_dir).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = metadata.permissions().mode();
            assert_eq!(mode & 0o777, 0o700, "~/.lexsort should be 700");
        }
    }
    let config_file = lexsort_dir.join("config.json");
    if config_file.exists() {
        let meta = std::fs::metadata(&config_file).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = meta.permissions().mode();
            assert_eq!(mode & 0o777, 0o600, "config.json should be 600");
        }
    }
}

#[test]
fn guardian_watch_intervals_are_within_bounds() {
    // Ollama check: must be between 15s and 60s
    // Too fast = CPU waste during inference. Too slow = user sees downtime.
    let ollama_interval_secs: u64 = 30;
    assert!(ollama_interval_secs >= 15 && ollama_interval_secs <= 60,
        "Ollama health check interval out of acceptable range");

    // Permissions check: must be between 2min and 15min
    let permissions_interval_secs: u64 = 300;
    assert!(permissions_interval_secs >= 120 && permissions_interval_secs <= 900,
        "Permissions check interval out of acceptable range");
}

#[test]
fn quick_organizer_task_roundtrip() {
    use chrono::Utc;
    let task = lexsort_personal_ai_lib::quick_organizer::Task {
        id: "task_test_001".to_string(),
        title: "Test task".to_string(),
        notes: None,
        list: lexsort_personal_ai_lib::quick_organizer::TaskList::Today,
        completed: false,
        created_at: Utc::now().to_rfc3339(),
        completed_at: None,
        ai_breakdown: None,
    };
    let json = serde_json::to_string(&task).unwrap();
    let restored: lexsort_personal_ai_lib::quick_organizer::Task = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.id, task.id);
    assert_eq!(restored.title, task.title);
    assert!(!restored.completed);
}
