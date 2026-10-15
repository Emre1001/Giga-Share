# Giga-Share protocol (v3, since 0.2.0)

## Discovery (UDP 52525)
Broadcast every 2 s to 255.255.255.255 and every interface's subnet broadcast:

    GIGASHARE_V3:{instance_id}|{device_name}|{device_type}|{tcp_port}|{os_type}

On exit: `GIGASHARE_BYE:{instance_id}`. Peers not heard from for 7 s are dropped.

## Transfer (TCP 52526 for LAN, iroh QUIC bi-stream with ALPN `giga-share/3` for Online)

    sender   → "GSH3" | u32 BE len | JSON {sender_name, sender_os, files:[{name, size}], total_size}
    receiver → u8 decision (1 accept / 0 reject)
    receiver → u32 BE len | JSON [resume offset per file]
    sender   → file bytes from each offset, in manifest order; then half-close
    receiver → u8 1 when every file is on disk

`name` is a relative path with `/`. The receiver sanitizes it, writes `<name>.part`,
and renames to a free name (`file (1).ext`) when complete. An existing `.part` no longer
than the file is resumed from its length.
