use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::friends::{self, Friend};
use crate::p2p::{self, P2pStatus};
use crate::state::{AppState, Peer, Settings};
use crate::{desktop, discovery, transfer};

#[derive(Serialize)]
pub struct Bootstrap {
    settings: Settings,
    peers: Vec<Peer>,
    friends: Vec<Friend>,
    p2p: P2pStatus,
    lan_error: Option<String>,
    local_ips: Vec<String>,
    os: &'static str,
    version: String,
    /// Files from `--send` / "Open with" that arrived before the UI was ready.
    cli_files: Vec<String>,
    /// How this install updates itself: "nsis", "appimage", "android" or "manual" (portable, deb, rpm).
    update_kind: &'static str,
}

fn update_kind() -> &'static str {
    match crate::state::os_type() {
        "android" => "android",
        "windows" if crate::state::portable_config_dir().is_none() => "nsis",
        "linux" if std::env::var_os("APPIMAGE").is_some() => "appimage",
        _ => "manual",
    }
}

/// Opens the GitHub release page (installs that cannot update themselves).
#[tauri::command]
pub fn open_releases() -> Result<(), String> {
    tauri_plugin_opener::open_url("https://github.com/Emre1001/Giga-Share/releases/latest", None::<&str>).map_err(|e| e.to_string())
}

/// Single call that returns everything the UI needs, and marks it ready for live events.
#[tauri::command]
pub fn frontend_ready(app: AppHandle, state: State<AppState>) -> Bootstrap {
    state.frontend_ready.store(true, Ordering::SeqCst);
    Bootstrap {
        settings: state.settings(),
        peers: discovery::peers(&app),
        friends: state.friends.lock().unwrap().clone(),
        p2p: p2p::status(&app),
        lan_error: state.lan_error.lock().unwrap().clone(),
        local_ips: discovery::local_ips(),
        os: crate::state::os_type(),
        version: app.package_info().version.to_string(),
        cli_files: std::mem::take(&mut *state.cli_files.lock().unwrap()),
        update_kind: update_kind(),
    }
}

#[tauri::command]
pub fn update_settings(app: AppHandle, state: State<AppState>, mut settings: Settings) -> Result<Settings, String> {
    settings.device_name = settings.device_name.trim().chars().take(40).collect();
    if settings.device_name.is_empty() {
        return Err("Device name cannot be empty".into());
    }
    if settings.port < 1024 || settings.port == discovery::PORT {
        return Err(format!("Port must be 1024–65535 and not {}", discovery::PORT));
    }
    settings.speed_limit_lan_mbps = settings.speed_limit_lan_mbps.max(0.0);
    settings.speed_limit_online_mbps = settings.speed_limit_online_mbps.max(0.0);
    let path = settings.download_path.trim().to_string();
    std::fs::create_dir_all(&path).map_err(|e| format!("Download folder: {e}"))?;
    settings.download_path = path;

    let old = state.settings();
    if old.context_menu != settings.context_menu {
        desktop::set_context_menu(settings.context_menu)?;
    }
    state.save_settings(settings.clone())?;
    if old.port != settings.port {
        transfer::restart_server(&app);
    }
    Ok(settings)
}

#[tauri::command]
pub async fn send_lan(app: AppHandle, ip: String, port: u16, paths: Vec<String>) -> Result<String, String> {
    let paths = resolve_paths(&app, paths)?;
    transfer::send(app, ip, port, paths)
}

#[tauri::command]
pub async fn send_online(app: AppHandle, friend_id: String, paths: Vec<String>) -> Result<String, String> {
    let paths = resolve_paths(&app, paths)?;
    p2p::send(app, friend_id, paths)
}

#[tauri::command]
pub fn respond_transfer(state: State<AppState>, id: String, accept: bool) {
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) {
        let _ = tx.send(accept);
    }
}

#[tauri::command]
pub fn cancel_transfer(state: State<AppState>, id: String) {
    if let Some(t) = state.cancels.lock().unwrap().get(&id) {
        t.cancel();
    }
}

