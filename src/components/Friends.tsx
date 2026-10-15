import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, QrCode, Send, Pencil, Trash2, UserPlus, Upload, Search, Share2, Loader2 } from "lucide-react";
import { stagger, type Friend, type P2pStatus, type Peer } from "../lib/api";
import { Avatar } from "./Avatar";
import { AddFriendDialog } from "./AddFriendDialog";
import { useT } from "../lib/i18n";

interface Props {
  friends: Friend[];
  p2p: P2pStatus;
  myName: string;
  nearby: Peer[];
  presence: Record<string, boolean>;
  waiting: Set<string>;
  dropTarget: string | null;
  onAdd: (code: string, name: string) => Promise<boolean>;
  onRemove: (f: Friend) => void;
  onRename: (f: Friend, name: string) => void;
  onPick: (f: Friend) => void;
}

export function Friends(props: Props) {
  const { t } = useT();
  const { friends, p2p, myName, presence, waiting, dropTarget, onRemove, onRename, onPick } = props;
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState<"nearby" | "qr" | "code" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [query, setQuery] = useState("");

  const copy = async () => {
    if (!p2p.friend_code) return;
    await navigator.clipboard.writeText(p2p.friend_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    const text = t("shareText", { code: p2p.friend_code ?? "" });
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) await nav.share({ text }).catch(() => {});
    else { await navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1600); }
  };

  const shown = friends
    .filter(f => f.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(presence[b.id] ?? 0) - Number(presence[a.id] ?? 0) || a.display_name.localeCompare(b.display_name));
  const onlineCount = friends.filter(f => presence[f.id]).length;
  const nearbyNew = props.nearby.filter(p => p.p2p_id && !friends.some(f => f.id === p.p2p_id));

  return (
    <>
      <motion.div className="card profile" {...stagger(0)}>
        <Avatar id={p2p.friend_code ?? myName} name={myName} size={52} />
        <div className="ellipsis" style={{ flex: 1 }}>
          <p className="eyebrow">
            {p2p.friend_code ? <><b>●</b> {t("onlineE2e")}</> : p2p.error ? t("offline") : t("connecting")}
          </p>
          <h2 className="hero-title" style={{ fontSize: 26, marginTop: 4 }}>{myName}</h2>
          <button className="code-chip mono" onClick={copy} disabled={!p2p.friend_code} title={t("copyCode")}>
            <span className="ellipsis">{p2p.error ?? p2p.friend_code ?? t("startingP2p")}</span>
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
        <div className="profile-acts">
          <button className="icon-btn" title={t("showQr")} onClick={() => setAdding("qr")} disabled={!p2p.friend_code}><QrCode /></button>
          <button className="icon-btn" title={t("shareCode")} onClick={share} disabled={!p2p.friend_code}><Share2 /></button>
        </div>
      </motion.div>

      <motion.div className="add-strip" {...stagger(1)}>
        <button className="btn btn-primary" onClick={() => setAdding(nearbyNew.length ? "nearby" : "code")}><UserPlus />{t("addFriend")}</button>
        {nearbyNew.length > 0 && (
          <motion.button className="nearby-hint" onClick={() => setAdding("nearby")} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
            <span className="dots">{nearbyNew.slice(0, 3).map(p => <Avatar key={p.id} id={p.p2p_id!} name={p.name} size={24} />)}</span>
            {t("nearbyToPair", { n: nearbyNew.length })}
          </motion.button>
        )}
      </motion.div>

      <motion.div className="card" {...stagger(2)}>
        <div className="card-head">
          <h2>{t("friends")}</h2>
          <span className="right eyebrow">{t("onlineOf", { a: onlineCount, b: friends.length })}</span>
        </div>
        {friends.length > 4 && (
          <div className="search">
            <Search />
            <input className="input" placeholder={t("searchFriends")} value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        )}
        {friends.length === 0 ? (
          <div className="empty">
            <div className="empty-art"><UserPlus /></div>
            {t("noFriends")}<br />{t("noFriendsHint")}
          </div>
        ) : (
          <motion.div className="list" layout>
            <AnimatePresence initial={false}>
              {shown.map((f, i) => {
                const over = dropTarget === `friend:${f.id}`;
                const st = waiting.has(f.id) ? "waiting" : presence[f.id] === undefined ? "checking" : presence[f.id] ? "online" : "offline";
                return (
                  <motion.div key={f.id} layout className={`row ${over ? "over" : ""}`} data-drop={`friend:${f.id}`}
                    {...stagger(i)} exit={{ opacity: 0, x: -30, height: 0, paddingTop: 0, paddingBottom: 0 }}>
                    {over ? <span className="os"><Upload /></span> : <Avatar id={f.id} name={f.display_name} online={st === "online" ? true : st === "offline" ? false : null} />}
                    {editing === f.id ? (
                      <input className="input" autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                        onBlur={() => { onRename(f, editName); setEditing(null); }}
                        onKeyDown={e => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditing(null);
                        }} />
                    ) : (
                      <span className="ellipsis">
                        <b className="ellipsis">{f.display_name}</b>
                        <small className={`st st-${st}`}>
                          {st === "waiting" ? <><Loader2 className="spin" size={11} /> {t("requestPending")}</> : t(st === "online" ? "stOnline" : st === "offline" ? "stOffline" : "stChecking")}
                        </small>
                      </span>
                    )}
                    <span className="acts">
                      <button className="icon-btn hide-sm" title={t("rename")} onClick={() => { setEditing(f.id); setEditName(f.display_name); }}><Pencil /></button>
                      <button className="icon-btn hide-sm" title={t("remove")} onClick={() => onRemove(f)}><Trash2 /></button>
                      <button className="btn btn-primary btn-sm" onClick={() => onPick(f)}><Send />{t("send")}</button>
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>

      <AddFriendDialog
        tab={adding}
        onTab={setAdding}
        code={p2p.friend_code ?? ""}
        nearby={nearbyNew}
        onAdd={async (c, n) => { const ok = await props.onAdd(c, n); if (ok) setAdding(null); return ok; }}
      />
    </>
  );
}
