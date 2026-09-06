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

const THEMES_DIR = path.join(__dirname, "..", "..", "..", "assets", "themes");

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
    console.error("[themes] " + key + ".json is not valid JSON:", err.message);
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

function list(template) {
  try {
    return fs.readdirSync(path.join(THEMES_DIR, template))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch (e) {
    return [];
  }
}

module.exports = { styleFor, load, list };
