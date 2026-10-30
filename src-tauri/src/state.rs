use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, RwLock};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::friends::Friend;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    pub device_name: String,
    pub download_path: String,
    pub port: u16,
    /// Accept without asking: LAN devices / online friends, set separately.
    pub auto_accept_lan: bool,
    pub auto_accept_online: bool,
    /// Pre-2.1 single switch; migrated into both fields on load.
    #[serde(skip_serializing)]
    pub auto_accept: Option<bool>,
    pub online_mode: bool,
    pub speed_limit_lan_mbps: f64,
    pub speed_limit_online_mbps: f64,
    pub minimize_to_tray: bool,
    /// "Send with Giga-Share" entry in the file manager / Explorer context menu.
    pub context_menu: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            device_name: default_device_name(),
            download_path: default_download_dir().to_string_lossy().into_owned(),
            port: 52526,
            auto_accept_lan: false,
            auto_accept_online: false,
            auto_accept: None,
            online_mode: false,
            speed_limit_lan_mbps: 0.0,
            speed_limit_online_mbps: 0.0,
            minimize_to_tray: true,
            context_menu: true,
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub device_type: String,
    pub os_type: String,
    /// iroh EndpointId (hex) when the peer's P2P node is up; enables one-tap friend pairing.
    pub p2p_id: Option<String>,
}

pub struct AppState {
    pub config_dir: PathBuf,
    /// Random per-process id, used by discovery to ignore our own broadcasts.
    pub instance_id: String,
    pub settings: RwLock<Settings>,
    pub peers: Mutex<HashMap<String, (Peer, std::time::Instant)>>,
    pub friends: Mutex<Vec<Friend>>,
    /// Incoming transfers waiting for the user to accept/reject.
    pub pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pub cancels: Mutex<HashMap<String, CancellationToken>>,
    /// Open transfer requests and running transfers (as sent to the UI), so a UI that
    /// starts later (window recreated from the tray, Android activity restarted) sees them.
    pub requests: Mutex<Vec<serde_json::Value>>,
    pub active: Mutex<HashMap<String, serde_json::Value>>,
    pub router: tokio::sync::OnceCell<iroh::protocol::Router>,
    pub p2p_error: Mutex<Option<String>>,
    pub lan_error: Mutex<Option<String>>,
    pub lan_server: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    /// Files passed on the command line before the UI was ready.
    pub cli_files: Mutex<Vec<String>>,
    pub frontend_ready: AtomicBool,
    /// UI language (en/de/tr) for notifications.
    pub lang: Mutex<String>,
}

impl AppState {
    pub fn new(config_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&config_dir);
        let mut settings: Settings = read_json(&config_dir.join("settings.json")).unwrap_or_default();
        if let Some(v) = settings.auto_accept.take() {
            settings.auto_accept_lan = v;
            settings.auto_accept_online = v;
        }
        let friends: Vec<Friend> = read_json(&config_dir.join("friends.json")).unwrap_or_default();
        Self {
            config_dir,
            instance_id: uuid::Uuid::new_v4().simple().to_string(),
            settings: RwLock::new(settings),
            peers: Mutex::new(HashMap::new()),
            friends: Mutex::new(friends),
            pending: Mutex::new(HashMap::new()),
            cancels: Mutex::new(HashMap::new()),
            requests: Mutex::new(Vec::new()),
            active: Mutex::new(HashMap::new()),
            router: tokio::sync::OnceCell::new(),
            p2p_error: Mutex::new(None),
            lan_error: Mutex::new(None),
            lan_server: Mutex::new(None),
            cli_files: Mutex::new(Vec::new()),
            frontend_ready: AtomicBool::new(false),
            lang: Mutex::new("en".into()),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().unwrap().clone()
    }

    pub fn save_settings(&self, s: Settings) -> Result<(), String> {
        write_json(&self.config_dir.join("settings.json"), &s)?;
        *self.settings.write().unwrap() = s;
        Ok(())
    }

    pub fn save_friends(&self, friends: &[Friend]) -> Result<(), String> {
        write_json(&self.config_dir.join("friends.json"), &friends)
    }
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

/// Write via temp file + rename so a crash never leaves a half-written config.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let data = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// `portable.marker` next to the executable keeps config beside the exe.
pub fn portable_config_dir() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    dir.join("portable.marker").exists().then(|| dir.join("config"))
}

pub fn os_type() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "android" => "android",
        "ios" => "ios",
        _ => "linux",
    }
}

pub fn device_type() -> &'static str {
    match os_type() {
        "android" | "ios" => "mobile",
        _ => "desktop",
    }
}

fn default_device_name() -> String {
    #[cfg(target_os = "android")]
    if let Ok(prop) = std::fs::read_to_string("/system/build.prop") {
        if let Some(m) = prop.lines().find_map(|l| l.strip_prefix("ro.product.model=")) {
            return m.trim().to_string();
        }
    }
    hostname::get()
        .ok()
        .map(|h| h.to_string_lossy().trim().to_string())
        .filter(|h| !h.is_empty() && h != "localhost")
        .unwrap_or_else(|| format!("Giga-Share {}", std::env::consts::OS))
}

fn default_download_dir() -> PathBuf {
    if cfg!(target_os = "android") {
        return PathBuf::from("/storage/emulated/0/Download/Giga-Share");
    }
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join("Giga-Share")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_auto_accept_migrates_to_both() {
        let dir = std::env::temp_dir().join(format!("gs-state-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), r#"{"auto_accept": true, "port": 52530}"#).unwrap();
        let s = AppState::new(dir.clone()).settings();
        assert!(s.auto_accept_lan && s.auto_accept_online && s.auto_accept.is_none());
        assert_eq!(s.port, 52530);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
