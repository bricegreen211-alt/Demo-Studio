/*
 * Cognigy Demo Studio — theme composition.
 *
 * A theme is a token block plus optional CSS, composed into a <style> the
 * service injects into the demo's page at request time. That placement is the
 * whole point: a demo folder holds its own copy of the template, so anything
 * shipped in templates/ would only reach demos created afterwards. Injecting
 * means a theme switch is live on refresh — no rebuild, no Sync, no _backup-
 * churn. Same escape hatch clear-mode.css uses (see CLAUDE.md §the constraint).
 *
 * Two emitters per theme:
 *   tokens   the demo's own UI, which is what the template stylesheet reads
 *   webrtc   Cognigy's click-to-call widget, whose 12 documented --webrtc-*
 *            variables are the only way to style it
 * so one choice skins both surfaces the same way.
 *
 * "cognigy-default" deliberately composes to nothing: that theme means Cognigy
 * owns the presentation and Demo Studio contributes no CSS at all.
 */
const fs = require("fs");
const path = require("path");
const schema = require("../../../packages/shared/demo-schema");

const THEMES_DIR = path.join(__dirname, "..", "..", "..", "assets", "themes");

// Same shape load() will accept, and the same shape a demo.json preset has to
// have to survive sanitize(). Enforced at discovery so a file that could never
// be loaded is never registered as selectable.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/*
 * Warnings are emitted from paths that run on every request and every demo
 * read, so each distinct message is said once. Loud, not repeated.
 */
const said = new Set();
function say(key, line) {
  if (said.has(key)) return;
  said.add(key);
  console.warn(line);
}

// Cached by mtime so editing a theme file is picked up without a restart —
// the same live-editing property the rest of the demo pipeline has.
const cache = new Map();

/*
 * Themes live under assets/themes/<endpoint>/<id>.json, namespaced because the
 * id space genuinely collides: "nebula" is both a CognigyWindowThemeBuilder
 * Webchat preset and one of the combination layouts, and they are entirely
 * different themes applied by entirely different mechanisms.
 */
function load(id, template) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id || ""))) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(template || ""))) return null;
  const file = path.join(THEMES_DIR, template, id + ".json");
  let stat;
  try { stat = fs.statSync(file); } catch (e) { return null; }

  const key = template + "/" + id;
  const hit = cache.get(key);
  if (hit && hit.mtime === stat.mtimeMs) return hit.theme;

  try {
    const theme = JSON.parse(fs.readFileSync(file, "utf8"));
    cache.set(key, { mtime: stat.mtimeMs, theme });
    return theme;
  } catch (err) {
    // Said once per version of the file — catalog() calls this on every
    // request now, and an unreadable theme must not scroll the log away.
    // Keyed by mtime, so fixing the file gets you a fresh complaint if it is
    // still broken, and silence once it isn't.
    say("json:" + key + ":" + stat.mtimeMs,
      "[themes] " + key + ".json is not valid JSON: " + err.message);
    return null;
  }
}

/*
 * CSS custom-property values reach the browser inside a <style> we build, so a
 * value carrying "}" or "</style>" could break out of the block. Theme files
 * are ours, but Custom comes from demo.json and is user-editable, so both go
 * through the same filter.
 */
function safeValue(v) {
  return String(v == null ? "" : v).replace(/[<>{};]/g, "").trim();
}
function safeProp(k) {
  return /^--[a-z0-9-]+$/i.test(String(k)) ? String(k) : null;
}

function block(selector, tokens) {
  const lines = [];
  Object.keys(tokens || {}).forEach((k) => {
    const prop = safeProp(k);
    const val = safeValue(tokens[k]);
    if (prop && val) lines.push("  " + prop + ": " + val + ";");
  });
  return lines.length ? selector + " {\n" + lines.join("\n") + "\n}\n" : "";
}

/*
 * The <style> for one demo, or "" when there is nothing to add.
 *
 * Order matters: the theme's own tokens first, then Custom's overrides on top,
 * then Custom's free CSS last, so vibe-coded edits always win over the preset
 * they started from.
 */
