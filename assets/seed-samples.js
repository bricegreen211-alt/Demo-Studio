/*
 * Create the sample Demo Experiences:  npm run seed:samples
 *
 * All of them point at https://www.cognigy.com so you can compare them on one
 * real site. Only one demo can auto-match a domain, so use the extension
 * popup's "Demo on this browser" override to switch between them.
 *
 * Each uses the endpoint value "mock", which the templates recognise as
 * simulated mode — scripted chat replies and a scripted voice call, marked SIM
 * in the UI so it can never be mistaken for a live agent. Swap the endpoint for
 * a real one in the dashboard when you're ready to test against Cognigy.
 *
 * Safe to re-run: existing samples are skipped, not duplicated.
 */
const store = require("../apps/studio/service/store");
const builder = require("../apps/studio/service/builder");

const SITE = "https://www.cognigy.com";

const SAMPLES = [
  /* ── The "looks like part of the site" set: small overlay widgets ────── */
  {
    name: "Webchat bubble — Overlay",
    template: "webchat",
    panelStyle: "overlay",
    launcher: "chat",
    launcherText: "Chat with us",
    agentName: "Ava",
    welcomeMessage: "Hi! I'm Ava. Ask me anything about Cognigy.",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "" }
  },
  {
    name: "Voice widget — Overlay",
    template: "webrtc",
    panelStyle: "overlay",
    launcher: "voice-wave",
    launcherText: "Talk to us",
    agentName: "Ava",
    cognigy: { chatEndpoint: "", voiceEndpoint: "mock" }
  },
  {
    name: "AI assistant, chat + voice — Overlay",
    template: "webchat-webrtc",
    panelStyle: "overlay",
    launcher: "ai-orb",
    launcherText: "Ask Ava",
    agentName: "Ava",
    welcomeMessage: "Hi! I'm Ava — chat here, or switch to voice any time.",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "mock" }
  },

  /* ── The other panel styles, for comparison ──────────────────────────── */
  {
    name: "Webchat — Clear side panel",
    template: "webchat",
    panelStyle: "clear",
    panelWidth: 420,
    launcher: "ai-spark",
    launcherText: "Ask Ava",
    agentName: "Ava",
    welcomeMessage: "Hi! I'm Ava. Ask me anything about Cognigy.",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "" }
  },
  {
    name: "Voice — Phone mockup",
    template: "webrtc",
    panelStyle: "phone",
    launcher: "voice-wave",
    launcherText: "Call Ava",
    agentName: "Ava",
    cognigy: { chatEndpoint: "", voiceEndpoint: "mock" }
  },
  {
    name: "Webchat — Solid side panel",
    template: "webchat",
    panelStyle: "solid",
    panelWidth: 420,
    launcher: "ai-orb",
    launcherText: "Ask Ava",
    agentName: "Ava",
    welcomeMessage: "Hi! I'm Ava. Ask me anything about Cognigy.",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "" }
  }
];

(async () => {
  const existing = store.list().map((d) => d.name);
  const created = [];

  for (const sample of SAMPLES) {
    if (existing.includes(sample.name)) {
      console.log("skip (already exists):", sample.name);
      continue;
    }
    const demo = store.create(Object.assign({ website: SITE, folder: "Samples" }, sample));
    created.push(demo);
    console.log("created:", demo.name, "->", demo.id);
  }

  for (const demo of created) {
    process.stdout.write("building " + demo.id + " ... ");
    await builder.buildDemo(demo.id);
    const r = builder.lastResult(demo.id);
    console.log(r && r.ok ? "ok" : "FAILED: " + (r && r.error));
  }

  console.log(
    created.length
      ? "\nDone — the samples are in a \"Samples\" folder in your demo list.\n" +
        "They're all mapped to " + SITE + "; open it in Chrome/Edge and use the\n" +
        'extension popup\'s "Demo on this browser" override to switch between them.'
      : "\nNothing to do — all samples already exist."
  );
})().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
