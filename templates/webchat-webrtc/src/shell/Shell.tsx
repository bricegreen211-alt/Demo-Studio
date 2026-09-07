/*
 * Overlay shell — used when the demo's panel style is "overlay".
 *
 * The browser extension supplies only a transparent iframe; everything the
 * customer sees is rendered here, so it's all vibe-codeable: the launcher, the
 * panel card, the close button, the open/close animation. Wrap the card in a
 * phone frame, dock it to a corner, make it full-bleed — the extension just
 * follows the size this reports.
 *
 * Talks to the extension with two messages:
 *   CDS_SIZE  — how big the collapsed launcher is, so the iframe can hug it
 *               (an oversized transparent iframe would swallow clicks meant
 *                for the customer's website)
 *   CDS_OPEN  — open/closed, so the iframe can grow to panel size
 */
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DemoConfig } from "../config";
import Launcher from "./Launcher";
import { Icon } from "../icons";

function post(msg: Record<string, unknown>) {
  try { window.parent.postMessage(msg, "*"); } catch { /* not embedded */ }
}

export default function Shell({ cfg, children }: { cfg: DemoConfig; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLDivElement>(null);

  // Keep the extension's iframe hugging the launcher while collapsed.
  // Only report real changes, and only on an animation frame: resizing the
  // iframe re-triggers the observer, so an unguarded report loops forever.
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
  }, [cfg.launcherText, cfg.launcherSize, cfg.launcher]);

  /*
   * Opened size is the demo's call, not the extension's — a small widget that
   * looks like it belongs on the customer's page, not a full-height panel.
   *
   * Read from CSS custom properties so a THEME can set its own geometry. That
   * is what makes layouts possible at all: Horizon is a wide two-column
   * workspace and Prism is an assistant plus a companion card beside it, and
   * neither fits the same rectangle as a narrow vertical panel. The service
   * injects the theme's :root block before this runs, so the value is already
   * there; the per-template numbers below are the fallback when no theme is
   * set. Vibe-coding can override either the variables or this function.
   */
  const readPx = (name: string, fallback: number) => {
    if (typeof window === "undefined") return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const fallbackSize =
    cfg.template === "webrtc" ? { width: 330, height: 430 } :
    cfg.template === "webchat-webrtc" ? { width: 390, height: 560 } :
    { width: 380, height: 520 };
  const openSize = {
    width: readPx("--cds-panel-w", fallbackSize.width),
    height: readPx("--cds-panel-h", fallbackSize.height)
  };

  useEffect(() => {
    post({ type: "CDS_OPEN", open, width: openSize.width, height: openSize.height });
  }, [open, openSize.width, openSize.height]);

  return (
    <div className="cds-shell">
      {/* Card stays mounted while closed so the conversation isn't lost. */}
      <div className="cds-shell-card" style={{ display: open ? "flex" : "none" }}>
        <button className="cds-shell-close" onClick={() => setOpen(false)} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <div className="cds-shell-body">{children}</div>
      </div>

      <div ref={launcherRef} className="cds-shell-launcher" style={{ display: open ? "none" : "flex" }}>
        <Launcher cfg={cfg} onClick={() => setOpen(true)} />
      </div>
    </div>
  );
}
