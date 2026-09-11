/*
 * Cognigy Demo Studio — register the MCP bridge (mcp-server/) with Claude Code
 * and Claude Desktop, plus install the matching personal skill.
 *
 * Run automatically by postinstall.js on `npm install`, and by hand any time
 * via `npm run mcp:register` (moved the project folder, installed Claude
 * Code/Desktop after the fact, etc.). Never allowed to throw past its own
 * module.exports.run() — every step is independently best-effort, exactly
 * like the audio-bundle and launcher-icon steps this sits alongside in
 * postinstall.js. A team of SEs on different machines with different
 * combinations of Code/Desktop/neither installed all have to come out of
 * `npm install` with a working app either way.
 *
 * Self-locating throughout: every path is derived from this file's own
 * location (__dirname), never hard-coded, so the exact same script is
 * correct on every SE's machine regardless of where they cloned the repo.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.join(__dirname, "..");
const SERVER_ENTRY = path.join(REPO_ROOT, "mcp-server", "index.js");
const SKILL_SOURCE = path.join(REPO_ROOT, "mcp-server", "SKILL.md");
const MCP_NAME = "demo-studio";

function log(msg) { console.log("[mcp] " + msg); }
function warn(msg) { console.warn("[mcp] " + msg); }

/* ------------------------------------------------------------------ *
 * Claude Code — entirely through the official CLI. Never touch
 * ~/.claude.json by hand; `claude mcp` is the sanctioned way in, and using
 * anything else risks corrupting a file this project doesn't own.
 * ------------------------------------------------------------------ */

function claudeCliPath() {
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(finder, ["claude"], { encoding: "utf8" });
    return out.split(/\r?\n/)[0].trim() || null;
  } catch (err) {
    return null;
  }
}

/** `claude mcp get <name>` output on success, or null if not registered. */
function getRegisteredCode(claudeBin) {
  try {
    return execFileSync(claudeBin, ["mcp", "get", MCP_NAME], { encoding: "utf8" });
  } catch (err) {
    return null; // "No MCP server found with name: ..." — not an error, just absent
  }
}

function registerClaudeCode() {
  const claudeBin = claudeCliPath();
  if (!claudeBin) {
    warn("Claude Code CLI not found on PATH — skipping. Install it, then run `npm run mcp:register`.");
    return;
  }

  const existing = getRegisteredCode(claudeBin);
  if (existing && existing.indexOf(SERVER_ENTRY) >= 0) {
    log("Claude Code: already registered and pointed at this checkout — nothing to do.");
    return;
  }
  if (existing) {
    // Registered, but pointed at a different path — the project moved, or a
    // different checkout registered first. Same situation the desktop
    // launcher's own "project has moved" flow handles for its shortcut;
    // replace rather than leaving two entries or a stale one.
    try {
      execFileSync(claudeBin, ["mcp", "remove", MCP_NAME, "--scope", "user"], { stdio: "ignore" });
      log("Claude Code: found an entry pointed at a different checkout — replacing it.");
    } catch (err) {
      warn("Claude Code: could not remove the stale entry (" + (err.message || err) + ") — leaving it, registration may now fail.");
    }
  }

  try {
    execFileSync(claudeBin, ["mcp", "add", "--scope", "user", MCP_NAME, "--", "node", SERVER_ENTRY], { stdio: "ignore" });
    log("Claude Code: registered (user scope) -> " + SERVER_ENTRY);
  } catch (err) {
    warn("Claude Code: registration failed — " + (err.message || err) + ". Run `npm run mcp:register` again after checking `claude mcp list`.");
  }
}

/* ------------------------------------------------------------------ *
 * Claude Desktop — no CLI for this direction, so this reads, backs up, and
 * merges the config file itself. Every existing entry in it is preserved;
 * this only ever adds or replaces its own "demo-studio" key.
 * ------------------------------------------------------------------ */

function desktopConfigPath() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  return null; // Claude Desktop doesn't ship a Linux build at the time of writing
}

