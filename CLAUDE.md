# Giga-Share

Cross-platform file sharing app. Tauri v2 (Rust + React). Targets Windows (.exe) and Android (.apk).

## Architecture

Backend rewritten from scratch 2026-10-15 (the old `src-tauri/` was never committed and was lost).

- **Discovery**: UDP broadcast on port 52525, every 2s. Hello `GIGASHARE_V3:{instance_id}|{name}|{device_type}|{port}|{os_type}|{p2p_id}` (p2p_id optional; enables one-tap "add friend" for nearby devices), bye `GIGASHARE_BYE:{instance_id}` on exit. Peers expire after 7s. Self-filter by per-process instance id.
- **Transfer protocol** (`protocol.rs`, shared by LAN + Online): `GSH3` + u32-len JSON manifest → receiver u8 decision → u32-len JSON resume offsets → raw file bytes → receiver u8 final ack. `.part` files resume. Remote names sanitized (no `..`, absolute, Windows-reserved). Not compatible with pre-0.2 builds.
- **LAN**: TCP on port 52526 (configurable).
- **Online**: iroh 1.x QUIC, ALPNs `giga-share/3` (files), `giga-share/friend/1` (mutual friend request: `{name}` → user prompt → `{accepted,name}`), `giga-share/ping/1` (presence probe), one `Router`/`Endpoint` for the app lifetime (in `AppState.router`). Secret key in `<config>/p2p.key`. Unknown senders allowed but always prompted.
- **Frontend**: React + framer-motion + lucide-react. Design tokens copied from the website (`docs/index.html`): Geist / Geist Mono (bundled via @fontsource), paper/ink palette, blue accent, light/dark/system theme.
- **Direct link** (`hotspot.rs`): desktop opens a Wi-Fi hotspot (Linux `nmcli device wifi hotspot`, Windows WinRT tethering via PowerShell); phone joins via `WIFI:` QR, then normal LAN transfer. Stopped on exit.
- **In-app updates** (`src/lib/update.ts`, `UpdateDialog.tsx`): checks GitHub `releases/latest` 5 s after start and every 6 h (Settings → Updates: manual check, auto switch; Later = 24 h, Skip = until a newer version). `Bootstrap.update_kind`: `nsis` / `appimage` install via `tauri-plugin-updater` (signed `latest.json`, pubkey in `tauri.conf.json`, private key `~/.tauri/giga-share.key`, CI secret `TAURI_SIGNING_PRIVATE_KEY`); `android` downloads the release APK in `MainActivity` (cache/updates, deleted on start and after the installer returns); `manual` (portable, deb, rpm) opens the release page. `build-all.sh` writes `dist-apps/latest.json`; upload it with the release (tag `v{version}`). APKs must always be signed with the same keystore.
- **Back / overlays** (`src/lib/back.ts`): every Modal/sheet registers with `useBackClose`; MainActivity's back callback calls `window.__nativeBack()` (closes the newest overlay, else the app leaves). Everything behind the newest overlay gets `inert`.
- **Android shell**: edge-to-edge; `MainActivity.onWebViewCreate` adds `window.GigaNative` (insets, status-bar icon color per theme, update download), forwards system-bar/cut-out insets as `--native-inset-*` (CSS uses `--safe-*`), shrinks the WebView above the keyboard. Theme-colored window background in `values(-night)/colors.xml`.
- **Theme switch**: circular View-Transition reveal only on Chromium engines (WebView2, Android WebView); WebKitGTK crashed on it and gets a colour fade. Theme applied before first paint by an inline script in `index.html`.
- **i18n**: `src/lib/i18n.tsx`, en/de/tr, default = first supported `navigator.languages`, override in Settings (`localStorage gs-lang`). Backend notifications localized via `set_language` + `desktop::text`. Backend error strings are English.
- **Linux/NVIDIA**: `WEBKIT_DISABLE_DMABUF_RENDERER=1` set at startup when `/proc/driver/nvidia` exists (animations froze otherwise). Radar sweep is rAF-driven SVG, not CSS.
- **Events** (backend → UI): `peers_changed`, `p2p_status`, `transfer_request`, `transfer_started`, `transfer_progress` (bytes, total, speed), `transfer_finished` (status done/rejected/failed/cancelled), `cli_send_files`, `app_error`, `friends_changed`, `friend_request`, `friend_request_closed`, `friend_answer`, `presence`. `frontend_ready` returns all initial state in one call.

## Key Modules (src-tauri/src)

- `lib.rs` — plugin setup, command registration, exit hook
- `state.rs` — `Settings` (JSON, atomic write), `AppState`, portable mode, defaults
- `discovery.rs` — UDP discovery, subnet broadcast addresses via `if-addrs`
- `protocol.rs` — transfer protocol, progress, speed limiter, cancel (`CancellationToken`)
- `transfer.rs` — TCP server/client
- `p2p.rs` — iroh endpoint, protocol handler, online send
- `friends.rs` — friend code encode/decode
- `desktop.rs` — tray, close-to-tray, single instance + `--send`/file args, notifications, context menu (Nemo/Dolphin/Nautilus on Linux, SendTo on Windows)
- `commands.rs` — Tauri commands; Android `content://` resolution via tauri-plugin-fs

## Linux integration

- Bundles: `.deb`, `.rpm`, `.AppImage` (`npx tauri build`). Binary name `giga-share`.
- Tray icon (needs libayatana-appindicator), close-to-tray, autostart (`--minimized`).
- Single instance: launching with files (`giga-share --send a b`) hands them to the running app.
- "Send with Giga-Share" right-click entry written to `~/.local/share/{nemo/actions,kio/servicemenus,nautilus/scripts}` (setting `context_menu`, default on). AppImage uses `$APPIMAGE` as exec path.
- Build deps: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev build-essential patchelf rpm`

## Build

- **Linux**: `npx tauri build` → `src-tauri/target/release/bundle/{deb,rpm,appimage}/`
- **Windows**: `npx tauri build` → `src-tauri/target/release/bundle/nsis/`
- **All from Linux**: `./build-all.sh [linux|windows|android]` → `dist-apps/`. Windows = MinGW cross-compile (`x86_64-pc-windows-gnu`, NSIS only; MSI needs a Windows host/CI). Android signed with `GIGASHARE_KEYSTORE`/`_KEY_ALIAS`/`_KEY_PASS` or the debug keystore.
- **Android**: `src-tauri/gen/android` is committed-worthy: `MainActivity.kt` holds the share intent (copies to `cache/shared/`, appends `inbox.txt`, polled by `desktop::watch_share_inbox`) and a WifiManager MulticastLock (needed to receive discovery broadcasts). Permissions in `AndroidManifest.xml`. SDK at `~/Android/Sdk`, NDK 27.
- **APK signing**: Must use `zipalign` + `apksigner` (not `jarsigner`) for Android 7+
- **Tests**: `cargo test --manifest-path src-tauri/Cargo.toml`
- **CI**: `.github/workflows/build-all.yml` (Linux + Windows)

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
