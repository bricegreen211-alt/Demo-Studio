/*
 * Halo chat pane. Identity and the mode tabs live in App; this is the log,
 * the starters and the composer.
 *
 * Renders whatever Cognigy sends — text, images, buttons, galleries and
 * structured data — through parseOutput in messages.ts. Nothing here is
 * authored: quick replies are the agent's, and the starter chips come from
 * the demo form.
 */
import { useEffect, useRef, useState } from "react";
import { DemoConfig } from "../config";
import { CognigyChat } from "./useCognigyChat";
import { ChatButton, ChatMessage, MessagePart } from "./messages";
import { Icon } from "../icons";

function Buttons({ buttons, onPostback }: { buttons: ChatButton[]; onPostback: (b: ChatButton) => void }) {
  return (
    <div className="cds-btns">
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
      return <>{part.text}</>;
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

function clockOf(msg: ChatMessage): string {
  const at = (msg as unknown as { at?: number }).at;
  return new Date(typeof at === "number" ? at : Date.now())
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Row({ msg, onPostback }: { msg: ChatMessage; onPostback: (b: ChatButton) => void }) {
  const mine = msg.from === "user";
  return (
    <div className={"cds-row cds-row-" + msg.from}>
      {!mine && <span className="cds-mini"><Icon name="graphic_eq" size={15} /></span>}
      <div className="cds-msg">
        <div className="cds-bubble">
          {msg.parts.map((p, i) => <Part key={i} part={p} onPostback={onPostback} />)}
        </div>
        <div className="cds-time">{clockOf(msg)}</div>
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
  const quickReplies = last && last.from === "bot" ? last.quickReplies || [] : [];

  /*
   * Starters are the form's "help me get started" boxes. They show only
   * before the customer has said anything, and the agent's own quick replies
   * take over from there — two rows of chips at once would be noise.
   */
  const spoken = chat.messages.some((m) => m.from === "user");
  const chips: { title: string; payload?: string }[] =
    quickReplies.length ? quickReplies
    : (!spoken ? cfg.starters.map((s) => ({ title: s })) : []);

  return (
    <div className="cds-chat">
      <div className="cds-scroll" ref={scrollRef} role="log" aria-label="Chat messages" aria-live="polite">
        {chat.messages.map((m) => <Row key={m.id} msg={m} onPostback={onPostback} />)}
        {chat.typing && (
          <div className="cds-row cds-row-bot">
            <span className="cds-mini"><Icon name="graphic_eq" size={15} /></span>
            <div className="cds-msg">
              <div className="cds-bubble cds-typing" aria-label={cfg.agentName + " is responding"}>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        {chat.connection === "error" && (
          <div className="cds-error">
            {chat.connectionError}
            <button onClick={chat.reset}>Retry</button>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="cds-quick">
          {chips.map((q, i) => (
            <button key={i} className="cds-chip" onClick={() => onPostback(q as ChatButton)}>{q.title}</button>
          ))}
        </div>
      )}

      <form className="cds-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={"Message " + cfg.agentName + "…"}
          aria-label={"Message " + cfg.agentName}
          autoComplete="off"
          maxLength={1000}
          disabled={chat.connection === "error"}
        />
        <button className="cds-send" type="submit" aria-label="Send message" disabled={!draft.trim()}>
          <Icon name="send" size={20} />
        </button>
      </form>
    </div>
  );
}
