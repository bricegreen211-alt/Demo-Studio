/*
 * The collapsed launcher — a wide pill carrying the agent's identity, so the
 * closed state says who it is rather than showing an anonymous bubble.
 *
 * ── VIBE-CODE ME ──────────────────────────────────────────────────────────
 * In "overlay" panel style this lives in the demo (not the browser extension),
 * so you can change it freely: swap the mark, restyle the pill, animate it,
 * use the customer's own brand — the extension just sizes its transparent
 * iframe to whatever this renders.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { DemoConfig } from "../config";
import { Icon } from "../icons";

export default function Launcher({
  cfg, onClick, status
}: { cfg: DemoConfig; onClick: () => void; status?: string }) {
  // launcherText overrides the agent name on the pill; the form's "show label"
  // toggle drops the trailing status instead, which is the only optional half.
  const name = cfg.launcherText || cfg.agentName || "Assistant";
  return (
    <button className="cds-launcher" onClick={onClick} aria-label={"Open " + name}>
      <span className="cds-avatar">
        {cfg.theme.logo ? <img src={cfg.theme.logo} alt="" /> : <Icon name="graphic_eq" size={23} />}
      </span>
      <span className="cds-launcher-name">{name}</span>
      {cfg.showLauncherText && <span className="cds-launcher-status">{status || "Open"}</span>}
    </button>
  );
}
