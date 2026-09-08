/*
 * Bundle the microphone cleanup layer into a browser global (window.CDSAudio)
 * and vendor the worklets and wasm it loads at runtime. Rerun after editing
 * assets/audio-clean-entry.js or bumping the package:
 *   node assets/build-audio-clean.js
 *
 * Output is committed on purpose, same as cds-voice-sdk.js: demos have no
 * node_modules, and the service has to work on conference wifi.
 */
const fs = require("fs");
const path = require("path");
const { buildSync } = require("esbuild");

const ROOT = path.join(__dirname, "..");
const PKG = path.join(ROOT, "node_modules", "@sapphi-red", "web-noise-suppressor");
const VENDOR = path.join(ROOT, "apps", "studio", "service", "vendor");
const AUDIO = path.join(VENDOR, "audio");

/*
 * Worklet processors and wasm are loaded by URL at runtime, not imported, so
 * they must be copied out rather than bundled. Names on the left are the
 * package's published subpaths; names on the right are what we serve from
 * /_cds/audio/ and what audio-clean-entry.js asks for.
 */
const ASSETS = {
  "dist/noiseGate/workletProcessor.js": "noiseGateWorklet.js",
  "dist/rnnoise/workletProcessor.js": "rnnoiseWorklet.js",
  "dist/gtcrn/workletProcessor.js": "gtcrnWorklet.js",
  "dist/speex/workletProcessor.js": "speexWorklet.js",
  "dist/rnnoise.wasm": "rnnoise.wasm",
  "dist/rnnoise_simd.wasm": "rnnoise_simd.wasm",
  "dist/gtcrn.wasm": "gtcrn.wasm",
  "dist/speex.wasm": "speex.wasm"
};

if (!fs.existsSync(PKG)) {
  console.error("@sapphi-red/web-noise-suppressor is not installed. Run: npm install");
  process.exit(1);
}

fs.mkdirSync(AUDIO, { recursive: true });

buildSync({
  entryPoints: [path.join(__dirname, "audio-clean-entry.js")],
  bundle: true,
  format: "iife",
  globalName: "CDSAudio",
  outfile: path.join(VENDOR, "cds-audio-clean.js"),
  minify: true,
  target: ["chrome100"],
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' }
});
console.log("wrote apps/studio/service/vendor/cds-audio-clean.js");

Object.keys(ASSETS).forEach((from) => {
  const src = path.join(PKG, from);
  if (!fs.existsSync(src)) {
    console.error("missing from the package: " + from + " — did its exports map change?");
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(AUDIO, ASSETS[from]));
});
console.log("copied " + Object.keys(ASSETS).length + " worklet/wasm assets to service/vendor/audio/");

/*
 * RNNoise and Speex are BSD-3 and GTCRN is Apache-2.0; all three require the
 * notice to ship alongside the binary. The wrapper itself is MIT.
 */
const license = path.join(PKG, "LICENSE");
if (fs.existsSync(license)) {
  fs.copyFileSync(license, path.join(AUDIO, "LICENSE"));
  console.log("copied upstream LICENSE");
}
