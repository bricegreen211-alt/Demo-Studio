/*
 * Custom Cognigy chat UI (SOW §9.1): text, typing state, quick replies,
 * buttons, cards, images, structured data, reset, connection/error states.
 * Branding comes entirely from demo.json via CSS variables.
 */
import { useEffect, useRef, useState } from "react";
import { DemoConfig } from "../config";
import { CognigyChat } from "./useCognigyChat";
import { ChatButton, ChatMessage, MessagePart } from "./messages";

function Buttons({ buttons, onPostback }: { buttons: ChatButton[]; onPostback: (b: ChatButton) => void }) {
  return (
    <div className="cds-buttons">
      {buttons.map((b, i) =>
        b.type === "web_url" && b.url ? (
          <a key={i} className="cds-btn" href={b.url} target="_blank" rel="noreferrer">{b.title}</a>
        ) : (
          <button key={i} className="cds-btn" onClick={() => onPostback(b)}>{b.title}</button>
        )
      )}
    </div>
  );
}

function Part({ part, onPostback }: { part: MessagePart; onPostback: (b: ChatButton) => void }) {
  switch (part.kind) {
    case "text":
      return <div className="cds-text">{part.text}</div>;
    case "image":
      return <img className="cds-image" src={part.imageUrl} alt="" />;
    case "buttons":
      return <Buttons buttons={part.buttons || []} onPostback={onPostback} />;
    case "cards":
      return (
        <div className="cds-cards">
          {(part.cards || []).map((c, i) => (
            <div key={i} className="cds-card">
              {c.imageUrl && <img src={c.imageUrl} alt="" />}
              <div className="cds-card-body">
                <div className="cds-card-title">{c.title}</div>
                {c.subtitle && <div className="cds-card-subtitle">{c.subtitle}</div>}
                <Buttons buttons={c.buttons} onPostback={onPostback} />
              </div>
            </div>
          ))}
        </div>
      );
    case "data":
      return (
        <details className="cds-data">
          <summary>Data</summary>
          <pre>{JSON.stringify(part.data, null, 2)}</pre>
        </details>
      );
    default:
      return null;
  }
}

function Bubble({ msg, onPostback }: { msg: ChatMessage; onPostback: (b: ChatButton) => void }) {
  return (
    <div className={"cds-row cds-row-" + msg.from}>
      <div className={"cds-bubble cds-bubble-" + msg.from}>
        {msg.parts.map((p, i) => <Part key={i} part={p} onPostback={onPostback} />)}
      </div>
    </div>
  );
}

export default function ChatView({ cfg, chat }: { cfg: DemoConfig; chat: CognigyChat }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.typing]);

  const onPostback = (b: ChatButton) => chat.send(b.payload || b.title, undefined, b.title);
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    chat.send(text);
  };

  const last = chat.messages[chat.messages.length - 1];
  const quickReplies = last && last.from === "bot" ? last.quickReplies : [];

  return (
    <div className="cds-chat">
      <header className="cds-header">
        {cfg.theme.logo ? <img className="cds-logo" src={cfg.theme.logo} alt="" /> : <div className="cds-logo-dot" />}
        <div className="cds-header-text">
          <div className="cds-agent">{cfg.agentName}</div>
          <div className={"cds-status cds-status-" + chat.connection}>
            {chat.connection === "connected" ? "Online" :
             chat.connection === "connecting" ? "Connecting…" :
             chat.connection === "error" ? "Connection issue" : ""}
          </div>
        </div>
        <button className="cds-reset" title="Restart conversation" onClick={chat.reset}>⟲</button>
      </header>

      <div className="cds-scroll" ref={scrollRef}>
        {chat.messages.map((m) => <Bubble key={m.id} msg={m} onPostback={onPostback} />)}
        {chat.typing && (
          <div className="cds-row cds-row-bot">
            <div className="cds-bubble cds-bubble-bot cds-typing"><span /><span /><span /></div>
          </div>
        )}
        {chat.connection === "error" && (
          <div className="cds-error">
            {chat.connectionError}
            <button onClick={chat.reset}>Retry</button>
          </div>
        )}
      </div>

      {quickReplies.length > 0 && (
        <div className="cds-quick">
          {quickReplies.map((q, i) => (
            <button key={i} className="cds-chip" onClick={() => onPostback(q)}>{q.title}</button>
          ))}
        </div>
      )}

      <footer className="cds-composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={"Message " + cfg.agentName + "…"}
          disabled={chat.connection === "error"}
        />
        <button className="cds-send" onClick={submit} disabled={!draft.trim()}>➤</button>
      </footer>
    </div>
  );
}
