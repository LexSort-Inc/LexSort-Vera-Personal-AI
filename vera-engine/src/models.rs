use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::warn;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCapability {
    pub tool_calling: bool,
    pub json_output_reliable: bool,
    pub context_window: usize,
    pub speed_tier: String,
}

lazy_static::lazy_static! {
    static ref BASELINE: HashMap<String, ModelCapability> = {
        let mut m = HashMap::new();
        // Physical filename on disk (Q6_K quantization)
        m.insert(
            "Llama-3.2-3B-Instruct-Q6_K".to_string(),
            ModelCapability {
                tool_calling: false,
                json_output_reliable: false,
                context_window: 8192,
                speed_tier: "fast".to_string(),
            },
        );
        // Logica alias used by the Python backend
        m.insert(
            "llama3.2:3b".to_string(),
            ModelCapability {
                tool_calling: false,
                json_output_reliable: false,
                context_window: 8192,
                speed_tier: "fast".to_string(),
            },
        );
        m.insert(
            "mistral-nemo".to_string(),
            ModelCapability {
                tool_calling: true,
                json_output_reliable: true,
                context_window: 32768,
                speed_tier: "medium".to_string(),
            },
        );
        m.insert(
            "deepseek-r1".to_string(),
            ModelCapability {
                tool_calling: true,
                json_output_reliable: true,
                context_window: 128000,
                speed_tier: "slow".to_string(),
            },
        );
        m
    };
}

#[derive(Debug, Deserialize)]
pub struct CapabilityManifest {
    #[allow(dead_code)]
    pub module: String,
    #[allow(dead_code)]
    pub version: String,
    pub capabilities_required: CapabilityRequirements,
    pub model_preferences: Vec<ModelPreference>,
}

#[derive(Debug, Deserialize)]
pub struct CapabilityRequirements {
    pub tool_calling: bool,
    pub json_output: bool,
    pub context_window_min: usize,
}

#[derive(Debug, Deserialize)]
pub struct ModelPreference {
    pub model_id: String,
    #[allow(dead_code)]
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ModelSelectionResponse {
    pub selected_model: String,
    pub reason: String,
    pub status: String,
    pub context_window: usize,
    pub capabilities: Vec<String>,
}

pub fn select_model(
    manifest: &CapabilityManifest,
    installed_models: &[String],
) -> ModelSelectionResponse {
    let mut candidates: Vec<(String, String)> = Vec::new();

    for preferred in &manifest.model_preferences {
        if !installed_models.contains(&preferred.model_id) {
            continue;
        }

        let baseline = BASELINE.get(&preferred.model_id);
        if let Some(cap) = baseline {
            let meets_tool = !manifest.capabilities_required.tool_calling || cap.tool_calling;
            let meets_json = !manifest.capabilities_required.json_output || cap.json_output_reliable;
            let meets_context = cap.context_window >= manifest.capabilities_required.context_window_min;

            if meets_tool && meets_json && meets_context {
                candidates.push((preferred.model_id.clone(), "matched preference".to_string()));
            }
        } else {
            warn!("Model '{}' not found in baseline – skipping.", preferred.model_id);
        }
    }

    if let Some((model, reason)) = candidates.into_iter().next() {
        let cap = BASELINE.get(&model).unwrap();
        return ModelSelectionResponse {
            selected_model: model.clone(),
            reason,
            status: "ready".to_string(),
            context_window: cap.context_window,
            capabilities: if cap.tool_calling {
                vec!["tool_calling".to_string(), "json_output".to_string(), "multi_turn".to_string()]
            } else {
                vec!["chat".to_string(), "instruction_following".to_string()]
            },
        };
    }

    if let Some(fallback) = installed_models.first() {
        if let Some(cap) = BASELINE.get(fallback) {
            return ModelSelectionResponse {
                selected_model: fallback.clone(),
                reason: "No preferred model matched – using fallback".to_string(),
                status: "degraded".to_string(),
                context_window: cap.context_window,
                capabilities: vec!["chat".to_string()],
            };
        }
    }

    warn!("No installed models found – defaulting to llama3.2:3b.");
    ModelSelectionResponse {
        selected_model: "llama3.2:3b".to_string(),
        reason: "Emergency fallback – model may not be installed".to_string(),
        status: "unreliable".to_string(),
        context_window: 8192,
        capabilities: vec!["chat".to_string()],
    }
}
