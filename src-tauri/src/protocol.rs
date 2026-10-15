//! Transfer protocol shared by LAN (TCP) and Online (QUIC) mode.
//!
//! Sender                                   Receiver
//!   "GSH3" + u32 len + JSON Manifest  ──►
//!                                     ◄──  u8 decision (1 accept, 0 reject)
//!                                     ◄──  u32 len + JSON [u64 resume offset per file]
//!   raw bytes of every file, from its offset, in manifest order  ──►
//!                                     ◄──  u8 1 (all files written)
//!
//! Receiver writes `<name>.part`, renames on completion; a later transfer of the
//! same name+size resumes from the existing `.part` length.

use serde::{Deserialize, Serialize};
use std::future::Future;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeekExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::state::AppState;

const MAGIC: &[u8; 4] = b"GSH3";
const MAX_JSON: u32 = 8 << 20;
const MAX_FILES: usize = 100_000;
const CHUNK: usize = 256 * 1024;
const DECISION_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    /// Relative path with `/` separators.
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Manifest {
    pub sender_name: String,
    pub sender_os: String,
    pub files: Vec<FileEntry>,
    pub total_size: u64,
}

pub struct LocalFile {
    pub path: PathBuf,
    pub entry: FileEntry,
}

#[derive(Clone, Copy, Serialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Via {
    Lan,
    Online,
}

#[derive(Serialize, Clone)]
struct StartedEvent<'a> {
    id: &'a str,
    direction: &'a str,
    peer: &'a str,
    via: Via,
    file_name: String,
    file_count: usize,
    total: u64,
}

#[derive(Serialize, Clone)]
struct ProgressEvent<'a> {
    id: &'a str,
    bytes: u64,
    total: u64,
    /// Bytes per second, smoothed.
    speed: f64,
}

#[derive(Serialize, Clone)]
struct RequestEvent<'a> {
    id: &'a str,
    peer: &'a str,
    /// Sender's P2P id for online requests (lets the UI offer "add as friend").
    peer_id: Option<&'a str>,
    via: Via,
    known: bool,
    file_count: usize,
    total_size: u64,
    files: Vec<&'a str>,
}

#[derive(Serialize, Clone)]
struct FinishedEvent<'a> {
    id: &'a str,
    status: &'a str,
    error: Option<String>,
    path: Option<String>,
}

pub enum Outcome {
    Done(Option<PathBuf>),
    Rejected,
}

/// Runs a transfer with cancel support and always emits `transfer_finished`.
pub async fn run_transfer(
    app: AppHandle,
    id: String,
    fut: impl Future<Output = Result<Outcome, String>>,
) {
    let state = app.state::<AppState>();
    let token = CancellationToken::new();
    state.cancels.lock().unwrap().insert(id.clone(), token.clone());
    let res = tokio::select! {
        r = fut => r,
        _ = token.cancelled() => Err("Cancelled".into()),
    };
    state.cancels.lock().unwrap().remove(&id);
    state.pending.lock().unwrap().remove(&id);
    let (status, error, path) = match res {
        Ok(Outcome::Done(p)) => ("done", None, p.map(|p| p.to_string_lossy().into_owned())),
        Ok(Outcome::Rejected) => ("rejected", None, None),
        Err(_) if token.is_cancelled() => ("cancelled", None, None),
        Err(e) => ("failed", Some(e), None),
    };
    if status == "done" {
        crate::desktop::notify_if_hidden(&app, &crate::desktop::text(&app, "complete", ""), path.as_deref().unwrap_or(""));
    }
    let _ = app.emit("transfer_finished", FinishedEvent { id: &id, status, error, path });
}

pub fn spawn_transfer(
    app: AppHandle,
    id: String,
    fut: impl Future<Output = Result<Outcome, String>> + Send + 'static,
) {
    tauri::async_runtime::spawn(run_transfer(app, id, fut));
}

/// Expands directories recursively. Names keep the selected folder as top-level component.
pub fn collect_files(paths: &[String]) -> Result<Vec<LocalFile>, String> {
    fn walk(dir: &Path, prefix: &str, out: &mut Vec<LocalFile>) -> std::io::Result<()> {
        let mut entries: Vec<_> = std::fs::read_dir(dir)?.collect::<Result<_, _>>()?;
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let ft = e.file_type()?;
            let name = format!("{prefix}/{}", e.file_name().to_string_lossy());
            if ft.is_dir() {
                walk(&e.path(), &name, out)?;
            } else if ft.is_file() {
                out.push(LocalFile { path: e.path(), entry: FileEntry { name, size: e.metadata()?.len() } });
            }
            // Symlinks are skipped: they can loop or point outside the selection.
        }
        Ok(())
    }

    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        let meta = std::fs::metadata(&path).map_err(|e| format!("{p}: {e}"))?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .ok_or_else(|| format!("{p}: invalid path"))?;
        if meta.is_dir() {
            walk(&path, &name, &mut out).map_err(|e| format!("{p}: {e}"))?;
        } else {
            out.push(LocalFile { path, entry: FileEntry { name, size: meta.len() } });
        }
    }
    if out.is_empty() {
        return Err("Nothing to send (empty folder?)".into());
    }
    Ok(out)
}

