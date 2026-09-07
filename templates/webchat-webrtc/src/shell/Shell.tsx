/*
 * Overlay shell — the only panel style this endpoint uses.
 *
 * The browser extension supplies a transparent iframe and nothing else;
 * everything the customer sees is rendered here, so it is all vibe-codeable:
 * the launcher, the card, the open animation, the resize grip.
 *
 * Messages to the extension:
 *   CDS_SIZE  — the collapsed launcher's footprint, so the iframe can hug it
 *               (an oversized transparent iframe swallows clicks meant for the
 *                customer's website)
 *   CDS_OPEN  — open/closed plus the card's footprint. `live: true` marks a
 *               frame mid-drag, which tells the extension to apply the size
 *               immediately instead of running its 280ms size transition —
 *               without it, dragging the grip feels like pulling elastic.
 */
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DemoConfig } from "../config";
import Launcher from "./Launcher";

function post(msg: Record<string, unknown>) {
  try { window.parent.postMessage(msg, "*"); } catch { /* not embedded */ }
}

/*
 * Panel geometry, in precedence order:
 *
 *   1. a size the user dragged   remembered per demo, below
 *   2. cfg.panelWidth            the demo form's Width control
 *   3. --cds-panel-w/h           the theme's own numbers, injected by the
 *                                service at request time, so a Custom theme
 *                                can resize the panel with no rebuild
 *   4. the constants             last resort
 *
 * Height follows width proportionally rather than being a second control: one
 * Width choice should still look like Halo, and a 650px-wide panel at a fixed
 * height reads as a different design.
 *
 * ROOM is the margin left below the viewport, and it matches the extension's
 * own clamp in content.js applySize(). The two have to agree: clamp tighter
 * here and the panel is shorter than it could be for no visible reason; clamp
 * looser and we ask for a height the extension quietly refuses.
 */
const REF = { width: 460, height: 900, minHeight: 470 };
const ROOM = 40;
const LIMITS = { minW: 320, maxW: 900, minH: 420, maxH: 1600 };

function readPx(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type Size = { width: number; height: number };

function configuredSize(cfg: DemoConfig): Size {
  const themeW = readPx("--cds-panel-w", REF.width);
  const themeH = readPx("--cds-panel-h", REF.height);
  const width = cfg.panelWidth && cfg.panelWidth > 0 ? cfg.panelWidth : themeW;
  const scaled = Math.round(themeH * (width / REF.width));
  const room = typeof window === "undefined" ? REF.height : window.innerHeight - ROOM;
  const height = Math.max(REF.minHeight, Math.min(scaled, Math.max(REF.minHeight, room)));
  return { width, height };
}

/*
 * A dragged size is remembered for this demo only, in this browser. It is
 * deliberately NOT written back to demo.json: on a customer's site this page
 * is a chrome-extension:// origin and cannot reach the Studio API, so a save
 * would work in the preview and silently fail in the only place that matters.
 * The form's Width stays the source of truth; this is a per-viewer adjustment.
 */
function storeKey(cfg: DemoConfig) { return "cds:panel:" + (cfg.id || "demo"); }

function loadStored(cfg: DemoConfig): Size | null {
  try {
    const raw = localStorage.getItem(storeKey(cfg));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.width !== "number" || typeof v.height !== "number") return null;
    return clamp(v);
  } catch { return null; }
}

function clamp(s: Size): Size {
  const maxH = Math.min(LIMITS.maxH, typeof window === "undefined" ? LIMITS.maxH : window.innerHeight - ROOM);
  const maxW = Math.min(LIMITS.maxW, typeof window === "undefined" ? LIMITS.maxW : Math.round(window.innerWidth * 0.92));
  return {
    width: Math.round(Math.max(LIMITS.minW, Math.min(s.width, Math.max(LIMITS.minW, maxW)))),
    height: Math.round(Math.max(LIMITS.minH, Math.min(s.height, Math.max(LIMITS.minH, maxH))))
  };
}