function styleFor(cfg) {
  const preset = (cfg && cfg.theme && cfg.theme.preset) || "cognigy-default";
  const template = (cfg && cfg.template) || "webchat";
  const custom = (cfg && cfg.theme && cfg.theme.custom) || {};

  let css = "";
  if (preset !== "cognigy-default") {
    const theme = load(preset === "custom" ? null : preset, template);
    if (theme) {
      css += block(":root", theme.tokens);
      // The click-to-call widget scopes its variables to its own container.
      css += block(".webrtc_widget_container", theme.webrtc);
      if (theme.css) css += String(theme.css) + "\n";
    }
  }

  css += block(":root", custom.tokens);
  if (custom.css) {
    // Only a closing </style> can escape the block; brace-stripping would
    // destroy legitimate CSS, so this is the one thing that is neutralised.
    css += String(custom.css).replace(/<\/style/gi, "<\\/style") + "\n";
  }

  if (!css.trim()) return "";
  return '<style data-cds-theme="' + preset + '">\n' + css + "</style>";
}

/* ---------------- registration ----------------
 *
 * Adding a theme is dropping assets/themes/<endpoint>/<id>.json in. Everything
 * that has to know about it derives from that file:
 *
 *   the schema's allowlist   syncSchema() below, so sanitize() stops rewriting
 *                            the preset back to the endpoint's first theme
 *   the dashboard's picker   catalog() -> GET /api/themes, so a tile appears
 *   the CSS on the page      load()/styleFor() above, as before
 *
 * The scan runs per request (server.js) rather than once at boot, which is what
 * makes it a one-file operation with no restart — the same live-editing
 * property the rest of the pipeline has. load() caches parsed JSON by mtime, so
 * the repeat cost is a readdir and a stat per endpoint.
 */

// A swatch is three colours for the picker tile. Declared in the file when the
// theme wants a particular three; otherwise taken off the tokens it already
// has, so a theme file never has to carry picker metadata just to render one.
const SWATCH_TOKENS = ["--surface", "--accent", "--surface-sunk", "--ink", "--line"];
const SWATCH_FALLBACK = ["#e2e8f0", "#3694fc", "#f8fafc"];
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

function swatchFor(theme) {
  const declared = (Array.isArray(theme.swatch) ? theme.swatch : [])
    .map((c) => String(c).trim()).filter((c) => COLOR_RE.test(c));
  if (declared.length) return declared.slice(0, 3);

  const tokens = theme.tokens || {};
  const derived = SWATCH_TOKENS
    .map((k) => String(tokens[k] == null ? "" : tokens[k]).trim())
    .filter((v) => COLOR_RE.test(v));
  return derived.length ? derived.slice(0, 3) : SWATCH_FALLBACK.slice();
}

