# Giga-Share

Cross-platform file sharing app. Tauri v2 (Rust + React). Targets Windows (.exe) and Android (.apk).

## Architecture

- **Discovery**: UDP broadcast on port 52525, protocol `GIGASHARE_V2:{name}|{device_type}|{port}|{os_type}` (V1 backward-compat)
- **Transfer (LAN)**: TCP on port 52526 (configurable). Manifest-first protocol with ACK handshake.
- **Transfer (Online)**: QUIC via iroh P2P. Same manifest protocol over bidirectional QUIC streams. E2E encrypted (TLS 1.3). NAT traversal via STUN + DERP relay fallback.
- **Frontend**: React + framer-motion + recharts + lucide-react
- **Backend**: Rust (tokio async)
- **P2P**: iroh 0.32 — Ed25519 keypair per device, NodeId as friend identifier, n0 DERP relays

## Key Modules

- `discovery.rs` — UDP LAN peer discovery
- `transfer.rs` — TCP file transfer (LAN mode) with speed limiting
- `p2p.rs` — iroh QUIC P2P transfer (Online mode) with speed limiting
- `friends.rs` — Friend system CRUD, friend code encode/decode, JSON persistence
- `speed_limiter.rs` — Token bucket AsyncRead/AsyncWrite wrapper for Mbit/s limiting
- `state.rs` — AppSettings + AppState (settings, pending transfers, friends, P2P node ID)

## Features

