/*
 * WebRTC — Halo, voice only.
 *
 * The same panel as the Webchat + WebRTC design with the chat half removed:
 * identity at the top, then call status, the live transcript, and Mute + Call.
 * No tab bar, because there is only one mode.
 *
 * Reached only for a non-default theme. On Cognigy Default the service serves
 * Cognigy's own click-to-call widget instead and this never runs — see
 * usesVoiceWidget() in packages/shared/demo-schema.js.
 *
 * Nothing here is scripted. Every transcript line arrives from the Cognigy
 * agent over the click-to-call SDK; the one exception is the literal endpoint
 * "mock", which paints a SIM badge.
 */
import { DemoConfig } from "./config";
import Shell from "./shell/Shell";
import VoiceView from "./voice/VoiceView";
import { useCognigyVoice, CognigyVoice } from "./voice/useCognigyVoice";
import { Icon } from "./icons";

function subtitle(cfg: DemoConfig, voice: CognigyVoice): string {
  if (voice.state === "unsupported") return "Voice needs Chrome or Edge";
  if (voice.state === "active") return voice.aiSpeaking ? cfg.agentName + " is speaking" : "Listening";
  if (voice.state === "connecting") return "Connecting…";
  if (voice.state === "ringing") return "Calling…";
  if (voice.state === "error") return "Call problem";
  if (voice.state === "ended") return "Call ended";
  return voice.simulated ? "Simulated demo" : "Ready to call";
}

function Panel({ cfg, voice, onMinimize }: { cfg: DemoConfig; voice: CognigyVoice; onMinimize?: () => void }) {
  return (
    <section className="cds-multi" aria-label={cfg.agentName}>
      <header className="cds-head">
        <div className="cds-avatar">
          {cfg.theme.logo ? <img src={cfg.theme.logo} alt="" /> : <Icon name="graphic_eq" size={23} />}
        </div>
        <div className="cds-head-text">
          <h1 className="cds-agent">{cfg.agentName}</h1>
          <p className="cds-sub">{subtitle(cfg, voice)}</p>
        </div>
        {voice.simulated && <span className="cds-sim" title="Scripted call — no Cognigy connection">SIM</span>}
        {onMinimize && (
          <button className="cds-min" onClick={onMinimize} aria-label={"Minimize " + cfg.agentName}>
            <Icon name="remove" size={21} />
          </button>
        )}
      </header>

      <div className="cds-pane">
        <VoiceView cfg={cfg} voice={voice} />
      </div>
    </section>
  );
}

export default function App({ cfg }: { cfg: DemoConfig }) {
  const voice = useCognigyVoice(cfg);
  return cfg.panelStyle === "overlay" ? (
    <Shell cfg={cfg}>{(close) => <Panel cfg={cfg} voice={voice} onMinimize={close} />}</Shell>
  ) : (
    <Panel cfg={cfg} voice={voice} />
  );
}
