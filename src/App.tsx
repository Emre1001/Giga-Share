import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { type as osType } from "@tauri-apps/plugin-os";
import { Radar } from "./components/Radar";
import { TransferView } from "./components/TransferView";
import { FriendsView, type Friend } from "./components/FriendsView";
import { ModePickerDialog } from "./components/ModePickerDialog";
import { SpeedCalculator } from "./utils/speed";
import { SettingsModal } from "./components/Settings";
import {
  Settings, History as HistoryIcon, CheckCircle2, AlertCircle,
  Smartphone, Globe, Wifi, Upload, FileIcon, X, Type, FolderOpen,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

// ──── Toast notification system ────────────────────────────────────────────
interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

// ──── Transfer state ───────────────────────────────────────────────────────
interface TransferState {
  id: string;
  fileName: string;
  progress: number;
  speed: string;
  eta: string;
  isSending: boolean;
  speedCalc: SpeedCalculator;
  speedHistory: { time: number; speed: number }[];
  hidden: boolean; // user dismissed the view, but still running
}

// ──── Normalize open() result to string[] ─────────────────────────────────
function normalizePaths(selected: string | string[] | null): string[] {
  if (!selected) return [];
  if (Array.isArray(selected)) return selected.filter(Boolean);
  return [selected];
}

interface Peer {
  name: string;
  ip: string;
  port: number;
  device_type: string;
  os_type?: string;
}

interface TransferUpdate {
  transfer_id: string;
  file_name: string;
  bytes_sent: number;
  total_bytes: number;
}

interface IncomingRequest {
  transfer_id: string;
  file_count: number;
  total_size: number;
  sender_ip: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function App() {
  const [peers, setPeers] = useState<Peer[]>([]);
  // ── Multi-transfer state ──────────────────────────────────────────────────
  const [transfers, setTransfers] = useState<Map<string, TransferState>>(new Map());
  const transfersRef = useRef<Map<string, TransferState>>(new Map());
  const [primaryTransferId, setPrimaryTransferId] = useState<string | null>(null);

  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    download_path: "", auto_accept: false, port: 52526,
    online_mode: false, speed_limit_lan_mbps: 0, speed_limit_online_mbps: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [showModePicker, setShowModePicker] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSendText, setShowSendText] = useState(false);
  const [sendTextContent, setSendTextContent] = useState("");
  const [localIPs, setLocalIPs] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>('unknown');

  // Online/P2P state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myFriendCode, setMyFriendCode] = useState("");

  const dragCounter = useRef(0);
  const isMobileRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    transfersRef.current = transfers;
  }, [transfers]);

  // ── Toast helpers ────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Resolve content:// URIs (Android) ────────────────────────────────────
  const resolveFilePaths = useCallback(async (paths: string[]): Promise<string[]> => {
    if (!isMobileRef.current) return paths;
    try {
      const resolved = await invoke<string[]>("resolve_file_paths", { paths });
      return resolved;
    } catch (err) {
      addToast(`Cannot read files: ${err}`, "error");
      return [];
    }
  }, [addToast]);

  useEffect(() => {
    const detectedPlatform = osType();
    setPlatform(detectedPlatform);
    const mobile = detectedPlatform === "android" || detectedPlatform === "ios";
    setIsMobile(mobile);
    isMobileRef.current = mobile;

    invoke("get_settings").then((s: any) => setSettings(s));
    invoke("start_discovery");
    invoke<string[]>("get_local_ips").then(ips => setLocalIPs(ips)).catch(() => {});

    // Load friends
    invoke("get_friends").then((f: any) => setFriends(f)).catch(() => {});

    const unlistenDiscovered = listen("peer_discovered", (event: any) => {
      const peer = event.payload as Peer;
      setPeers(prev => {
        const idx = prev.findIndex(p => p.ip === peer.ip);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = peer;
          return updated;
        }
        return [...prev, peer];
      });
    });

    const unlistenLost = listen("peer_lost", (event: any) => {
      const lostIp = event.payload as string;
      setPeers(prev => prev.filter(p => p.ip !== lostIp));
    });

    const unlistenRequest = listen("transfer_request", (event: any) => {
      setIncomingRequest(event.payload as IncomingRequest);
    });

    const unlistenStarted = listen("transfer_started", (event: any) => {
      const data = event.payload as any;
      const newTransfer: TransferState = {
        id: data.transfer_id,
        fileName: data.file_name,
        progress: 0,
        speed: "0 B/s",
        eta: "Starting...",
        isSending: data.is_sending,
        speedCalc: new SpeedCalculator(),
        speedHistory: [],
        hidden: false,
      };
      setTransfers(prev => {
        const next = new Map(prev);
        next.set(data.transfer_id, newTransfer);
        return next;
      });
      setPrimaryTransferId(data.transfer_id);
    });

    const unlistenProgress = listen("transfer_progress", (event: any) => {
      const data = event.payload as TransferUpdate;
      setTransfers(prev => {
        const t = prev.get(data.transfer_id);
        if (!t) return prev;
        t.speedCalc.addSample(data.bytes_sent);
        const currentSpeed = t.speedCalc.getSpeed();
        const progress = Math.round((data.bytes_sent / data.total_bytes) * 100);
        const updated: TransferState = {
          ...t,
          progress: Math.min(progress, 100),
          speed: t.speedCalc.formatSpeed(currentSpeed),
          eta: progress >= 100 ? "Complete" : currentSpeed > 0
            ? `${Math.round((data.total_bytes - data.bytes_sent) / currentSpeed)}s`
            : "Calculating...",
          speedHistory: [
            ...t.speedHistory.slice(-30),
            { time: Date.now(), speed: currentSpeed / (1024 * 1024) },
          ],
        };
        const next = new Map(prev);
        next.set(data.transfer_id, updated);
        return next;
      });
    });

    const unlistenComplete = listen("transfer_complete", (event: any) => {
      const data = event.payload as any;
      // Use ref to get current state without stale closure
      const t = transfersRef.current.get(data.transfer_id);
      if (t) {
        setHistory(prev => [{
          fileName: t.fileName,
          status: data.status,
          time: new Date().toLocaleTimeString(),
          isSending: t.isSending,
          filePath: data.file_path || null,
        }, ...prev]);
      }
      if (data.status === "rejected") {
        addToast("Transfer rejected by receiver", "error");
      }
      // Remove from active transfers after short delay (so progress hits 100%)
      setTimeout(() => {
        setTransfers(prev => {
          const next = new Map(prev);
          next.delete(data.transfer_id);
          return next;
        });
        setPrimaryTransferId(prev => {
          if (prev === data.transfer_id) {
            // Pick another active transfer if any
            const remaining = [...transfersRef.current.keys()].filter(id => id !== data.transfer_id);
            return remaining[0] || null;
          }
          return prev;
        });
      }, 3000);
    });

    // P2P ready event
    const unlistenP2p = listen("p2p_ready", (_event: any) => {
      invoke("get_my_friend_code").then((code: any) => setMyFriendCode(code)).catch(() => {});
    });

    // Backend error events → toast
    const unlistenDiscoveryErr = listen("discovery_error", (event: any) => {
      addToast(`Discovery: ${event.payload}`, "error");
    });
    const unlistenTransferServerErr = listen("transfer_server_error", (event: any) => {
      addToast(`Transfer server: ${event.payload}`, "error");
    });
    const unlistenP2pErr = listen("p2p_error", (event: any) => {
      const msg = event.payload?.message || event.payload;
      addToast(`P2P: ${msg}`, "error");
    });

    // CLI --send files (Windows Send To)
    const unlistenCli = listen("cli_send_files", (event: any) => {
      const data = event.payload as { paths: string[] };
      if (data.paths && data.paths.length > 0) {
        setPendingFiles(data.paths);
        setShowModePicker(true);
      }
    });

    // Android share intent
    const handleShareIntent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail) && detail.length > 0) {
        setPendingFiles(detail);
        setShowModePicker(true);
      }
    };
    window.addEventListener('giga-share-files', handleShareIntent);

    // Check if files were queued before listener attached (Android)
    if ((window as any).__GIGA_SHARED_FILES__) {
      const queued = (window as any).__GIGA_SHARED_FILES__ as string[];
      if (queued.length > 0) {
        setPendingFiles(queued);
        setShowModePicker(true);
      }
      delete (window as any).__GIGA_SHARED_FILES__;
    }

    // Tauri native drag-drop events (desktop file drops)
    const unlistenDragEnterNative = listen("tauri://drag-enter", () => {
      setIsDragOver(true);
    });
    const unlistenDragLeaveNative = listen("tauri://drag-leave", () => {
      setIsDragOver(false);
    });
    const unlistenDragDrop = listen("tauri://drag-drop", (event: any) => {
      setIsDragOver(false);
      const paths = event.payload?.paths as string[] | undefined;
      if (paths && paths.length > 0) {
        setPendingFiles(paths);
        setShowModePicker(true);
      }
    });

    // Signal backend that all event listeners are registered
    invoke("frontend_ready").catch(() => {});

    return () => {
      unlistenDiscovered.then(f => f());
      unlistenLost.then(f => f());
      unlistenRequest.then(f => f());
      unlistenStarted.then(f => f());
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
      unlistenP2p.then(f => f());
      unlistenDiscoveryErr.then(f => f());
      unlistenTransferServerErr.then(f => f());
      unlistenP2pErr.then(f => f());
      unlistenCli.then(f => f());
      unlistenDragEnterNative.then(f => f());
      unlistenDragLeaveNative.then(f => f());
      unlistenDragDrop.then(f => f());
      window.removeEventListener('giga-share-files', handleShareIntent);
    };
  }, []);

  // Refresh friend code when settings change to online mode
  useEffect(() => {
    if (settings.online_mode && !myFriendCode) {
      invoke("get_my_friend_code").then((code: any) => setMyFriendCode(code)).catch(() => {});
    }
  }, [settings.online_mode]);

  const handleSelectPeer = async (peer: Peer) => {
    let paths: string[];

    if (pendingFiles.length > 0) {
      paths = [...pendingFiles];
      setPendingFiles([]);
    } else {
      const selected = await open({ multiple: true, directory: false });
      paths = normalizePaths(selected as string | string[] | null);
    }

    if (paths.length === 0) return;

    // Resolve Android content:// URIs to real temp file paths
    const resolved = await resolveFilePaths(paths);
    if (resolved.length === 0) return;

    invoke("send_files", {
      targetIp: peer.ip,
      targetPort: peer.port,
      paths: resolved,
    }).catch(err => {
      console.error("Send failed:", err);
      const msg = String(err);
      addToast(
        msg.includes("refused") || msg.includes("timed out")
          ? "Cannot connect — check firewall or that both devices are on the same network"
          : `Transfer failed: ${msg}`,
        "error"
      );
      setHistory(prev => [{
        fileName: resolved[0]?.split(/[/\\]/).pop() || "file",
        status: "error",
        time: new Date().toLocaleTimeString(),
        isSending: true,
      }, ...prev]);
    });
  };

  const handleDropFilesToPeer = async (peer: Peer, paths: string[]) => {
    if (paths.length === 0) return;
    const resolved = await resolveFilePaths(paths);
    if (resolved.length === 0) return;
    invoke("send_files", {
      targetIp: peer.ip,
      targetPort: peer.port,
      paths: resolved,
    }).catch(err => {
      console.error("Drop send failed:", err);
      addToast(`Transfer failed: ${err}`, "error");
    });
  };

  const handleSelectFriend = async (friend: Friend) => {
    let paths: string[];

    if (pendingFiles.length > 0) {
      paths = [...pendingFiles];
      setPendingFiles([]);
    } else {
      const selected = await open({ multiple: true, directory: false });
      paths = normalizePaths(selected as string | string[] | null);
    }

    if (paths.length === 0) return;

    // Resolve Android content:// URIs
    const resolved = await resolveFilePaths(paths);
    if (resolved.length === 0) return;

    invoke("send_files_online", {
      friendId: friend.id,
      paths: resolved,
    }).catch(err => {
      console.error("P2P send failed:", err);
      const msg = String(err);
      addToast(
        msg.includes("not ready")
          ? "P2P not ready yet — wait a moment and try again"
          : msg.includes("timeout") || msg.includes("timed out")
          ? "Connection timed out — check internet and friend code"
          : `Online transfer failed: ${msg}`,
        "error"
      );
      setHistory(prev => [{
        fileName: resolved[0]?.split(/[/\\]/).pop() || "file",
        status: "error",
        time: new Date().toLocaleTimeString(),
        isSending: true,
      }, ...prev]);
    });
  };

  const handleAddFriend = async (code: string, name: string) => {
    try {
      const friend = await invoke("add_friend", { code, name }) as Friend;
      setFriends(prev => [...prev, friend]);
    } catch (err) {
      addToast(`Add friend failed: ${err}`, "error");
    }
  };

  const handleRemoveFriend = async (id: string) => {
    try {
      await invoke("remove_friend", { id });
      setFriends(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error("Remove friend failed:", err);
    }
  };

  const handleRenameFriend = async (id: string, newName: string) => {
    try {
      await invoke("rename_friend", { id, newName });
      setFriends(prev => prev.map(f => f.id === id ? { ...f, display_name: newName } : f));
    } catch (err) {
      console.error("Rename friend failed:", err);
    }
  };

  const handleAccept = () => {
    if (incomingRequest) {
      invoke("accept_transfer", { transferId: incomingRequest.transfer_id });
      setIncomingRequest(null);
    }
  };

  const handleReject = () => {
    if (incomingRequest) {
      invoke("reject_transfer", { transferId: incomingRequest.transfer_id });
      setIncomingRequest(null);
    }
  };

  // Mode picker handlers
  const handleModePickerLan = () => {
    setShowModePicker(false);
    const newSettings = { ...settings, online_mode: false };
    setSettings(newSettings);
    invoke("update_settings", { newSettings });
  };

  const handleModePickerOnline = () => {
    setShowModePicker(false);
    const newSettings = { ...settings, online_mode: true };
    setSettings(newSettings);
    invoke("update_settings", { newSettings });
  };

  const handleCancelPending = () => {
    setPendingFiles([]);
    setShowModePicker(false);
  };

  // ── Send Text feature ────────────────────────────────────────────────────
  const handleSendTextSubmit = async () => {
    if (!sendTextContent.trim()) return;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `text-${timestamp}.txt`;
      const tempPath = await invoke<string>("create_text_file", {
        text: sendTextContent.trim(),
        filename,
      });
      setSendTextContent("");
      setShowSendText(false);
      setPendingFiles([tempPath]);
      setShowModePicker(true);
    } catch (err) {
      addToast(`Cannot create text file: ${err}`, "error");
    }
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
  };

  const isOnline = settings.online_mode;

  // ── Active transfers for display ─────────────────────────────────────────
  const activeTransferList = [...transfers.values()].filter(t => !t.hidden);
  const primaryTransfer = primaryTransferId ? transfers.get(primaryTransferId) : null;
  const visiblePrimary = primaryTransfer && !primaryTransfer.hidden ? primaryTransfer : activeTransferList[0] || null;
  const extraCount = activeTransferList.length > 1 ? activeTransferList.length - 1 : 0;

  return (
    <div
      className="app-container"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="nebula-bg" />

      {/* ── Toast Notifications ─────────────────────────────────────────── */}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              className={`toast toast-${toast.type}`}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
            >
              <span className="toast-message">{toast.message}</span>
              <button className="toast-close" onClick={() => dismissToast(toast.id)}>
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Drag & Drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className="drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Upload size={48} color="var(--accent-purple)" />
            <span className="drop-overlay-text">Drop files to share</span>
            <span className="drop-overlay-hint">
              {isOnline ? "Drop on a friend to send" : "Drop on a device to send"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="header">
        <motion.div
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          GIGA-SHARE
        </motion.div>
        <motion.div
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Active transfer badge */}
          <AnimatePresence>
            {activeTransferList.length > 0 && (
              <motion.div
                className="transfer-badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 20 }}
                onClick={() => {
                  const t = activeTransferList[0];
                  if (t) {
                    setPrimaryTransferId(t.id);
                    setTransfers(prev => {
                      const next = new Map(prev);
                      const updated = next.get(t.id);
                      if (updated) next.set(t.id, { ...updated, hidden: false });
                      return next;
                    });
                    setShowHistory(false);
                  }
                }}
              >
                {activeTransferList.some(t => t.isSending)
                  ? <ArrowUpRight size={12} />
                  : <ArrowDownLeft size={12} />}
                <span>{activeTransferList.length}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            className="icon-btn"
            title="Send text / URL"
            onClick={() => setShowSendText(true)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Type size={18} />
          </motion.button>
          <button
            className={`icon-btn ${showHistory ? 'active' : ''}`}
            onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
          >
            <HistoryIcon size={20} />
          </button>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowHistory(false); }}
          >
            <Settings size={20} />
          </button>
        </motion.div>
      </header>

      <main className="main-content">
        {/* Incoming transfer request overlay */}
        <AnimatePresence>
          {incomingRequest && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="glass-panel incoming-dialog"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <div className="incoming-icon">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Smartphone size={40} color="var(--accent-blue)" />
                  </motion.div>
                </div>
                <h2>Incoming Transfer</h2>
                <p className="text-secondary">{incomingRequest.sender_ip}</p>
                <p className="incoming-details">
                  {incomingRequest.file_count} file{incomingRequest.file_count > 1 ? 's' : ''} — {formatSize(incomingRequest.total_size)}
                </p>
                <div className="incoming-actions">
                  <motion.button
                    className="btn-primary"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAccept}
                  >
                    Accept
                  </motion.button>
                  <motion.button
                    className="btn-secondary btn-reject"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleReject}
                  >
                    Reject
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode Picker Dialog */}
        <ModePickerDialog
          isOpen={showModePicker}
          fileCount={pendingFiles.length}
          onSelectLan={handleModePickerLan}
          onSelectOnline={handleModePickerOnline}
          onClose={handleCancelPending}
        />

        {/* Send Text Dialog */}
        <AnimatePresence>
          {showSendText && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSendText(false)}
            >
              <motion.div
                className="glass-panel send-text-dialog"
                initial={{ scale: 0.85, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Type size={20} color="var(--accent-purple)" />
                    <h3>Send Text</h3>
                  </div>
                  <motion.button
                    className="icon-btn"
                    onClick={() => setShowSendText(false)}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <X size={18} />
                  </motion.button>
                </div>
                <p className="text-secondary" style={{ fontSize: '12px', marginBottom: '12px' }}>
                  Share a message, URL, or any text — sent as a .txt file
                </p>
                <textarea
                  className="glass-input"
                  value={sendTextContent}
                  onChange={e => setSendTextContent(e.target.value)}
                  placeholder="Type or paste text here..."
                  rows={5}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: '16px' }}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendTextSubmit();
                  }}
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <motion.button
                    className="btn-secondary"
                    onClick={() => setShowSendText(false)}
                    whileTap={{ scale: 0.95 }}
                    style={{ padding: '10px 20px' }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    className="btn-primary"
                    onClick={handleSendTextSubmit}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={!sendTextContent.trim()}
                    style={{ padding: '10px 24px', opacity: sendTextContent.trim() ? 1 : 0.5 }}
                  >
                    Next →
                  </motion.button>
                </div>
                <p className="text-secondary" style={{ fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>
                  Ctrl+Enter to continue
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div
              key="history"
              className="glass-panel history-panel"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.3 }}
            >
              <h2 style={{ marginBottom: '20px' }}>Transfer History</h2>
              {history.length === 0 ? (
                <p className="text-secondary">No transfers yet.</p>
              ) : (
                history.map((item, i) => (
                  <motion.div
                    key={i}
                    className="history-item"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0, flex: 1 }}>
                      {item.status === 'success' ? (
                        <CheckCircle2 color="#10b981" size={16} style={{ flexShrink: 0 }} />
                      ) : (
                        <AlertCircle color="#ef4444" size={16} style={{ flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                          {item.isSending ? '↑ ' : '↓ '}{item.fileName}
                        </div>
                        {item.status !== 'success' && (
                          <div style={{ fontSize: '11px', color: '#ef4444' }}>Failed</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {item.status === 'success' && !item.isSending && item.filePath && !isMobile && (
                        <motion.button
                          className="icon-btn"
                          style={{ width: '28px', height: '28px', borderRadius: '8px' }}
                          title="Reveal in Explorer"
                          onClick={() => invoke("reveal_file", { path: item.filePath }).catch(() => {})}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <FolderOpen size={13} />
                        </motion.button>
                      )}
                      <span className="text-secondary" style={{ fontSize: '11px' }}>{item.time}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : visiblePrimary ? (
            <motion.div
              key="transfer"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
            >
              <TransferView
                {...visiblePrimary}
                history={visiblePrimary.speedHistory}
                onCancel={() => {
                  // Hide from view but keep running in background
                  setTransfers(prev => {
                    const next = new Map(prev);
                    const t = next.get(visiblePrimary.id);
                    if (t) next.set(visiblePrimary.id, { ...t, hidden: true });
                    return next;
                  });
                  // Show next active if any
                  const others = [...transfers.values()].filter(t => t.id !== visiblePrimary.id && !t.hidden);
                  setPrimaryTransferId(others[0]?.id || null);
                }}
              />
              {/* Extra transfers mini list */}
              {extraCount > 0 && (
                <motion.div
                  className="extra-transfers"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {activeTransferList.filter(t => t.id !== visiblePrimary.id).map(t => (
                    <motion.div
                      key={t.id}
                      className="extra-transfer-item"
                      onClick={() => {
                        setPrimaryTransferId(t.id);
                        setTransfers(prev => {
                          const next = new Map(prev);
                          const upd = next.get(t.id);
                          if (upd) next.set(t.id, { ...upd, hidden: false });
                          return next;
                        });
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t.isSending ? <ArrowUpRight size={12} color="var(--accent-purple)" /> : <ArrowDownLeft size={12} color="var(--accent-blue)" />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.fileName}</span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent-purple)' }}>{t.progress}%</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          ) : isOnline ? (
            <motion.div
              key="friends"
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <FriendsView
                friends={friends}
                myFriendCode={myFriendCode}
                pendingFiles={pendingFiles}
                onAddFriend={handleAddFriend}
                onRemoveFriend={handleRemoveFriend}
                onRenameFriend={handleRenameFriend}
                onSelectFriend={handleSelectFriend}
                onCancelPending={handleCancelPending}
              />
            </motion.div>
          ) : (
            <motion.div
              key="radar"
              style={{ textAlign: 'center', width: '100%' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Radar peers={peers} onSelectPeer={handleSelectPeer} onDropFiles={handleDropFilesToPeer} platform={platform} />
              <motion.div
                style={{ marginTop: 'clamp(16px, 4vh, 40px)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {pendingFiles.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <FileIcon size={18} color="var(--accent-purple)" />
                    <h1 style={{ fontSize: 'clamp(16px, 3.5vw, 22px)', margin: 0 }}>
                      {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready — tap a device
                    </h1>
                    <motion.button
                      className="btn-secondary"
                      style={{ padding: '5px 14px', fontSize: '12px' }}
                      onClick={handleCancelPending}
                      whileTap={{ scale: 0.95 }}
                    >
                      Cancel
                    </motion.button>
                  </div>
                ) : (
                  <>
                    <h1 style={{ fontSize: 'clamp(18px, 4vw, 28px)', marginBottom: '10px' }}>
                      {peers.length > 0 ? 'Tap a device to send' : 'Searching for Peers...'}
                    </h1>
                    <p className="text-secondary">
                      {peers.length} device{peers.length !== 1 ? 's' : ''} on network
                    </p>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <motion.footer
        className="stats-footer glass-panel"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <div className="stat-card">
          <div className="stat-label">IP Address</div>
          <div className="stat-value" style={{ fontSize: 'clamp(10px, 1.8vw, 13px)', color: 'var(--text-secondary)' }}>
            {localIPs[0] || "—"}
          </div>
        </div>
        <div className="stat-card stat-card-bordered">
          <div className="stat-label">Bandwidth</div>
          <div className="stat-value" style={{ color: activeTransferList.length > 0 ? 'var(--accent-purple)' : 'var(--text-secondary)' }}>
            {visiblePrimary ? visiblePrimary.speed : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mode</div>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isOnline ? (
              <><Globe size={16} color="var(--accent-blue)" /> <span style={{ color: 'var(--accent-blue)' }}>P2P</span></>
            ) : (
              <><Wifi size={16} /> LAN</>
            )}
          </div>
        </div>
      </motion.footer>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        isMobile={isMobile}
        onUpdate={(s) => {
          setSettings(s);
          invoke("update_settings", { newSettings: s });
        }}
      />
    </div>
  );
}

export default App;
