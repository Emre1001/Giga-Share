# Nebula Share Protocol Specification (v1.0)

This document describes the underlying communication protocol used by Nebula Share for discovery and file transfer.

## 1. Discovery (UDP)
- **Port**: 52525
- **Mechanism**: UDP Broadcast
- **Frequency**: Every 5 seconds
- **Payload Format**: `NEBULA_HELLO:<DEVICE_NAME>`
- **Behavior**: When a device receives a `NEBULA_HELLO` from an IP not in its local peer list, it adds it and displays it in the UI.

## 2. Transfer Handshake (TCP)
- **Port**: 52526
- **Step 1 (Manifest)**:
    - Sender connects to Receiver.
    - Sender sends 4 bytes (Big-Endian `u32`) representing the length of the JSON manifest.
    - Sender sends the JSON manifest.
- **Manifest Schema**:
```json
{
  "files": [
    { "name": "video.mp4", "size": 1073741824, "is_dir": false }
  ],
  "total_size": 1073741824
}
```

## 3. Data Transfer
- **Binary Stream**: Direct TCP stream after the manifest.
- **Chunking**: Files are read/written in 64KB buffers to minimize memory overhead while maintaining throughput.
- **Parallelism**: Multiple TCP connections can be established to increase throughput on high-latency networks (optional implementation).

## 4. UI/UX Philosophy
- **Nebula Design**: Uses a dark-mode palette with semi-transparent "glass" panels.
- **Animations**: Uses `framer-motion` for layout transitions and `recharts` for the live bandwidth graph.
