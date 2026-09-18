/*
 * Cognigy Demo Studio — settings.json (data dir).
 *   overrideDemoId     : manual demo override from the extension popup (null = auto by domain)
 *   extensionLastSeen  : heartbeat timestamp used by preflight's "extension connected"
 *   gateways/activeGateway : Remote Control voice gateways [{name, endpointUrl}]
 *   preferredMicId/preferredSpeakerId : Remote Control device preferences
 *   outbound           : how the Outbound Trigger places a call. `mode` picks
 *                        the path: "flow" POSTs the contact to your Agent
 *                        flow's REST endpoint and the flow does the dialling;
 *                        "vg" POSTs straight to the Voice Gateway Calls API and
 *                        the phone rings with no flow wiring at all
 *   followMeUserId     : the Cognigy user ID every demo and gateway connects
 *                        with. Global: Live Follow tracks one ID, and it is a
 *                        property of how this machine demos, not of a demo.
 *   theme              : dashboard appearance — "system" | "light" | "dark"
 *   sidebarCollapsed   : sidebar shown as an icon-only rail
 *   audio              : microphone cleanup applied to every outbound call.
 *                        Global, not per demo, for the same reason
 *                        preferredMicId is: it describes this machine and this
 *                        room, not a demo. See service/audio-clean.js.
 */
const fs = require("fs");
const { SETTINGS_FILE, ensureDirs } = require("./paths");

const DEFAULTS = {
  overrideDemoId: null,
  extensionLastSeen: 0,
  // Reported by the extension's heartbeat; compared against the app version to
  // spot an extension that was never reloaded after an update.
  extensionVersion: "",
  gateways: [],        // Remote Control: [{id, name, endpointUrl, folder}]
  activeGateway: 0,    // legacy index (pre-list-view)
  folders: [],         // Demo Experiences folders
  gatewayFolders: [],  // Voice Agent gateway folders
  preferredMicId: "",
  preferredSpeakerId: "",
  outbound: {
    mode: "flow",
    endpointUrl: "", endpointKey: "",
    // Voice Gateway, for mode "vg". Everything here comes out of the VG
    // Self-Service Portal; vgApiKey is an ACCOUNT-level API key, which is a
    // different credential from the flow's endpointKey above.
    vgBaseUrl: "", vgAccountSid: "", vgApiKey: "",
    vgApplicationSid: "", vgFrom: "", vgTrunk: ""
  },
  /*
   * Cognigy.AI management API, for the Logs page. This is the only ORG-WIDE
   * credential in the app — outbound.endpointKey is one flow's endpoint and
   * outbound.vgApiKey is a Voice Gateway account; this one can read and write
   * every Project. Two consequences, both enforced elsewhere and both easy to
   * undo by accident:
   *   - server.js redacts apiKey out of GET /api/settings, so the dashboard
   *     never receives it. Every Cognigy call is proxied by the service.
   *   - importer.js leaves this block out of Export, which DOES carry the
   *     other two in clear.
   * apiKey is a user API key from Cognigy > My Profile > API Keys.
   */
  cognigy: { baseUrl: "", apiKey: "" },
  // Last Project used on the Logs page, so it opens where you left off
  // instead of asking. Not a credential; just somewhere to put it.
  logsProjectId: "",
  // Draws a small state badge on the demo and logs verbosely. On by
  // default while Webchat v3 support settles — turn it off in Settings
  // before demoing to a customer.
  showDiagnostics: true,
  // Dashboard appearance. "system" follows the OS. The renderer mirrors both
  // of these into localStorage so the inline <head> script can apply them
  // before first paint; this file stays the source of truth.
  theme: "system",
  sidebarCollapsed: false,
  // "followme" is what Cognigy Live Follow / the Interaction Panel watch for.
  followMeUserId: "followme",
  /*
   * Microphone cleanup. The three constraint flags are what the browser does
   * for free and what the Cognigy SDK never asks for — it calls getUserMedia
   * with a bare { audio: true }, so these are off today by omission.
   *
   * engine and gate both ship OFF. A gate threshold set too high clips the
   * start of the SE's words, which is worse on a customer call than the
   * background noise it removes, so both are opt-in with the level meter in
   * Settings (or the gear on the widget) in front of you.
   */
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    engine: "none",          // "none" | "rnnoise" | "gtcrn" | "speex"
    gate: false,
    gateOpenThreshold: -50,  // dBFS
    gateCloseThreshold: -60, // dBFS, hysteresis so the gate can't chatter
    gateHoldMs: 90,
    panel: true              // the gear on the widget; still gated on showDiagnostics
  }
};

function read() {
  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    const merged = Object.assign({}, DEFAULTS, stored);
    merged.outbound = Object.assign({}, DEFAULTS.outbound, stored.outbound || {});
    // Nested objects need their own merge or a settings.json written before a
    // new sub-key existed would keep overriding the whole block with an old
    // shape, and the new key would read as undefined forever.
    merged.audio = Object.assign({}, DEFAULTS.audio, stored.audio || {});
    merged.cognigy = Object.assign({}, DEFAULTS.cognigy, stored.cognigy || {});
    return merged;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function write(patch) {
  ensureDirs();
  const next = Object.assign(read(), patch || {});
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { read, write };
