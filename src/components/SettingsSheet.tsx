import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen } from "lucide-react";
import type { Settings } from "../lib/api";
import { useT, LANG_NAMES, type LangSetting } from "../lib/i18n";

interface Props {
  open: boolean;
  settings: Settings;
  isDesktop: boolean;
  version: string;
  onClose: () => void;
  onSave: (s: Settings) => Promise<boolean>;
  langSetting: LangSetting;
  onLang: (l: LangSetting) => void;
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className="switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}

export function SettingsSheet({ open, settings, isDesktop, version, onClose, onSave, langSetting, onLang }: Props) {
  const { t } = useT();
  const [draft, setDraft] = useState(settings);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  useEffect(() => {
    if (!open || !isDesktop) return;
    import("@tauri-apps/plugin-autostart").then(m => m.isEnabled()).then(setAutostart).catch(() => {});
  }, [open, isDesktop]);

  // Toggles save immediately; text fields save on blur.
  const save = (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onSave(next).then(ok => { if (!ok) setDraft(settings); });
  };

  const toggleAutostart = async (v: boolean) => {
    const m = await import("@tauri-apps/plugin-autostart");
    await (v ? m.enable() : m.disable()).catch(() => {});
    setAutostart(await m.isEnabled().catch(() => v));
  };

  const pickFolder = async () => {
    const dir = await openDialog({ directory: true, defaultPath: draft.download_path });
    if (typeof dir === "string") save({ download_path: dir });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="overlay" style={{ zIndex: 55 }} onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="sheet" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="sheet-head">
              <h3>{t("settings")}</h3>
              <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose}><X /></button>
            </div>
            <div className="sheet-body">
              <div className="group">
                <span className="eyebrow">{t("appearance")}</span>
                <div className="setting col-set">
                  <div className="txt"><b>{t("language")}</b></div>
                  <div className="lang-pick">
                    {(["system", "de", "en", "tr"] as const).map(l => (
                      <button key={l} aria-pressed={langSetting === l} onClick={() => onLang(l)}>
                        {langSetting === l && <motion.span className="tab-bg" layoutId="lang-bg" transition={{ type: "spring", damping: 26, stiffness: 320 }} />}
                        <span>{l === "system" ? t("languageSystem") : LANG_NAMES[l]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="group">
                <span className="eyebrow">{t("thisDevice")}</span>
                <div className="setting col-set">
                  <div className="txt"><b>{t("deviceName")}</b><small>{t("deviceNameSub")}</small></div>
                  <input className="input" value={draft.device_name} maxLength={40}
                    onChange={e => setDraft({ ...draft, device_name: e.target.value })}
                    onBlur={() => draft.device_name !== settings.device_name && save({})} />
                </div>
                <div className="setting col-set">
                  <div className="txt"><b>{t("downloadFolder")}</b></div>
                  <div className="form-row">
                    <input className="input mono" value={draft.download_path}
                      onChange={e => setDraft({ ...draft, download_path: e.target.value })}
                      onBlur={() => draft.download_path !== settings.download_path && save({})} />
                    {isDesktop && <button className="icon-btn" title={t("chooseFolder")} onClick={pickFolder}><FolderOpen /></button>}
                  </div>
                </div>
              </div>

              <div className="group">
                <span className="eyebrow">{t("receiving")}</span>
                <div className="setting">
                  <div className="txt"><b>{t("autoAccept")}</b><small>{t("autoAcceptSub")}</small></div>
                  <Switch on={draft.auto_accept} onChange={v => save({ auto_accept: v })} />
                </div>
                <div className="setting">
                  <div className="txt"><b>{t("tcpPort")}</b><small>{t("tcpPortSub")}</small></div>
                  <input className="input num mono" type="number" min={1024} max={65535} value={draft.port}
                    onChange={e => setDraft({ ...draft, port: Number(e.target.value) })}
                    onBlur={() => draft.port !== settings.port && save({})} />
                </div>
              </div>

              <div className="group">
                <span className="eyebrow">{t("speedLimit")}</span>
                {(["speed_limit_lan_mbps", "speed_limit_online_mbps"] as const).map(k => (
                  <div className="setting" key={k}>
                    <div className="txt"><b>{t(k.includes("lan") ? "lan" : "onlineP2p")}</b></div>
                    <input className="input num mono" type="number" min={0} step={1} value={draft[k]}
                      onChange={e => setDraft({ ...draft, [k]: Number(e.target.value) })}
                      onBlur={() => draft[k] !== settings[k] && save({})} />
                  </div>
                ))}
              </div>

              {isDesktop && (
                <div className="group">
                  <span className="eyebrow">{t("system")}</span>
                  <div className="setting">
                    <div className="txt"><b>{t("autostart")}</b><small>{t("autostartSub")}</small></div>
                    <Switch on={autostart} onChange={toggleAutostart} />
                  </div>
                  <div className="setting">
                    <div className="txt"><b>{t("tray")}</b><small>{t("traySub")}</small></div>
                    <Switch on={draft.minimize_to_tray} onChange={v => save({ minimize_to_tray: v })} />
                  </div>
                  <div className="setting">
                    <div className="txt"><b>{t("contextMenu")}</b><small>{t("contextMenuSub")}</small></div>
                    <Switch on={draft.context_menu} onChange={v => save({ context_menu: v })} />
                  </div>
                </div>
              )}
              <p className="eyebrow" style={{ textAlign: "center" }}>Giga-Share {version}</p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
