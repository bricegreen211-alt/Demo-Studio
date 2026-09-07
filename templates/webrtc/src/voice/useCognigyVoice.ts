/*
 * React hook around @cognigy/click-to-call-sdk (pinned per Demo Studio release).
 * Wraps the official SDK lifecycle — no custom SIP/WebRTC signaling (SOW §10).
 * Also reports call state to the extension launcher (Voice Wave) via postMessage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWebRTCClient,
  checkWebRTCSupport,
  type IWebRTCClient,
} from "@cognigy/click-to-call-sdk";
// @ts-ignore - shared plain-JS module aliased by the Demo Studio build
import normalize from "@cds/shared/normalize.js";
// Shared with Remote Control: this is the one piece of the voice path that
// guesses at a payload shape Cognigy does not document, so it lives in one file.
import voiceTranscript from "@cds/shared/voice-transcript.js";
import { DemoConfig, randomId, isMock } from "../config";

export type CallState = "unsupported" | "idle" | "connecting" | "ringing" | "active" | "ended" | "error";

export interface TranscriptLine {
  id: string;
  role: "user" | "ai" | "info";
  text: string;
  at: number;
}

export interface CognigyVoice {
  state: CallState;
  error: string;
  muted: boolean;
  seconds: number;
  /**
   * Wall-clock ms when the current call started, so a transcript line's
   * absolute `at` can be shown as an offset into the call. 0 before the first
   * call. Kept here rather than derived from the first line in the UI: the
   * first thing said is rarely at 00:00, and showing it as such misreports
   * how long the caller waited.
   */
  startedAt: number;
  aiSpeaking: boolean;
  transcript: TranscriptLine[];
  supportMissing: string[];
  start: () => void;
  end: () => void;
  toggleMute: () => void;
  sendInfo: (text: string, data?: Record<string, any>) => void;
  /** True when running the scripted demo call (endpoint "mock"). */
  simulated: boolean;
}

/** Scripted call used when the voice endpoint is "mock". */
const MOCK_TURNS: Array<{ role: "user" | "ai"; text: string; at: number }> = [
  { role: "ai", at: 1200, text: "Thanks for calling. How can I help you today?" },
  { role: "user", at: 4200, text: "I'd like to check on my recent order." },
  { role: "ai", at: 6200, text: "Of course — I found order 4471, shipped yesterday." },
  { role: "ai", at: 9000, text: "It's due to arrive Thursday. Anything else?" },
  { role: "user", at: 12500, text: "That's perfect, thank you." },
  { role: "ai", at: 14200, text: "Happy to help. Have a great day!" },
];

/** Tell the slide-out shell / Voice Wave launcher what the call is doing. */
function reportState(state: string) {
  try { window.parent.postMessage({ type: "CDS_VOICE_STATE", state }, "*"); } catch { /* not embedded */ }
}


/*
 * Verbose by default, like the extension's content script. A voice call is
 * unfalsifiable from the outside — "the transcript is empty" could be Cognigy
 * sending nothing, the endpoint having transcription switched off, or us
 * misreading the payload — and this is the only place that can tell them apart.
 */
function vlog(...args: unknown[]) {
  try { console.log("[cds-voice]", ...args); } catch { /* ignore */ }
}

let lineCounter = 0;
const lineId = () => "t" + ++lineCounter + "-" + Date.now().toString(36);

