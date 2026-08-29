/*
 * Bundle the pinned @cognigy/click-to-call-sdk into a browser global for the
 * dashboard (window.CdsVoice). Rerun after bumping the SDK version:
 *   node assets/build-voice-sdk.js
 */
const path = require("path");
const { buildSync } = require("esbuild");

buildSync({
  entryPoints: [path.join(__dirname, "voice-sdk-entry.js")],
  bundle: true,
  format: "iife",
  globalName: "CdsVoice",
  outfile: path.join(__dirname, "..", "apps", "studio", "renderer", "vendor", "cds-voice-sdk.js"),
  minify: true,
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' }
});
console.log("wrote apps/studio/renderer/vendor/cds-voice-sdk.js");
