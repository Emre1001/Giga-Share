export type Theme = "system" | "light" | "dark";

const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const effective = (t: Theme) => (t === "system" ? (sysDark() ? "dark" : "light") : t);

let current: Theme = "system";

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  current = t;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  // Android: status/navigation bar icons follow the app theme, not the system one.
  window.GigaNative?.setDarkBars(effective(t) === "dark");
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (current === "system") applyTheme("system"); });

/** Round reveal from `origin` via the View Transitions API, colour fade as fallback.
 *  Only Chromium engines (WebView2, Android WebView) get the reveal: WebKitGTK crashed on it. */
export function switchTheme(from: Theme, to: Theme, origin?: Element | null, commit?: () => void) {
  const root = document.documentElement;
  const run = () => { applyTheme(to); commit?.(); };
  if (!origin || effective(from) === effective(to) || matchMedia("(prefers-reduced-motion: reduce)").matches) return run();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition || !/Chrome\//.test(navigator.userAgent)) {
    root.classList.add("theme-fade");
    run();
    setTimeout(() => root.classList.remove("theme-fade"), 350);
    return;
  }
  const r = origin.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const reach = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  root.classList.add("vt-run");
  const vt = doc.startViewTransition(run);
  vt.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
      { duration: 700, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
  vt.finished.finally(() => root.classList.remove("vt-run"));
}
