import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  device_name: string;
  download_path: string;
  port: number;
  auto_accept_lan: boolean;
  auto_accept_online: boolean;
  online_mode: boolean;
  speed_limit_lan_mbps: number;
  speed_limit_online_mbps: number;
  minimize_to_tray: boolean;
  context_menu: boolean;
}

export interface Peer {
  id: string;
  name: string;
  ip: string;
  port: number;
  device_type: string;
  os_type: string;
  p2p_id: string | null;
}

export interface Friend {
  id: string;
  display_name: string;
  added_at: number;
}

export interface P2pStatus {
  friend_code: string | null;
  error: string | null;
}

export interface Bootstrap {
  settings: Settings;
  peers: Peer[];
  friends: Friend[];
  p2p: P2pStatus;
  lan_error: string | null;
  local_ips: string[];
  os: string;
  version: string;
  cli_files: string[];
  update_kind: UpdateKind;
  requests: IncomingRequest[];
  active: { id: string; direction: "send" | "receive"; peer: string; via: Via; file_name: string; file_count: number; total: number }[];
}

export type UpdateKind = "nsis" | "appimage" | "android" | "manual";

export type Via = "lan" | "online";
export type Status = "waiting" | "active" | "done" | "failed" | "cancelled" | "rejected";

export interface Transfer {
  id: string;
  direction: "send" | "receive";
  peer: string;
  via: Via;
  name: string;
  count: number;
  total: number;
  bytes: number;
  speed: number;
  samples: number[];
  status: Status;
  error?: string;
  path?: string;
  at: number;
}

export interface IncomingRequest {
  id: string;
  peer: string;
  via: Via;
  known: boolean;
  peer_id: string | null;
  file_count: number;
  total_size: number;
  files: string[];
}

export interface FriendRequest {
  id: string;
  from: string;
  name: string;
}

export interface HotspotInfo {
  ssid: string;
  password: string;
}

export const api = {
  ready: () => invoke<Bootstrap>("frontend_ready"),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
  sendLan: (peer: Peer, paths: string[]) =>
    invoke<string>("send_lan", { ip: peer.ip, port: peer.port, paths }),
  sendOnline: (friendId: string, paths: string[]) => invoke<string>("send_online", { friendId, paths }),
  respond: (id: string, accept: boolean) => invoke("respond_transfer", { id, accept }),
  cancel: (id: string) => invoke("cancel_transfer", { id }),
  addFriend: (code: string, name: string) => invoke<Friend>("add_friend", { code, name }),
  removeFriend: (id: string) => invoke("remove_friend", { id }),
  renameFriend: (id: string, name: string) => invoke("rename_friend", { id, name }),
  createTextFile: (text: string) => invoke<string>("create_text_file", { text }),
  reveal: (path: string) => invoke("reveal_file", { path }),
  openReleases: () => invoke("open_releases"),
  openDownloads: () => invoke("open_download_folder"),
  checkPresence: () => invoke("check_presence"),
  setLanguage: (lang: string) => invoke("set_language", { lang }),
  hotspotStart: () => invoke<HotspotInfo>("hotspot_start"),
  hotspotStop: () => invoke("hotspot_stop"),
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

export const formatSpeed = (bps: number) => `${formatBytes(bps)}/s`;

export function formatEta(t: Transfer): string {
  if (t.status === "waiting") return "—";
  if (t.speed <= 0) return "…";
  const s = Math.round((t.total - t.bytes) / t.speed);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const baseName = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() ?? p;

/** Shared motion presets. */
export const ease = [0.2, 0.7, 0.1, 1] as const;
export const rise = {
  initial: { opacity: 0, y: 14, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: { duration: 0.45, ease },
};
export const stagger = (i: number) => ({ ...rise, transition: { ...rise.transition, delay: 0.04 * i } });

const HUES = [218, 262, 330, 12, 38, 152, 190];
export function avatarStyle(id: string) {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { background: `linear-gradient(135deg, hsl(${hue} 85% 60%), hsl(${(hue + 40) % 360} 80% 48%))` };
}
export const initials = (name: string) =>
  name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
