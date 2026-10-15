<div align="center">
  <img src="docs/icon.svg" alt="Giga-Share" width="112" height="112" />
  
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
- **Direct link** — no shared Wi-Fi? The computer opens a hotspot, the phone joins by QR
- Switch modes with one toggle

</td>
<td width="50%">

### Friend System
- Add friends by code, QR or **one tap on a nearby device**
- Friend **requests** — accepting adds both sides
- **Online status** for every friend
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
- **Right-click send** — Windows Send To, Linux Nemo / Dolphin / Nautilus
- **Drag & drop** — drag files onto a device to send
- **Send Text** — share text/URLs directly as a `.txt` file
- Tray, start on boot, desktop notifications
- **Deutsch, English, Türkçe** — follows the system language

</td>
<td width="50%">

### Discovery
- Auto-discovers devices on local network
- Animated radar with **OS-specific icons** (Windows / macOS / Linux / Android), light & dark
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

1. **Discovery** — Devices broadcast `GIGASHARE_V3:{id}|{name}|{type}|{port}|{os}|{p2p_id}` via UDP on port `52525`
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

Download from the [latest release](https://github.com/Emre1001/Giga-Share/releases/latest) or the [website](https://emre1001.github.io/Giga-Share/).

> **Version 2 is a rewrite.** Its protocol is not compatible with 1.x — update every device.

### Windows

- **`Giga-Share-Setup.exe`** — installer
- **`Giga-Share-Portable.zip`** — unzip and run; `portable.marker` keeps the config next to the `.exe`

"Send with Giga-Share" is added to the Explorer **Send To** menu (Settings → System).

### Linux

```bash
sudo apt install ./Giga-Share.deb      # Debian, Ubuntu, Mint
sudo dnf install ./Giga-Share.rpm      # Fedora
chmod +x Giga-Share.AppImage && ./Giga-Share.AppImage   # anywhere
```

Tray icon, autostart, desktop notifications and a **"Send with Giga-Share"** right-click entry in Nemo, Dolphin and Nautilus.

### Android

1. Download **`Giga-Share.apk`**, allow installing from your browser, install
2. Use **Share → Giga-Share** in any app

> **LAN mode**: devices on the same network. **Direct link**: no shared Wi-Fi — the computer opens its own hotspot, the phone scans the QR. **Online mode**: anywhere, via friend code.

<br />

## Build From Source

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 20+ |
| [Rust](https://rustup.rs/) | stable |
| Linux build deps | `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf rpm` |
| Windows cross-build (from Linux) | `mingw-w64 nsis`, `rustup target add x86_64-pc-windows-gnu` |
| Android | JDK 17, Android SDK + NDK 27, `rustup target add aarch64-linux-android armv7-linux-androideabi` |

### Everything from one Linux machine

```bash
npm install
./build-all.sh            # or: ./build-all.sh linux | windows | android
# Output: dist-apps/
```

APK signing uses `GIGASHARE_KEYSTORE`, `GIGASHARE_KEY_ALIAS`, `GIGASHARE_KEY_PASS` (falls back to the Android debug keystore).

### CI

`.github/workflows/build-all.yml` builds Linux and Windows (incl. `.msi`) on every `v*` tag.

### Development

```bash
npm install
npx tauri dev
cargo test --manifest-path src-tauri/Cargo.toml
```

<br />

## Protocol

See [ARCHITECTURE.md](ARCHITECTURE.md).

- **Discovery** (UDP `52525`, every 2 s): `GIGASHARE_V3:{instance_id}|{name}|{device_type}|{port}|{os_type}|{p2p_id}`
- **Transfer** (TCP `52526` on LAN, iroh QUIC for Online): `GSH3` + manifest → accept → resume offsets → bytes → ack. Interrupted transfers resume from `.part` files.
- **Friends**: friend code = Ed25519 public key (`GIGA-` + 64 hex). Adding someone sends them a request; accepting adds both sides. Presence is a QUIC ping.

<br />

## Project Structure

```
Giga-Share/
├── src/                         # React frontend
│   ├── App.tsx                  # State, backend events, layout
│   ├── styles.css               # Design tokens shared with the website
│   ├── lib/                     # api.ts (commands/types), i18n.tsx (de/en/tr), theme.ts
│   └── components/              # Radar, Friends, AddFriendDialog, HotspotDialog, Transfers, SettingsSheet …
├── src-tauri/src/               # Rust backend
│   ├── protocol.rs              # Transfer protocol (shared by LAN + Online)
│   ├── transfer.rs              # TCP server/client
│   ├── p2p.rs                   # iroh endpoint, friend requests, presence
│   ├── discovery.rs             # UDP discovery
│   ├── hotspot.rs               # Direct link (nmcli / Windows mobile hotspot)
│   ├── desktop.rs               # Tray, single instance, notifications, context menus
│   ├── friends.rs, state.rs, commands.rs, lib.rs
├── src-tauri/gen/android/       # Android project (MainActivity.kt: share intent, MulticastLock)
├── docs/                        # Website (GitHub Pages)
└── build-all.sh                 # Linux + Windows + Android builds
```

<br />

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Device Name | hostname / Android model | Shown to other devices |
| Download Path | `~/Downloads/Giga-Share` | Where received files go |
| Auto-Accept | `false` | From LAN devices and friends, without asking |
| Speed Limit (LAN / Online) | `0` (unlimited) | Mbit/s |
| Port | `52526` | TCP port for LAN transfers |
| Keep running in tray | `true` | Desktop |
| Send-with menu | `true` | Explorer Send To / Nemo / Dolphin / Nautilus |
| Language | system | Deutsch, English, Türkçe |

Config location: the OS app-config dir (`~/.config/io.github.emre1001.gigashare/` on Linux, `%APPDATA%\io.github.emre1001.gigashare\` on Windows). Portable: `portable.marker` next to the `.exe` → `./config/`.

### Ports & Firewall

| Port | Protocol | Purpose |
|------|----------|---------|
| 52525 | UDP | Discovery (broadcast) |
| 52526 | TCP | LAN transfers (configurable) |
| any | QUIC/UDP | Online P2P via iroh |

<br />

<div align="center">

---

**Made with Rust, React & iroh**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
