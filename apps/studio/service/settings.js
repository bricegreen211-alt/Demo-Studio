/*
 * Cognigy Demo Studio — settings.json (data dir).
 *   overrideDemoId     : manual demo override from the extension popup (null = auto by domain)
 *   extensionLastSeen  : heartbeat timestamp used by preflight's "extension connected"
 *   gateways/activeGateway : Remote Control voice gateways [{name, endpointUrl}]
 *   preferredMicId/preferredSpeakerId : Remote Control device preferences
 *   outbound           : { endpointUrl, endpointKey } — Agent flow REST endpoint
 *                        the Outbound Trigger posts contacts to
 *   theme              : dashboard appearance — "system" | "light" | "dark"
 *   sidebarCollapsed   : sidebar shown as an icon-only rail
 */
const fs = require("fs");
const { SETTINGS_FILE, ensureDirs } = require("./paths");

const DEFAULTS = {
  overrideDemoId: null,
  extensionLastSeen: 0,
  gateways: [],        // Remote Control: [{id, name, endpointUrl, folder}]
  activeGateway: 0,    // legacy index (pre-list-view)
  folders: [],         // Demo Experiences folders
  gatewayFolders: [],  // Voice Agent gateway folders
  preferredMicId: "",
  preferredSpeakerId: "",
  outbound: { endpointUrl: "", endpointKey: "" },
  // Draws a small state badge on the demo and logs verbosely. On by
  // default while Webchat v3 support settles — turn it off in Settings
  // before demoing to a customer.
  showDiagnostics: true,
  // Dashboard appearance. "system" follows the OS. The renderer mirrors both
  // of these into localStorage so the inline <head> script can apply them
  // before first paint; this file stays the source of truth.
  theme: "system",
  sidebarCollapsed: false
};

function read() {
  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    const merged = Object.assign({}, DEFAULTS, stored);
    merged.outbound = Object.assign({}, DEFAULTS.outbound, stored.outbound || {});
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