export function useCognigyVoice(cfg: DemoConfig): CognigyVoice {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [supportMissing, setSupportMissing] = useState<string[]>([]);
  const clientRef = useRef<IWebRTCClient | null>(null);
  const timerRef = useRef<number | null>(null);
  const speakingTimer = useRef<number | null>(null);
  const mockTimers = useRef<number[]>([]);
  const simulated = isMock(cfg.cognigy.voiceEndpoint);

  useEffect(() => {
    // A simulated call never touches WebRTC, so skip the support gate — this
    // is how the demo runs on a machine with no mic or gateway at all.
    if (simulated) return;
    const support = checkWebRTCSupport();
    if (!support.supported) {
      setState("unsupported");
      setSupportMissing(support.missing || []);
    }
    return () => {
      stopTimer();
      clearMockTimers();
      const c = clientRef.current;
      clientRef.current = null;
      if (c) c.destroy().catch(() => {});
      reportState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current != null) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function setStateReported(s: CallState) {
    setState(s);
    reportState(s === "active" ? "listening" : s === "connecting" || s === "ringing" ? "connecting" : s === "error" ? "error" : "idle");
  }

  const pushLine = (role: TranscriptLine["role"], text: string) => {
    if (!text) return;
    setTranscript((t) => [...t, { id: lineId(), role, text, at: Date.now() }]);
  };

  const markAiSpeaking = useCallback(() => {
    setAiSpeaking(true);
    reportState("speaking");
    if (speakingTimer.current != null) clearTimeout(speakingTimer.current);
    speakingTimer.current = window.setTimeout(() => {
      setAiSpeaking(false);
      reportState("listening");
    }, 2200);
  }, []);

  const clearMockTimers = () => {
    mockTimers.current.forEach((t) => window.clearTimeout(t));
    mockTimers.current = [];
  };

  const startMockCall = useCallback(() => {
    setError("");
    setTranscript([]);
    setSeconds(0);
    setStartedAt(Date.now());
    setMuted(false);
    setStateReported("connecting");
    clearMockTimers();

    mockTimers.current.push(window.setTimeout(() => setStateReported("ringing"), 500));
    mockTimers.current.push(window.setTimeout(() => {
      setStateReported("active");
      stopTimer();
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    }, 1000));

    MOCK_TURNS.forEach((turn) => {
      mockTimers.current.push(window.setTimeout(() => {
        if (turn.role === "ai") markAiSpeaking();
        pushLine(turn.role, turn.text);
      }, turn.at));
    });

    // Wrap up shortly after the last line.
    const endsAt = MOCK_TURNS[MOCK_TURNS.length - 1].at + 3000;
    mockTimers.current.push(window.setTimeout(() => {
      stopTimer();
      setStateReported("ended");
      pushLine("info", "Call ended");
    }, endsAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markAiSpeaking]);

  const start = useCallback(async () => {
    if (simulated) { startMockCall(); return; }
    if (clientRef.current || state === "unsupported") return;
    const endpointUrl = normalize.voiceEndpoint(cfg.cognigy.voiceEndpoint);
    if (!endpointUrl) {
      setError("No Cognigy voice endpoint configured. Add it in Cognigy Demo Studio.");
      setStateReported("error");
      return;
    }
    setError("");
    setTranscript([]);
    setSeconds(0);
    setStartedAt(Date.now());
    setMuted(false);
    setStateReported("connecting");
    try {
      const client = await createWebRTCClient({
        endpointUrl,
        userId: cfg.userId || randomId("cds-user"),
      });
      clientRef.current = client;

      client.on("ringing", () => { vlog("ringing"); setStateReported("ringing"); });
      client.on("answered", () => {
        vlog("answered — transcription will appear here if the endpoint sends it");
        setStateReported("active");
        stopTimer();
        timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      });
      client.on("ended", (_s, info) => {
        stopTimer();
        setStateReported("ended");
        pushLine("info", "Call ended" + (info && info.cause ? " (" + info.cause + ")" : ""));
        clientRef.current = null;
        client.destroy().catch(() => {});
      });
      client.on("failed", (_s, info) => {
        stopTimer();
        setError((info && (info.description || info.cause)) || "Call failed");
        setStateReported("error");
        clientRef.current = null;
        client.destroy().catch(() => {});
      });
      client.on("muted", () => setMuted(true));
      client.on("unmuted", () => setMuted(false));
      client.on("error", (err) => {
        setError(String((err && err.message) || err));
        setStateReported("error");
      });
      /*
       * Transcription. Still cast: "transcription" is missing from the event
       * union in the installed 0.0.7 typings even though the SDK emits it —
       * sessionManager forwards it to the public client, verified in the dist.
       */
      (client as any).on("transcription", (payload: any) => {
        vlog("transcription", payload);
        const line = voiceTranscript.readTranscription(payload);
        if (!line) {
          vlog("transcription payload had no readable text — shape not recognised", payload);
          return;
        }
        if (line.role === "ai") markAiSpeaking();
        pushLine(line.role, line.text);
      });

      /*
       * Everything else Cognigy sends over SIP INFO lands here: the SDK routes
       * a body with "_transcription" to the event above and emits infoReceived
       * for the rest. That makes this the channel an agent uses to push a card
       * or open an xApp mid-call, so it is logged now and will be routed to the
       * stage once the built-in chat can render those.
       */
      client.on("infoReceived", (payload: any) => {
        vlog("infoReceived", payload);
      });

      await client.connectAndCall();
    } catch (err: any) {
      setError(String((err && err.message) || err));
      setStateReported("error");
      const c = clientRef.current;
      clientRef.current = null;
      if (c) c.destroy().catch(() => {});
    }
  }, [cfg, state, markAiSpeaking, simulated, startMockCall]);

  const end = useCallback(async () => {
    if (simulated) {
      clearMockTimers();
      stopTimer();
      setStateReported("ended");
      pushLine("info", "Call ended");
      return;
    }
    const c = clientRef.current;
    if (!c) return;
    try { await c.endCall(); } catch { /* ended event handles state */ }
  }, [simulated]);

  const toggleMute = useCallback(async () => {
    if (simulated) { setMuted((m) => !m); return; }
    const c = clientRef.current;
    if (!c) return;
    try { muted ? await c.unmute() : await c.mute(); } catch { /* mic status unchanged */ }
  }, [muted, simulated]);

  const sendInfo = useCallback((text: string, data?: Record<string, any>) => {
    const c = clientRef.current;
    if (!c) return;
    c.sendInfo(text, data).catch(() => {});
  }, []);

  return { state, error, muted, seconds, startedAt, aiSpeaking, transcript, supportMissing, start, end, toggleMute, sendInfo, simulated };
}
