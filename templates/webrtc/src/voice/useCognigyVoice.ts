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
import { DemoConfig, randomId } from "../config";

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
  aiSpeaking: boolean;
  transcript: TranscriptLine[];
  supportMissing: string[];
  start: () => void;
  end: () => void;
  toggleMute: () => void;
  sendInfo: (text: string, data?: Record<string, any>) => void;
}

/** Tell the slide-out shell / Voice Wave launcher what the call is doing. */
function reportState(state: string) {
  try { window.parent.postMessage({ type: "CDS_VOICE_STATE", state }, "*"); } catch { /* not embedded */ }
}

let lineCounter = 0;
const lineId = () => "t" + ++lineCounter + "-" + Date.now().toString(36);

export function useCognigyVoice(cfg: DemoConfig): CognigyVoice {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [supportMissing, setSupportMissing] = useState<string[]>([]);
  const clientRef = useRef<IWebRTCClient | null>(null);
  const timerRef = useRef<number | null>(null);
  const speakingTimer = useRef<number | null>(null);

  useEffect(() => {
    const support = checkWebRTCSupport();
    if (!support.supported) {
      setState("unsupported");
      setSupportMissing(support.missing || []);
    }
    return () => {
      stopTimer();
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

  const start = useCallback(async () => {
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
    setMuted(false);
    setStateReported("connecting");
    try {
      const client = await createWebRTCClient({
        endpointUrl,
        userId: cfg.userId || randomId("cds-user"),
      });
      clientRef.current = client;

      client.on("ringing", () => setStateReported("ringing"));
      client.on("answered", () => {
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
      // Transcription where the endpoint supports it. Payload shape varies by
      // release; handle the common fields defensively.
      (client as any).on("transcription", (payload: any) => {
        const text = payload && (payload.text || payload.transcript || (typeof payload === "string" ? payload : ""));
        const who = payload && (payload.role || payload.participant || payload.originator || "");
        const role: TranscriptLine["role"] = /agent|ai|bot|remote/i.test(String(who)) ? "ai" : "user";
        if (role === "ai") markAiSpeaking();
        pushLine(role, String(text || ""));
      });

      await client.connectAndCall();
    } catch (err: any) {
      setError(String((err && err.message) || err));
      setStateReported("error");
      const c = clientRef.current;
      clientRef.current = null;
      if (c) c.destroy().catch(() => {});
    }
  }, [cfg, state, markAiSpeaking]);

  const end = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    try { await c.endCall(); } catch { /* ended event handles state */ }
  }, []);

  const toggleMute = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    try { muted ? await c.unmute() : await c.mute(); } catch { /* mic status unchanged */ }
  }, [muted]);

  const sendInfo = useCallback((text: string, data?: Record<string, any>) => {
    const c = clientRef.current;
    if (!c) return;
    c.sendInfo(text, data).catch(() => {});
  }, []);

  return { state, error, muted, seconds, aiSpeaking, transcript, supportMissing, start, end, toggleMute, sendInfo };
}
