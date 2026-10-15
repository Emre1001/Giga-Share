import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  Wifi, Globe, Type, Settings as SettingsIcon, Sun, Moon, Monitor, X, FileText, Send,
  AlertCircle, CheckCircle2, Info, UserPlus, Zap, Check,
} from "lucide-react";
import {
  api, baseName, formatBytes, stagger, ease,
  type FriendRequest, type HotspotInfo, type Bootstrap, type Friend, type IncomingRequest, type P2pStatus, type Peer, type Settings, type Transfer,
} from "./lib/api";
import { Radar } from "./components/Radar";
import { applyTheme, switchTheme, type Theme } from "./lib/theme";
import { I18nProvider, makeT, resolveLang, type LangSetting } from "./lib/i18n";
import { OsIcon } from "./components/OsIcon";
import { Friends } from "./components/Friends";
import { ActiveTransfers, History } from "./components/Transfers";
import { SettingsSheet } from "./components/SettingsSheet";
import { Modal } from "./components/Modal";
import { Avatar } from "./components/Avatar";
import { HotspotDialog } from "./components/HotspotDialog";

interface Toast { id: number; text: string; kind: "error" | "success" | "info" }

const HISTORY_KEY = "gs-history";
const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [p2p, setP2p] = useState<P2pStatus>({ friend_code: null, error: null });
  const [transfers, setTransfers] = useState<Map<string, Transfer>>(new Map());
  const [history, setHistory] = useState<Transfer[]>(() => store.get(HISTORY_KEY, []));
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");
  const [theme, setTheme] = useState<Theme>(() => store.get("gs-theme", "system"));
  const [langSetting, setLangSetting] = useState<LangSetting>(() => store.get("gs-lang", "system"));
  const lang = resolveLang(langSetting);
  const t = useMemo(() => makeT(lang), [lang]);
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    document.documentElement.lang = lang;
    api.setLanguage(lang).catch(() => {});
  }, [lang]);
  const changeLang = (l: LangSetting) => { setLangSetting(l); store.set("gs-lang", l); };
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [waiting, setWaiting] = useState<Set<string>>(new Set());
  const [friendReqs, setFriendReqs] = useState<FriendRequest[]>([]);
  const [showHotspot, setShowHotspot] = useState(false);
  const [hotspot, setHotspot] = useState<HotspotInfo | null>(null);

  // Event handlers registered once need the latest values.
  const live = useRef({ peers, requests, friends });
  live.current = { peers, requests, friends };

  const toast = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  useEffect(() => { applyTheme(theme); }, []);
  const changeTheme = (t: Theme, el: Element) => {
    switchTheme(theme, t, el, () => setTheme(t));
    store.set("gs-theme", t);
  };

  useEffect(() => store.set(HISTORY_KEY, history.slice(0, 100)), [history]);

  // Source of truth updated synchronously, so events arriving between renders see each other.
  const xf = useRef(new Map<string, Transfer>());
  const putTransfer = (t: Transfer) => { xf.current.set(t.id, t); setTransfers(new Map(xf.current)); };
  const dropTransfer = (id: string) => { xf.current.delete(id); setTransfers(new Map(xf.current)); };
  const patchTransfer = (id: string, f: (t: Transfer) => Transfer) => {
    const t = xf.current.get(id);
    if (t) putTransfer(f(t));
  };

  // ── Backend events ──────────────────────────────────────────────────────
  useEffect(() => {
    const subs = [
      listen<Peer[]>("peers_changed", e => setPeers(e.payload)),
      listen<P2pStatus>("p2p_status", e => setP2p(e.payload)),
      listen<string>("app_error", e => toast(e.payload)),
      listen<Friend[]>("friends_changed", e => setFriends(e.payload)),
      listen<{ id: string; online: boolean }>("presence", e => setPresence(p => ({ ...p, [e.payload.id]: e.payload.online }))),
      listen<FriendRequest>("friend_request", e => setFriendReqs(r => [...r, e.payload])),
      listen<string>("friend_request_closed", e => setFriendReqs(r => r.filter(x => x.id !== e.payload))),
      listen<{ id: string; accepted: boolean; name?: string; error?: string }>("friend_answer", ({ payload: a }) => {
        setWaiting(w => { const n = new Set(w); n.delete(a.id); return n; });
        const f = live.current.friends.find(x => x.id === a.id);
        if (a.accepted) {
          toast(tRef.current("friendAccepted", { name: f?.display_name ?? a.name ?? "" }), "success");
          setPresence(p => ({ ...p, [a.id]: true }));
        } else if (a.error) toast(tRef.current("friendUnreachable", { name: f?.display_name ?? "?" }), "info");
        else toast(tRef.current("friendDeclined", { name: f?.display_name ?? "?" }), "info");
      }),
      listen<string[]>("cli_send_files", e => setPending(e.payload)),
      listen<IncomingRequest>("transfer_request", e => setRequests(r => [...r, e.payload])),
      listen<{ id: string; direction: "send" | "receive"; peer: string; via: "lan" | "online"; file_name: string; file_count: number; total: number }>(
        "transfer_started",
        ({ payload: p }) =>
          putTransfer({
            id: p.id, direction: p.direction, peer: p.peer, via: p.via, name: p.file_name, count: p.file_count,
            total: p.total, bytes: 0, speed: 0, samples: [], status: p.direction === "send" ? "waiting" : "active", at: Date.now(),
          }),
      ),
      listen<{ id: string; bytes: number; total: number; speed: number }>("transfer_progress", ({ payload: p }) =>
        patchTransfer(p.id, t => ({
          ...t, status: "active", bytes: p.bytes, total: p.total, speed: p.speed,
          samples: p.speed > 0 ? [...t.samples.slice(-39), p.speed] : t.samples,
        })),
      ),
      listen<{ id: string; status: Transfer["status"]; error: string | null; path: string | null }>("transfer_finished", ({ payload: p }) => {
        const req = live.current.requests.find(r => r.id === p.id);
        setRequests(r => r.filter(x => x.id !== p.id));
        if (req && p.status !== "rejected") toast(tRef.current("senderCancelled", { name: req.peer }), "info");
        const t = xf.current.get(p.id);
        if (!t) return;
        const done: Transfer = { ...t, status: p.status, error: p.error ?? undefined, path: p.path ?? undefined, at: Date.now(), samples: [] };
        putTransfer(done);
        setHistory(h => [done, ...h]);
        if (p.status === "failed") toast(p.error ?? tRef.current("transferFailed"));
        setTimeout(() => dropTransfer(p.id), p.status === "done" ? 6000 : 10000);
      }),
    ];

    // Native file drops: find the device/friend under the cursor via data-drop.
    const targetAt = (pos: { x: number; y: number }) => {
      const r = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / r, pos.y / r)?.closest("[data-drop]");
      return el?.getAttribute("data-drop") ?? null;
    };
    const dnd = getCurrentWebview().onDragDropEvent(({ payload: e }) => {
      if (e.type === "enter" || e.type === "over") {
        setDragging(true);
        setDropTarget(targetAt(e.position));
      } else if (e.type === "drop") {
        setDragging(false);
        setDropTarget(null);
        const target = targetAt(e.position);
        if (e.paths.length) {
          if (target) sendTo(target, e.paths);
          else setPending(e.paths);
        }
      } else {
        setDragging(false);
        setDropTarget(null);
      }
    });

    let alive = true;
    Promise.all([...subs, dnd]).then(() =>
      api.ready().then(b => {
        if (!alive) return;
        setBoot(b);
        setSettings(b.settings);
        setPeers(b.peers);
        setFriends(b.friends);
        setP2p(b.p2p);
        if (b.cli_files.length) setPending(b.cli_files);
        if (b.lan_error) toast(b.lan_error);
      }),
    );
    return () => {
      alive = false;
      [...subs, dnd].forEach(p => p.then(un => un()));
    };
  }, []);

  const onlineMode = settings?.online_mode ?? false;
  useEffect(() => {
    if (!onlineMode || !p2p.friend_code) return;
    api.checkPresence();
    const t = setInterval(() => api.checkPresence(), 45000);
    return () => clearInterval(t);
  }, [onlineMode, p2p.friend_code, friends.length]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const sendTo = async (target: string, paths: string[]) => {
    const [kind, id] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
    try {
      if (kind === "lan") {
        const peer = live.current.peers.find(p => p.id === id);
        if (!peer) throw tRef.current("deviceOffline");
        await api.sendLan(peer, paths);
      } else {
        await api.sendOnline(id, paths);
      }
      setPending([]);
    } catch (e) {
      toast(String(e));
    }
  };

  const pickAndSend = async (target: string) => {
    let paths = pending;
    if (!paths.length) {
      const sel = await openDialog({ multiple: true, directory: false });
      paths = sel ? (Array.isArray(sel) ? sel : [sel]) : [];
    }
    if (paths.length) sendTo(target, paths);
  };

  const saveSettings = async (s: Settings) => {
    try {
      setSettings(await api.updateSettings(s));
      return true;
    } catch (e) {
      toast(String(e));
      return false;
    }
  };

  const setMode = (online: boolean) => settings && settings.online_mode !== online && saveSettings({ ...settings, online_mode: online });

  const respond = (req: IncomingRequest, accept: boolean) => {
    api.respond(req.id, accept);
    setRequests(r => r.filter(x => x.id !== req.id));
  };

  const addFriend = async (code: string, name: string) => {
    try {
      const f = await api.addFriend(code, name);
      setWaiting(w => new Set(w).add(f.id));
      toast(t("requestSent", { name: f.display_name }), "success");
      return true;
    } catch (e) {
      toast(String(e));
      return false;
    }
  };

  const answerFriend = (r: FriendRequest, accept: boolean) => {
    api.respond(r.id, accept);
    setFriendReqs(l => l.filter(x => x.id !== r.id));
    if (accept) toast(t("nowFriends", { name: r.name }), "success");
  };

  const submitText = async () => {
    if (!text.trim()) return;
    try {
      setPending([await api.createTextFile(text)]);
      setText("");
      setShowText(false);
    } catch (e) {
      toast(String(e));
    }
  };

  if (!boot || !settings) return <div className="app" />;

  const online = settings.online_mode;
  const isDesktop = !["android", "ios"].includes(boot.os);
  const active = [...transfers.values()].sort((a, b) => b.at - a.at);
  const running = active.filter(t => t.status === "active" || t.status === "waiting");
  const req = requests[0];
  const ip = boot.local_ips[0] ?? "offline";

  return (
    <I18nProvider lang={lang}>
    <div className="app">
      <nav className="nav">
        <div className="brand">
          <img src="/icon.png" alt="" />
          <span>Giga-Share<span className="dot">.</span></span>
        </div>
        <div className="seg">
          <motion.span className="thumb" layout transition={{ type: "spring", damping: 22, stiffness: 300 }}
            style={{ width: "calc(50% - 3px)", left: online ? "50%" : 3 }} />
          <button aria-pressed={!online} onClick={() => setMode(false)}><Wifi />LAN</button>
          <button aria-pressed={online} onClick={() => setMode(true)}><Globe />Online</button>
        </div>
        <div className="nav-right">
          <div className="theme" role="radiogroup" aria-label="Theme">
            {([["light", Sun], ["system", Monitor], ["dark", Moon]] as const).map(([th, Icon]) => (
              <button key={th} role="radio" aria-checked={theme === th} title={t(th === "light" ? "themeLight" : th === "dark" ? "themeDark" : "themeSystem")} onClick={e => changeTheme(th, e.currentTarget)}><Icon /></button>
            ))}
          </div>
          <button className="icon-btn" title={t("sendText")} onClick={() => setShowText(true)}><Type /></button>
          <button className={`icon-btn ${showSettings ? "on" : ""}`} title={t("settings")} onClick={() => setShowSettings(true)}>
            <SettingsIcon />
          </button>
        </div>
      </nav>

      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
        <motion.section key={online ? "online" : "lan"} className={`col ${online ? "col-scroll" : ""}`}
          initial={{ opacity: 0, x: online ? 40 : -40, filter: "blur(6px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: online ? -40 : 40, filter: "blur(6px)" }}
          transition={{ duration: 0.35, ease }}>
          <AnimatePresence>
            {pending.length > 0 && (
              <motion.div className="pending" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <FileText />
                <span className="ellipsis" style={{ flex: 1 }}>
                  <b>{pending.length === 1 ? baseName(pending[0]) : t("itemsN", { n: pending.length })}</b>{" "}
                  {t(online ? "readyPickFriend" : "readyPickDevice")}
                </span>
                <button className="icon-btn" title={t("discard")} onClick={() => setPending([])}><X /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {online ? (
            <Friends
              friends={friends}
              p2p={p2p}
              myName={settings.device_name}
              nearby={peers}
              presence={presence}
              waiting={waiting}
              dropTarget={dropTarget}
              onPick={f => pickAndSend(`friend:${f.id}`)}
              onAdd={addFriend}
              onRemove={f => {
                if (!confirm(t("confirmRemove", { name: f.display_name }))) return;
                api.removeFriend(f.id).then(() => setFriends(l => l.filter(x => x.id !== f.id))).catch(e => toast(String(e)));
              }}
              onRename={(f, name) => {
                if (!name.trim() || name === f.display_name) return;
                api.renameFriend(f.id, name)
                  .then(() => setFriends(l => l.map(x => (x.id === f.id ? { ...x, display_name: name.trim() } : x))))
                  .catch(e => toast(String(e)));
              }}
            />
          ) : (
            <>
              <Radar peers={peers} myName={settings.device_name} myIp={`${ip}:${settings.port}`} dropTarget={dropTarget}
                onPick={p => pickAndSend(`lan:${p.id}`)} />
              <div className="card" style={{ flex: "none" }}>
                <div className="card-head">
                  <h2>{t("devices")}</h2>
                  <span className="right">
                    <button className={`btn btn-line btn-sm ${hotspot ? "live-btn" : ""}`} onClick={() => setShowHotspot(true)}>
                      <Zap />{t(hotspot ? "directLinkOn" : "directLink")}
                    </button>
                  </span>
                </div>
                {peers.length === 0 ? (
                  <div className="empty">
                    {t("noDevices")}<br />
                    {t("noDevicesOr")} <button className="btn btn-ghost btn-sm" style={{ display: "inline-flex" }} onClick={() => setShowHotspot(true)}>{t("directLink")}</button> {t("noDevicesEnd")}
                  </div>
                ) : (
                  <div className="list">
                    <AnimatePresence initial={false}>
                    {peers.map((p, i) => (
                      <motion.div key={p.id} layout {...stagger(i)} className={`row ${dropTarget === `lan:${p.id}` ? "over" : ""}`} data-drop={`lan:${p.id}`}>
                        <span className="os"><OsIcon os={p.os_type} type={p.device_type} size={18} /></span>
                        <span className="ellipsis">
                          <b className="ellipsis">{p.name}</b>
                          <small>{p.ip} · {p.os_type}</small>
                        </span>
                        <span className="acts">
                          {p.p2p_id && (friends.some(f => f.id === p.p2p_id) ? (
                            <span className="icon-btn" title={t("alreadyFriend")}><Check /></span>
                          ) : (
                            <button className="icon-btn" title={t("addAsFriend")} onClick={() => addFriend(p.p2p_id!, p.name)}><UserPlus /></button>
                          ))}
                          <button className="btn btn-primary btn-sm" onClick={() => pickAndSend(`lan:${p.id}`)}><Send />{t("send")}</button>
                        </span>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.section>
        </AnimatePresence>

        <section className="col col-scroll">
          <ActiveTransfers list={active} />
          <History items={history} onClear={() => setHistory([])} />
        </section>
      </main>

      <footer className="foot">
        <span className={boot.lan_error ? "live bad" : "live"}>{t(boot.lan_error ? "lanUnavailable" : "ready")}</span>
        <span>{settings.device_name}</span>
        <span>{ip}:{settings.port}</span>
        <span>{online ? t(p2p.friend_code ? "p2pOnline" : "p2pConnecting") : t("lan")}</span>
        {running.length > 0 && <span>{t("transfersN", { n: running.length })}</span>}
        <span className="right">v{boot.version}</span>
      </footer>

      {/* Incoming request */}
      <Modal open={!!req}>
        {req && (
          <>
            <div className="dialog-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: 8 }}>{t("incoming")} · <b>{req.via === "online" ? "P2P" : "LAN"}</b></p>
                <h3>{req.peer}</h3>
                <p className="sub">{t("wantsToSend", { n: req.file_count, size: formatBytes(req.total_size) })}</p>
              </div>
            </div>
            {!req.known && <span className="tag warn">{t("notFriend")}</span>}
            <ul className="files">
              {req.files.map(f => <li key={f}><span className="ellipsis">{f}</span></li>)}
              {req.file_count > req.files.length && <li className="muted">{t("moreN", { n: req.file_count - req.files.length })}</li>}
            </ul>
            <div className="dialog-actions">
              <button className="btn btn-line" onClick={() => respond(req, false)}>{t("decline")}</button>
              {!req.known && req.peer_id && (
                <button className="btn btn-line" onClick={() => { respond(req, true); addFriend(req.peer_id!, ""); }}><UserPlus />{t("acceptAdd")}</button>
              )}
              <button className="btn btn-primary" onClick={() => respond(req, true)}>{t("accept")}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Send text */}
      <Modal open={showText} onClose={() => setShowText(false)}>
        <div className="dialog-head">
          <div>
            <h3>{t("sendText")}</h3>
            <p className="sub">{t("sendTextSub")}</p>
          </div>
          <button className="icon-btn" onClick={() => setShowText(false)}><X /></button>
        </div>
        <textarea className="input" rows={6} autoFocus value={text} placeholder={t("typeOrPaste")}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.ctrlKey || e.metaKey) && submitText()} />
        <div className="dialog-actions">
          <span className="eyebrow" style={{ marginRight: "auto", alignSelf: "center" }}>Ctrl + Enter</span>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={submitText}>{t("chooseRecipient")}</button>
        </div>
      </Modal>

      {/* Friend request */}
      <Modal open={!req && friendReqs.length > 0}>
        {friendReqs[0] && (
          <>
            <div className="dialog-head" style={{ alignItems: "center" }}>
              <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 10 }}>
                <Avatar id={friendReqs[0].from} name={friendReqs[0].name} size={56} />
              </motion.div>
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}><b>{t("friendRequest")}</b></p>
                <h3>{friendReqs[0].name}</h3>
                <p className="sub">{t("friendRequestText")}</p>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-line" onClick={() => answerFriend(friendReqs[0], false)}>{t("decline")}</button>
              <button className="btn btn-primary" onClick={() => answerFriend(friendReqs[0], true)}><UserPlus />{t("accept")}</button>
            </div>
          </>
        )}
      </Modal>

      <HotspotDialog open={showHotspot} isDesktop={isDesktop} info={hotspot} onInfo={setHotspot}
        onClose={() => setShowHotspot(false)} onError={e => toast(e)} />

      <SettingsSheet open={showSettings} settings={settings} isDesktop={isDesktop} version={boot.version}
        onClose={() => setShowSettings(false)} onSave={saveSettings} langSetting={langSetting} onLang={changeLang} />

      <AnimatePresence>
        {dragging && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: dropTarget ? 0.35 : 1 }} exit={{ opacity: 0 }}>
            <div>
              <b>{t("dropToShare")}</b>
              <span>{t(online ? "dropOnFriend" : "dropOnDevice")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} className={`toast ${t.kind}`} layout
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
              {t.kind === "error" ? <AlertCircle /> : t.kind === "success" ? <CheckCircle2 /> : <Info />}
              <p>{t.text}</p>
              <button onClick={() => setToasts(l => l.filter(x => x.id !== t.id))}><X size={14} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
    </I18nProvider>
  );
}