// "test-custom" -> "Test Custom", for a file that didn't bother with a name.
function titleize(id) {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function dirFor(template) {
  return path.join(THEMES_DIR, template);
}

/*
 * The themes on disk for one endpoint, as picker-ready entries. Skips — loudly
 * — anything that exists as a file but could never work as a theme, because
 * "the file is there and nothing happened" is the failure this whole path is
 * meant to stop.
 */
function catalog(template) {
  let files;
  try {
    files = fs.readdirSync(dirFor(template));
  } catch (e) {
    return [];
  }

  const entries = [];
  files.sort().forEach((f) => {
    if (!f.endsWith(".json")) return;
    const id = f.slice(0, -5);
    const where = "assets/themes/" + template + "/" + f;

    if (!ID_RE.test(id)) {
      return say("id:" + where, "[themes] ignoring " + where +
        ": a theme id must be lowercase letters, digits and dashes.");
    }
    if (schema.RESERVED_THEMES.indexOf(id) >= 0) {
      return say("reserved:" + where, "[themes] ignoring " + where + ': "' + id +
        '" is reserved — cognigy-default composes to nothing on purpose and ' +
        "custom's tokens live in demo.json. Give the file another name.");
    }

    // load() reports its own JSON parse errors and caches by mtime.
    const theme = load(id, template);
    if (!theme) return;

    entries.push({
      id: id,
      name: String(theme.name || titleize(id)),
      note: String(theme.note || ""),
      swatch: swatchFor(theme)
    });
  });
  return entries;
}

// Every endpoint at once, for GET /api/themes.
function catalogAll() {
  const out = {};
  schema.TEMPLATES.forEach((t) => { out[t] = catalog(t); });
  return out;
}

/*
 * Teach the shared schema about the themes on disk, so sanitize() keeps a
 * preset that has a file instead of falling back to the endpoint's first theme.
 * Idempotent; logs only what was genuinely new.
 */
function syncSchema() {
  schema.TEMPLATES.forEach((template) => {
    schema.registerThemes(template, catalog(template).map((e) => e.id)).forEach((id) => {
      console.log("[themes] registered " + template + "/" + id + ".json");
    });
  });

  // A theme dropped into a directory that is not an endpoint is invisible, and
  // looks exactly like the bug this replaced. Name it.
  let dirs;
  try { dirs = fs.readdirSync(THEMES_DIR, { withFileTypes: true }); } catch (e) { return; }
  dirs.forEach((e) => {
    if (!e.isDirectory() || schema.TEMPLATES.indexOf(e.name) >= 0) return;
    say("dir:" + e.name, "[themes] assets/themes/" + e.name + "/ is not an endpoint, so " +
      "nothing in it is registered. Endpoints are: " + schema.TEMPLATES.join(", ") + ".");
  });
}

// Which endpoints ship a file for this id — themes are namespaced, so the same
// id can exist for one endpoint and not another.
function templatesWith(id) {
  if (!ID_RE.test(String(id || ""))) return [];
  return schema.TEMPLATES.filter((t) => {
    try { return fs.statSync(path.join(dirFor(t), id + ".json")).isFile(); }
    catch (e) { return false; }
  });
}

/*
 * sanitize() dropped a theme preset. Say why.
 *
 * The fallback itself is correct and has to stay silent inside sanitize() —
 * that function runs on every read and every write and must stay pure — so the
 * explaining happens here, at the store's edges, where there is a demo to name.
 */
function warnDropped(asked, template, fallback, slug) {
  const id = String(asked || "");
  if (!id) return;

  const elsewhere = templatesWith(id).filter((t) => t !== template);
  const retired = (schema.RETIRED_THEMES || {})[template] || [];
  let why;
  if (retired.indexOf(id) >= 0) {
    // Retired on purpose, so "drop a file in" would be the wrong advice: the
    // name referred to a CognigyWindowThemeBuilder preset applied on the
    // Endpoint, which Demo Studio never composed anything for. Nothing about
    // the demo LOOKS different for having been moved off it.
    why = '"' + id + '" was a CognigyWindowThemeBuilder preset name, styled on the Endpoint — ' +
      "Demo Studio never applied it, so the demo renders exactly as it did. " +
      "Set that theme on the Webchat Endpoint in Cognigy instead.";
  } else if (elsewhere.length) {
    why = "its file is under assets/themes/" + elsewhere.join("/ and assets/themes/") +
      "/, not assets/themes/" + template + "/ — themes are per endpoint.";
  } else if (schema.RESERVED_THEMES.indexOf(id) >= 0) {
    why = '"' + id + '" is not offered on this endpoint.';
  } else if (templatesWith(id).length) {
    why = "assets/themes/" + template + "/" + id + ".json exists but could not be read " +
      "— see the [themes] error above.";
  } else {
    why = "no theme file at assets/themes/" + template + "/" + id + ".json. " +
      "Drop one in and it registers itself.";
  }

  say("drop:" + slug + ":" + template + ":" + id,
    '[themes] demo "' + slug + '" asks for theme "' + id + '" on ' + template +
    ', which is not registered — saved as "' + fallback + '" instead. ' + why);
}

// Back-compat: the ids alone, which is all this ever returned.
function list(template) {
  return catalog(template).map((e) => e.id);
}

module.exports = {
  styleFor, load, list,
  catalog, catalogAll, syncSchema, templatesWith, warnDropped
};
