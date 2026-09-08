/*
 * Runs after `npm install`. Two jobs:
 *   1. rebuild the vendored noise-suppression bundle, so it can never drift
 *   2. create the double-click launcher icons
 *
 * Neither is allowed to fail the install. A broken postinstall would leave an
 * SE with dependencies installed but npm reporting failure, which is a far
 * worse place to be than missing an icon they can recreate with `npm run setup`.
 */
function attempt(label, fn) {
  try {
    fn();
  } catch (err) {
    console.warn("[setup] " + label + " failed: " + (err && err.message));
    console.warn("[setup] the app still works — you can retry later.");
  }
}

attempt("rebuilding the audio bundle", () => require("./build-audio-clean.js"));
attempt("creating launcher icons", () => require("./make-launcher.js"));
