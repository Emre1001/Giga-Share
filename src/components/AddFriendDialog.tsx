import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Radar as RadarIcon, QrCode, KeyRound, ScanLine, UserPlus, Loader2 } from "lucide-react";
import { stagger, type Peer } from "../lib/api";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { OsIcon } from "./OsIcon";
import { useT } from "../lib/i18n";

type Tab = "nearby" | "qr" | "code";

interface Props {
  tab: Tab | null;
  onTab: (t: Tab | null) => void;
  code: string;
  nearby: Peer[];
  onAdd: (code: string, name: string) => Promise<boolean>;
}

const TABS = [
  { id: "nearby", label: "tabNearby", icon: RadarIcon },
  { id: "qr", label: "tabQr", icon: QrCode },
  { id: "code", label: "tabCode", icon: KeyRound },
] as const;

function Scanner({ onCode }: { onCode: (c: string) => void }) {
  const { t } = useT();
  const [error, setError] = useState("");
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader", false);
    let running = false;
    let done = false;
    scanner
      .start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, text => {
        if (done || !/giga-/i.test(text)) return;
        done = true;
        cb.current(text.trim());
      }, () => {})
      .then(() => { running = true; })
      .catch(e => setError(t("cameraUnavailable", { e: String(e) })));
    return () => { if (running) scanner.stop().then(() => scanner.clear()).catch(() => {}); };
  }, [t]);
  return (
    <>
      <div id="qr-reader" />
      {error && <p className="xfer-msg err">{error}</p>}
    </>
  );
}

export function AddFriendDialog({ tab, onTab, code, nearby, onAdd }: Props) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (!tab) { setScan(false); setBusy(null); } }, [tab]);

  const add = async (c: string, n: string, key = c) => {
    setBusy(key);
    const ok = await onAdd(c, n);
    setBusy(null);
    if (ok) { setInput(""); setName(""); }
  };

  return (
    <Modal open={tab !== null} onClose={() => onTab(null)}>
      <div className="dialog-head">
        <div>
          <h3>{t("addAFriend")}</h3>
          <p className="sub">{t("addAFriendSub")}</p>
        </div>
        <button className="icon-btn" onClick={() => onTab(null)}><X /></button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(x => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { onTab(x.id); setScan(false); }}>
            {tab === x.id && <motion.span className="tab-bg" layoutId="tab-bg" transition={{ type: "spring", damping: 26, stiffness: 320 }} />}
            <x.icon /><span>{t(x.label)}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${tab}-${scan}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22 }} style={{ minHeight: 220 }}>
          {tab === "nearby" && (
            nearby.length === 0 ? (
              <div className="empty">
                <div className="empty-art pulse"><RadarIcon /></div>
                {t("noNearby")}<br />{t("noNearbyHint")}
              </div>
            ) : (
              <div className="list">
                {nearby.map((p, i) => (
                  <motion.div className="row" key={p.id} {...stagger(i)}>
                    <Avatar id={p.p2p_id!} name={p.name} />
                    <span className="ellipsis">
                      <b className="ellipsis">{p.name}</b>
                      <small style={{ display: "flex", gap: 6, alignItems: "center" }}><OsIcon os={p.os_type} type={p.device_type} size={12} />{p.ip}</small>
                    </span>
                    <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => add(p.p2p_id!, p.name, p.id)}>
                      {busy === p.id ? <Loader2 className="spin" /> : <UserPlus />}{t("add")}
                    </button>
                  </motion.div>
                ))}
              </div>
            )
          )}

          {tab === "qr" && (scan ? (
            <Scanner onCode={c => { setScan(false); onTab("code"); setInput(c); }} />
          ) : (
            <div style={{ display: "grid", gap: 14, justifyItems: "center" }}>
              <motion.div className="qr" initial={{ scale: 0.9, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 14 }}>
                {code ? <QRCodeSVG value={code} size={200} level="M" /> : <Loader2 className="spin" />}
              </motion.div>
              <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>{t("scanHint")}</p>
              <button className="btn btn-line" onClick={() => setScan(true)}><ScanLine />{t("scanTheirs")}</button>
            </div>
          ))}

          {tab === "code" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label>{t("friendCode")}</label>
                <textarea className="input mono" rows={3} placeholder="GIGA-XXXX-XXXX-…" value={input}
                  onChange={e => setInput(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("name")} <span className="muted">{t("nameOptional")}</span></label>
                <input className="input" value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && input.trim() && add(input, name)} />
              </div>
              <div className="dialog-actions" style={{ marginTop: 6 }}>
                <button className="btn btn-primary" disabled={!input.trim() || busy !== null} onClick={() => add(input, name)}>
                  {busy ? <Loader2 className="spin" /> : <UserPlus />}{t("sendRequest")}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
