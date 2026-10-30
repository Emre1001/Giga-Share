//! OS integration: tray, close-to-tray, `--send` CLI / second-instance hand-off,
//! notifications and the "Send with Giga-Share" file manager entry.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

static TRAY_OK: AtomicBool = AtomicBool::new(false);

/// Every non-flag argument that exists on disk is a file to send
/// (`--send` is accepted for Windows "Send To" / older shortcuts).
pub fn parse_cli(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with("--"))
        .map(|a| {
            let p = a.strip_prefix("file://").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(a));
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Shows the window, recreating it if it was closed to the tray.
pub fn show_main(app: &AppHandle) {
    let w = match app.get_webview_window("main") {
        Some(w) => w,
        #[cfg(desktop)]
        None => match app.config().app.windows.first().map(|c| tauri::WebviewWindowBuilder::from_config(app, c).and_then(|b| b.build())) {
            Some(Ok(w)) => w,
            Some(Err(e)) => return log::error!("Cannot open window: {e}"),
            None => return,
        },
        #[cfg(not(desktop))]
        None => return,
    };
    #[cfg(desktop)]
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

/// Whether closing the last window keeps the app running (tray on desktop, background service on Android).
pub fn keep_running(app: &AppHandle) -> bool {
    let wanted = app.state::<AppState>().settings().minimize_to_tray;
    #[cfg(desktop)]
    return wanted && TRAY_OK.load(Ordering::SeqCst);
    #[cfg(not(desktop))]
    wanted
}

pub fn handle_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    if state.frontend_ready.load(Ordering::SeqCst) {
        let _ = app.emit("cli_send_files", files);
    } else {
        state.cli_files.lock().unwrap().extend(files);
    }
}

#[cfg(desktop)]
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    show_main(app);
    handle_files(app, parse_cli(&argv, Path::new(&cwd)));
}

/// Notification texts in the UI language. `{}` is replaced by `arg`.
pub fn text(app: &AppHandle, key: &str, arg: &str) -> String {
    let lang = app.state::<AppState>().lang.lock().unwrap().clone();
    let s = match (lang.as_str(), key) {
        ("de", "complete") => "Übertragung abgeschlossen",
        ("tr", "complete") => "Aktarım tamamlandı",
        (_, "complete") => "Transfer complete",
        ("de", "incoming") => "Eingehende Übertragung",
        ("tr", "incoming") => "Gelen aktarım",
        (_, "incoming") => "Incoming transfer",
        ("de", "wantsSend") => "{} möchte dir etwas senden",
        ("tr", "wantsSend") => "{} sana bir şey göndermek istiyor",
        (_, "wantsSend") => "{} wants to send you something",
        ("de", "friendReq") => "Freundschaftsanfrage",
        ("tr", "friendReq") => "Arkadaşlık isteği",
        (_, "friendReq") => "Friend request",
        ("de", "wantsAdd") => "{} möchte dich hinzufügen",
        ("tr", "wantsAdd") => "{} seni eklemek istiyor",
        (_, "wantsAdd") => "{} wants to add you",
        ("de", "failed") => "Übertragung fehlgeschlagen",
        ("tr", "failed") => "Aktarım başarısız",
        (_, "failed") => "Transfer failed",
        ("de", "receivingFrom") => "Empfange von {}",
        ("tr", "receivingFrom") => "{} cihazından alınıyor",
        (_, "receivingFrom") => "Receiving from {}",
        ("de", "sendingTo") => "Sende an {}",
        ("tr", "sendingTo") => "{} cihazına gönderiliyor",
        (_, "sendingTo") => "Sending to {}",
        ("de", "accept") => "Annehmen",
        ("tr", "accept") => "Kabul et",
        (_, "accept") => "Accept",
        ("de", "decline") => "Ablehnen",
        ("tr", "decline") => "Reddet",
        (_, "decline") => "Decline",
        ("de", "cancel") => "Abbrechen",
        ("tr", "cancel") => "İptal",
        (_, "cancel") => "Cancel",
        ("de", "bgTitle") => "Bereit zum Empfangen",
        ("tr", "bgTitle") => "Almaya hazır",
        (_, "bgTitle") => "Ready to receive",
        ("de", "bgText") => "Geräte im WLAN und Freunde können dir Dateien senden",
        ("tr", "bgText") => "Wi-Fi'daki cihazlar ve arkadaşlar sana dosya gönderebilir",
        (_, "bgText") => "Devices on your Wi-Fi and friends can send you files",
        _ => key,
    };
    s.replace("{}", arg)
}

