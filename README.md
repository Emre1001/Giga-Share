<div align="center">
  <img src="Icon.png" alt="Giga-Share Logo" width="120" height="120" style="border-radius: 24px;" />
  
  # Giga-Share
  
  **Blazing fast cross-platform file sharing over your local network**
  
  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#installation)
  [![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#installation)
  [![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](#tech-stack)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#tech-stack)
  [![Tauri](https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](#tech-stack)

  <br />
  
  Send files between your **Android phone** and **Windows PC** instantly.  
  No cloud. No cables. No setup. Just connect to the same WiFi.

  <br />

  ---
</div>

<br />

## Features

<table>
<tr>
<td width="50%">

### Speed
- Direct device-to-device TCP transfer
- No cloud relay — stays on your LAN
- Real-time speed graph & ETA

</td>
<td width="50%">

### Discovery
- Auto-discovers devices on the network
- Animated radar UI shows nearby devices
- Tap to send, one interaction

</td>
</tr>
<tr>
<td width="50%">

### Security
- Accept/reject incoming transfers
- Auto-accept mode for trusted networks
- Files never leave your local network

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

```
┌──────────────┐                        ┌──────────────┐
│              │   UDP Broadcast         │              │
│   Android    │ ◄──────────────────►    │   Windows    │
│   Phone      │   Device Discovery      │   PC         │
│              │                        │              │
│              │   TCP Connection        │              │
│              │ ◄──────────────────►    │              │
│              │   File Transfer         │              │
└──────────────┘                        └──────────────┘
```

1. **Discovery** — Devices broadcast their presence via UDP on port `52525`
2. **Selection** — Tap a device on the radar to pick files
3. **Handshake** — Receiver gets a transfer request with file details
4. **Transfer** — Files stream over TCP on port `52526` with real-time progress

<br />

## Installation

### Windows

Download the latest release:
- **Giga-Share-Setup.exe** — NSIS Installer
- **Giga-Share.msi** — MSI Installer

### Android

1. Download **Giga-Share.apk**
2. Enable "Install from unknown sources" in your phone settings
3. Install the APK

> Both devices must be on the **same WiFi network** for discovery to work.

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
| **Discovery** | UDP Broadcast |
| **Transfer** | TCP with manifest-first protocol |
| **Charts** | Recharts |
| **Icons** | Lucide React |

</div>

<br />

## Protocol

Giga-Share uses a simple custom protocol:

### Discovery (UDP)
```
GIGASHARE_V1:{device_name}|{device_type}|{port}
```
- Broadcast every 3 seconds on port `52525`
- `device_type`: `"mobile"` or `"desktop"`
- Peers timeout after 15 seconds of silence

### Transfer (TCP)
```
[4 bytes: manifest length][JSON manifest][1 byte: ACK][file data...]
```
- Manifest contains file names, sizes, and transfer ID
- Receiver sends `0x01` (accept) or `0x00` (reject)
- Files stream sequentially with progress events

<br />

## Project Structure

```
Giga-Share/
├── src/                    # React frontend
│   ├── App.tsx             # Main app with event listeners
│   ├── App.css             # Glassmorphism UI styles
│   ├── components/
│   │   ├── Radar.tsx       # Device discovery radar
│   │   ├── TransferView.tsx # Transfer progress UI
│   │   └── Settings.tsx    # Settings modal
│   └── utils/
│       └── speed.ts        # Speed calculation
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # Tauri commands
│       ├── discovery.rs    # UDP peer discovery
│       ├── transfer.rs     # TCP file transfer
│       └── state.rs        # App settings & state
├── dist-apps/              # Built releases
│   ├── Giga-Share-Setup.exe
│   ├── Giga-Share.msi
│   └── Giga-Share.apk
└── Icon.png                # App icon
```

<br />

## Configuration

Settings are stored in:
- **Windows**: `%APPDATA%/GigaShare/settings.json`
- **Android**: App internal storage

| Setting | Default | Description |
|---------|---------|-------------|
| Download Path | System Downloads folder | Where received files are saved |
| Auto-Accept | `false` | Skip approval for incoming transfers |
| Port | `52526` | TCP port for file transfer |
| Minimize to Tray | `false` | Desktop only: minimize instead of close |
| Start on Boot | `false` | Desktop only: launch at system startup |

<br />

<div align="center">

---

**Made with Rust and React**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
