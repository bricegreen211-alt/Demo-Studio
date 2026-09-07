/*
 * Overlay shell — the only panel style this endpoint uses.
 *
 * The browser extension supplies a transparent iframe and nothing else;
 * everything the customer sees is rendered here, so it is all vibe-codeable:
 * the launcher, the card, the open/close behaviour.
 *
 * Two messages to the extension:
 *   CDS_SIZE  — the collapsed launcher's footprint, so the iframe can hug it
 *               (an oversized transparent iframe swallows clicks meant for the
 *                customer's website)
 *   CDS_OPEN  — open/closed plus the open card's footprint
 */
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DemoConfig } from "../config";
import Launcher from "./Launcher";

function post(msg: Record<string, unknown>) {
  try { window.parent.postMessage(msg, "*"); } catch { /* not embedded */ }
}

/*
 * Panel geometry, in precedence order:
 *
 *   1. cfg.panelWidth   the demo form's Width control — Compact 360 through
 *                       Extra wide 650. This used to be ignored entirely in
 *                       overlay, so the control looked live and did nothing.
 *   2. --cds-panel-w/h  the theme's own numbers, injected by the service at
 *                       request time, so a Custom theme can resize the panel
 *                       with no rebuild.
 *   3. the constants    last resort, matching Halo's reference.
 *
 * Height follows width proportionally rather than being a second control:
 * one Width choice should give a panel that still looks like Halo, and a
 * 650px-wide panel at a fixed 800px tall reads as a different design. The
 * viewport clamp keeps it on screen on a laptop.
 */
const REF = { width: 460, height: 800, minHeight: 470 };

function readPx(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function panelSize(cfg: DemoConfig) {
  const themeW = readPx("--cds-panel-w", REF.width);
  const themeH = readPx("--cds-panel-h", REF.height);
  const width = cfg.panelWidth && cfg.panelWidth > 0 ? cfg.panelWidth : themeW;
  const scaled = Math.round(themeH * (width / REF.width));
  const room = typeof window === "undefined" ? REF.height : window.innerHeight - 110;
  const height = Math.max(REF.minHeight, Math.min(scaled, Math.max(REF.minHeight, room)));
  return { width, height };
}

export default function Shell({
  cfg, children
}: { cfg: DemoConfig; children: ReactNode | ((close: () => void) => ReactNode) }) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(() => panelSize(cfg));
  const launcherRef = useRef<HTMLDivElement>(null);

  // The viewport clamp above depends on window height, so re-measure on resize.
  useEffect(() => {
    const onResize = () => setSize(panelSize(cfg));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cfg.panelWidth]);

  // Keep the extension's iframe hugging the launcher while collapsed. Only
  // report real changes, and only on an animation frame: resizing the iframe
  // re-triggers the observer, so an unguarded report loops forever.
  useLayoutEffect(() => {
    const el = launcherRef.current;
    if (!el) return;
    let last = "";
    let queued = 0;
    const report = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const w = Math.ceil(r.width) + 4;
        const h = Math.ceil(r.height) + 4;
        const key = w + "x" + h;
        if (key === last) return;
        last = key;
        post({ type: "CDS_SIZE", width: w, height: h });
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => { cancelAnimationFrame(queued); ro.disconnect(); };
  }, [cfg.launcherText, cfg.launcherSize, cfg.launcher, cfg.agentName]);

  useEffect(() => {
    post({ type: "CDS_OPEN", open, width: size.width, height: size.height });
  }, [open, size.width, size.height]);

  const close = () => setOpen(false);

  return (
    <div className="cds-shell">
      {/* The card stays mounted while closed so the conversation, the chat
          socket and any call in progress all survive a minimize. */}
      <div className="cds-shell-card" style={{ display: open ? "flex" : "none" }}>
        <div className="cds-shell-body">
          {typeof children === "function" ? children(close) : children}
        </div>
      </div>

      <div ref={launcherRef} className="cds-shell-launcher" style={{ display: open ? "none" : "flex" }}>
        <Launcher cfg={cfg} onClick={() => setOpen(true)} />
      </div>
    </div>
  );
}