/// Adds the friend locally and asks them (over P2P) to add us back.
/// `code` may be a friend code or a bare hex id (nearby pairing).
#[tauri::command]
pub fn add_friend(app: AppHandle, state: State<AppState>, code: String, name: String) -> Result<Friend, String> {
    let id = friends::decode_code(&code)?;
    if state.router.get().map(|r| hex::encode(r.endpoint().id().as_bytes())) == Some(id.clone()) {
        return Err("That is your own friend code".into());
    }
    if state.friends.lock().unwrap().iter().any(|f| f.id == id) {
        return Err("Already in your friends list".into());
    }
    let named = !name.trim().is_empty();
    let friend = p2p::upsert_friend(&app, &id, &name.chars().take(40).collect::<String>(), false)?;
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let res = p2p::request_friend(&app2, &id).await;
        let _ = app2.emit(
            "friend_answer",
            match res {
                Ok((accepted, their_name)) => {
                    if accepted && !named {
                        let _ = p2p::upsert_friend(&app2, &id, &their_name, true);
                    }
                    serde_json::json!({ "id": id, "accepted": accepted, "name": their_name })
                }
                Err(e) => serde_json::json!({ "id": id, "accepted": false, "error": e }),
            },
        );
    });
    Ok(friend)
}

#[tauri::command]
pub fn check_presence(app: AppHandle) {
    p2p::check_presence(app);
}

#[tauri::command]
pub async fn hotspot_start() -> Result<crate::hotspot::HotspotInfo, String> {
    tauri::async_runtime::spawn_blocking(crate::hotspot::start_tracked).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn hotspot_stop() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::hotspot::stop_tracked).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn remove_friend(state: State<AppState>, id: String) -> Result<(), String> {
    let mut list = state.friends.lock().unwrap();
    list.retain(|f| f.id != id);
    state.save_friends(&list)
}

#[tauri::command]
pub fn rename_friend(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    let name: String = name.trim().chars().take(40).collect();
    if name.is_empty() {
        return Err("Name cannot be empty".into());
    }
    let mut list = state.friends.lock().unwrap();
    let f = list.iter_mut().find(|f| f.id == id).ok_or("Unknown friend")?;
    f.display_name = name;
    state.save_friends(&list)
}

#[tauri::command]
pub fn create_text_file(app: AppHandle, text: String) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("text");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("Text {secs}.txt"));
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_download_folder(state: State<AppState>) -> Result<(), String> {
    let dir = state.settings().download_path;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
fn resolve_paths(_app: &AppHandle, paths: Vec<String>) -> Result<Vec<String>, String> {
    Ok(paths)
}

/// Android pickers return `content://` URIs; copy them into the cache so the
/// transfer code can work with real paths.
#[cfg(target_os = "android")]
fn resolve_paths(app: &AppHandle, paths: Vec<String>) -> Result<Vec<String>, String> {
    use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("outgoing");
    paths
        .into_iter()
        .map(|p| {
            if !p.starts_with("content://") {
                return Ok(p);
            }
            let fp: FilePath = p.parse().map_err(|_| format!("Bad URI: {p}"))?;
            let mut opts = OpenOptions::new();
            opts.read(true);
            let mut src = app.fs().open(fp, opts).map_err(|e| e.to_string())?;
            // shortcut: name guessed from the URI's last segment, upgrade to a DISPLAY_NAME query if names look wrong.
            let decoded = p.replace("%2F", "/").replace("%3A", ":").replace("%20", " ");
            let name = decoded.rsplit(['/', ':']).next().filter(|n| !n.is_empty()).unwrap_or("file");
            let dest = dir.join(uuid::Uuid::new_v4().simple().to_string()).join(name);
            std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
            let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, &mut out).map_err(|e| e.to_string())?;
            Ok(dest.to_string_lossy().into_owned())
        })
        .collect()
}

#[tauri::command]
pub fn set_language(state: State<AppState>, lang: String) {
    if ["en", "de", "tr"].contains(&lang.as_str()) {
        *state.lang.lock().unwrap() = lang;
    }
}