export default function Shell({
  cfg, children
}: { cfg: DemoConfig; children: ReactNode | ((close: () => void) => ReactNode) }) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<Size>(() => clamp(configuredSize(cfg)));
  const [dragging, setDragging] = useState(false);
  const launcherRef = useRef<HTMLDivElement>(null);
  const custom = useRef<Size | null>(null);

  // A stored size only applies once the page knows its own viewport, so this
  // runs after mount rather than in the useState initialiser.
  useEffect(() => {
    const stored = loadStored(cfg);
    custom.current = stored;
    setSize(stored || clamp(configuredSize(cfg)));
  }, [cfg.id, cfg.panelWidth]);

  // Both the proportional height and every clamp depend on the viewport.
  useEffect(() => {
    const onResize = () => setSize(clamp(custom.current || configuredSize(cfg)));
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
  }, [cfg.launcherText, cfg.launcherSize, cfg.launcher, cfg.showLauncherText, cfg.launcherImage]);

  useEffect(() => {
    post({ type: "CDS_OPEN", open, width: size.width, height: size.height, live: dragging });
  }, [open, size.width, size.height, dragging]);

  /*
   * Drag to resize.
   *
   * Deltas come from screenX/screenY, not clientX/clientY, and that is the
   * whole trick: this runs inside an iframe whose box is being resized by the
   * drag, so client coordinates are measured against a moving origin and the
   * panel runs away from the cursor. Screen coordinates do not move.
   *
   * The grip sits on the corner nearest the middle of the page — the frame is
   * anchored to its bottom corner, so that is the only corner that grows the
   * panel rather than sliding it.
   */
  const onGripDown = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    // Capture keeps the moves coming once the frame resizes out from under the
    // cursor. It throws if the pointer is already gone, which must not abort
    // the drag — the window listeners below work either way.
    try { (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); } catch { /* no active pointer */ }
    const fromLeft = cfg.panelSide === "left";
    const start = { x: ev.screenX, y: ev.screenY, w: size.width, h: size.height };
    setDragging(true);

    const move = (e: PointerEvent) => {
      const dx = e.screenX - start.x;
      const dy = e.screenY - start.y;
      const next = clamp({
        width: start.w + (fromLeft ? dx : -dx),
        height: start.h - dy
      });
      custom.current = next;
      setSize(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(false);
      try {
        if (custom.current) localStorage.setItem(storeKey(cfg), JSON.stringify(custom.current));
      } catch { /* private mode — the size just won't survive a reload */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [cfg.panelSide, cfg.id, size.width, size.height]);

  // Double-click the grip to go back to the size set in the demo form.
  const resetSize = useCallback(() => {
    custom.current = null;
    try { localStorage.removeItem(storeKey(cfg)); } catch { /* nothing to clear */ }
    setSize(clamp(configuredSize(cfg)));
  }, [cfg.id, cfg.panelWidth]);

  const close = () => setOpen(false);

  return (
    <div className={
      "cds-shell" + (open ? " is-open" : "") + (dragging ? " is-dragging" : "") +
      (cfg.panelSide === "left" ? " from-left" : "")
    }>
      {/* The card stays mounted while closed so the conversation, the chat
          socket and any call in progress all survive a minimize — and so the
          open/close can animate rather than cut. */}
      <div className="cds-shell-card" aria-hidden={!open}>
        <div
          className="cds-grip"
          onPointerDown={onGripDown}
          onDoubleClick={resetSize}
          role="separator"
          aria-label="Resize the panel — double-click to reset"
          title="Drag to resize · double-click to reset"
        />
        <div className="cds-shell-body">
          {typeof children === "function" ? children(close) : children}
        </div>
      </div>

      <div ref={launcherRef} className="cds-shell-launcher">
        <Launcher cfg={cfg} onClick={() => setOpen(true)} />
      </div>
    </div>
  );
}
