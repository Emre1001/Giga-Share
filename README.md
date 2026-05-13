<div align="center">
  <img src="Icon.png" alt="Giga-Share Logo" width="120" height="120" style="border-radius: 24px;" />
  
  # Giga-Share

  **Blazing fast file sharing — LAN or P2P worldwide**

  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#installation)
  [![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#installation)
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
- Rename or remove friends anytime
- Send files to any friend with one tap
- Friends list persists across app restarts

</td>
</tr>
<tr>
<td width="50%">

### Speed & Control
- Real-time speed graph & ETA
- Configurable Mbit/s speed limits (LAN & Online separate)
- Background upload/download support
- Direct device-to-device — no relay bottleneck

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

### Discovery
- Auto-discovers devices on local network
- Animated radar UI shows nearby devices
- Tap to send, one interaction

</td>
<td width="50%">

### Cross-Platform
- Windows (.exe / .msi installer)
- Android (.apk)
- Same app, same protocol, same UX

</td>
</tr>
</table>

<br />

## How It Works

### LAN Mode (Local Network)

```
┌──────────────┐                        ┌──────────────┐
│              │   UDP Broadcast         │              │
│   Device A   │ ◄──────────────────►    │   Device B   │
│              │   Auto-Discovery        │              │
│              │                        │              │
│              │   TCP Connection        │              │
│              │ ◄──────────────────►    │              │
│              │   File Transfer         │              │
└──────────────┘                        └──────────────┘
```

1. **Discovery** — Devices broadcast via UDP on port `52525`
2. **Selection** — Tap a device on the radar to pick files
3. **Handshake** — Receiver gets transfer request with file details
4. **Transfer** — Files stream over TCP with real-time progress

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

1. **Add Friend** — Exchange Friend Codes (derived from Ed25519 public key)
2. **Connect** — iroh handles NAT traversal automatically (STUN + DERP relay fallback)
3. **Handshake** — Same manifest + ACK protocol over QUIC
4. **Transfer** — Files stream via encrypted QUIC with real-time progress

<br />

## Installation

### Windows

Download the latest release:
- **Giga-Share-Setup.exe** — NSIS Installer
- **Giga-Share.msi** — MSI Installer

### Android

1. Download **Giga-Share.apk**
2. Enable "Install from unknown sources" in phone settings
3. Install the APK

> **LAN Mode**: Both devices must be on the **same WiFi network**.  
> **Online Mode**: Works from anywhere — just add your friend's code.

<br />

## Build From Source

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 18+ |
| [Rust](https://rustup.rs/) | 1.70+ |
| [Tauri CLI](https://v2.tauri.app/) | 2.x |
| Android SDK + NDK | For APK builds |
| JDK 17 | For APK builds |

### Build Commands

```bash
# Install dependencies
npm install

# Development
npm run tauri dev

# Build Windows
npm run tauri build

# Build Android APK
export ANDROID_HOME="path/to/sdk"
export NDK_HOME="path/to/ndk"
export JAVA_HOME="path/to/jdk17"
npm run tauri android build --apk
```

<br />

## Tech Stack

<div align="center">

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + TypeScript + Framer Motion |
| **Backend** | Rust + Tokio (async) |
| **Framework** | Tauri v2 |
| **P2P / Online** | iroh 0.32 (QUIC + NAT traversal + E2E encryption) |
| **LAN Discovery** | UDP Broadcast |
| **LAN Transfer** | TCP with manifest-first protocol |
| **Online Transfer** | QUIC bidirectional streams (same protocol over QUIC) |
| **Speed Limiting** | Token bucket rate limiter (AsyncRead/AsyncWrite) |
| **Charts** | Recharts |
| **Icons** | Lucide React |

</div>

<br />

## Protocol

### Discovery (UDP — LAN Mode)
```
GIGASHARE_V1:{device_name}|{device_type}|{port}
```
- Broadcast every 3 seconds on port `52525`
- `device_type`: `"mobile"` or `"desktop"`
- Peers timeout after 15 seconds of silence

### Transfer (TCP / QUIC)
```
[4 bytes: manifest length][JSON manifest][1 byte: ACK][file data...]
```
- Same protocol for both LAN (TCP) and Online (QUIC)
- Manifest contains file names, sizes, and transfer ID
- Receiver sends `0x01` (accept) or `0x00` (reject)
- Files stream sequentially in 512 KB chunks with progress events

### Friend Codes
```
GIGA-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```
- Derived from Ed25519 public key (iroh NodeId)
- Hex-encoded, formatted with `GIGA-` prefix and dashes every 4 chars
- Persistent across app restarts (key stored locally)

### P2P Connection (Online Mode)
- ALPN protocol: `gigashare/1`
- NAT traversal: STUN + n0 DERP relay fallback
- Transport: QUIC with TLS 1.3
- Connection timeout: 30 seconds

<br />

## Project Structure

```
Giga-Share/
├── src/                        # React frontend
│   ├── App.tsx                 # Main app — mode switching, events
│   ├── App.css                 # Glassmorphism UI styles
│   ├── components/
│   │   ├── Radar.tsx           # LAN device discovery radar
│   │   ├── FriendsView.tsx     # Online mode — friend list & send
│   │   ├── TransferView.tsx    # Transfer progress UI
│   │   └── Settings.tsx        # Settings modal (modes, speed, etc.)
│   └── utils/
│       └── speed.ts            # Speed calculation
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── lib.rs              # Tauri commands
│       ├── discovery.rs        # UDP peer discovery (LAN)
│       ├── transfer.rs         # TCP file transfer (LAN)
│       ├── p2p.rs              # iroh P2P endpoint + QUIC transfer
│       ├── friends.rs          # Friend CRUD + code encode/decode
│       ├── speed_limiter.rs    # Token bucket rate limiter
│       ├── state.rs            # App settings & shared state
│       └── main.rs             # Entry point
├── dist-apps/                  # Built releases
│   ├── Giga-Share-Setup.exe
│   ├── Giga-Share.msi
│   └── Giga-Share.apk
└── Icon.png                    # App icon
```

<br />

## Configuration

Settings stored in:
- **Windows**: `%APPDATA%/GigaShare/settings.json`
- **Android**: App internal storage

Friends stored in:
- `~/.config/GigaShare/friends.json`

Node key (Ed25519) stored in:
- `~/.config/GigaShare/node_key`

| Setting | Default | Description |
|---------|---------|-------------|
| Online Mode | `false` | Switch between LAN and P2P mode |
| Download Path | System Downloads | Where received files are saved |
| Auto-Accept | `false` | Skip approval for incoming transfers |
| Speed Limit (LAN) | `0` (unlimited) | Max transfer speed in Mbit/s for LAN |
| Speed Limit (Online) | `0` (unlimited) | Max transfer speed in Mbit/s for P2P |
| Port | `52526` | TCP port for LAN file transfer |
| Minimize to Tray | `false` | Desktop: minimize instead of close |
| Start on Boot | `false` | Desktop: launch at system startup |
| Run in Background | `false` | Mobile: keep transfers alive in background |

<br />

<div align="center">

---

**Made with Rust, React & iroh**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
