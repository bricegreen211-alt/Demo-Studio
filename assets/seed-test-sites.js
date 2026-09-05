/*
 * Create the real Test Sites:  npm run seed:test-sites
 *
 * These are the SE's own working endpoints, from "Testing Link.docx" — unlike
 * the Samples (`npm run seed:samples`), which are simulated. They talk to live
 * Cognigy agents, so they are never marked SIM and never use the "mock"
 * endpoint.
 *
 * Two kinds of thing get created, because the doc lists two kinds of endpoint:
 *
 *   Webchat  -> a Demo Experience mapped to the customer's real domain, in
 *               Clear + Cognigy Webchat v3. Clear means Demo Studio paints
 *               nothing at all: Cognigy's own launcher and window float on the
 *               customer's site exactly as if they had deployed it. That is
 *               the cleanest overlay the app can produce.
 *
 *   WebRTC   -> a Remote Control gateway, not a demo. The voice endpoints here
 *               are standalone widget links with no website attached, which is
 *               what gateways are for — you place the call from Remote Control
 *               rather than mounting anything on a page.
 *
 * Endpoint URLs are stored exactly as the doc gives them. normalize.js turns a
 * hosted webchat page or a static widget link into the Endpoint URL the SDKs
 * actually want, at read time, so pasting what Cognigy hands you is correct.
 *
 * Safe to re-run: anything already present by name is skipped, not duplicated.
 */
const store = require("../apps/studio/service/store");
const builder = require("../apps/studio/service/builder");
const settingsStore = require("../apps/studio/service/settings");

const FOLDER = "Test Sites";

/*
 * Webchat demos. Template "webchat" (not "webchat-webrtc") on purpose: the
 * schema coerces chatUi to "studio" for any template other than plain webchat,
 * so asking for chat + voice in one demo would silently give up the real
 * Cognigy Webchat v3 widget. Voice for these accounts lives in GATEWAYS below,
 * which is both closer to how the doc lists them and keeps the overlay clean.
 */
const DEMOS = [
  {
    name: "Reliance Home Comfort",
    website: "https://expert-demo-clone101.mindtouch.us/Reliance_Home_Comfort",
    // NiCE CXone-branded host; normalize.js swaps "webchat" -> "endpoint" by
    // pattern, so branded domains work without a hard-coded list.
    chatEndpoint: "https://cognigy-webchat-na1.nicecxone.com/v3/feaf6ac53f6a9e4e40dd5e997141953e90132b56cf5cbdf8ae8f849a67f6b2b9"
  },
  {
    name: "NEOGOV",
    website: "https://www.governmentjobs.com/home/applicationguide",
    chatEndpoint: "https://webchat-trial-us.cognigy.ai/v3/a83af22d5264711a1240c66095d9638872c69fe0fe70be656d97bcde7cb34d3c"
  },
  {
    name: "JetBlue",
    website: "https://www.jetblue.com/",
    chatEndpoint: "https://webchat-trial-us.cognigy.ai/v3/e089406b4294bd29d84019b97383d1075a62ba3704575c8a69de532ee8abd71d"
  },
  {
    // The doc gives no website for LFG. Created anyway: it will not auto-match
    // a domain, so pick it from the extension popup's "Demo on this browser"
    // override, or fill the website in on the demo form later.
    name: "LFG",
    website: "",
    chatEndpoint: "https://webchat-trial-us.cognigy.ai/v3/953556bd68dae5a6de003d5029ede16ab6c8ddb7703527f96f388cea88141b85"
  }
];

// Voice endpoints -> Remote Control gateways.
const GATEWAYS = [
  {
    name: "JetBlue Voice",
    endpointUrl: "https://static-trial-us.cognigy.ai/webrtc/?token=aec60440192ef8a562e133becc6fbc4194d05fdb55b884c6c0f34f432b1c3f4a"
  },
  {
    // ICEE is voice-only and has no website in the doc, so a gateway is the
    // whole of it — there is nothing to mount on a page.
    name: "The ICEE Company Voice",
    endpointUrl: "https://static-trial-us.cognigy.ai/webrtc/?token=0aa092f66a30caeb63a38b9d24b85453676d427bf744f9cb0c5bb19236c2d877"
  },
  {
    name: "LFG Voice",
    endpointUrl: "https://static-trial-us.cognigy.ai/webrtc/?token=928067999cf28dfca4b7f1009b16f26494c715a521d6c35f563f6d172237200b"
  }
];

function gatewayId() {
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

(async () => {
  /* ---------------- demos ---------------- */
  const existingDemos = store.list().map((d) => d.name);
  const created = [];

  for (const d of DEMOS) {
    if (existingDemos.includes(d.name)) {
      console.log("skip (already exists):", d.name);
      continue;
    }
    const demo = store.create({
      name: d.name,
      website: d.website,
      folder: FOLDER,
      template: "webchat",
      chatUi: "webchat3",
      panelStyle: "clear",
      cognigy: { chatEndpoint: d.chatEndpoint, voiceEndpoint: "" }
    });
    created.push(demo);
    console.log("created demo:", demo.name, "->", demo.id);
  }

  /* ---------------- gateways ---------------- */
  const settings = settingsStore.read();
  const gateways = settings.gateways || [];
  let addedGateways = 0;

  for (const g of GATEWAYS) {
    if (gateways.some((x) => x.name === g.name)) {
      console.log("skip (already exists):", g.name);
      continue;
    }
    gateways.push({ id: gatewayId(), name: g.name, endpointUrl: g.endpointUrl, folder: FOLDER });
    addedGateways++;
    console.log("created gateway:", g.name);
  }

  const folders = settings.folders || [];
  const gatewayFolders = settings.gatewayFolders || [];
  if (created.length && !folders.includes(FOLDER)) folders.push(FOLDER);
  if (addedGateways && !gatewayFolders.includes(FOLDER)) gatewayFolders.push(FOLDER);
  settingsStore.write({ gateways, folders, gatewayFolders });

  /*
   * Webchat v3 demos need no build — the service serves its own host page in
   * place of the demo's dist. Built anyway so that flipping Chat UI to the
   * built-in chat later just works, and non-fatally, because a build failure
   * must not leave the endpoints unseeded.
   */
  for (const demo of created) {
    process.stdout.write("building " + demo.id + " ... ");
    try {
      await builder.buildDemo(demo.id);
      const r = builder.lastResult(demo.id);
      console.log(r && r.ok ? "ok" : "failed (Webchat v3 doesn't need it): " + (r && r.error));
    } catch (err) {
      console.log("failed (Webchat v3 doesn't need it):", err.message);
    }
  }

  if (!created.length && !addedGateways) {
    console.log("\nNothing to do — every test site already exists.");
    return;
  }
  console.log(
    "\nDone. " + created.length + " demo(s) and " + addedGateways + ' gateway(s) in "' + FOLDER + '".\n' +
    "  Webchat: open the customer's site in Chrome with the extension on — Cognigy's own\n" +
    "           launcher floats on the page, because these are Clear + Webchat v3.\n" +
    "  Voice:   Remote Control > Voice Agent > Call.\n" +
    "  LFG has no website in the doc, so use the extension popup's demo override for it."
  );
})().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
