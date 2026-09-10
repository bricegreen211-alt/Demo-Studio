/*
 * Halo voice pane: call status strip, live transcript, Mute + Call footer.
 *
 * Every line in the transcript comes from Cognigy — the click-to-call SDK
 * turns a SIP INFO body carrying "_transcription" into a transcription event,
 * and useCognigyVoice puts it here. There is no scripted call: with no
 * endpoint, or a wrong one, this reports the failure instead of playing one.
 *
 * No dial pad, deliberately. The click-to-call widget has Call, Mute and End
 * and nothing else, so a keypad here would be a control the real product
 * doesn't have.
 */
import { useEffect, useRef } from "react";
import { DemoConfig } from "../config";
import { CognigyVoice } from "./useCognigyVoice";
import { Icon } from "../icons";

function fmt(seconds: number): string {
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

const STATUS: Record<string, string> = {
  unsupported: "Voice calls need Chrome or Edge",
  idle: "Ready to call",
  connecting: "Connecting…",
  ringing: "Calling…",
  active: "Call in progress",
  ended: "Call ended",
  error: "Something went wrong",
};

// Bar heights from the reference, kept as data so the wave stays one line of CSS.
const WAVE = [5, 10, 17, 11, 20, 13, 8, 17, 11, 6, 10];

export default function VoiceView({ cfg, voice }: { cfg: DemoConfig; voice: CognigyVoice }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [voice.transcript]);

  const inCall = voice.state === "active" || voice.state === "ringing" || voice.state === "connecting";
  const live = voice.state === "active";
  const status = voice.muted && live ? "Microphone muted" : (STATUS[voice.state] || "");

  return (
    <div className="cds-voice">
      <div className="cds-strip">
        <span className={"cds-dot" + (live ? " on" : "")} />
        <span role="status">{status}</span>
        {live && <span className="cds-clock">· {fmt(voice.seconds)}</span>}
        <div className={"cds-wave" + (live && voice.aiSpeaking ? " on" : "")} aria-hidden="true">
          {WAVE.map((h, i) => (
            <i key={i} style={{ ["--h" as string]: h + "px", ["--delay" as string]: -(i * 0.13) + "s" }} />
          ))}
        </div>
      </div>

      <h2 className="cds-tt">Live transcript</h2>

      <div className="cds-scroll" ref={scrollRef} role="log" aria-label="Voice transcript" aria-live="polite">
        {voice.transcript.length === 0 ? (
          <div className="cds-empty">
            <Icon name="mic" size={30} />
            <strong>{voice.state === "ended" ? "Call ended" : "Ready when you are."}</strong>
            <p>
              {voice.state === "unsupported"
                ? "Voice calls need WebRTC (" + (voice.supportMissing.join(", ") || "unsupported browser") + ")."
                : voice.state === "error"
                ? voice.error
                : "Start a call and the conversation appears here as " + cfg.agentName + " transcribes it."}
            </p>
          </div>
        ) : (
          voice.transcript.map((l) => (
            <div key={l.id} className={"cds-utt cds-utt-" + (l.role === "user" ? "user" : l.role === "info" ? "info" : "ai")}>
              {l.role !== "info" && (
                <div className="cds-utt-icon">{l.role === "user" ? "You" : "AI"}</div>
              )}
              <div className="cds-utt-body">
                {l.role !== "info" && (
                  <p className="cds-utt-who">
                    {l.role === "user" ? "You" : cfg.agentName}
                    <time>· {fmt(Math.max(0, Math.round((l.at - voice.startedAt) / 1000)))}</time>
                  </p>
                )}
                <p className="cds-utt-text">{l.text}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cds-vfoot">
        <button
          className="cds-mute"
          aria-pressed={voice.muted}
          onClick={voice.toggleMute}
          disabled={!live}
        >
          <Icon name={voice.muted ? "mic_off" : "mic"} size={19} />
          <span>{voice.muted ? "Unmute" : "Mute"}</span>
        </button>
        <button
          className={"cds-call" + (inCall ? " end" : "")}
          onClick={inCall ? voice.end : voice.start}
          disabled={voice.state === "unsupported"}
        >
          <Icon name={inCall ? "call_end" : "call"} size={19} />
          <span>
            {inCall ? "End call"
              : voice.state === "ended" || voice.state === "error" ? "Call again"
              : "Start a call"}
          </span>
        </button>
      </div>
    </div>
  );
}
