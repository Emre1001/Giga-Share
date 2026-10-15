//! LAN mode: the shared protocol over TCP.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{BufReader, BufWriter};
use tokio::net::{TcpListener, TcpStream};

use crate::protocol::{self, Via};
use crate::state::AppState;

const BUF: usize = 256 * 1024;

/// (Re)binds the TCP server on the configured port.
pub fn restart_server(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Some(old) = state.lan_server.lock().unwrap().take() {
        old.abort();
    }
    let app2 = app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let port = app2.state::<AppState>().settings().port;
        let listener = match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(l) => l,
            Err(e) => {
                let msg = format!("Cannot listen on TCP port {port}: {e}");
                log::error!("{msg}");
                *app2.state::<AppState>().lan_error.lock().unwrap() = Some(msg.clone());
                let _ = app2.emit("app_error", msg);
                return;
            }
        };
        *app2.state::<AppState>().lan_error.lock().unwrap() = None;
        loop {
            let Ok((stream, addr)) = listener.accept().await else { continue };
            let _ = stream.set_nodelay(true);
            let ip = addr.ip().to_canonical().to_string();
            let peer = peer_name(&app2, &ip).unwrap_or(ip);
            let (r, w) = stream.into_split();
            let id = uuid::Uuid::new_v4().to_string();
            let fut = protocol::receive(
                app2.clone(),
                BufReader::with_capacity(BUF, r),
                BufWriter::with_capacity(BUF, w),
                id.clone(),
                peer,
                Via::Lan,
                true,
                None,
            );
            protocol::spawn_transfer(app2.clone(), id, fut);
        }
    });
    *state.lan_server.lock().unwrap() = Some(handle);
}

fn peer_name(app: &AppHandle, ip: &str) -> Option<String> {
    let state = app.state::<AppState>();
    let peers = state.peers.lock().unwrap();
    peers.values().find(|(p, _)| p.ip == ip).map(|(p, _)| p.name.clone())
}

pub fn send(app: AppHandle, ip: String, port: u16, paths: Vec<String>) -> Result<String, String> {
    let files = protocol::collect_files(&paths)?;
    let id = uuid::Uuid::new_v4().to_string();
    let peer = peer_name(&app, &ip).unwrap_or_else(|| ip.clone());
    let (app2, id2) = (app.clone(), id.clone());
    let fut = async move {
        let stream = tokio::time::timeout(Duration::from_secs(5), TcpStream::connect((ip.as_str(), port)))
            .await
            .map_err(|_| format!("Cannot reach {peer} ({ip}:{port}) — same network? Firewall?"))?
            .map_err(|e| format!("Cannot connect to {peer}: {e}"))?;
        let _ = stream.set_nodelay(true);
        let (r, w) = stream.into_split();
        protocol::send(
            app2,
            BufReader::with_capacity(BUF, r),
            BufWriter::with_capacity(BUF, w),
            id2,
            peer,
            Via::Lan,
            files,
        )
        .await
    };
    protocol::spawn_transfer(app, id.clone(), fut);
    Ok(id)
}
