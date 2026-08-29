/*
 * Cognigy Demo Studio — settings.json (data dir).
 *   presentationMode : serve locked demo copies, suppress dev affordances
 *   overrideDemoId   : manual demo override from the extension popup (null = auto by domain)
 *   extensionLastSeen: heartbeat timestamp used by preflight's "extension connected"
 */
const fs = require("fs");
const { SETTINGS_FILE, ensureDirs } = require("./paths");

const DEFAULTS = { presentationMode: false, overrideDemoId: null, extensionLastSeen: 0 };

function read() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

function write(patch) {
  ensureDirs();
  const next = Object.assign(read(), patch || {});
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { read, write };
