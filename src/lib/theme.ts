export type Theme = "system" | "light" | "dark";

const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const effective = (t: Theme) => (t === "system" ? (sysDark() ? "dark" : "light") : t);

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

/** Round reveal from `from` via the View Transitions API, colour fade as fallback. */
export function switchTheme(from: Theme, to: Theme, origin?: Element | null, commit?: () => void) {
  const root = document.documentElement;
  const run = () => { applyTheme(to); commit?.(); };
  if (!origin || effective(from) === effective(to)) return run();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition) {
    root.classList.add("theme-fade");
    run();
    setTimeout(() => root.classList.remove("theme-fade"), 800);
    return;
  }
  const r = origin.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const feather = Math.round(Math.min(innerWidth, innerHeight) * 0.24);
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + feather;
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-f", `${feather}px`);
  root.classList.add("vt-run");
  const vt = doc.startViewTransition(run);
  vt.ready.then(() => {
    const o: KeyframeAnimationOptions = { duration: 1100, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" };
    root.animate({ "--vt-r": ["0px", `${reach}px`] } as PropertyIndexedKeyframes, { ...o, pseudoElement: "::view-transition-new(root)" });
    root.animate({ transform: ["scale(1)", "scale(1.035)"], filter: ["blur(0px)", "blur(3px)"] }, { ...o, pseudoElement: "::view-transition-old(root)" });
  }).catch(() => {});
  vt.finished.finally(() => root.classList.remove("vt-run"));
}
