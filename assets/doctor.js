/*
 * Cognigy Demo Studio — setup check:  npm run doctor
 *
 * Prints where everything resolved to on THIS machine and checks the things
 * that actually break a fresh install. Written to be the first thing to run on
 * a new computer (especially Windows) and the first thing to paste back when
 * something isn't working.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");

const paths = require("../apps/studio/service/paths");

const PORT = 41700;
let failures = 0;
let warnings = 0;

const line = (s) => console.log(s);
const ok = (label, detail) => line("  ✓ " + label + (detail ? "  " + detail : ""));
const warn = (label, detail) => { warnings++; line("  ! " + label + (detail ? "  " + detail : "")); };
const bad = (label, detail) => { failures++; line("  ✗ " + label + (detail ? "  " + detail : "")); };
const head = (s) => line("\n" + s);

line("\nCognigy Demo Studio — setup check");
line("=================================");

/* ── machine ───────────────────────────────────────────────── */
head("Machine");
const plat = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : process.platform;
ok("Platform", plat + " (" + process.arch + ")");

const major = parseInt(process.versions.node.split(".")[0], 10);
if (major >= 20) ok("Node.js", "v" + process.versions.node);
else if (major >= 18) warn("Node.js", "v" + process.versions.node + " — v20 LTS or newer is recommended");
else bad("Node.js", "v" + process.versions.node + " — too old, install v20 LTS from nodejs.org");

/* ── folders ───────────────────────────────────────────────── */
head("Folders");
const docs = paths.resolveDocumentsDir();
if (docs === os.homedir()) {
  warn("Documents folder", docs + " — couldn't find a Documents folder, using your home folder");
} else if (process.platform === "win32" && docs !== path.join(os.homedir(), "Documents")) {
  // resolveDocumentsDir only leaves <home>\Documents when that folder is itself
  // a junction into the OneDrive sync root.
  warn("Documents folder", docs + " — your Documents folder redirects into OneDrive, so demos go here instead");
} else {
  ok("Documents folder", docs);
}

if (process.env.CDS_DATA_DIR) ok("CDS_DATA_DIR override", process.env.CDS_DATA_DIR);

// Runs the one-time move from wherever demos used to live — including the
// OneDrive-redirected Documents folder earlier versions resolved to.
let moved = null;
try { moved = paths.migrateLegacyData(); } catch (err) { bad("Moving your old demos folder", String(err.message || err)); }
if (moved) ok("Moved your demos", moved.from + "  →  " + moved.to);

ok("Your demos", paths.DATA_ROOT);
ok("The app", paths.REPO_ROOT);

// The thing that brings OneDrive to its knees: node_modules is thousands of
// files, and the builder rewrites each demo's dist/ on every single save.
if (paths.isInOneDrive(paths.REPO_ROOT)) {
  warn("The app is inside OneDrive", "node_modules will be synced file by file — move this folder to " +
       (process.platform === "win32" ? "C:\\Users\\<you>\\Documents\\Demo-Studio" : "~/Documents/Demo-Studio") +
       ", then re-run:  npm install");
}
if (paths.isInOneDrive(paths.DATA_ROOT)) {
  warn("Your demos are inside OneDrive", "every rebuild re-syncs the demo — point CDS_DATA_DIR at a local folder");
}

// The data folder has to be creatable and writable, or nothing works.
try {
  fs.mkdirSync(paths.DEMOS_ROOT, { recursive: true });
  const probe = path.join(paths.DATA_ROOT, ".write-test");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
  ok("Data folder is writable");
} catch (err) {
  bad("Data folder is NOT writable", String(err.message || err));
}

let demoCount = 0;
try {
  demoCount = fs.readdirSync(paths.DEMOS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(paths.DEMOS_ROOT, e.name, "demo.json"))).length;
  ok("Demos found", String(demoCount));
} catch (e) { warn("Demos found", "could not read the demos folder"); }

/* ── app files ─────────────────────────────────────────────── */
head("Application files");
for (const [label, dir] of [["templates/", paths.TEMPLATES_ROOT], ["extension/", paths.EXTENSION_ROOT]]) {
  if (fs.existsSync(dir)) ok(label, dir);
  else bad(label + " is missing", dir);
}
if (fs.existsSync(path.join(paths.REPO_ROOT, "node_modules"))) ok("node_modules", "dependencies installed");
else bad("node_modules missing", "run:  npm install");

// Demos with Chat UI "Cognigy Webchat v3" are served this bundle by the
// service; without it they render a blank panel, which is hard to trace back
// to a missing dependency.
const webchatBundle = path.join(paths.REPO_ROOT, "node_modules", "@cognigy", "webchat", "dist", "webchat.js");
if (fs.existsSync(webchatBundle)) ok("Cognigy Webchat v3", "widget bundle present");
else bad("Cognigy Webchat v3 bundle missing", "run:  npm install");

