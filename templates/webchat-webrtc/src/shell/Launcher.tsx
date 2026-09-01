/*
 * The launcher icon the customer clicks to open this demo.
 *
 * ── VIBE-CODE ME ──────────────────────────────────────────────────────────
 * In "overlay" panel style this lives in the demo (not the browser extension),
 * so you can change it freely: swap the SVG, restyle the pill, animate it,
 * use the customer's own brand mark — the extension just sizes its transparent
 * iframe to whatever this renders.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { DemoConfig } from "../config";

const SIZE_PX: Record<string, number> = { small: 52, medium: 62, large: 74 };

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H12l-4.6 3.4a.6.6 0 0 1-.95-.48V16.5H4.5A1.5 1.5 0 0 1 3 15V7a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 3.8c.5-.3 1.2-.1 1.5.4l1.7 2.8c.3.5.2 1.1-.2 1.5L9.2 9.8c-.3.3-.4.7-.2 1a9.6 9.6 0 0 0 4.2 4.2c.36.18.78.1 1.04-.2l1.28-1.3c.4-.4 1-.5 1.5-.2l2.8 1.7c.5.3.7 1 .4 1.5l-1 1.7c-.35.6-1.03.9-1.7.8A15.5 15.5 0 0 1 4.7 6.5c-.1-.67.2-1.35.8-1.7l2-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5Z" fill="currentColor" />
      <circle cx="18.5" cy="17.5" r="1.7" fill="currentColor" opacity=".85" />
      <circle cx="5.5" cy="16.5" r="1.1" fill="currentColor" opacity=".6" />
    </svg>
  );
}

/** AI orb — the "does both" default for multimodal demos. */
function OrbIcon() {
  return (
    <span className="cds-orb-icon">
      <span className="cds-orb-icon-swirl" />
      <span className="cds-orb-icon-shine" />
    </span>
  );
}

function iconFor(launcher: string) {
  if (launcher === "voice-wave") return <PhoneIcon />;
  if (launcher === "ai-spark") return <SparkIcon />;
  if (launcher === "chat") return <ChatIcon />;
  return <OrbIcon />;
}

export default function Launcher({ cfg, onClick }: { cfg: DemoConfig; onClick: () => void }) {
  const size = SIZE_PX[cfg.launcherSize] || SIZE_PX.medium;
  const showLabel = cfg.showLauncherText && !!cfg.launcherText;

  return (
    <div className="cds-launcher-row">
      {showLabel && <span className="cds-launcher-label">{cfg.launcherText}</span>}
      <button
        className={"cds-launcher cds-launcher-" + cfg.launcher}
        style={{ width: size, height: size }}
        onClick={onClick}
        aria-label={"Open " + (cfg.agentName || "assistant")}
      >
        {iconFor(cfg.launcher)}
      </button>
    </div>
  );
}