function registerClaudeDesktop() {
  const configPath = desktopConfigPath();
  if (!configPath) {
    log("Claude Desktop: no known config location on this platform — skipping.");
    return;
  }
  if (!fs.existsSync(path.dirname(configPath))) {
    // The app's own support folder doesn't exist, so Desktop was never
    // installed/run on this machine. Nothing to do, and nothing to create —
    // an empty config directory would just be clutter this script invented.
    log("Claude Desktop: not installed on this machine — skipping.");
    return;
  }

  let raw = "{}";
  let existed = false;
  if (fs.existsSync(configPath)) {
    existed = true;
    try {
      raw = fs.readFileSync(configPath, "utf8");
    } catch (err) {
      warn("Claude Desktop: could not read " + configPath + " (" + (err.message || err) + ") — skipping.");
      return;
    }
  }

  let config;
  try {
    config = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    warn("Claude Desktop: " + configPath + " isn't valid JSON — leaving it untouched rather than guessing. Add the entry from mcp-server/README.md by hand.");
    return;
  }

  const desired = { command: "node", args: [SERVER_ENTRY] };
  const current = config.mcpServers && config.mcpServers[MCP_NAME];
  const alreadyCorrect = current && current.command === desired.command &&
    Array.isArray(current.args) && current.args[0] === SERVER_ENTRY;
  if (alreadyCorrect) {
    log("Claude Desktop: already registered and pointed at this checkout — nothing to do.");
    return;
  }

  if (existed) {
    // Back up before touching a file this project doesn't own — the same
    // discipline demo folders get before Sync overwrites their source
    // (store.js's _backup-<timestamp>/ folders).
    const backupPath = configPath + ".backup-" + Date.now();
    try {
      fs.copyFileSync(configPath, backupPath);
    } catch (err) {
      warn("Claude Desktop: could not back up " + configPath + " (" + (err.message || err) + ") — skipping rather than risk it unbacked-up.");
      return;
    }
    log("Claude Desktop: backed up existing config -> " + backupPath);
  } else {
    try { fs.mkdirSync(path.dirname(configPath), { recursive: true }); } catch (err) { /* directory already existing is fine */ }
  }

  config.mcpServers = Object.assign({}, config.mcpServers, { [MCP_NAME]: desired });

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    log("Claude Desktop: registered -> " + configPath + " (restart Desktop to pick it up)");
  } catch (err) {
    warn("Claude Desktop: could not write " + configPath + " (" + (err.message || err) + ").");
  }
}

/* ------------------------------------------------------------------ *
 * The skill — one file, copied into place. Not hand-authored per machine;
 * mcp-server/SKILL.md in this repo is the single source of it.
 * ------------------------------------------------------------------ */

function installSkill() {
  const destDir = path.join(os.homedir(), ".claude", "skills", "demo-studio");
  const destFile = path.join(destDir, "SKILL.md");
  try {
    const wanted = fs.readFileSync(SKILL_SOURCE, "utf8");
    const have = fs.existsSync(destFile) ? fs.readFileSync(destFile, "utf8") : null;
    if (have === wanted) {
      log("Skill: already up to date at " + destFile);
      return;
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destFile, wanted, "utf8");
    log((have === null ? "Skill: installed -> " : "Skill: updated -> ") + destFile);
  } catch (err) {
    warn("Skill: could not install (" + (err.message || err) + ") — copy mcp-server/SKILL.md to ~/.claude/skills/demo-studio/SKILL.md by hand.");
  }
}

function run() {
  registerClaudeCode();
  registerClaudeDesktop();
  installSkill();
}

module.exports = {
  run,
  // Read-only, so `npm run doctor` can report status without re-registering
  // anything — the single place that knows how to detect either app's
  // registration state, reused rather than duplicated.
  SERVER_ENTRY, MCP_NAME,
  claudeCliPath, getRegisteredCode, desktopConfigPath
};

// Runnable directly (`npm run mcp:register`) as well as required from
// postinstall.js.
if (require.main === module) run();