/// Turns a remote-supplied name into a safe relative path. Trust boundary: never
/// allow absolute paths, `..`, drive prefixes or Windows-invalid characters.
pub fn sanitize_name(name: &str) -> Option<PathBuf> {
    const RESERVED: &[&str] = &[
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    let mut out = PathBuf::new();
    for part in name.split(['/', '\\']) {
        if part.is_empty() || part == "." || part == ".." {
            if part == ".." {
                return None;
            }
            continue;
        }
        let mut clean: String = part
            .chars()
            .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
            .collect();
        clean = clean.trim_end_matches(['.', ' ']).to_string();
        if clean.is_empty() {
            return None;
        }
        let stem = clean.split('.').next().unwrap_or("").to_lowercase();
        if RESERVED.contains(&stem.as_str()) {
            clean.insert(0, '_');
        }
        out.push(clean);
    }
    let only_normal = out.components().all(|c| matches!(c, Component::Normal(_)));
    (only_normal && out.components().next().is_some()).then_some(out)
}

/// `file.txt` → `file (1).txt` if taken.
fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..)
        .map(|i| path.with_file_name(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

async fn write_json<W: AsyncWrite + Unpin, T: Serialize>(w: &mut W, v: &T) -> Result<(), String> {
    let data = serde_json::to_vec(v).map_err(|e| e.to_string())?;
    w.write_u32(data.len() as u32).await.map_err(io_err)?;
    w.write_all(&data).await.map_err(io_err)
}

async fn read_json<R: AsyncRead + Unpin, T: serde::de::DeserializeOwned>(r: &mut R) -> Result<T, String> {
    let len = r.read_u32().await.map_err(io_err)?;
    if len > MAX_JSON {
        return Err("Protocol error: message too large".into());
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf).await.map_err(io_err)?;
    serde_json::from_slice(&buf).map_err(|e| format!("Protocol error: {e}"))
}

fn io_err(e: std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::UnexpectedEof => "Connection closed by peer".into(),
        _ => e.to_string(),
    }
}

struct Progress<'a> {
    app: &'a AppHandle,
    id: &'a str,
    total: u64,
    done: u64,
    last_emit: Instant,
    last_bytes: u64,
    speed: f64,
}

impl<'a> Progress<'a> {
    fn new(app: &'a AppHandle, id: &'a str, total: u64, done: u64) -> Self {
        let p = Self { app, id, total, done, last_emit: Instant::now(), last_bytes: done, speed: 0.0 };
        p.emit();
        p
    }

    fn add(&mut self, n: u64) {
        self.done += n;
        let dt = self.last_emit.elapsed().as_secs_f64();
        if dt >= 0.2 {
            let inst = (self.done - self.last_bytes) as f64 / dt;
            self.speed = if self.speed == 0.0 { inst } else { self.speed * 0.6 + inst * 0.4 };
            self.last_bytes = self.done;
            self.last_emit = Instant::now();
            self.emit();
        }
    }

    fn emit(&self) {
        let _ = self.app.emit(
            "transfer_progress",
            ProgressEvent { id: self.id, bytes: self.done, total: self.total, speed: self.speed },
        );
    }
}

/// Token-bucket-ish limiter: sleeps whenever we are ahead of the allowed rate.
struct Limiter {
    bytes_per_sec: f64,
    start: Instant,
    bytes: u64,
}

impl Limiter {
    fn new(mbps: f64) -> Self {
        Self { bytes_per_sec: mbps * 1_000_000.0 / 8.0, start: Instant::now(), bytes: 0 }
    }

    async fn wait(&mut self, n: usize) {
        if self.bytes_per_sec <= 0.0 {
            return;
        }
        self.bytes += n as u64;
        let due = Duration::from_secs_f64(self.bytes as f64 / self.bytes_per_sec);
        if let Some(ahead) = due.checked_sub(self.start.elapsed()) {
            tokio::time::sleep(ahead).await;
        }
    }
}

async fn copy_exact<R, W>(
    r: &mut R,
    w: &mut W,
    mut left: u64,
    buf: &mut [u8],
    progress: &mut Progress<'_>,
    limiter: &mut Limiter,
) -> Result<(), String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    while left > 0 {
        let want = (left as usize).min(buf.len());
        let got = r.read(&mut buf[..want]).await.map_err(io_err)?;
        if got == 0 {
            return Err("Connection closed by peer".into());
        }
        w.write_all(&buf[..got]).await.map_err(io_err)?;
        left -= got as u64;
        progress.add(got as u64);
        limiter.wait(got).await;
    }
    Ok(())
}

