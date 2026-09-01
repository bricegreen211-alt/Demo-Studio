/*
 * Create the sample Demo Experiences used to try out the panel styles without
 * a Cognigy connection:  npm run seed:samples
 *
 * Each sample uses the endpoint value "mock", which the templates recognise as
 * simulated mode — scripted chat replies and a scripted voice call, marked SIM
 * in the UI so it can never be mistaken for a live agent. Swap the endpoint for
 * a real one in the dashboard when you're ready to test against Cognigy.
 *
 * Safe to re-run: existing samples are skipped, not duplicated.
 */
const store = require("../apps/studio/service/store");
const builder = require("../apps/studio/service/builder");

const SAMPLES = [
  {
    name: "Sample — Chat (Solid)",
    template: "webchat",
    panelStyle: "solid",
    website: "example.com",
    agentName: "Ava",
    launcher: "ai-orb",
    launcherText: "Ask Ava",
    welcomeMessage: "Hi, I'm Ava. What can I help you with today?",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "" }
  },
  {
    name: "Sample — Chat (Clear)",
    template: "webchat",
    panelStyle: "clear",
    website: "wikipedia.org",
    agentName: "Ava",
    launcher: "ai-spark",
    launcherText: "Ask Ava",
    welcomeMessage: "Hi, I'm Ava. What can I help you with today?",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "" }
  },
  {
    name: "Sample — Voice (Phone)",
    template: "webrtc",
    panelStyle: "phone",
    website: "news.ycombinator.com",
    agentName: "Ava",
    launcher: "voice-wave",
    launcherText: "Call Ava",
    cognigy: { chatEndpoint: "", voiceEndpoint: "mock" }
  },
  {
    name: "Sample — Multimodal (Clear)",
    template: "webchat-webrtc",
    panelStyle: "clear",
    website: "",
    agentName: "Ava",
    launcher: "ai-orb",
    launcherText: "Ask Ava",
    welcomeMessage: "Hi, I'm Ava. Chat with me, or switch to voice any time.",
    cognigy: { chatEndpoint: "mock", voiceEndpoint: "mock" }
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
    const demo = store.create(sample);
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
      ? "\nDone. Open Demo Studio — the samples are in your demo list.\n" +
        "Each one is mapped to a different website; or use the extension popup's\n" +
        '"Demo on this browser" override to compare styles on the same site.'
      : "\nNothing to do — all samples already exist."
  );
})().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
