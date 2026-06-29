use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct EngineConfig {
    pub port: u16,
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default)]
    pub require_auth: bool,     // reserved for Pro tier
    #[serde(default = "default_log_level")]
    pub log_level: String,
    pub llama_server_binary: PathBuf,
    pub token_path: PathBuf,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ModelConfig {
    pub default: String,
    pub models_dir: PathBuf,
    #[serde(default = "default_download_url")]
    pub download_url: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default = "default_fallback_url")]
    pub fallback_url: String,
    #[serde(default)]
    pub fallback_sha256: String,
    #[serde(default = "default_fallback_name")]
    pub fallback_name: String,
}

fn default_fallback_url() -> String {
    "https://models.lexsort.com/vera-models/Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string()
}
fn default_fallback_name() -> String {
    "Llama-3.2-3B-Instruct-Q4_K_M".to_string()
}

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub engine: EngineConfig,
    pub model: ModelConfig,
}

fn default_host() -> String {
    "127.0.0.1".to_string()
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_download_url() -> String {
    "https://models.lexsort.com/vera-models/Llama-3.2-3B-Instruct-Q6_K.gguf".to_string()
}

impl Config {
    pub fn model_path(&self) -> PathBuf {
        self.model.models_dir.join(&self.model.default).with_extension("gguf")
    }

    #[allow(dead_code)]
    pub fn fallback_model_path(&self) -> PathBuf {
        self.model.models_dir.join(&self.model.fallback_name).with_extension("gguf")
    }

    pub fn load() -> anyhow::Result<Self> {
        let home = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find home directory"))?;
        let config_path = home.join(".lexsort/vera-engine/config.toml");

        if !config_path.exists() {
            std::fs::create_dir_all(config_path.parent().unwrap())?;
            let default = r#"
[engine]
port = 8888
host = "127.0.0.1"
require_auth = false
log_level = "info"
llama_server_binary = "C:/Program Files/LexSort/VERA/llama-server.exe"
token_path = "$HOME/.lexsort/vera-engine/token"

[model]
default = "Llama-3.2-3B-Instruct-Q6_K"
models_dir = "$HOME/.lexsort/vera-engine/models"
download_url = "https://models.lexsort.com/vera-models/Llama-3.2-3B-Instruct-Q6_K.gguf"
sha256 = "1771887c15fc3d327cfee6fd593553b2126e88834bf48eae50e709d3f70dd998"
fallback_url = "https://models.lexsort.com/vera-models/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
fallback_sha256 = ""
fallback_name = "Llama-3.2-3B-Instruct-Q4_K_M"
"#;
            std::fs::write(&config_path, default)?;
        }

        let contents = std::fs::read_to_string(&config_path)?;
        let mut config: Config = toml::from_str(&contents)?;

        let home_str = home.to_string_lossy().to_string();
        expand_home(&mut config.engine.llama_server_binary, &home_str);
        expand_home(&mut config.engine.token_path, &home_str);
        expand_home(&mut config.model.models_dir, &home_str);

        Ok(config)
    }
}

fn expand_home(path: &mut PathBuf, home: &str) {
    let s = path.to_string_lossy().replace("$HOME", home);
    *path = PathBuf::from(s);
}
