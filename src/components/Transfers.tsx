import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Check, FolderOpen, X, AlertCircle, Globe, Wifi } from "lucide-react";
import { api, formatBytes, formatEta, formatSpeed, type Transfer } from "../lib/api";
import { useT } from "../lib/i18n";

function Spark({ samples }: { samples: number[] }) {
  if (samples.length < 2) return <svg className="spark" />;
  const max = Math.max(...samples, 1);
  const pts = samples.map((v, i) => `${(i / (samples.length - 1)) * 100},${40 - (v / max) * 36}`);
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,40 ${pts.join(" ")} 100,40`} fill="currentColor" opacity=".12" />
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}


export function TransferCard({ t }: { t: Transfer }) {
  const { t: tr } = useT();
  const pct = t.total ? Math.min(100, (t.bytes / t.total) * 100) : t.status === "done" ? 100 : 0;
  const running = t.status === "waiting" || t.status === "active";
  const failed = ["failed", "rejected", "cancelled"].includes(t.status);
  return (
    <motion.div
      layout
      className={`xfer ${t.status === "done" ? "done" : failed ? "failed" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
    >
      <div className="eyebrow" style={{ display: "flex", gap: 8, marginBottom: 2 }}>
        <span>{tr(t.direction === "send" ? "sendingTo" : "receivingFrom")} <b>{t.peer}</b></span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {t.via === "online" ? <Globe size={11} /> : <Wifi size={11} />}{t.via === "online" ? "P2P" : "LAN"}
        </span>
      </div>
      <div className="xfer-name">
        <span className="ic">{t.direction === "send" ? <ArrowUpRight /> : <ArrowDownLeft />}</span>
        <span className="ellipsis" style={{ flex: 1 }}>
          <b className="ellipsis">{t.name}</b>
          <small>{t.count > 1 ? `${tr("filesN", { n: t.count })} · ` : ""}{formatBytes(t.total)}</small>
        </span>
        {running ? (
          <button className="icon-btn" title={tr("cancel")} onClick={() => api.cancel(t.id)}><X /></button>
        ) : t.status === "done" && t.path ? (
          <button className="icon-btn" title={tr("showInFolder")} onClick={() => api.reveal(t.path!)}><FolderOpen /></button>
        ) : null}
      </div>
      <div className={`bar ${t.status === "waiting" ? "indet" : ""}`}><i style={{ width: `${pct}%` }} /></div>
      {running ? (
        <>
          <div className="stats">
            <div>{t.status === "waiting" ? "—" : formatSpeed(t.speed)}<small>{tr("speed")}</small></div>
            <div>{Math.floor(pct)}%<small>{formatBytes(t.bytes)}</small></div>
            <div>{formatEta(t)}<small>{tr(t.status === "waiting" ? "waitingAccept" : "remaining")}</small></div>
          </div>
          <Spark samples={t.samples} />
        </>
      ) : t.status === "done" ? (
        <motion.div className="xfer-msg ok" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}><Check size={14} style={{ display: "inline", verticalAlign: -2 }} /> {tr("done")} · {formatBytes(t.total)}</motion.div>
      ) : (
        <div className="xfer-msg err">{t.error ?? (t.status === "rejected" ? tr("declinedByReceiver") : tr("cancelled"))}</div>
      )}
    </motion.div>
  );
}

export function ActiveTransfers({ list }: { list: Transfer[] }) {
  const { t } = useT();
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t("transfers")}</h2>
        <span className="right eyebrow">{t("activeN", { n: list.filter(x => x.status === "active" || x.status === "waiting").length })}</span>
      </div>
      {list.length === 0 ? (
        <div className="empty">{t("nothingMoving")}<br />{t("pickOrDrop")}</div>
      ) : (
        <AnimatePresence initial={false}>
          {list.map(t => <TransferCard key={t.id} t={t} />)}
        </AnimatePresence>
      )}
    </div>
  );
}

export function History({ items, onClear }: { items: Transfer[]; onClear: () => void }) {
  const { t, lang } = useT();
  const tr = t;
  return (
    <div className="card hist">
      <div className="card-head">
        <h2>{t("history")}</h2>
        <div className="right">
          <button className="btn btn-ghost btn-sm" onClick={() => api.openDownloads()}>{t("downloads")}</button>
          {items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={onClear}>{t("clear")}</button>}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty">{t("noTransfers")}</div>
      ) : (
        <div className="list">
          {items.map(h => (
            <div className="row" key={h.id}>
              <span className={`os st-${h.status === "done" ? "done" : "failed"}`}>
                {h.status === "done" ? (h.direction === "send" ? <ArrowUpRight /> : <ArrowDownLeft />) : <AlertCircle />}
              </span>
              <span className="ellipsis">
                <b className="ellipsis" style={{ fontSize: 13.5 }}>{h.name}</b>
                <small>
                  {tr(h.direction === "send" ? "toPeer" : "fromPeer", { name: h.peer })} · {formatBytes(h.total)} ·{" "}
                  {new Date(h.at).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })}
                </small>
              </span>
              <span className="acts">
                {h.status === "done" && h.path ? (
                  <button className="icon-btn" title={tr("showInFolder")} onClick={() => api.reveal(h.path!).catch(() => {})}><FolderOpen /></button>
                ) : h.status === "done" ? <Check size={16} className="st-done" /> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
