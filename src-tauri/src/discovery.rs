//! LAN discovery over UDP broadcast.
//! Hello: `GIGASHARE_V3:{instance_id}|{name}|{device_type}|{port}|{os_type}[|{p2p_id}]`
//! Bye:   `GIGASHARE_BYE:{instance_id}` (sent on exit so peers vanish immediately)

use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{device_type, os_type, AppState, Peer};

pub const PORT: u16 = 52525;
const INTERVAL: Duration = Duration::from_secs(2);
const PEER_TIMEOUT: Duration = Duration::from_secs(7);

pub fn local_ips() -> Vec<String> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.addr {
            if_addrs::IfAddr::V4(v4) if !v4.ip.is_link_local() => Some(v4.ip.to_string()),
            _ => None,
        })
        .collect()
}

/// 255.255.255.255 plus each interface's subnet broadcast (many routers drop the global one).
fn broadcast_addrs() -> Vec<SocketAddr> {
    let mut out = vec![SocketAddr::from((Ipv4Addr::BROADCAST, PORT))];
    for i in if_addrs::get_if_addrs().unwrap_or_default() {
        if let if_addrs::IfAddr::V4(v4) = i.addr {
            if !v4.ip.is_loopback() {
                let b = v4.broadcast.unwrap_or_else(|| Ipv4Addr::from(u32::from(v4.ip) | !u32::from(v4.netmask)));
                let a = SocketAddr::from((b, PORT));
                if !out.contains(&a) {
                    out.push(a);
                }
            }
        }
    }
    out
}

fn emit_peers(app: &AppHandle) {
    let _ = app.emit("peers_changed", peers(app));
}

pub fn peers(app: &AppHandle) -> Vec<Peer> {
    let state = app.state::<AppState>();
    let mut list: Vec<Peer> = state.peers.lock().unwrap().values().map(|(p, _)| p.clone()).collect();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    list
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let sock = match UdpSocket::bind(("0.0.0.0", PORT)) {
            Ok(s) => s,
            Err(e) => {
                let msg = format!("LAN discovery unavailable (UDP {PORT}): {e}");
                log::error!("{msg}");
                let _ = app.emit("app_error", msg);
                return;
            }
        };
        let _ = sock.set_broadcast(true);
        let sender = sock.try_clone().expect("clone udp socket");
        let app2 = app.clone();
        std::thread::spawn(move || loop {
            let state = app2.state::<AppState>();
            let s = state.settings();
            let p2p_id = state.router.get().map(|r| hex::encode(r.endpoint().id().as_bytes())).unwrap_or_default();
            let msg = format!(
                "GIGASHARE_V3:{}|{}|{}|{}|{}|{}",
                state.instance_id,
                s.device_name.replace('|', " "),
                device_type(),
                s.port,
                os_type(),
                p2p_id
            );
            for addr in broadcast_addrs() {
                let _ = sender.send_to(msg.as_bytes(), addr);
            }
            let removed = {
                let mut peers = state.peers.lock().unwrap();
                let before = peers.len();
                peers.retain(|_, (_, seen)| seen.elapsed() < PEER_TIMEOUT);
                before != peers.len()
            };
            if removed {
                emit_peers(&app2);
            }
            std::thread::sleep(INTERVAL);
        });

        let mut buf = [0u8; 1024];
        loop {
            let Ok((n, from)) = sock.recv_from(&mut buf) else { continue };
            let text = String::from_utf8_lossy(&buf[..n]);
            let state = app.state::<AppState>();
            if let Some(id) = text.strip_prefix("GIGASHARE_BYE:") {
                if state.peers.lock().unwrap().remove(id.trim()).is_some() {
                    emit_peers(&app);
                }
                continue;
            }
            let Some(peer) = parse_hello(&text, from) else { continue };
            if peer.id == state.instance_id {
                continue;
            }
            let changed = {
                let mut peers = state.peers.lock().unwrap();
                let changed = peers.get(&peer.id).map(|(p, _)| p != &peer).unwrap_or(true);
                peers.insert(peer.id.clone(), (peer, Instant::now()));
                changed
            };
            if changed {
                emit_peers(&app);
            }
        }
    });
}

fn parse_hello(text: &str, from: SocketAddr) -> Option<Peer> {
    let body = text.strip_prefix("GIGASHARE_V3:")?;
    let parts: Vec<&str> = body.trim().splitn(6, '|').collect();
    let (id, name, device_type, port, os, p2p) = match parts.as_slice() {
        [a, b, c, d, e] => (a, b, c, d, e, None),
        [a, b, c, d, e, f] => (a, b, c, d, e, Some(*f)),
        _ => return None,
    };
    Some(Peer {
        id: id.chars().take(64).collect(),
        name: name.chars().take(64).collect(),
        ip: from.ip().to_canonical().to_string(),
        port: port.parse().ok()?,
        device_type: device_type.chars().take(16).collect(),
        os_type: os.chars().take(16).collect(),
        p2p_id: p2p.filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit())).map(|h| h.to_lowercase()),
    })
}

pub fn say_bye(app: &AppHandle) {
    let id = &app.state::<AppState>().instance_id;
    if let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)) {
        let _ = sock.set_broadcast(true);
        for addr in broadcast_addrs() {
            let _ = sock.send_to(format!("GIGASHARE_BYE:{id}").as_bytes(), addr);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello() {
        let from: SocketAddr = "192.168.1.5:52525".parse().unwrap();
        let p = parse_hello("GIGASHARE_V3:abc|My PC|desktop|52526|linux", from).unwrap();
        assert_eq!((p.id.as_str(), p.name.as_str(), p.port, p.ip.as_str()), ("abc", "My PC", 52526, "192.168.1.5"));
        assert!(parse_hello("GIGASHARE_V3:abc|x|desktop|notaport|linux", from).is_none());
        let hex_id = "ab".repeat(32);
        let p = parse_hello(&format!("GIGASHARE_V3:abc|x|desktop|1|linux|{hex_id}"), from).unwrap();
        assert_eq!(p.p2p_id.as_deref(), Some(hex_id.as_str()));
        assert_eq!(parse_hello("GIGASHARE_V3:abc|x|desktop|1|linux|", from).unwrap().p2p_id, None);
        assert!(parse_hello("GIGASHARE_V2:x|desktop|1|linux", from).is_none());
    }
}