fn speed_limit(app: &AppHandle, via: Via) -> f64 {
    let s = app.state::<AppState>().settings();
    match via {
        Via::Lan => s.speed_limit_lan_mbps,
        Via::Online => s.speed_limit_online_mbps,
    }
}

fn display_name(files: &[FileEntry]) -> String {
    match files {
        [one] => one.name.rsplit('/').next().unwrap_or(&one.name).to_string(),
        _ => {
            // A single dropped folder shows as the folder name.
            let top = files[0].name.split('/').next().unwrap_or("");
            if files.iter().all(|f| f.name.starts_with(&format!("{top}/"))) {
                top.to_string()
            } else {
                format!("{} files", files.len())
            }
        }
    }
}

pub async fn send<R, W>(
    app: AppHandle,
    mut r: R,
    mut w: W,
    id: String,
    peer: String,
    via: Via,
    files: Vec<LocalFile>,
) -> Result<Outcome, String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let settings = app.state::<AppState>().settings();
    let entries: Vec<FileEntry> = files.iter().map(|f| f.entry.clone()).collect();
    let total: u64 = entries.iter().map(|e| e.size).sum();
    let _ = app.emit(
        "transfer_started",
        StartedEvent {
            id: &id,
            direction: "send",
            peer: &peer,
            via,
            file_name: display_name(&entries),
            file_count: entries.len(),
            total,
        },
    );

    let manifest = Manifest {
        sender_name: settings.device_name,
        sender_os: crate::state::os_type().into(),
        files: entries,
        total_size: total,
    };
    w.write_all(MAGIC).await.map_err(io_err)?;
    write_json(&mut w, &manifest).await?;
    w.flush().await.map_err(io_err)?;

    let decision = tokio::time::timeout(DECISION_TIMEOUT + Duration::from_secs(10), r.read_u8())
        .await
        .map_err(|_| "No answer from receiver".to_string())?
        .map_err(io_err)?;
    if decision != 1 {
        return Ok(Outcome::Rejected);
    }
    let offsets: Vec<u64> = read_json(&mut r).await?;
    if offsets.len() != files.len() || offsets.iter().zip(&files).any(|(o, f)| *o > f.entry.size) {
        return Err("Protocol error: bad resume offsets".into());
    }

    let mut progress = Progress::new(&app, &id, total, offsets.iter().sum());
    let mut limiter = Limiter::new(speed_limit(&app, via));
    let mut buf = vec![0u8; CHUNK];
    for (f, off) in files.iter().zip(offsets) {
        let mut file = tokio::fs::File::open(&f.path).await.map_err(|e| format!("{}: {e}", f.entry.name))?;
        file.seek(std::io::SeekFrom::Start(off)).await.map_err(io_err)?;
        copy_exact(&mut file, &mut w, f.entry.size - off, &mut buf, &mut progress, &mut limiter)
            .await
            .map_err(|e| if e.starts_with("Connection") { e } else { format!("{}: {e}", f.entry.name) })?;
    }
    progress.emit();
    // shutdown() flushes and half-closes (TCP FIN / QUIC stream finish).
    w.shutdown().await.map_err(io_err)?;

    let ack = tokio::time::timeout(Duration::from_secs(60), r.read_u8())
        .await
        .map_err(|_| "Receiver did not confirm".to_string())?
        .map_err(io_err)?;
    if ack != 1 {
        return Err("Receiver reported an error".into());
    }
    Ok(Outcome::Done(None))
}

