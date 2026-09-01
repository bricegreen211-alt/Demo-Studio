/*
 * Custom Cognigy voice UI (SOW §9.2): start/end call, mute, mic status, call
 * timer, connection + listening + AI-speaking states, live transcription where
 * available, graceful errors. Branding via demo.json CSS variables.
 */
import { useEffect, useRef } from "react";
import { DemoConfig } from "../config";
import { CognigyVoice } from "./useCognigyVoice";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m + ":" + String(s).padStart(2, "0");
}

const STATUS_TEXT: Record<string, string> = {
  unsupported: "This browser doesn't support voice calls",
  idle: "Ready when you are",
  connecting: "Connecting…",
  ringing: "Calling…",
  active: "Listening",
  ended: "Call ended",
  error: "Something went wrong",
};

export default function VoiceView({ cfg, voice }: { cfg: DemoConfig; voice: CognigyVoice }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [voice.transcript]);

  const inCall = voice.state === "active" || voice.state === "ringing" || voice.state === "connecting";
  const status = voice.state === "active" && voice.aiSpeaking ? cfg.agentName + " is speaking" : STATUS_TEXT[voice.state] || "";

  return (
    <div className="cds-voice">
      <header className="cds-vheader">
        {cfg.theme.logo ? <img className="cds-logo" src={cfg.theme.logo} alt="" /> : <div className="cds-logo-dot" />}
        <div>
          <div className="cds-agent">{cfg.agentName}</div>
          <div className="cds-vstatus">{voice.simulated && voice.state === "idle" ? "Simulated demo" : status}</div>
        </div>
        {voice.simulated && <span className="cds-sim-badge" title="Scripted call — no Cognigy connection">SIM</span>}
        {voice.state === "active" && <div className="cds-timer">{fmt(voice.seconds)}</div>}
      </header>

      <div className="cds-vstage">
        <div className={"cds-orb cds-orb-" + voice.state + (voice.aiSpeaking ? " cds-orb-speaking" : "")}>
          <div className="cds-orb-core" />
          <div className="cds-wave">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: i * 0.12 + "s" }} />)}
          </div>
        </div>

        {voice.state === "unsupported" && (
          <div className="cds-verror">Voice calls need WebRTC ({voice.supportMissing.join(", ") || "unsupported browser"}). Try Chrome or Edge.</div>
        )}
        {voice.error && voice.state === "error" && <div className="cds-verror">{voice.error}</div>}

        <div className="cds-vcontrols">
          {!inCall ? (
            <button className="cds-call" onClick={voice.start} disabled={voice.state === "unsupported"}>
              <span className="cds-call-icon">✆</span>
              {voice.state === "ended" || voice.state === "error" ? "Call again" : "Talk to " + cfg.agentName}
            </button>
          ) : (
            <>
              <button
                className={"cds-mute" + (voice.muted ? " cds-muted" : "")}
                onClick={voice.toggleMute}
                title={voice.muted ? "Unmute microphone" : "Mute microphone"}
              >
                {voice.muted ? "🔇" : "🎙️"}
              </button>
              <button className="cds-hangup" onClick={voice.end} title="End call">✕</button>
            </>
          )}
        </div>
        {voice.state === "active" && (
          <div className="cds-micnote">{voice.muted ? "Microphone muted" : "Microphone live"}</div>
        )}
      </div>

      {voice.transcript.length > 0 && (
        <div className="cds-transcript" ref={scrollRef}>
          {voice.transcript.map((l) => (
            <div key={l.id} className={"cds-tline cds-tline-" + l.role}>
              {l.role !== "info" && <b>{l.role === "ai" ? cfg.agentName : "You"}: </b>}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
