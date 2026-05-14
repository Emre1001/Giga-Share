<div align="center">
  <img src="Icon.png" alt="Giga-Share Logo" width="120" height="120" style="border-radius: 24px;" />
  
  # Giga-Share

  **Blazing fast file sharing — LAN or P2P worldwide**

  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#installation)
  [![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#installation)
  [![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](#build-from-source)
  [![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](#build-from-source)
  [![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](#tech-stack)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#tech-stack)
  [![Tauri](https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](#tech-stack)

  <br />

  Send files between **any device, anywhere** — locally over WiFi or globally via encrypted P2P.  
  No cloud. No accounts. No file size limits. Just share.

  <br />

  ---
</div>

<br />

## Features

<table>
<tr>
<td width="50%">

### Two Modes
- **LAN Mode** — Auto-discover devices on same WiFi, transfer via TCP
- **Online Mode** — Send to friends anywhere via encrypted P2P (QUIC)
- Switch modes with one toggle in settings

</td>
<td width="50%">

### Friend System
- Add friends by sharing your unique Friend Code
- **QR code pairing** — show your QR or scan a friend's with the camera
- Rename or remove friends anytime
- Friends list persists across app restarts

</td>
</tr>
<tr>
<td width="50%">

### Speed & Control
- **Concurrent transfers** — multiple simultaneous transfers tracked
- Real-time speed graph & ETA per transfer
- **Transfer resume** — interrupted transfers restart from last byte
- Configurable Mbit/s speed limits (LAN & Online separate)

</td>
<td width="50%">

### Security
- E2E encryption via TLS 1.3 (QUIC)
- NAT traversal with STUN + DERP relay fallback
- Accept/reject incoming transfers
- Auto-accept mode for trusted contexts
- No data ever touches a cloud server

</td>
</tr>
<tr>
<td width="50%">

### OS Integration
- **Android share sheet** — "Share with Giga-Share" from any app
- **Windows Send To** — right-click any file → Send to → Giga-Share
- **Drag & drop** — drag files onto a device to send
- **Send Text** — share text/URLs directly as a `.txt` file
- Minimize to tray, start on boot

</td>
<td width="50%">

### Discovery
- Auto-discovers devices on local network
- Animated radar with **OS-specific icons** (Windows / macOS / Linux / Android)
- Tap to send, one interaction
- Portrait & landscape responsive — works at 360 px wide

</td>
</tr>
</table>

<br />

## How It Works

### LAN Mode (Local Network)

```
┌──────────────┐                        ┌──────────────┐
│              │   UDP Broadcast V2      │              │
│   Device A   │ ◄──────────────────►    │   Device B   │
│              │   Auto-Discovery        │              │
│              │                        │              │
│              │   TCP Connection        │              │
│              │ ◄──────────────────►    │              │
│              │   File Transfer         │              │
└──────────────┘                        └──────────────┘
```

1. **Discovery** — Devices broadcast `GIGASHARE_V2:{name}|{type}|{port}|{os}` via UDP on port `52525`
2. **Selection** — Tap a device on the radar (or drag files onto it)
3. **Handshake** — Receiver gets transfer request; sends ACK + resume offsets
4. **Transfer** — Files stream over TCP, written to `.part` files, renamed on completion

### Online Mode (P2P Worldwide)

```
┌──────────────┐                        ┌──────────────┐
│              │   iroh P2P (QUIC)       │              │
│   Friend A   │ ◄──────────────────►    │   Friend B   │
│              │   NAT Traversal         │              │
│              │   E2E Encrypted         │              │
│              │                        │              │
│              │   QUIC Bidir Stream     │              │
│              │ ◄──────────────────►    │              │
│              │   File Transfer         │              │
└──────────────┘                        └──────────────┘
```

1. **Add Friend** — Exchange Friend Codes or scan QR (Ed25519 public key)
2. **Connect** — iroh handles NAT traversal automatically (STUN + DERP relay fallback)
3. **Handshake** — Same manifest + ACK + resume protocol over QUIC bidirectional stream
4. **Transfer** — Files stream via encrypted QUIC with real-time progress

<br />

## Installation

### Windows

Download from `dist-apps/`:
- **`Giga-Share-Setup.exe`** — NSIS Installer
- **`Giga-Share.msi`** — MSI Installer
- **`Giga-Share-Portable/Giga-Share.exe`** — No install needed; config stored next to `.exe`

**Windows Send To** (optional): Open Settings → enable "Send To Menu" → right-click any file → Send to → Giga-Share.

### Android

1. Download **`Giga-Share.apk`**
2. Enable "Install from unknown sources" in phone settings
3. Install the APK
4. Use "Share" in any app to share directly via Giga-Share

### Linux / macOS

Build from source or trigger CI (see below).

> **LAN Mode**: Both devices must be on the **same WiFi network**.  
> **Online Mode**: Works from anywhere — just add your friend's code.

<br />

## Build From Source

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 20+ |
| [Rust](https://rustup.rs/) | stable |
| [Tauri CLI](https://v2.tauri.app/) | 2.x |
| Android SDK + NDK 27 | For APK builds |
| JDK 17 | For APK builds |

### Windows

```bash
npm install
npx tauri build
# Output: src-tauri/target/release/bundle/nsis/  +  /msi/
```

### Android

```bash
npm install
npx tauri android build --apk

# Sign (Windows — apksigner is a .bat file):
%ANDROID_HOME%\build-tools\37.0.0\zipalign.exe -v 4 app-unsigned.apk aligned.apk
cmd /c "%ANDROID_HOME%\build-tools\37.0.0\apksigner.bat" sign ^
  --ks your-keystore.jks --ks-pass pass:password ^
  --ks-key-alias key-alias --key-pass pass:password ^
  --out Giga-Share.apk aligned.apk
```

### Linux / macOS (GitHub Actions CI)

Push a `v*` tag to trigger all platform builds:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Workflow: `.github/workflows/build-all.yml` — produces `.AppImage`, `.deb` (Linux) and `.dmg`, `.app` (macOS).

Or trigger manually from the GitHub Actions tab (`workflow_dispatch`).

### Development

```bash
npm install
npx tauri dev
```

<br />

## Tech Stack

<div align="center">

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + TypeScript + Framer Motion + Recharts |
| **Backend** | Rust + Tokio (async) |
| **Framework** | Tauri v2 |
| **P2P / Online** | iroh 0.32 (QUIC + NAT traversal + E2E encryption) |
| **LAN Discovery** | UDP Broadcast V2 (name, type, port, OS) |
| **LAN Transfer** | TCP — manifest → ACK → resume offsets → data |
| **Online Transfer** | QUIC bidirectional streams (same protocol) |
| **Speed Limiting** | Token bucket rate limiter (AsyncRead/AsyncWrite) |
| **QR Pairing** | qrcode.react (display) + html5-qrcode (camera scan) |
| **Icons** | Lucide React + custom OS SVG icons |

</div>

<br />

## Protocol

### Discovery (UDP V2 — LAN Mode)

```
GIGASHARE_V2:{device_name}|{device_type}|{port}|{os_type}
```
- Broadcast every 3 seconds on port `52525`
- `device_type`: `"mobile"` or `"desktop"`
- `os_type`: `"windows"` / `"macos"` / `"linux"` / `"android"` / `"ios"`
- Backward-compatible: `GIGASHARE_V1:…` (3 fields) also accepted
- Peers timeout after 15 seconds of silence

### Transfer (TCP / QUIC — V2 Protocol)

```
Sender → Receiver: [4-byte len][manifest JSON]
Receiver → Sender: [1 byte: 0=reject, 1=accept]
Receiver → Sender: [4-byte len][ResumeResponse JSON]   ← offsets per file
Sender → Receiver: [raw bytes, seeked to resume offset]
```

- Files written to `{name}.part` during transfer
- Renamed to final name on completion
- On reconnect: existing `.part` size sent as resume offset; sender seeks to that byte

### Friend Codes

```
GIGA-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

- 64 hex chars (32-byte Ed25519 public key) split into 16 groups of 4
- Key generated once, stored in `GigaShare/node_key`, reused forever
- ALPN protocol: `gigashare/1` — connection timeout 30 s

<br />

## Project Structure

```
Giga-Share/
├── src/                          # React frontend
│   ├── App.tsx                   # Main app — events, transfer Map, mode switching
│   ├── App.css                   # Glassmorphism UI + responsive breakpoints
│   ├── components/
│   │   ├── Radar.tsx             # LAN device discovery radar (dynamic radius, drop targets)
│   │   ├── OsIcon.tsx            # OS-specific SVG icons (Windows/macOS/Linux/Android)
│   │   ├── FriendsView.tsx       # Online mode — friend list, QR, send
│   │   ├── QRPairing.tsx         # QR code display + html5-qrcode camera scanner
│   │   ├── TransferView.tsx      # Transfer progress, speed graph
│   │   ├── ModePickerDialog.tsx  # LAN vs Online picker (share intent / drag-drop / Send To)
│   │   └── Settings.tsx          # Settings modal
│   └── utils/
│       └── speed.ts              # SpeedCalculator (rolling average)
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── lib.rs                # All Tauri commands + setup
│       ├── discovery.rs          # UDP V2 broadcast + listener
│       ├── transfer.rs           # TCP LAN transfer (V2 resume protocol)
│       ├── p2p.rs                # iroh QUIC P2P (shared Endpoint, same protocol)
│       ├── friends.rs            # Friend CRUD + friend code encode/decode
│       ├── speed_limiter.rs      # Token bucket AsyncRead/AsyncWrite
│       ├── state.rs              # AppSettings, AppState, portable mode config
│       ├── android_utils.rs      # JNI content:// URI resolver, Android model detection
│       └── main.rs               # Entry point
├── src-tauri/gen/android/        # Android project (Gradle + Kotlin)
│   └── app/src/main/
│       ├── AndroidManifest.xml   # Permissions + share intent filters
│       └── java/.../MainActivity.kt  # Share intent handler → emits to WebView
├── dist-apps/                    # Ready-to-install builds
│   ├── Giga-Share-Setup.exe
│   ├── Giga-Share.msi
│   ├── Giga-Share-Portable/Giga-Share.exe
│   └── Giga-Share.apk
└── .github/workflows/build-all.yml  # CI: Windows + Android + Linux + macOS
```

<br />

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Device Name | hostname / Android model | Shown to other devices on radar |
| Online Mode | `false` | Switch between LAN and P2P mode |
| Download Path | `~/Downloads` | Where received files are saved |
| Auto-Accept | `false` | Skip approval dialog for incoming transfers |
| Speed Limit (LAN) | `0` (unlimited) | Max Mbit/s for LAN transfers |
| Speed Limit (Online) | `0` (unlimited) | Max Mbit/s for P2P transfers |
| Port | `52526` | TCP port for LAN file transfer |
| Minimize to Tray | `false` | Desktop: minimize instead of close |
| Start on Boot | `false` | Desktop: launch at system startup |
| Send To Menu | `false` | Windows: add to right-click Send To folder |
| Run in Background | `false` | Android: keep alive in background |

Config location:
- **Standard**: `%APPDATA%/GigaShare/` (Windows) / `~/.config/GigaShare/` (Linux/macOS) / app internal storage (Android)
- **Portable** (Windows): place `portable.marker` next to `.exe` → config stored in `./config/` beside the exe

### Ports & Firewall

| Port | Protocol | Purpose |
|------|----------|---------|
| 52525 | UDP | Peer discovery (broadcast) |
| 52526 | TCP | LAN file transfer (configurable) |
| any | QUIC/UDP | Online P2P via iroh (auto NAT traversal) |

On Windows the app auto-adds firewall rules at startup (requires admin or prior approval). If LAN transfers fail, verify both devices are on the same subnet.

<br />

<div align="center">

---

**Made with Rust, React & iroh**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