pub async fn receive<R, W>(
    app: AppHandle,
    mut r: R,
    mut w: W,
    id: String,
    peer: String,
    via: Via,
    known: bool,
    peer_id: Option<String>,
) -> Result<Outcome, String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).await.map_err(io_err)?;
    if &magic != MAGIC {
        return Err("Incompatible sender (old Giga-Share version?)".into());
    }
    let manifest: Manifest = read_json(&mut r).await?;
    if manifest.files.is_empty() || manifest.files.len() > MAX_FILES {
        return Err("Protocol error: bad file list".into());
    }
    let rel: Vec<PathBuf> = manifest
        .files
        .iter()
        .map(|f| sanitize_name(&f.name).ok_or_else(|| format!("Rejected unsafe file name: {}", f.name)))
        .collect::<Result<_, _>>()?;
    let total: u64 = manifest.files.iter().map(|f| f.size).sum();
    let peer = if peer.is_empty() { manifest.sender_name.clone() } else { peer };

    let state = app.state::<AppState>();
    let settings = state.settings();
    let accepted = if settings.auto_accept && known {
        true
    } else {
        let (tx, rx) = oneshot::channel();
        state.pending.lock().unwrap().insert(id.clone(), tx);
        let _ = app.emit(
            "transfer_request",
            RequestEvent {
                id: &id,
                peer: &peer,
                peer_id: peer_id.as_deref(),
                via,
                known,
                file_count: manifest.files.len(),
                total_size: total,
                files: manifest.files.iter().take(5).map(|f| f.name.as_str()).collect(),
            },
        );
        crate::desktop::notify_if_hidden(
            &app,
            &crate::desktop::text(&app, "incoming", ""),
            &format!("{} · {}", crate::desktop::text(&app, "wantsSend", &peer), display_name(&manifest.files)),
        );
        let mut probe = [0u8; 1];
        tokio::select! {
            d = tokio::time::timeout(DECISION_TIMEOUT, rx) => matches!(d, Ok(Ok(true))),
            // The sender sends nothing while waiting, so any read result means it gave up.
            _ = r.read(&mut probe) => return Err("Sender cancelled".into()),
        }
    };
    if !accepted {
        let _ = w.write_u8(0).await;
        let _ = w.shutdown().await;
        return Ok(Outcome::Rejected);
    }

    let base = PathBuf::from(&settings.download_path);
    let mut offsets = Vec::with_capacity(rel.len());
    for (f, rp) in manifest.files.iter().zip(&rel) {
        let part = part_path(&base.join(rp));
        let len = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        offsets.push(if len <= f.size { len } else { 0 });
    }
    w.write_u8(1).await.map_err(io_err)?;
    write_json(&mut w, &offsets).await?;
    w.flush().await.map_err(io_err)?;

    let _ = app.emit(
        "transfer_started",
        StartedEvent {
            id: &id,
            direction: "receive",
            peer: &peer,
            via,
            file_name: display_name(&manifest.files),
            file_count: manifest.files.len(),
            total,
        },
    );
    let mut progress = Progress::new(&app, &id, total, offsets.iter().sum());
    let mut limiter = Limiter::new(speed_limit(&app, via));
    let mut buf = vec![0u8; CHUNK];
    let mut shown: Option<PathBuf> = None;
    for ((f, rp), off) in manifest.files.iter().zip(&rel).zip(offsets) {
        let target = base.join(rp);
        let parent = target.parent().unwrap_or(&base);
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("{}: {e}", parent.display()))?;
        let part = part_path(&target);
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(&part)
            .await
            .map_err(|e| format!("{}: {e}", part.display()))?;
        file.set_len(off).await.map_err(io_err)?;
        file.seek(std::io::SeekFrom::Start(off)).await.map_err(io_err)?;
        let mut out = tokio::io::BufWriter::with_capacity(CHUNK, file);
        copy_exact(&mut r, &mut out, f.size - off, &mut buf, &mut progress, &mut limiter).await?;
        out.flush().await.map_err(io_err)?;
        drop(out);
        let fin = unique_path(&target);
        tokio::fs::rename(&part, &fin).await.map_err(|e| format!("{}: {e}", fin.display()))?;
        if shown.is_none() {
            // Multi-file sends into a folder reveal the folder, otherwise the file.
            shown = Some(match rp.components().count() {
                1 => fin,
                _ => base.join(rp.components().next().unwrap()),
            });
        }
    }
    progress.emit();
    w.write_u8(1).await.map_err(io_err)?;
    w.shutdown().await.map_err(io_err)?;
    Ok(Outcome::Done(shown))
}

fn part_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    target.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize() {
        assert_eq!(sanitize_name("a/b.txt"), Some(PathBuf::from("a").join("b.txt")));
        assert_eq!(sanitize_name("a\\b.txt"), Some(PathBuf::from("a").join("b.txt")));
        assert_eq!(sanitize_name("/etc/passwd"), Some(PathBuf::from("etc").join("passwd")));
        assert_eq!(sanitize_name("../x"), None);
        assert_eq!(sanitize_name("a/../../x"), None);
        assert_eq!(sanitize_name("C:\\x"), Some(PathBuf::from("C_").join("x")));
        assert_eq!(sanitize_name("CON.txt"), Some(PathBuf::from("_CON.txt")));
        assert_eq!(sanitize_name(""), None);
        assert_eq!(sanitize_name("..."), None);
    }

    #[test]
    fn unique() {
        let dir = std::env::temp_dir().join(format!("gs-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("f.txt");
        assert_eq!(unique_path(&p), p);
        std::fs::write(&p, b"x").unwrap();
        assert_eq!(unique_path(&p), dir.join("f (1).txt"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
