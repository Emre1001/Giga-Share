import { useEffect, useRef, type RefObject } from "react";

// Open overlays, newest last. Android's back gesture closes the newest one instead of leaving the app.
// An overlay without onClose (e.g. an incoming transfer that needs an answer) swallows back.
type Entry = { close: () => void; closable: () => boolean; els: RefObject<HTMLElement | null>[] };
const stack: Entry[] = [];

declare global {
  interface Window { __nativeBack?: () => boolean }
}

/** Called by MainActivity on back; `false` lets the system leave the app. */
window.__nativeBack = () => {
  const top = stack[stack.length - 1];
  if (top?.closable()) { stack.pop(); top.close(); syncInert(); }
  return !!top;
};

/** Everything behind the newest overlay is inert: not focusable, not tappable, hidden from screen readers. */
function syncInert() {
  const app = document.querySelector(".app");
  if (!app) return;
  const keep = new Set(stack[stack.length - 1]?.els.map(r => r.current).filter(Boolean));
  for (const c of Array.from(app.children) as HTMLElement[])
    c.inert = stack.length > 0 && !keep.has(c) && !c.classList.contains("toasts");
}

/** Registers an open overlay. `els` are its top-level elements inside `.app` (backdrop, panel). */
export function useBackClose(open: boolean, onClose: (() => void) | undefined, ...els: RefObject<HTMLElement | null>[]) {
  const cb = useRef(onClose);
  cb.current = onClose;
  const elsRef = useRef(els);
  elsRef.current = els;
  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => cb.current?.(), closable: () => !!cb.current, els: elsRef.current };
    stack.push(entry);
    syncInert();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      syncInert();
    };
  }, [open]);
}
