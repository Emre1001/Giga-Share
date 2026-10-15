import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { X, Zap, Loader2, Wifi } from "lucide-react";
import { api, type HotspotInfo } from "../lib/api";
import { Modal } from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  open: boolean;
  isDesktop: boolean;
  info: HotspotInfo | null;
  onInfo: (i: HotspotInfo | null) => void;
  onClose: () => void;
  onError: (e: string) => void;
}

/** Direct link: this computer opens a Wi-Fi hotspot, the other device joins via QR. */
export function HotspotDialog({ open, isDesktop, info, onInfo, onClose, onError }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try { onInfo(await api.hotspotStart()); } catch (e) { onError(String(e)); }
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true);
    await api.hotspotStop().catch(e => onError(String(e)));
    onInfo(null);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="dialog-head">
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}><b>{t("directLink")}</b> · {t("noWifiNeeded")}</p>
          <h3>{t("directTitle")}</h3>
          <p className="sub">{t("directSub")}</p>
        </div>
        <button className="icon-btn" onClick={onClose}><X /></button>
      </div>
      <AnimatePresence mode="wait">
        {!isDesktop ? (
          <motion.div key="mobile" className="steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p><b>1</b> {t("directStep1")}</p>
            <p><b>2</b> {t("directStep2")}</p>
            <p><b>3</b> {t("directStep3")}</p>
          </motion.div>
        ) : info ? (
          <motion.div key="on" style={{ display: "grid", gap: 14, justifyItems: "center" }}
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
            <div className="qr live-ring"><QRCodeSVG value={`WIFI:T:WPA;S:${info.ssid};P:${info.password};;`} size={200} level="M" /></div>
            <div className="wifi-creds mono">
              <span><Wifi size={14} />{info.ssid}</span>
              <span>{info.password}</span>
            </div>
            <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
              {t("directScan")}
            </p>
            <button className="btn btn-danger" disabled={busy} onClick={stop}>{busy ? <Loader2 className="spin" /> : null}{t("directStop")}</button>
          </motion.div>
        ) : (
          <motion.div key="off" style={{ display: "grid", justifyItems: "center", gap: 16, padding: "10px 0" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="empty-art big pulse"><Zap /></div>
            <button className="btn btn-primary" disabled={busy} onClick={start}>
              {busy ? <Loader2 className="spin" /> : <Zap />}{t("directStart")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
