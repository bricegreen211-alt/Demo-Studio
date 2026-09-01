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

  // Opened size is the demo's call, not the extension's — a small widget that
  // looks like it belongs on the customer's page, not a full-height panel.
  // Tune these (or drive them from cfg) when you vibe-code this shell.
  const openSize =
    cfg.template === "webrtc" ? { width: 330, height: 430 } :
    cfg.template === "webchat-webrtc" ? { width: 390, height: 560 } :
    { width: 380, height: 520 };

  useEffect(() => {
    post({ type: "CDS_OPEN", open, width: openSize.width, height: openSize.height });
  }, [open, openSize.width, openSize.height]);

  return (
    <div className="cds-shell">
      {/* Card stays mounted while closed so the conversation isn't lost. */}
      <div className="cds-shell-card" style={{ display: open ? "flex" : "none" }}>
        <button className="cds-shell-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        <div className="cds-shell-body">{children}</div>
      </div>

      <div ref={launcherRef} className="cds-shell-launcher" style={{ display: open ? "none" : "flex" }}>
        <Launcher cfg={cfg} onClick={() => setOpen(true)} />
      </div>
    </div>
  );
}
