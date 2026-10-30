import { Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Modal } from "./Modal";
import { useT } from "../lib/i18n";
import type { UpdateKind } from "../lib/api";
import type { useUpdater } from "../lib/update";

type U = ReturnType<typeof useUpdater>;

export function UpdateDialog({ u, kind }: { u: U; kind: UpdateKind }) {
  const { t } = useT();
  const { info, phase, percent } = u;
  const busy = phase === "downloading" || phase === "installing";
  const onClose = busy ? undefined : phase === "available" ? u.later : u.close;

  return (
    <Modal open={!!info} onClose={onClose}>
      {info && (
        <div aria-live="polite">
          <div className="dialog-head">
            <span className={`update-ic ${phase === "error" ? "err" : ""}`}>
              {phase === "error" ? <AlertCircle /> : phase === "handoff" ? <CheckCircle2 /> : <Download />}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3>{t(phase === "error" ? "updateError" : phase === "handoff" ? "updateHandoffTitle" : "updateTitle")}</h3>
              <p className="sub">
                {phase === "available" && t("updateBody", { version: info.version, current: info.current })}
                {phase === "downloading" && t("updateDownloading")}
                {phase === "installing" && t("updateInstallingHint")}
                {phase === "handoff" && t("updateHandoff")}
                {phase === "permission" && t("updateAndroidPermission")}
                {phase === "error" && t("updateErrorBody")}
              </p>
            </div>
          </div>

          {phase === "available" && kind === "manual" && <p className="sub update-manual">{t("updateManual")}</p>}
          {phase === "error" && u.error && <p className="mono update-error">{u.error}</p>}
          {phase === "available" && info.notes && (
            <div className="update-notes">
              <span className="eyebrow">{t("updateNotes")}</span>
              <p>{info.notes}</p>
            </div>
          )}

          {busy && (
            <div className="update-progress">
              <div className={`bar ${phase === "installing" || percent === 0 ? "indet" : ""}`}>
                <i style={{ width: `${percent}%` }} />
              </div>
              <span className="mono muted">{phase === "installing" ? t("updateInstalling") : `${Math.round(percent)} %`}</span>
            </div>
          )}

          <div className="dialog-actions">
            {phase === "available" && (
              <>
                <button className="btn btn-ghost" style={{ marginRight: "auto" }} onClick={u.skip}>{t("updateSkip")}</button>
                <button className="btn btn-line" onClick={u.later}>{t("updateLater")}</button>
                <button className="btn btn-primary" autoFocus onClick={u.install}>
                  <Download />{t(kind === "manual" ? "updateOpenPage" : "updateInstall")}
                </button>
              </>
            )}
            {phase === "downloading" && kind === "android" && <button className="btn btn-line" onClick={u.cancel}>{t("cancel")}</button>}
            {phase === "handoff" && <button className="btn btn-line" onClick={u.close}>{t("close")}</button>}
            {phase === "error" && <button className="btn btn-line" onClick={u.openPage}>{t("updateOpenPage")}</button>}
            {phase === "permission" && <button className="btn btn-line" onClick={u.later}>{t("updateLater")}</button>}
            {(phase === "error" || phase === "permission") && (
              <button className="btn btn-primary" autoFocus onClick={u.install}>{t(phase === "error" ? "updateRetry" : "updateInstall")}</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
