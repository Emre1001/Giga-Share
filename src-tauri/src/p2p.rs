//! Online mode: the shared protocol over an iroh QUIC bi-stream (TLS 1.3, E2E encrypted).
//! One endpoint per app, created once; its secret key is the device identity.

use iroh::endpoint::{presets, Connection};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, EndpointAddr, PublicKey, SecretKey};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{BufReader, BufWriter};

use crate::friends::encode_code;
use crate::protocol::{self, Via};
use crate::state::AppState;

const ALPN: &[u8] = b"giga-share/3";
const FRIEND_ALPN: &[u8] = b"giga-share/friend/1";
const PING_ALPN: &[u8] = b"giga-share/ping/1";
const BUF: usize = 256 * 1024;

#[derive(Debug, Clone)]
struct Handler {
    app: AppHandle,
}

impl ProtocolHandler for Handler {
    async fn accept(&self, conn: Connection) -> Result<(), AcceptError> {
        let remote = hex::encode(conn.remote_id().as_bytes());
        let (send, recv) = conn.accept_bi().await?;
        let friend = {
            let state = self.app.state::<AppState>();
            let friends = state.friends.lock().unwrap();
            friends.iter().find(|f| f.id == remote).map(|f| f.display_name.clone())
        };
        let known = friend.is_some();
        let peer = friend.unwrap_or_else(|| format!("Unknown ({}…)", &encode_code(&remote)[..14]));
        let id = uuid::Uuid::new_v4().to_string();
        let fut = protocol::receive(
            self.app.clone(),
            BufReader::with_capacity(BUF, recv),
            BufWriter::with_capacity(BUF, send),
            id.clone(),
            peer,
            Via::Online,
            known,
            Some(remote.clone()),
        );
        protocol::run_transfer(self.app.clone(), id, fut).await;
        // Give the sender time to read our final ack before the connection drops.
        let _ = tokio::time::timeout(Duration::from_secs(5), conn.closed()).await;
        Ok(())
    }
}

