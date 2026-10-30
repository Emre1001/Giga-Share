#[cfg(target_os = "android")]
mod android;
mod commands;
mod desktop;
mod discovery;
mod friends;
mod hotspot;
mod p2p;
mod protocol;
mod state;
mod transfer;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer freezes CSS/compositor animations on the NVIDIA driver.
    #[cfg(target_os = "linux")]
    if std::path::Path::new("/proc/driver/nvidia").exists() && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // Must be the first plugin: a second launch (e.g. "Send with Giga-Share") hands its files to us and exits.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
                desktop::on_second_instance(app, argv, cwd)
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let config_dir = match state::portable_config_dir() {
                Some(d) => d,
                None => app.path().app_config_dir()?,
            };
            app.manage(state::AppState::new(config_dir));

            let cwd = std::env::current_dir().unwrap_or_default();
            let args: Vec<String> = std::env::args().collect();
            desktop::handle_files(app.handle(), desktop::parse_cli(&args, &cwd));

            #[cfg(desktop)]
            desktop::setup(app)?;
            #[cfg(target_os = "android")]
            {
                desktop::watch_share_inbox(app.handle().clone());
                android::init(app.handle());
            }

            let handle = app.handle().clone();
            discovery::start(handle.clone());
            transfer::restart_server(&handle);
            tauri::async_runtime::spawn(p2p::start(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::frontend_ready,
            commands::update_settings,
            commands::send_lan,
            commands::send_online,
            commands::respond_transfer,
            commands::cancel_transfer,
            commands::add_friend,
            commands::remove_friend,
            commands::rename_friend,
            commands::create_text_file,
            commands::reveal_file,
            commands::open_releases,
            commands::open_download_folder,
            commands::check_presence,
            commands::set_language,
            commands::hotspot_start,
            commands::hotspot_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Giga-Share")
        .run(|app, event| match event {
            // The last window closed (desktop: closed to tray; Android: activity gone). Keep receiving
            // in the background without a webview, which is where almost all idle memory goes.
            tauri::RunEvent::ExitRequested { code: None, api, .. } if desktop::keep_running(app) => api.prevent_exit(),
            // Files handed over while no UI runs are queued for the next `frontend_ready`.
            tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::Destroyed, .. } => {
                app.state::<state::AppState>().frontend_ready.store(false, std::sync::atomic::Ordering::SeqCst);
            }
            tauri::RunEvent::Exit => {
                discovery::say_bye(app);
                let _ = hotspot::stop_if_running();
            }
            _ => {}
        });
}
