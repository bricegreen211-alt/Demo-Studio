/*
 * React hook around @cognigy/socket-client.
 * Fresh session per mount (mirrors the old injector's disableLocalStorage
 * trick) so Live Follow / Interaction Panel always sees the configured userId.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SocketClient } from "@cognigy/socket-client";
// @ts-ignore - shared plain-JS module aliased by the Demo Studio build
import normalize from "@cds/shared/normalize.js";
import { DemoConfig, randomId } from "../config";
import { ChatMessage, parseOutput, userMessage, botTextMessage } from "./messages";

export type ConnectionState = "idle" | "connecting" | "connected" | "error";

export interface CognigyChat {
  messages: ChatMessage[];
  typing: boolean;
  connection: ConnectionState;
  connectionError: string;
  send: (text: string, data?: Record<string, unknown>, displayAs?: string) => void;
  sendData: (data: Record<string, unknown>) => void;
  reset: () => void;
}

export function useCognigyChat(cfg: DemoConfig): CognigyChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [epoch, setEpoch] = useState(0); // bump to reset the conversation
  const clientRef = useRef<SocketClient | null>(null);

  useEffect(() => {
    const endpoint = normalize.chatEndpoint(cfg.cognigy.chatEndpoint);
    const split = normalize.splitEndpoint(endpoint);
    setMessages(cfg.welcomeMessage ? [botTextMessage(cfg.welcomeMessage)] : []);
    setTyping(false);
    setConnectionError("");

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
  }, [cfg, epoch]);

  const send = useCallback((text: string, data?: Record<string, unknown>, displayAs?: string) => {
    const client = clientRef.current;
    if (!client) return;
    const shown = displayAs !== undefined ? displayAs : text;
    if (shown) setMessages((m) => [...m, userMessage(shown)]);
    setTyping(true);
    try { client.sendMessage(text, data); }
    catch (err) {
      setTyping(false);
      setConnection("error");
      setConnectionError(String((err as Error).message || err));
    }
  }, []);

  const sendData = useCallback((data: Record<string, unknown>) => {
    const client = clientRef.current;
    if (!client) return;
    try { client.sendMessage("", data); } catch { /* surfaced via error event */ }
  }, []);

  const reset = useCallback(() => setEpoch((e) => e + 1), []);

  return { messages, typing, connection, connectionError, send, sendData, reset };
}
