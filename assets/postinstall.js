/*
 * Runs after `npm install`. Three jobs:
 *   1. rebuild the vendored noise-suppression bundle, so it can never drift
 *   2. create the double-click launcher icons
 *   3. register the MCP bridge with Claude Code/Desktop and install its skill,
 *      so a fresh `git clone` + `npm install` is the entire install for that
 *      too — see register-mcp.js and mcp-server/README.md
 *
 * None of the three is allowed to fail the install. A broken postinstall
 * would leave an SE with dependencies installed but npm reporting failure,
 * which is a far worse place to be than missing an icon or an MCP
 * registration they can recreate with `npm run setup` / `npm run mcp:register`.
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
attempt("registering the MCP bridge", () => require("./register-mcp.js").run());