- **Local Mode**: UDP discovery + TCP transfer on LAN
- **Online Mode**: P2P to friends worldwide via iroh QUIC
- **Friend System**: Add by friend code, rename, remove. Persistent across restarts
- **Speed Limiting**: Configurable Mbit/s limit for both LAN and Online modes (0 = unlimited)
- **E2E Encryption**: All online transfers encrypted via TLS 1.3 (QUIC)
- **Cross-platform**: Windows desktop + Android mobile (Linux/macOS via CI)
- **Transfer Resume**: V2 protocol — `.part` files, `ResumeResponse` offsets, seek-based restart
- **OS Icons**: SVG icons per platform (Windows/macOS/Linux/Android) in discovery + friends view
- **Concurrent Transfers**: Multiple simultaneous transfers tracked in frontend Map; badge in header
- **QR Pairing**: `qrcode.react` display + `html5-qrcode` camera scanner for friend codes
- **Drag & Drop**: App-level + per-peer drop targets; `tauri://drag-drop` native events
- **Send Text**: Creates temp `.txt` file via `create_text_file` Rust command
- **Android Share Intent**: `ACTION_SEND`/`ACTION_SEND_MULTIPLE` in `MainActivity.kt`, JNI content URI resolver
- **Windows Send To**: Shortcut in `%APPDATA%\Microsoft\Windows\SendTo\`, `--send` CLI arg
- **Portable Mode**: `portable.marker` next to exe → config stored beside exe in `config/`

## Build

- **Windows**: `npx tauri build` → `src-tauri/target/release/bundle/nsis/`
- **Android**: Set `ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME` → `npx tauri android build --apk`
- **APK signing**: Must use `zipalign` + `apksigner` (not `jarsigner`) for Android 7+
- **APK signing**: `zipalign` + `apksigner.bat` (Windows batch file — call via `cmd /c` or full path with `.bat` extension)
- **Build outputs**: `dist-apps/Giga-Share-Setup.exe`, `dist-apps/Giga-Share.msi`, `dist-apps/Giga-Share.apk`, `dist-apps/Giga-Share-Portable/`
- **Linux/macOS**: CI only via `.github/workflows/build-all.yml` (requires native runners)

## Friend Code Format

Friend codes encode the iroh NodeId (32-byte Ed25519 public key) as hex, formatted:
`GIGA-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`

## Bug History (Session 2026-05-11)

Bugs found and fixed during initial review:

### Round 1
1. **Port hardcoded** — `send_files` always used 52526, ignored settings port
2. **Transfer ID mismatch** — Frontend generated ID via `Math.random()`, backend generated UUID
3. **No handshake ACK** — Sender sent data immediately after manifest, no confirmation
4. **Stale closure** — `activeTransfer` captured as `null` in `useEffect` closure
5. **Discovery crash** — `expect()` on UDP bind
6. **Radar circles invisible** — CSS `.radar-circle` had no width/height
7. **Double discovery** — No guard against calling `start_discovery` multiple times
8. **Error swallowing** — `let _ = transfer::send_files(...)` discarded all errors
9. **No incoming transfer UI** — No `transfer_request` event listener
10. **Android permissions missing** — No `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`

### Round 2
11. **APK signing** — Used `jarsigner` instead of `apksigner`
12. **Self-discovery** — Device saw its own UDP broadcast
13. **Device type wrong** — `cfg!(target_os)` is compile-time
14. **Hostname "localhost"** — `hostname::get()` returns "localhost" on some configs
15. **Broadcast limited** — Only 255.255.255.255 (often blocked by routers)
16. **Download path not settable** — Missing capabilities + mobile can't use directory picker
17. **Peer port not sent** — Discovery protocol missing port field
18. **Path separators** — Windows backslashes in file names caused issues

### Fixes applied
- Subnet-specific broadcast addresses via `local_ip_address::list_afinet_netifas()`
- Self-IP filtering in discovery listener
- Proper ACK handshake (receiver sends 1=accept, 0=reject)
- Transfer approval flow with `oneshot` channels
- `AtomicBool` guard for single discovery start
- `apksigner` for APK signing (v2+v3 scheme)
- Mobile text input for download path
- Port included in discovery protocol
- Path separator normalization (backslash → forward slash)
- Full framer-motion animations throughout UI

## Bug History (Session 2026-05-14)

### Root causes fixed
19. **P2P endpoint conflict** — `send_files_p2p` created second `iroh::Endpoint` with same secret key → NodeId conflicts in relay. Fix: store single endpoint in `AppState.p2p_endpoint: tokio::sync::Mutex<Option<Endpoint>>`, clone it for outgoing. Never call `ep.close()` on shared endpoint.
20. **Android content:// URIs** — `open()` dialog returns `content://` URIs; `tokio::fs::File::open` fails. Fix: JNI via `ndk-context` → `ContentResolver.openInputStream()` → stream to temp file → return real path. Frontend calls `resolve_file_paths` Tauri command before any send.
21. **Device names wrong** — Discovery broadcaster called `get_device_name()` once before loop on Android (hostname returns "Android"). Fix: read `settings.device_name` inside loop each iteration. Android default name reads `ro.product.model=` from `/system/build.prop`.
22. **Stale closure on `activeTransfer`** — Fixed by changing to `Map<string, TransferState>` + `transfersRef`; removes stale closure issue entirely.
23. **Windows firewall blocking LAN** — Added `netsh advfirewall firewall add rule` for TCP 52526 + UDP 52525 at startup (best-effort).

### Features added (Session 2026-05-14)
- Transfer resume (V2 protocol): `.part` files, `ResumeResponse`, seek offsets
- Discovery V2 protocol: `os_type` field (`windows`/`macos`/`linux`/`android`/`ios`)
- OS-specific SVG icons: `OsIcon.tsx` component, shown on radar + friends
- Concurrent transfers: `Map<string, TransferState>` in frontend, badge in header, extra-transfers list
- QR code pairing: `QRPairing.tsx` with `qrcode.react` + `html5-qrcode` camera
- Drag & drop: per-peer drop targets on radar, app-level drop overlay
- Send Text: modal → temp `.txt` → mode picker flow
- Android share intent: `AndroidManifest.xml` + `MainActivity.kt`
- Windows Send To: shortcut + `--send` CLI arg handling
- Mode picker dialog for share intent / Send To / drag & drop
- Toast notification system (error/success/info, 5s auto-dismiss)
- Reveal in Explorer for received files (`reveal_file` command)
- IP address in footer, `get_local_ips` command
- Portable mode: `portable.marker` → local config dir
- GitHub Actions CI: `.github/workflows/build-all.yml` for Linux/macOS/Android/Windows
- `apksigner.bat` on Windows: call via `cmd /c` with full `.bat` path
- `android_utils.rs`: JNI content URI resolver + Android model detection
