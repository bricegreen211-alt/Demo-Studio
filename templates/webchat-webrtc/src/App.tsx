/*
 * Multimodal Demo Experience (SOW §9.3): chat and voice in one panel.
 * - Chat stays connected while on a call, so the conversation is persistent.
 * - The Voice/Chat selector is the only way between them. There is no separate
 *   "Call" button: voice is already one of the two modes, so a third control
 *   that jumps to it was a duplicate of the tab beside it.
 * - When the call ends, the panel returns to chat with the same userId.
 */
import { useEffect, useRef, useState } from "react";
import { DemoConfig } from "./config";
import ChatView from "./chat/ChatView";
import Shell from "./shell/Shell";
import VoiceView from "./voice/VoiceView";
import { useCognigyChat } from "./chat/useCognigyChat";
import { useCognigyVoice } from "./voice/useCognigyVoice";
import { Icon } from "./icons";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const chat = useCognigyChat(cfg);
  const voice = useCognigyVoice(cfg);
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const prevState = useRef(voice.state);

  // Return to chat after the call wraps up.
  useEffect(() => {
    if (prevState.current === "active" && voice.state === "ended") {
      const t = setTimeout(() => setMode("chat"), 1600);
      return () => clearTimeout(t);
    }
    prevState.current = voice.state;
  }, [voice.state]);

  const inCall = voice.state === "active" || voice.state === "ringing" || voice.state === "connecting";

  const view = (
    <div className="cds-multi">
      <nav className="cds-tabs">
        <button className={mode === "chat" ? "on" : ""} onClick={() => setMode("chat")}>
          <Icon name="chat" /> Chat
        </button>
        <button className={mode === "voice" ? "on" : ""} onClick={() => setMode("voice")}>
          <Icon name="mic" /> Voice{inCall && <span className="cds-live" aria-label="on a call" />}
        </button>
      </nav>
      <div className="cds-pane" style={{ display: mode === "chat" ? "flex" : "none" }}>
        <ChatView cfg={cfg} chat={chat} />
      </div>
      <div className="cds-pane" style={{ display: mode === "voice" ? "flex" : "none" }}>
        <VoiceView cfg={cfg} voice={voice} />
      </div>
    </div>
  );

  // "overlay" panel style: this demo draws its own launcher and panel card
  // (see src/shell/) instead of the browser extension providing them.
  return cfg.panelStyle === "overlay" ? <Shell cfg={cfg}>{view}</Shell> : view;
}