pub fn notify_if_hidden(app: &AppHandle, title: &str, body: &str) {
    let visible = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    if !visible {
        use tauri_plugin_notification::NotificationExt;
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

// ── Transfer lifecycle: kept in AppState for late UIs, mirrored to OS notifications ──

/// A transfer waits for a decision. Desktop brings the window up; Android posts a notification
/// with Accept / Decline that works without opening the app.
pub fn on_request(app: &AppHandle, id: &str, ev: serde_json::Value, peer: &str, what: &str) {
    app.state::<AppState>().requests.lock().unwrap().push(ev);
    let title = text(app, "incoming", "");
    let body = format!("{} · {what}", text(app, "wantsSend", peer));
    #[cfg(target_os = "android")]
    crate::android::request(app, id, &title, &body);
    #[cfg(desktop)]
    {
        let _ = id;
        notify_if_hidden(app, &title, &body);
        show_main(app);
    }
}

pub fn request_closed(app: &AppHandle, id: &str) {
    app.state::<AppState>().requests.lock().unwrap().retain(|r| r["id"] != id);
    #[cfg(target_os = "android")]
    crate::android::clear(id);
}

pub fn on_started(app: &AppHandle, id: &str, ev: serde_json::Value) {
    app.state::<AppState>().active.lock().unwrap().insert(id.to_string(), ev);
    on_progress(app, id, 0, 0);
}

/// Called about once a second while bytes flow.
#[allow(unused_variables)]
pub fn on_progress(app: &AppHandle, id: &str, done: u64, total: u64) {
    #[cfg(target_os = "android")]
    if let Some(ev) = app.state::<AppState>().active.lock().unwrap().get(id) {
        let peer = ev["peer"].as_str().unwrap_or_default();
        let key = if ev["direction"] == "send" { "sendingTo" } else { "receivingFrom" };
        let percent = if total > 0 { (done * 100 / total) as i32 } else { -1 };
        crate::android::progress(app, id, &text(app, key, peer), ev["file_name"].as_str().unwrap_or_default(), percent);
    }
}

pub fn on_finished(app: &AppHandle, id: &str, status: &str, path: Option<&str>) {
    let state = app.state::<AppState>();
    let ev = state.active.lock().unwrap().remove(id);
    state.requests.lock().unwrap().retain(|r| r["id"] != id);
    let name = ev.as_ref().and_then(|e| e["file_name"].as_str().map(str::to_string)).unwrap_or_default();
    match status {
        "done" => {
            #[cfg(target_os = "android")]
            crate::android::finished(app, id, &text(app, "complete", ""), &name);
            #[cfg(desktop)]
            notify_if_hidden(app, &text(app, "complete", ""), path.unwrap_or(&name));
        }
        "failed" => {
            #[cfg(target_os = "android")]
            crate::android::finished(app, id, &text(app, "failed", ""), &name);
            #[cfg(desktop)]
            notify_if_hidden(app, &text(app, "failed", ""), &name);
        }
        _ => {
            #[cfg(target_os = "android")]
            crate::android::clear(id);
        }
    }
    let _ = path;
}

/// Decision from the UI or an Android notification action.
pub fn respond(app: &AppHandle, id: &str, accept: bool) {
    if let Some(tx) = app.state::<AppState>().pending.lock().unwrap().remove(id) {
        let _ = tx.send(accept);
    }
}

pub fn cancel(app: &AppHandle, id: &str) {
    if let Some(t) = app.state::<AppState>().cancels.lock().unwrap().get(id) {
        t.cancel();
    }
}

#[cfg(desktop)]
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Show Giga-Share", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Giga-Share")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    match tray.build(app) {
        Ok(_) => TRAY_OK.store(true, Ordering::SeqCst),
        // Without a tray (e.g. no appindicator) closing must really quit, or the app becomes unreachable.
        Err(e) => log::warn!("Tray unavailable: {e}"),
    }

    // Closing the window destroys it (see `keep_running`) and the tray recreates it, so a tray-only
    // app runs without a webview. Autostart (`--minimized`) drops it right away.
    if std::env::args().any(|a| a == "--minimized") && TRAY_OK.load(Ordering::SeqCst) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.destroy();
        }
    }

    let enabled = app.state::<AppState>().settings().context_menu;
    std::thread::spawn(move || {
        if let Err(e) = set_context_menu(enabled) {
            log::warn!("Context menu: {e}");
        }
    });
    Ok(())
}

