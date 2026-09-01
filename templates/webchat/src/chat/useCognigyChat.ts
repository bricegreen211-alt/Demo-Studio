/*
 * React hook around @cognigy/socket-client.
 * Fresh session per mount (mirrors the old injector's disableLocalStorage
 * trick) so Live Follow / Interaction Panel always sees the configured userId.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SocketClient } from "@cognigy/socket-client";
// @ts-ignore - shared plain-JS module aliased by the Demo Studio build
import normalize from "@cds/shared/normalize.js";
import { DemoConfig, randomId, isMock } from "../config";
import { ChatMessage, parseOutput, userMessage, botTextMessage } from "./messages";
import { mockWelcome, mockReply } from "./mockScript";

export type ConnectionState = "idle" | "connecting" | "connected" | "error";

export interface CognigyChat {
  messages: ChatMessage[];
  typing: boolean;
  connection: ConnectionState;
  connectionError: string;
  send: (text: string, data?: Record<string, unknown>, displayAs?: string) => void;
  sendData: (data: Record<string, unknown>) => void;
  reset: () => void;
  /** True when running the scripted demo conversation (endpoint "mock"). */
  simulated: boolean;
}

export function useCognigyChat(cfg: DemoConfig): CognigyChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [epoch, setEpoch] = useState(0); // bump to reset the conversation
  const clientRef = useRef<SocketClient | null>(null);
  const simulated = isMock(cfg.cognigy.chatEndpoint);
  const replyTimer = useRef<number | null>(null);

  useEffect(() => {
    setTyping(false);
    setConnectionError("");

    // Simulated mode: no socket at all, just the scripted conversation.
    if (simulated) {
      setMessages([]);
      setConnection("connecting");
      const t = window.setTimeout(() => {
        setConnection("connected");
        setMessages([mockWelcome(cfg.agentName, cfg.welcomeMessage)]);
      }, 500);
      return () => {
        window.clearTimeout(t);
        if (replyTimer.current) window.clearTimeout(replyTimer.current);
      };
    }

    const endpoint = normalize.chatEndpoint(cfg.cognigy.chatEndpoint);
    const split = normalize.splitEndpoint(endpoint);
    setMessages(cfg.welcomeMessage ? [botTextMessage(cfg.welcomeMessage)] : []);

    if (!split) {
      setConnection("error");
      setConnectionError("No Cognigy chat endpoint configured. Add it in Cognigy Demo Studio.");
      return;
    }

    setConnection("connecting");
    const client = new SocketClient(split.baseUrl, split.urlToken, {
      userId: cfg.userId || randomId("cds-user"),
      sessionId: randomId("cds-session"),
      channel: "demo-studio",
      forceWebsockets: true,
      reconnection: true,
    });
    clientRef.current = client;
    let disposed = false;

    client.on("output", (output: any) => {
      if (disposed) return;
      setTyping(false);
      const msg = parseOutput(output || {});
      if (msg) setMessages((m) => [...m, msg]);
    });
    client.on("typingStatus", (status: any) => {
      if (disposed) return;
      setTyping(status === "on" || status === "typingOn" || status === true);
    });
    client.on("error", (err: any) => {
      if (disposed) return;
      setConnection("error");
      setConnectionError(String((err && (err.message || err.code)) || "Connection error"));
    });

    client
      .connect()
      .then(() => { if (!disposed) setConnection("connected"); })
      .catch((err: any) => {
        if (disposed) return;
        setConnection("error");
        setConnectionError(String((err && err.message) || "Could not connect to Cognigy"));
      });

    return () => {
      disposed = true;
      try { client.disconnect(); } catch { /* already down */ }
      clientRef.current = null;
    };
  }, [cfg, epoch, simulated]);

  const send = useCallback((text: string, data?: Record<string, unknown>, displayAs?: string) => {
    const shown = displayAs !== undefined ? displayAs : text;

    if (simulated) {
      if (shown) setMessages((m) => [...m, userMessage(shown)]);
      setTyping(true);
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
      replyTimer.current = window.setTimeout(() => {
        setTyping(false);
        setMessages((m) => [...m, mockReply(text, cfg.agentName)]);
      }, 700 + Math.random() * 600);
      return;
    }

    const client = clientRef.current;
    if (!client) return;
    if (shown) setMessages((m) => [...m, userMessage(shown)]);
    setTyping(true);
    try { client.sendMessage(text, data); }
    catch (err) {
      setTyping(false);
      setConnection("error");
      setConnectionError(String((err as Error).message || err));
    }
  }, [simulated, cfg.agentName]);

  const sendData = useCallback((data: Record<string, unknown>) => {
    const client = clientRef.current;
    if (!client) return;
    try { client.sendMessage("", data); } catch { /* surfaced via error event */ }
  }, []);

  const reset = useCallback(() => setEpoch((e) => e + 1), []);

  return { messages, typing, connection, connectionError, send, sendData, reset, simulated };
}
