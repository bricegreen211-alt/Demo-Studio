/*
 * Simulated conversation for demos whose chat endpoint is "mock".
 * Exercises every renderable message part (text, quick replies, buttons,
 * cards, structured data) so panel styling can be checked end to end without
 * a Cognigy connection.
 */
import { ChatMessage, ChatButton, msgId } from "./messages";

function bot(parts: ChatMessage["parts"], quickReplies: ChatButton[] = []): ChatMessage {
  return { id: msgId(), from: "bot", parts, quickReplies, at: Date.now() };
}

const QUICK: ChatButton[] = [
  { title: "Check my balance", type: "postback", payload: "balance" },
  { title: "Recent activity", type: "postback", payload: "activity" },
  { title: "Talk to someone", type: "postback", payload: "agent" },
];

export function mockWelcome(agentName: string, welcome: string): ChatMessage {
  return bot(
    [{ kind: "text", text: welcome || `Hi, I'm ${agentName}. What can I help you with today?` }],
    QUICK
  );
}

/** Pick a scripted reply for whatever the user said. */
export function mockReply(input: string, agentName: string): ChatMessage {
  const t = input.toLowerCase();

  if (/balance|account|how much|money/.test(t)) {
    return bot([
      { kind: "text", text: "Your checking account balance is $2,847.63, and savings is $11,204.10." },
      {
        kind: "buttons",
        buttons: [
          { title: "Transfer between accounts", type: "postback", payload: "transfer" },
          { title: "See full statement", type: "web_url", url: "https://example.com/statement" },
        ],
      },
      { kind: "data", data: { checking: 2847.63, savings: 11204.1, currency: "USD" } },
    ]);
  }

  if (/activity|transaction|recent|history|spend/.test(t)) {
    return bot(
      [
        { kind: "text", text: "Here are your three most recent transactions." },
        {
          kind: "cards",
          cards: [
            {
              title: "Blue Bottle Coffee",
              subtitle: "Today · $6.75",
              buttons: [{ title: "Dispute", type: "postback", payload: "dispute-1" }],
            },
            {
              title: "Whole Foods Market",
              subtitle: "Yesterday · $84.22",
              buttons: [{ title: "Dispute", type: "postback", payload: "dispute-2" }],
            },
            {
              title: "Transit Authority",
              subtitle: "Monday · $2.90",
              buttons: [{ title: "Dispute", type: "postback", payload: "dispute-3" }],
            },
          ],
        },
      ],
      QUICK
    );
  }

  if (/agent|human|someone|person|representative|call|speak/.test(t)) {
    return bot([
      { kind: "text", text: "Of course — I can connect you with a specialist right now." },
      {
        kind: "buttons",
        buttons: [
          { title: "📞 Start a voice call", type: "postback", payload: "start-voice" },
          { title: "Schedule a callback", type: "postback", payload: "callback" },
        ],
      },
    ]);
  }

  if (/transfer/.test(t)) {
    return bot(
      [{ kind: "text", text: "How much would you like to transfer, and to which account?" }],
      [
        { title: "$100 to savings", type: "postback", payload: "t100" },
        { title: "$500 to savings", type: "postback", payload: "t500" },
      ]
    );
  }

  if (/dispute/.test(t)) {
    return bot([
      { kind: "text", text: "I've opened a dispute for that charge. You'll get an email confirmation shortly, and provisional credit within 3 business days." },
      { kind: "data", data: { caseId: "DSP-40912", status: "open", provisionalCredit: true } },
    ]);
  }

  if (/thank|thanks|bye|great|perfect/.test(t)) {
    return bot([{ kind: "text", text: "Happy to help. Anything else I can do for you?" }], QUICK);
  }

  return bot(
    [
      {
        kind: "text",
        text: `This is a simulated response from ${agentName}, so I can show off the interface without a live connection. Try one of these:`,
      },
    ],
    QUICK
  );
}