fn load_or_create_key(app: &AppHandle) -> Result<SecretKey, String> {
    let path = app.state::<AppState>().config_dir.join("p2p.key");
    if let Ok(bytes) = std::fs::read(&path) {
        if let Ok(arr) = <[u8; 32]>::try_from(bytes.as_slice()) {
            return Ok(SecretKey::from_bytes(&arr));
        }
    }
    let key = SecretKey::generate();
    std::fs::write(&path, key.to_bytes()).map_err(|e| format!("Cannot save P2P key: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(key)
}

pub async fn start(app: AppHandle) {
    let res: Result<(), String> = async {
        let key = load_or_create_key(&app)?;
        let ep = Endpoint::builder(presets::N0)
            .secret_key(key)
            .bind()
            .await
            .map_err(|e| format!("P2P start failed: {e}"))?;
        let router = Router::builder(ep)
            .accept(ALPN, Handler { app: app.clone() })
            .accept(FRIEND_ALPN, FriendHandler { app: app.clone() })
            .accept(PING_ALPN, PingHandler)
            .spawn();
        let state = app.state::<AppState>();
        state.router.set(router).map_err(|_| "P2P already started".to_string())?;
        Ok(())
    }
    .await;
    let state = app.state::<AppState>();
    if let Err(e) = &res {
        log::error!("{e}");
        *state.p2p_error.lock().unwrap() = Some(e.clone());
    }
    let _ = app.emit("p2p_status", status(&app));
}

#[derive(serde::Serialize, Clone)]
pub struct P2pStatus {
    pub friend_code: Option<String>,
    pub error: Option<String>,
}

pub fn status(app: &AppHandle) -> P2pStatus {
    let state = app.state::<AppState>();
    let friend_code = state.router.get().map(|r| encode_code(&hex::encode(r.endpoint().id().as_bytes())));
    let error = state.p2p_error.lock().unwrap().clone();
    P2pStatus { friend_code, error }
}

pub fn send(app: AppHandle, friend_id: String, paths: Vec<String>) -> Result<String, String> {
    let ep = endpoint(&app)?;
    let (peer, key_hex) = {
        let state = app.state::<AppState>();
        let friends = state.friends.lock().unwrap();
        let f = friends.iter().find(|f| f.id == friend_id).ok_or("Unknown friend")?;
        (f.display_name.clone(), f.id.clone())
    };
    let key = parse_key(&key_hex)?;
    let files = protocol::collect_files(&paths)?;
    let id = uuid::Uuid::new_v4().to_string();
    let (app2, id2) = (app.clone(), id.clone());
    let fut = async move {
        let conn = tokio::time::timeout(Duration::from_secs(30), ep.connect(EndpointAddr::from(key), ALPN))
            .await
            .map_err(|_| format!("{peer} is not reachable (offline or app closed?)"))?
            .map_err(|e| format!("Cannot connect to {peer}: {e}"))?;
        let (send, recv) = conn.open_bi().await.map_err(|e| e.to_string())?;
        let res = protocol::send(
            app2,
            BufReader::with_capacity(BUF, recv),
            BufWriter::with_capacity(BUF, send),
            id2,
            peer,
            Via::Online,
            files,
        )
        .await;
        conn.close(0u32.into(), b"done");
        res
    };
    protocol::spawn_transfer(app, id.clone(), fut);
    Ok(id)
}

// ── Friend requests ─────────────────────────────────────────────────────────
// Requester opens a bi-stream, sends {name}; the other side asks its user and
// answers {accepted, name}. Both sides then store each other, so pairing is mutual.

#[derive(serde::Serialize, serde::Deserialize)]
struct FriendHello {
    name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct FriendAnswer {
    accepted: bool,
    name: String,
}

#[derive(serde::Serialize, Clone)]
struct FriendRequestEvent<'a> {
    id: &'a str,
    from: &'a str,
    name: &'a str,
}

#[derive(Debug, Clone)]
struct FriendHandler {
    app: AppHandle,
}

impl ProtocolHandler for FriendHandler {
    async fn accept(&self, conn: Connection) -> Result<(), AcceptError> {
        let remote = hex::encode(conn.remote_id().as_bytes());
        let (mut send, mut recv) = conn.accept_bi().await?;
        let Ok(Ok(bytes)) = tokio::time::timeout(Duration::from_secs(10), recv.read_to_end(4096)).await else {
            return Ok(());
        };
        let Ok(hello) = serde_json::from_slice::<FriendHello>(&bytes) else { return Ok(()) };
        let name: String = hello.name.trim().chars().take(40).collect();
        let app = &self.app;
        let state = app.state::<AppState>();
        let known = state.friends.lock().unwrap().iter().any(|f| f.id == remote);
        let accepted = if known {
            true
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel();
            state.pending.lock().unwrap().insert(id.clone(), tx);
            let _ = app.emit("friend_request", FriendRequestEvent { id: &id, from: &remote, name: &name });
            crate::desktop::notify_if_hidden(app, &crate::desktop::text(app, "friendReq", ""), &crate::desktop::text(app, "wantsAdd", &name));
            let ok = matches!(tokio::time::timeout(Duration::from_secs(120), rx).await, Ok(Ok(true)));
            state.pending.lock().unwrap().remove(&id);
            let _ = app.emit("friend_request_closed", &id);
            ok
        };
        if accepted && !known {
            let _ = upsert_friend(app, &remote, &name, false);
        }
        let me = state.settings().device_name;
        let answer = serde_json::to_vec(&FriendAnswer { accepted, name: me }).unwrap_or_default();
        let _ = send.write_all(&answer).await;
        let _ = send.finish();
        let _ = tokio::time::timeout(Duration::from_secs(5), conn.closed()).await;
        Ok(())
    }
}

/// Adds a friend, or (with `rename`) updates the name of an existing one. Emits `friends_changed`.
pub fn upsert_friend(app: &AppHandle, id: &str, name: &str, rename: bool) -> Result<crate::friends::Friend, String> {
    let state = app.state::<AppState>();
    let mut list = state.friends.lock().unwrap();
    let name = if name.trim().is_empty() { format!("Friend {}", &id[..4].to_uppercase()) } else { name.trim().to_string() };
    let friend = match list.iter_mut().find(|f| f.id == id) {
        Some(f) => {
            if rename {
                f.display_name = name;
            }
            f.clone()
        }
        None => {
            let f = crate::friends::Friend {
                id: id.to_string(),
                display_name: name,
                added_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
            };
            list.push(f.clone());
            f
        }
    };
    state.save_friends(&list)?;
    let _ = app.emit("friends_changed", list.clone());
    Ok(friend)
}

fn endpoint(app: &AppHandle) -> Result<Endpoint, String> {
    app.state::<AppState>()
        .router
        .get()
        .map(|r| r.endpoint().clone())
        .ok_or_else(|| "P2P not ready yet — check your internet connection".to_string())
}

fn parse_key(id_hex: &str) -> Result<PublicKey, String> {
    let bytes: [u8; 32] = hex::decode(id_hex).ok().and_then(|b| b.try_into().ok()).ok_or("Invalid friend id")?;
    PublicKey::from_bytes(&bytes).map_err(|_| "Invalid friend id".to_string())
}

/// Asks `id_hex` to become friends. Returns their answer and their device name.
pub async fn request_friend(app: &AppHandle, id_hex: &str) -> Result<(bool, String), String> {
    let ep = endpoint(app)?;
    let key = parse_key(id_hex)?;
    let conn = tokio::time::timeout(Duration::from_secs(20), ep.connect(EndpointAddr::from(key), FRIEND_ALPN))
        .await
        .map_err(|_| "Device not reachable".to_string())?
        .map_err(|e| format!("Cannot reach device: {e}"))?;
    let (mut send, mut recv) = conn.open_bi().await.map_err(|e| e.to_string())?;
    let me = app.state::<AppState>().settings().device_name;
    send.write_all(&serde_json::to_vec(&FriendHello { name: me }).unwrap_or_default())
        .await
        .map_err(|e| e.to_string())?;
    send.finish().map_err(|e| e.to_string())?;
    let bytes = tokio::time::timeout(Duration::from_secs(130), recv.read_to_end(4096))
        .await
        .map_err(|_| "No answer".to_string())?
        .map_err(|e| e.to_string())?;
    conn.close(0u32.into(), b"bye");
    let ans: FriendAnswer = serde_json::from_slice(&bytes).map_err(|_| "Bad answer".to_string())?;
    Ok((ans.accepted, ans.name.chars().take(40).collect()))
}

// ── Presence ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct PingHandler;

impl ProtocolHandler for PingHandler {
    async fn accept(&self, conn: Connection) -> Result<(), AcceptError> {
        // Reaching us is the whole answer.
        conn.close(0u32.into(), b"pong");
        Ok(())
    }
}

#[derive(serde::Serialize, Clone)]
struct PresenceEvent {
    id: String,
    online: bool,
}

/// Probes every friend in parallel; emits one `presence` event per friend.
pub fn check_presence(app: AppHandle) {
    let Ok(ep) = endpoint(&app) else { return };
    let ids: Vec<String> = app.state::<AppState>().friends.lock().unwrap().iter().map(|f| f.id.clone()).collect();
    for id in ids {
        let (app, ep) = (app.clone(), ep.clone());
        tauri::async_runtime::spawn(async move {
            let online = match parse_key(&id) {
                Ok(key) => match tokio::time::timeout(Duration::from_secs(10), ep.connect(EndpointAddr::from(key), PING_ALPN)).await {
                    Ok(Ok(c)) => {
                        c.close(0u32.into(), b"bye");
                        true
                    }
                    _ => false,
                },
                Err(_) => false,
            };
            let _ = app.emit("presence", PresenceEvent { id, online });
        });
    }
}
