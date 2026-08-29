/*
 * Parse Cognigy output payloads into renderable message parts.
 * Rich content arrives in the messenger-style structure under
 * output.data._cognigy._webchat.message (quick replies, button/generic
 * templates, images); everything else in output.data is "structured data".
 */

export interface ChatButton {
  title: string;
  type: "postback" | "web_url" | string;
  payload?: string;
  url?: string;
}

export interface ChatCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttons: ChatButton[];
}

export interface MessagePart {
  kind: "text" | "image" | "buttons" | "cards" | "data";
  text?: string;
  imageUrl?: string;
  buttons?: ChatButton[];
  cards?: ChatCard[];
  data?: unknown;
}

export interface ChatMessage {
  id: string;
  from: "user" | "bot" | "system";
  parts: MessagePart[];
  quickReplies: ChatButton[];
  at: number;
}

let counter = 0;
export function msgId(): string {
  return "m" + ++counter + "-" + Date.now().toString(36);
}

function toButtons(raw: any[]): ChatButton[] {
  return (raw || [])
    .filter((b) => b && b.title)
    .map((b) => ({ title: String(b.title), type: b.type || "postback", payload: b.payload, url: b.url }));
}

export function parseOutput(output: { text?: string; data?: any }): ChatMessage | null {
  const parts: MessagePart[] = [];
  let quickReplies: ChatButton[] = [];
  const data = output.data || {};
  const wc = data._cognigy && data._cognigy._webchat && data._cognigy._webchat.message;

  if (wc) {
    if (wc.text) parts.push({ kind: "text", text: String(wc.text) });
    if (Array.isArray(wc.quick_replies)) {
      quickReplies = (wc.quick_replies as any[])
        .filter((q) => q && q.content_type === "text" && q.title)
        .map((q) => ({ title: String(q.title), type: "postback", payload: q.payload != null ? String(q.payload) : String(q.title) }));
    }
    const att = wc.attachment;
    if (att && att.type === "image" && att.payload && att.payload.url) {
      parts.push({ kind: "image", imageUrl: String(att.payload.url) });
    }
    if (att && att.type === "template" && att.payload) {
      const p = att.payload;
      if (p.template_type === "button") {
        if (p.text) parts.push({ kind: "text", text: String(p.text) });
        parts.push({ kind: "buttons", buttons: toButtons(p.buttons) });
      } else if (p.template_type === "generic" && Array.isArray(p.elements)) {
        parts.push({
          kind: "cards",
          cards: p.elements.map((el: any) => ({
            title: String(el.title || ""),
            subtitle: el.subtitle ? String(el.subtitle) : undefined,
            imageUrl: el.image_url ? String(el.image_url) : undefined,
            buttons: toButtons(el.buttons),
          })),
        });
      }
    }
  } else if (output.text) {
    parts.push({ kind: "text", text: String(output.text) });
  }

  // Structured data (Send Data support): anything meaningful outside _cognigy.
  const extraKeys = Object.keys(data).filter((k) => k !== "_cognigy");
  if (extraKeys.length > 0) {
    const extra: Record<string, unknown> = {};
    for (const k of extraKeys) extra[k] = data[k];
    parts.push({ kind: "data", data: extra });
  }

  if (parts.length === 0 && quickReplies.length === 0) return null;
  return { id: msgId(), from: "bot", parts, quickReplies, at: Date.now() };
}

export function userMessage(text: string): ChatMessage {
  return { id: msgId(), from: "user", parts: [{ kind: "text", text }], quickReplies: [], at: Date.now() };
}

export function systemMessage(text: string): ChatMessage {
  return { id: msgId(), from: "system", parts: [{ kind: "text", text }], quickReplies: [], at: Date.now() };
}

export function botTextMessage(text: string): ChatMessage {
  return { id: msgId(), from: "bot", parts: [{ kind: "text", text }], quickReplies: [], at: Date.now() };
}
