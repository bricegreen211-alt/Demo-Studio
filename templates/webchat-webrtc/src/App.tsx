/*
 * Webchat + WebRTC — Halo.
 *
 * Chat and voice in one panel, with identity stated once at the top and a
 * segmented control between the two modes. There is no separate "Call" button:
 * voice is already one of the two modes, so a third control that jumps to it
 * duplicated the tab beside it.
 *
 * Chat stays connected while a call is running, so the conversation is
 * continuous, and the panel returns to chat when the call wraps up.
 *
 * Everything shown here is real. The transcript lines, adaptive cards and
 * xApp payloads all arrive from the Cognigy agent through the two adapters
 * (useCognigyChat / useCognigyVoice); nothing on this screen is scripted
 * unless the endpoint is the literal string "mock", which paints a SIM badge.
 */
import { useEffect, useRef, useState } from "react";
import { DemoConfig } from "./config";
import ChatView from "./chat/ChatView";
import Shell from "./shell/Shell";
import VoiceView from "./voice/VoiceView";
import { useCognigyChat, CognigyChat } from "./chat/useCognigyChat";
import { useCognigyVoice, CognigyVoice } from "./voice/useCognigyVoice";
import { Icon } from "./icons";

type Mode = "chat" | "voice";

function Avatar({ cfg }: { cfg: DemoConfig }) {
  return (
    <div className="cds-avatar">
      {cfg.theme.logo ? <img src={cfg.theme.logo} alt="" /> : <Icon name="graphic_eq" size={23} />}
    </div>
  );
}

/*
 * The subtitle carries live connection state rather than a fixed tagline.
 * Halo's reference shows a static descriptor there, but an SE needs to see at
 * a glance that the agent is actually connected — dropping it would lose the
 * "a wrong endpoint fails loudly" property the rest of the app is built on.
 */
function subtitle(cfg: DemoConfig, mode: Mode, chat: CognigyChat, voice: CognigyVoice): string {
  if (mode === "voice") {
    if (voice.state === "unsupported") return "Voice needs Chrome or Edge";
    if (voice.state === "active") return voice.aiSpeaking ? cfg.agentName + " is speaking" : "Listening";
    if (voice.state === "connecting") return "Connecting…";
    if (voice.state === "ringing") return "Calling…";
    if (voice.state === "error") return "Call problem";
  }
  if (chat.connection === "connecting") return "Connecting…";
  if (chat.connection === "error") return "Connection issue";
  return chat.simulated ? "Simulated demo" : "Online";
}

function Panel({
  cfg, chat, voice, onMinimize
}: { cfg: DemoConfig; chat: CognigyChat; voice: CognigyVoice; onMinimize?: () => void }) {
  const [mode, setMode] = useState<Mode>("chat");
  const prevState = useRef(voice.state);

  useEffect(() => {
    if (prevState.current === "active" && voice.state === "ended") {
      const t = setTimeout(() => setMode("chat"), 1600);
      return () => clearTimeout(t);
    }
    prevState.current = voice.state;
  }, [voice.state]);

  const inCall = voice.state === "active" || voice.state === "ringing" || voice.state === "connecting";
  const simulated = chat.simulated || voice.simulated;

  return (
    <section className="cds-multi" aria-label={cfg.agentName}>
      <header className="cds-head">
        <Avatar cfg={cfg} />
        <div className="cds-head-text">
          <h1 className="cds-agent">{cfg.agentName}</h1>
          <p className="cds-sub">{subtitle(cfg, mode, chat, voice)}</p>
        </div>
        {simulated && <span className="cds-sim" title="Scripted responses — no Cognigy connection">SIM</span>}
        {onMinimize && (
          <button className="cds-min" onClick={onMinimize} aria-label={"Minimize " + cfg.agentName}>
            <Icon name="remove" size={21} />
          </button>
        )}
      </header>

      <div className="cds-tabs" role="tablist" aria-label="Conversation mode">
        <button
          role="tab" id="cds-tab-chat" aria-controls="cds-panel-chat"
          aria-selected={mode === "chat"} tabIndex={mode === "chat" ? 0 : -1}
          className={mode === "chat" ? "on" : ""} onClick={() => setMode("chat")}
        >
          <Icon name="chat" size={19} /> Chat
        </button>
        <button
          role="tab" id="cds-tab-voice" aria-controls="cds-panel-voice"
          aria-selected={mode === "voice"} tabIndex={mode === "voice" ? 0 : -1}
          className={mode === "voice" ? "on" : ""} onClick={() => setMode("voice")}
        >
          <Icon name="mic" size={19} /> Voice
          {inCall && <span className="cds-live" aria-label="on a call" />}
        </button>
      </div>

      {/* Both panes stay mounted: switching to voice must not drop the chat
          history, and the chat socket must not reconnect on every toggle. */}
      <div className="cds-pane" id="cds-panel-chat" role="tabpanel" aria-labelledby="cds-tab-chat"
           style={{ display: mode === "chat" ? "flex" : "none" }}>
        <ChatView cfg={cfg} chat={chat} />
      </div>
      <div className="cds-pane" id="cds-panel-voice" role="tabpanel" aria-labelledby="cds-tab-voice"
           style={{ display: mode === "voice" ? "flex" : "none" }}>
        <VoiceView cfg={cfg} voice={voice} />
      </div>
    </section>
  );
}

export default function App({ cfg }: { cfg: DemoConfig }) {
  const chat = useCognigyChat(cfg);
  const voice = useCognigyVoice(cfg);

  // "overlay": the demo draws its own launcher and card (see src/shell/)
  // instead of the browser extension providing them. This is the only style
  // this endpoint uses — the schema coerces it — because Halo ships a launcher
  // of its own, and any other style would put a second one beside it.
  return cfg.panelStyle === "overlay" ? (
    <Shell cfg={cfg}>
      {(close) => <Panel cfg={cfg} chat={chat} voice={voice} onMinimize={close} />}
    </Shell>
  ) : (
    <Panel cfg={cfg} chat={chat} voice={voice} />
  );
}
