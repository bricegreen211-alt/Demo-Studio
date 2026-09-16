/*
 * Cognigy Demo Studio — one version, written everywhere.
 *
 *   npm run version:set 1.2.0        write it into all three manifests
 *   npm run version:set 1.2.0 --tag  ...then commit and tag v1.2.0
 *   npm run version:check            are they all the same? (doctor calls this)
 *
 * WHY THIS EXISTS
 *
 * Three files carry a version and all three were edited by hand. mcp-server/
 * was missed at 1.1.0 and sat a release behind, and nothing anywhere noticed.
 * package.json is the source of truth; the other two are written from it.
 *
 * The version is substituted with a targeted replace rather than
 * JSON.parse/stringify, so hand-formatting, key order and comments-by-
 * convention in these files survive being bumped.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.join(__dirname, "..");

/*
 * package.json first — it is the source of truth, and the one the service
 * reads at startup (server.js) to report the running version.
 */
const FILES = [
  { label: "package.json", file: path.join(REPO_ROOT, "package.json") },
  { label: "extension/manifest.json", file: path.join(REPO_ROOT, "extension", "manifest.json"), numericOnly: true },
  { label: "mcp-server/package.json", file: path.join(REPO_ROOT, "mcp-server", "package.json") }
];

// The top-level "version" key. "manifest_version" can't match — the pattern
// requires a quote immediately before `version`.
const VERSION_RE = /("version"\s*:\s*")([^"]+)(")/;

function read(entry) {
  const raw = fs.readFileSync(entry.file, "utf8");
  const m = raw.match(VERSION_RE);
  if (!m) throw new Error('no "version" key in ' + entry.label);
  return { raw, version: m[2] };
}

function currentVersions() {
  return FILES.map((entry) => {
    try {
      return { label: entry.label, version: read(entry).version };
    } catch (err) {
      return { label: entry.label, version: null, error: err.message };
    }
  });
}

/**
 * Do all three agree? Returns { ok, versions, expected }.
 * Exported so `npm run doctor` can report drift without duplicating the list.
 */
function check() {
  const versions = currentVersions();
  const expected = versions[0] && versions[0].version;
  const ok = !!expected && versions.every((v) => v.version === expected);
  return { ok, versions, expected };
}

/*
 * Chrome requires manifest versions to be one to four dot-separated integers —
 * a prerelease suffix like 1.2.0-rc.1 is rejected outright and the extension
 * won't load. Everywhere else keeps the full string.
 */
function numericOnly(version) {
  return version.split("-")[0];
}

function set(version) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('not a version: "' + version + '" — expected MAJOR.MINOR.PATCH, e.g. 1.2.0');
  }

  for (const entry of FILES) {
    const { raw, version: was } = read(entry);
    const next = entry.numericOnly ? numericOnly(version) : version;
    if (was === next) {
      console.log("[version] " + entry.label + "  already " + next);
      continue;
    }
    fs.writeFileSync(entry.file, raw.replace(VERSION_RE, "$1" + next + "$3"));
    console.log("[version] " + entry.label + "  " + was + " → " + next);
  }

  if (version !== numericOnly(version)) {
    console.log("[version] note: extension/manifest.json carries " + numericOnly(version) +
                " — Chrome rejects prerelease suffixes.");
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commitAndTag(version) {
  const tag = "v" + version;
  git(["commit", "-am", "Version " + version]);
  git(["tag", "-a", tag, "-m", "Version " + version]);
  console.log("[version] committed and tagged " + tag);
  console.log("[version] push it with:  git push && git push origin " + tag);
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === "--check" || args[0] === "check") {
    const r = check();
    for (const v of r.versions) console.log("  " + (v.version || "?") + "  " + v.label + (v.error ? "  (" + v.error + ")" : ""));
    if (r.ok) {
      console.log("\n✓ all three agree on " + r.expected);
    } else {
      console.log("\n✗ versions disagree — fix with:  npm run version:set " + (r.expected || "<version>"));
      process.exitCode = 1;
    }
  } else if (!args[0] || args[0].startsWith("-")) {
    const r = check();
    console.log("Usage:  npm run version:set <version> [--tag]\n");
    for (const v of r.versions) console.log("  " + (v.version || "?") + "  " + v.label);
    process.exitCode = 1;
  } else {
    try {
      set(args[0]);
      if (args.includes("--tag")) commitAndTag(args[0]);
      else console.log("\nNext:  git commit -am \"Version " + args[0] + "\" && git tag -a v" + args[0] + " -m \"Version " + args[0] + "\"");
    } catch (err) {
      console.error("[version] " + (err.message || err));
      process.exitCode = 1;
    }
  }
}

module.exports = { check, set, FILES };
