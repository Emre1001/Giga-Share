import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, Sun, Monitor, Moon, ChevronRight, Check, RefreshCw } from "lucide-react";
import type { Settings } from "../lib/api";
import { useT, LANG_NAMES, type LangSetting } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import { useBackClose } from "../lib/back";
import { Modal } from "./Modal";
import { K_AUTO, autoCheckEnabled, type CheckResult } from "../lib/update";

interface Props {
  open: boolean;
  settings: Settings;
  isDesktop: boolean;
  version: string;
  onClose: () => void;
  onSave: (s: Settings) => Promise<boolean>;
  langSetting: LangSetting;
  onLang: (l: LangSetting) => void;
  theme: Theme;
  onTheme: (t: Theme, el: Element) => void;
  onCheckUpdate: () => Promise<CheckResult>;
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className="switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}

export function SettingsSheet({ open, settings, isDesktop, version, onClose, onSave, langSetting, onLang, theme, onTheme, onCheckUpdate }: Props) {
  const { t } = useT();
  const backdrop = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  useBackClose(open, onClose, backdrop, panel);
  const [draft, setDraft] = useState(settings);
  const [autostart, setAutostart] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(autoCheckEnabled);
  const [updState, setUpdState] = useState<"idle" | "checking" | CheckResult>("idle");

  const checkNow = async () => {
    setUpdState("checking");
    setUpdState(await onCheckUpdate());
  };
  const toggleAutoUpdate = (v: boolean) => {
    setAutoUpdate(v);
    try { localStorage.setItem(K_AUTO, v ? "1" : "0"); } catch { /* storage unavailable */ }
  };

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
    <>
    <AnimatePresence>
      {open && (
        <>
          <motion.div ref={backdrop} className="overlay sheet-backdrop" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside ref={panel} className="sheet" role="dialog" aria-modal aria-label={t("settings")} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <div className="sheet-head">
              <h3>{t("settings")}</h3>
              <button className="icon-btn" style={{ marginLeft: "auto" }} aria-label={t("close")} onClick={onClose}><X /></button>
            </div>
            <div className="sheet-body">
              <div className="group">
                <span className="eyebrow">{t("appearance")}</span>
                <div className="setting col-set">
                  <div className="txt"><b>{t("theme")}</b></div>
                  <div className="lang-pick" style={{ gridTemplateColumns: "repeat(3,1fr)" }} role="radiogroup" aria-label={t("theme")}>
                    {([["light", Sun, "themeLight"], ["system", Monitor, "themeSystem"], ["dark", Moon, "themeDark"]] as const).map(([th, Icon, key]) => (
                      <button key={th} role="radio" aria-checked={theme === th} aria-pressed={theme === th} onClick={e => onTheme(th, e.currentTarget)}>
                        {theme === th && <motion.span className="tab-bg" layoutId="theme-bg" transition={{ type: "spring", damping: 26, stiffness: 320 }} />}
                        <span className="pick-label"><Icon size={14} aria-hidden />{t(key)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button className="setting setting-btn" onClick={() => setLangOpen(true)} aria-haspopup="dialog">
                  <div className="txt"><b>{t("language")}</b></div>
                  <span className="muted">{langSetting === "system" ? t("languageSystem") : LANG_NAMES[langSetting]}</span>
                  <ChevronRight size={16} className="muted" aria-hidden />
                </button>
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
                  <div className="txt"><b>{t("autoAcceptLan")}</b><small>{t("autoAcceptLanSub")}</small></div>
                  <Switch on={draft.auto_accept_lan} onChange={v => save({ auto_accept_lan: v })} />
                </div>
                <div className="setting">
                  <div className="txt"><b>{t("autoAcceptOnline")}</b><small>{t("autoAcceptOnlineSub")}</small></div>
                  <Switch on={draft.auto_accept_online} onChange={v => save({ auto_accept_online: v })} />
                </div>
                {!isDesktop && (
                  <div className="setting">
                    <div className="txt"><b>{t("background")}</b><small>{t("backgroundSub")}</small></div>
                    <Switch on={draft.minimize_to_tray} onChange={v => save({ minimize_to_tray: v })} />
                  </div>
                )}
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
              <div className="group">
                <span className="eyebrow">{t("updates")}</span>
                <div className="setting">
                  <div className="txt">
                    <b>Giga-Share {version}</b>
                    <small role="status">
                      {updState === "checking" ? t("updateChecking")
                        : updState === "none" ? t("updateUpToDate", { current: version })
                        : updState === "error" ? t("updateCheckFailed") : "\u00a0"}
                    </small>
                  </div>
                  <button className="btn btn-line btn-sm" disabled={updState === "checking"} onClick={checkNow}>
                    <RefreshCw className={updState === "checking" ? "spin" : ""} />{t("updateCheck")}
                  </button>
                </div>
                <div className="setting">
                  <div className="txt"><b>{t("updateAuto")}</b><small>{t("updateAutoSub")}</small></div>
                  <Switch on={autoUpdate} onChange={toggleAutoUpdate} />
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>

    <Modal open={open && langOpen} onClose={() => setLangOpen(false)}>
      <div className="dialog-head">
        <h3>{t("chooseLanguage")}</h3>
        <button className="icon-btn" aria-label={t("close")} onClick={() => setLangOpen(false)}><X /></button>
      </div>
      <div className="lang-list" role="radiogroup" aria-label={t("language")}>
        {(["system", "de", "en", "tr"] as const).map(l => (
          <button key={l} role="radio" aria-checked={langSetting === l} onClick={() => { onLang(l); setLangOpen(false); }}>
            <span>{l === "system" ? t("languageSystem") : LANG_NAMES[l]}</span>
            {langSetting === l && <Check size={16} aria-hidden />}
          </button>
        ))}
      </div>
    </Modal>
    </>
  );
}
