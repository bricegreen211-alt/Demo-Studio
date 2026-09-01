/*
 * Multimodal Demo Experience (SOW §9.3): chat and voice in one panel.
 * - Chat stays connected while on a call (persistent customer experience).
 * - "Voice launch from chat": phone button switches to voice and starts the call.
 * - When the call ends, one tap returns to chat with shared userId context.
 */
import { useEffect, useRef, useState } from "react";
import { DemoConfig } from "./config";
import ChatView from "./chat/ChatView";
import Shell from "./shell/Shell";
import VoiceView from "./voice/VoiceView";
import { useCognigyChat } from "./chat/useCognigyChat";
import { useCognigyVoice } from "./voice/useCognigyVoice";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const chat = useCognigyChat(cfg);
  const voice = useCognigyVoice(cfg);
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const [autoCall, setAutoCall] = useState(false);
  const prevState = useRef(voice.state);

  // Voice launch from chat: switch + start in one tap.
  const launchVoice = () => { setMode("voice"); setAutoCall(true); };
  useEffect(() => {
    if (autoCall && mode === "voice" && voice.state === "idle") {
      setAutoCall(false);
      voice.start();
    }
  }, [autoCall, mode, voice]);

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
        <button className={mode === "chat" ? "on" : ""} onClick={() => setMode("chat")}>💬 Chat</button>
        <button className={mode === "voice" ? "on" : ""} onClick={() => setMode("voice")}>
          🎙 Voice{inCall ? " ●" : ""}
        </button>
        {mode === "chat" && !inCall && (
          <button className="cds-launch-voice" onClick={launchVoice} title={"Talk to " + cfg.agentName}>✆ Call</button>
        )}
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
