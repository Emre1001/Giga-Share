import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateKind } from "./api";

const REPO = "Emre1001/Giga-Share";
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const K_SKIPPED = "gs-update-skipped";
const K_REMIND = "gs-update-remind";
export const K_AUTO = "gs-update-auto";

export interface UpdateInfo { version: string; current: string; notes: string; apk?: string }
export type Phase = "available" | "downloading" | "installing" | "handoff" | "permission" | "error";
export type CheckResult = "available" | "none" | "error";

/** Android bridge from MainActivity (absent on desktop). */
interface GigaNative {
  canInstallPackages(): boolean;
  openInstallSettings(): void;
  downloadUpdate(url: string): void;
  cancelUpdate(): void;
  setDarkBars(dark: boolean): void;
  insets(): string;
}
type UpdateEvent = { type: "progress"; percent: number } | { type: "handoff" } | { type: "error"; message: string };
declare global {
  interface Window { GigaNative?: GigaNative; __gsUpdate?: (e: UpdateEvent) => void }
}

/** Numeric dotted compare: is `a` newer than `b`? */
export function isNewer(a: string, b: string) {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

/** Release notes are Markdown; shown as plain text (never as HTML). */
const plainNotes = (md: string) =>
  md.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^#+\s*/gm, "").replace(/\*\*|__|`/g, "").trim();

const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
export const autoCheckEnabled = () => local.get(K_AUTO) !== "0";

async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json() as Promise<{ tag_name: string; body?: string; assets: { name: string; browser_download_url: string }[] }>;
}

/** Update check + install for every platform. Desktop installs through tauri-plugin-updater
 *  (signature-verified), Android downloads the release APK and hands it to the system installer,
 *  "manual" installs (portable, deb, rpm) get a link to the release page. */
export function useUpdater(kind: UpdateKind, current: string) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [percent, setPercent] = useState(0);
  const pending = useRef<import("@tauri-apps/plugin-updater").Update | null>(null);
  const busy = useRef(false);

  const check = useCallback(async (manual: boolean): Promise<CheckResult> => {
    if (busy.current || !current) return "none";
    busy.current = true;
    try {
      const rel = await latestRelease();
      const version = rel.tag_name.replace(/^v/, "");
      if (!isNewer(version, current)) return "none";
      if (!manual && (local.get(K_SKIPPED) === version || Number(local.get(K_REMIND) || 0) > Date.now())) return "none";
      let apk: string | undefined;
      if (kind === "android") {
        apk = rel.assets.find(a => a.name.endsWith(".apk"))?.browser_download_url;
        if (!apk?.startsWith(DOWNLOAD_PREFIX)) return "none";
      }
      if (kind === "nsis" || kind === "appimage") {
        const { check: tauriCheck } = await import("@tauri-apps/plugin-updater");
        pending.current = await tauriCheck();
        if (!pending.current) return "none"; // release without a signed latest.json yet
      }
      setPhase("available");
      setPercent(0);
      setInfo({ version, current, notes: plainNotes(rel.body ?? ""), apk });
      return "available";
    } catch (e) {
      console.error("[update] check failed", e);
      return "error";
    } finally {
      busy.current = false;
    }
  }, [kind, current]);

  useEffect(() => {
    if (!current) return;
    const run = () => { if (autoCheckEnabled()) check(false); };
    const first = setTimeout(run, 5000);
    const every = setInterval(run, 6 * 3600 * 1000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [check]);

  // Android reports download progress through this global.
  useEffect(() => {
    window.__gsUpdate = e => {
      if (e.type === "progress") setPercent(e.percent);
      else if (e.type === "handoff") setPhase("handoff");
      else { console.error("[update]", e.message); setPhase("error"); }
    };
    return () => { delete window.__gsUpdate; };
  }, []);

  const install = useCallback(async () => {
    if (!info) return;
    if (kind === "manual") {
      const { api } = await import("./api");
      api.openReleases().catch(() => {});
      return setInfo(null);
    }
    if (kind === "android") {
      const n = window.GigaNative;
      if (!n || !info.apk) return setPhase("error");
      if (!n.canInstallPackages()) { n.openInstallSettings(); return setPhase("permission"); }
      setPercent(0);
      setPhase("downloading");
      n.downloadUpdate(info.apk);
      return;
    }
    const update = pending.current;
    if (!update) return setPhase("error");
    setPercent(0);
    setPhase("downloading");
    try {
      let total = 0, got = 0;
      await update.downloadAndInstall(e => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") { got += e.data.chunkLength; if (total) setPercent((got / total) * 100); }
        else setPhase("installing");
      });
      setPhase("installing");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("[update] install failed", e);
      setPhase("error");
    }
  }, [info, kind]);

  const cancel = useCallback(() => {
    window.GigaNative?.cancelUpdate();
    setPhase("available");
  }, []);
  const later = useCallback(() => { local.set(K_REMIND, String(Date.now() + 24 * 3600 * 1000)); setInfo(null); }, []);
  const skip = useCallback(() => { if (info) local.set(K_SKIPPED, info.version); setInfo(null); }, [info]);
  const close = useCallback(() => setInfo(null), []);

  return { info, phase, percent, check, install, cancel, later, skip, close };
}
