import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Wifi } from "lucide-react";
import { OsIcon } from "./OsIcon";
import type { Peer } from "../lib/api";
import { useT } from "../lib/i18n";

interface Props {
  peers: Peer[];
  myName: string;
  myIp: string;
  dropTarget: string | null;
  onPick: (peer: Peer) => void;
}

const SLOT = 116; // px of ring length one device label needs

/** Circular rings that always fit inside the stage; devices sit exactly on a drawn
 *  ring, evenly spaced. One ring at ~3/4 of the room until full, then inner + outer. */
function layout(w: number, h: number, count: number) {
  const top = 72, bottom = 26;
  const cx = w / 2;
  const cy = top + (h - top - bottom) / 2;
  const R = Math.max(104, Math.min(w / 2 - 62, (h - top - bottom) / 2 - 44));
  const mid = Math.max(96, R * 0.78);
  const inner = Math.max(84, R * 0.52);
  const single = count <= Math.floor((2 * Math.PI * mid) / SLOT);
  const rings = single ? [mid] : [inner, R];
  // Split by ring length so spacing is similar on both.
  const cap0 = single ? count : Math.round((count * inner) / (inner + R));
  const pos = Array.from({ length: count }, (_, i) => {
    const ring = i < cap0 ? 0 : 1;
    const n = ring === 0 ? cap0 : count - cap0;
    const k = ring === 0 ? i : i - cap0;
    const t = -Math.PI / 2 + (ring ? Math.PI / n : 0.4) + (k / n) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rings[ring], y: cy + Math.sin(t) * rings[ring] };
  });
  const deco = [inner * 0.42, ...rings, R * 1.4, R * 1.85];
  return { cx, cy, R, pos, deco };
}

/** Sweep driven by requestAnimationFrame on an SVG attribute: repaints even where
 *  CSS transform animations stall (WebKitGTK with compositing/DMA-BUF issues). */
function Sweep({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const g = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      g.current?.setAttribute("transform", `rotate(${((t - start) / 6000) * 360 % 360} ${cx} ${cy})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cx, cy]);
  // 70° wedge ending at angle 0 (pointing right), faded by a radial mask.
  const a = (70 * Math.PI) / 180;
  const d = `M${cx},${cy} L${cx + r},${cy} A${r},${r} 0 0 0 ${cx + Math.cos(a) * r},${cy - Math.sin(a) * r} Z`;
  return (
    <g ref={g}>
      <path d={d} fill="url(#sweep-grad)" mask="url(#sweep-mask)" />
      <line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke="rgba(80,140,255,.55)" strokeWidth="1.2" mask="url(#sweep-mask)" />
    </g>
  );
}

export function Radar({ peers, myName, myIp, dropTarget, onPick }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const L = layout(w, h, peers.length);
  const sweepR = Math.hypot(w, h);

  return (
    <div className="stage" ref={ref} style={{ minHeight: peers.length > 4 ? 520 : undefined }}>
      {w > 0 && (
        <svg className="stage-rings" width={w} height={h} aria-hidden>
          <defs>
            <linearGradient id="sweep-grad" x1="1" y1="1" x2="0.2" y2="0">
              <stop offset="0" stopColor="#0a5cff" style={{ stopOpacity: "var(--radar-sweep)" }} />
              <stop offset="1" stopColor="#0a5cff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="sweep-fade" cx={L.cx} cy={L.cy} r={L.R * 1.25} gradientUnits="userSpaceOnUse">
              <stop offset=".25" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="sweep-mask"><rect width={w} height={h} fill="url(#sweep-fade)" /></mask>
          </defs>
          {L.deco.map((r, i) => (
            <motion.circle key={i} cx={L.cx} cy={L.cy} r={r} fill="none" stroke="var(--radar-ring)" strokeWidth="1"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: `${L.cx}px ${L.cy}px` }}
              transition={{ delay: 0.08 * i, duration: 0.9, ease: [0.2, 0.7, 0.1, 1] }} />
          ))}
          <Sweep cx={L.cx} cy={L.cy} r={sweepR} />
          {/* Signal pulses expanding from me */}
          {[0, 1, 2].map(i => (
            <motion.circle key={`p${i}`} cx={L.cx} cy={L.cy} r={L.R} fill="none" stroke="#2f6fff" strokeWidth="1.2"
              style={{ transformOrigin: `${L.cx}px ${L.cy}px` }}
              initial={{ scale: 0.12, opacity: 0.6 }} animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: 3.6, repeat: Infinity, delay: i * 1.2, ease: "easeOut" }} />
          ))}
          {/* Link lines to devices */}
          {L.pos.map((p, i) => (
            <motion.line key={peers[i].id} x1={L.cx} y1={L.cy} x2={p.x} y2={p.y - 14}
              stroke={dropTarget === `lan:${peers[i].id}` ? "#2f6fff" : "var(--radar-link)"} strokeWidth="1" strokeDasharray="3 6"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeDashoffset: [0, -18] }}
              transition={{ pathLength: { duration: 0.6 }, strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: "linear" } }} />
          ))}
        </svg>
      )}
      <div className="stage-head">
        <div>
          <motion.div className="t" key={peers.length ? "y" : "n"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {peers.length ? t("nearbyDevices") : t("lookingAround")}
          </motion.div>
          <div className="s">{t("onNetwork", { n: peers.length })}</div>
        </div>
      </div>
      {w > 0 && (
        <div className="me" style={{ left: L.cx, top: L.cy }}>
          <motion.div className="core" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12, stiffness: 200 }}>
            <Wifi />
          </motion.div>
          <span>{myName}</span>
        </div>
      )}
      <AnimatePresence>
        {w > 0 && peers.map((p, i) => {
          const over = dropTarget === `lan:${p.id}`;
          return (
            <motion.button
              key={p.id}
              className={`peer ${over ? "over" : ""}`}
              data-drop={`lan:${p.id}`}
              onClick={() => onPick(p)}
              initial={{ opacity: 0, scale: 0.3, left: L.cx, top: L.cy }}
              animate={{ opacity: 1, scale: over ? 1.08 : 1, left: L.pos[i].x, top: L.pos[i].y }}
              exit={{ opacity: 0, scale: 0.3, left: L.cx, top: L.cy }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", damping: 17, stiffness: 170 }}
              style={{ x: "-50%", y: "-50%" }}
              title={t("sendTo", { name: p.name })}
            >
              <span className="ic">
                {over ? <Upload size={22} /> : <OsIcon os={p.os_type} type={p.device_type} size={24} />}
              </span>
              <span style={{ width: "100%" }}>
                <b className="ellipsis">{p.name}</b>
                <small>{p.ip}</small>
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
      <div className="stage-foot">
        <span>UDP 52525 · broadcast</span>
        <span>{myIp}</span>
      </div>
    </div>
  );
}
