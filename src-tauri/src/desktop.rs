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

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
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

    if let Some(w) = app.get_webview_window("main") {
        let handle = app.handle().clone();
        w.on_window_event(move |e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                let to_tray = handle.state::<AppState>().settings().minimize_to_tray;
                if to_tray && TRAY_OK.load(Ordering::SeqCst) {
                    api.prevent_close();
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }
        });
        if std::env::args().any(|a| a == "--minimized") && TRAY_OK.load(Ordering::SeqCst) {
            let _ = w.hide();
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
