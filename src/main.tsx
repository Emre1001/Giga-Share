import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { MotionConfig } from "framer-motion";
import App from "./App";

// Android: system bar / cut-out insets from MainActivity, for WebViews whose env(safe-area-inset-*) reports 0.
type Insets = { top: number; right: number; bottom: number; left: number };
const setInsets = (i: Insets) => {
  for (const k of ["top", "right", "bottom", "left"] as const)
    document.documentElement.style.setProperty(`--native-inset-${k}`, `${i[k]}px`);
};
(window as Window & { __gsInsets?: (i: Insets) => void }).__gsInsets = setInsets;
try { if (window.GigaNative) setInsets(JSON.parse(window.GigaNative.insets())); } catch { /* bridge unavailable */ }

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