/// Path the file manager should launch. AppImages must use the .AppImage, not the mounted binary.
fn launcher_path() -> Result<PathBuf, String> {
    if let Some(p) = std::env::var_os("APPIMAGE") {
        return Ok(PathBuf::from(p));
    }
    std::env::current_exe().map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
pub fn set_context_menu(enabled: bool) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let data = dirs::data_dir().ok_or("No data dir")?;
    let exe = launcher_path()?.to_string_lossy().replace('"', "\\\"");
    let label = "Send with Giga-Share";
    let files: [(PathBuf, String, bool); 3] = [
        // Nemo (Cinnamon / Linux Mint)
        (
            data.join("nemo/actions/giga-share.nemo_action"),
            format!(
                "[Nemo Action]\nName={label}\nComment=Send the selection to another device\n\
                 Exec=\"{exe}\" --send %F\nIcon-Name=giga-share\nSelection=notnone\nExtensions=any;\nQuote=double\n"
            ),
            false,
        ),
        // Dolphin (KDE), KF5 >= 5.85 and KF6. KF6 requires the file to be executable.
        (
            data.join("kio/servicemenus/giga-share.desktop"),
            format!(
                "[Desktop Entry]\nType=Service\nMimeType=all/allfiles;inode/directory;\n\
                 X-KDE-ServiceTypes=KonqPopupMenu/Plugin\nActions=send\n\n\
                 [Desktop Action send]\nName={label}\nIcon=giga-share\nExec=\"{exe}\" --send %F\n"
            ),
            true,
        ),
        // Nautilus (GNOME) scripts menu
        (
            data.join(format!("nautilus/scripts/{label}")),
            format!(
                "#!/bin/sh\nIFS='\n'\n# shellcheck disable=SC2086\nexec \"{exe}\" --send $NAUTILUS_SCRIPT_SELECTED_FILE_PATHS\n"
            ),
            true,
        ),
    ];
    for (path, content, exec) in files {
        if enabled {
            std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))?;
            if exec {
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
            }
        } else if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn set_context_menu(enabled: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let appdata = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let lnk = PathBuf::from(appdata).join("Microsoft\\Windows\\SendTo\\Giga-Share.lnk");
    if !enabled {
        if lnk.exists() {
            std::fs::remove_file(&lnk).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let exe = launcher_path()?.to_string_lossy().replace('\'', "''");
    let lnk_s = lnk.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$s=(New-Object -COM WScript.Shell).CreateShortcut('{lnk_s}');$s.TargetPath='{exe}';$s.Arguments='--send';$s.IconLocation='{exe},0';$s.Save()"
    );
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    status.success().then_some(()).ok_or_else(|| "Could not create Send To shortcut".into())
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn set_context_menu(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli() {
        let tmp = std::env::temp_dir();
        let f = tmp.join(format!("gs-cli-{}", uuid::Uuid::new_v4()));
        std::fs::write(&f, b"x").unwrap();
        let args = vec!["giga-share".into(), "--send".into(), f.to_string_lossy().into(), "/nope/missing".into()];
        assert_eq!(parse_cli(&args, &tmp), vec![f.to_string_lossy().to_string()]);
        let rel = vec!["giga-share".into(), f.file_name().unwrap().to_string_lossy().into()];
        assert_eq!(parse_cli(&rel, &tmp), vec![f.to_string_lossy().to_string()]);
        std::fs::remove_file(f).unwrap();
    }
}

/// Android share intent: MainActivity.kt copies shared files into the cache and
/// appends their paths to `shared/inbox.txt`; we pick them up here.
#[cfg(target_os = "android")]
pub fn watch_share_inbox(app: AppHandle) {
    let Ok(dir) = app.path().app_cache_dir() else { return };
    let inbox = dir.join("shared").join("inbox.txt");
    let taken = dir.join("shared").join("inbox.taken");
    std::thread::spawn(move || loop {
        if std::fs::rename(&inbox, &taken).is_ok() {
            let files: Vec<String> = std::fs::read_to_string(&taken)
                .unwrap_or_default()
                .lines()
                .filter(|l| !l.is_empty() && Path::new(l).exists())
                .map(String::from)
                .collect();
            let _ = std::fs::remove_file(&taken);
            handle_files(&app, files);
        }
        std::thread::sleep(std::time::Duration::from_millis(700));
    });
}