// Three files carry a version and they drifted once already (mcp-server sat a
// release behind through 1.1.0). A mismatch shows up as the app and the
// extension disagreeing in Settings, which reads like a broken install.
try {
  const v = require("./set-version.js").check();
  if (v.ok) ok("Version", v.expected + " — package.json, extension and mcp-server agree");
  else warn("Versions disagree", v.versions.map((x) => (x.version || "?") + " " + x.label).join(",  ") +
            " — run:  npm run version:set " + (v.expected || "<version>"));
} catch (err) {
  warn("Could not check versions", String(err.message || err));
}

const iconDir = path.join(paths.EXTENSION_ROOT, "icons");
if (fs.existsSync(path.join(iconDir, "icon128.png"))) ok("Extension icons");
else warn("Extension icons missing", "run:  node assets/make-icons.js");

/* ── optional tools ────────────────────────────────────────── */
head("Optional");
try {
  const { execFileSync } = require("child_process");
  const v = execFileSync("git", ["--version"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  ok("git", v + " — Settings → About can show the version date");
} catch (e) {
  warn("git not found", "fine to skip; About falls back to file dates and you'll update by re-downloading");
}

/* ── MCP bridge ────────────────────────────────────────────── */
head("MCP bridge (mcp-server/)");
try {
  const mcp = require("./register-mcp.js");

  const claudeBin = mcp.claudeCliPath();
  if (!claudeBin) {
    warn("Claude Code CLI not found", "install it, then run:  npm run mcp:register");
  } else {
    const registered = mcp.getRegisteredCode(claudeBin);
    if (registered && registered.indexOf(mcp.SERVER_ENTRY) >= 0) ok("Claude Code", "registered, path is current");
    else if (registered) warn("Claude Code", "registered but points at a different checkout — run:  npm run mcp:register");
    else warn("Claude Code", "not registered — run:  npm run mcp:register");
  }

  const desktopConfig = mcp.desktopConfigPath();
  if (!desktopConfig || !fs.existsSync(path.dirname(desktopConfig))) {
    ok("Claude Desktop", "not installed on this machine — nothing to check");
  } else if (!fs.existsSync(desktopConfig)) {
    warn("Claude Desktop", "installed but no config file yet — run:  npm run mcp:register");
  } else {
    let entry = null;
    try { entry = JSON.parse(fs.readFileSync(desktopConfig, "utf8")).mcpServers || {}; } catch (e) { entry = null; }
    const server = entry && entry[mcp.MCP_NAME];
    if (server && Array.isArray(server.args) && server.args[0] === mcp.SERVER_ENTRY) ok("Claude Desktop", "registered, path is current");
    else if (server) warn("Claude Desktop", "registered but points at a different checkout — run:  npm run mcp:register");
    else warn("Claude Desktop", "not registered — run:  npm run mcp:register");
  }

  if (fs.existsSync(mcp.SKILL_DEST)) ok("Skill installed", mcp.SKILL_DEST);
  else warn("Skill not installed", "run:  npm run mcp:register");
} catch (err) {
  warn("Could not check MCP bridge status", String(err.message || err));
}

/* ── port ──────────────────────────────────────────────────── */
head("Local service (port " + PORT + ")");
const srv = net.createServer();
srv.once("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // Already in use is good news if it's us, bad news if it's something else.
    fetch("http://localhost:" + PORT + "/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (j && j.app === "cognigy-demo-studio") ok("Demo Studio is already running", "v" + j.version);
        else bad("Port " + PORT + " is used by another program", "close that program, then start Demo Studio again");
        finish();
      })
      .catch(() => { bad("Port " + PORT + " is used by another program", "quit it and try again"); finish(); });
  } else {
    bad("Could not test port " + PORT, String(err.message || err));
    finish();
  }
});
srv.once("listening", () => { srv.close(() => { ok("Port " + PORT + " is free"); finish(); }); });
srv.listen(PORT, "127.0.0.1");

function finish() {
  line("");
  if (failures) {
    line("✗ " + failures + " problem" + (failures === 1 ? "" : "s") + " found" +
         (warnings ? ", " + warnings + " warning" + (warnings === 1 ? "" : "s") : "") + ".");
    line("  Fix the ✗ lines above, then run  npm run doctor  again.");
    process.exitCode = 1;
  } else if (warnings) {
    line("✓ Ready to go — with " + warnings + " note" + (warnings === 1 ? "" : "s") + " above.");
  } else {
    line("✓ Everything looks good. Double-click the Cognigy Demo Studio icon to start.");
  }
  line("");
}
