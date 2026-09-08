/*
 * Cognigy Demo Studio — the theme catalogue the demo form picks from.
 *
 * A tile needs three things a token file doesn't: a human label, one line of
 * description, and a few swatches. Those come from the theme file itself —
 * assets/themes/<endpoint>/<id>.json carries name and note, and the service
 * derives the swatch from the theme's own tokens — fetched through
 * GET /api/themes by load() below. So adding a theme is adding that one file;
 * there is nothing to add here.
 *
 * The table in this file is what remains after that: the entries that have no
 * file and never will. Cognigy Default composes to nothing on purpose, Custom
 * lives in demo.json, and the nine Webchat presets are
 * CognigyWindowThemeBuilder names styled on the Endpoint — Demo Studio ships no
 * CSS for any of them, so nothing on disk could describe them. It is also what
 * paints before the fetch lands, and if the fetch fails.
 *
 * Kept as a separate script (no build step in this dashboard) so the picker and
 * anything later — a Theme Designer, an export — read one list.
 */
(function (root) {
  "use strict";

  /* Cognigy's own presentation. First in every list, and the one theme where
     Demo Studio contributes nothing: the widget is styled on the Endpoint. */
  var DEFAULT_ENTRY = {
    id: "cognigy-default",
    name: "Cognigy Default",
    note: "Cognigy's own widget, styled on the Endpoint. Demo Studio adds nothing.",
    swatch: ["#ffffff", "#3694fc", "#e2e8f0"]
  };

  var CUSTOM_ENTRY = {
    id: "custom",
    name: "Custom",
    note: "Starts as a copy of the selected theme. Edit its tokens by vibe-coding.",
    swatch: ["#f2f0eb", "#6100ff", "#00e2a0"],
    custom: true
  };

  /*
   * Webchat themes are the presets CognigyWindowThemeBuilder already ships.
   * They are CSS applied to Cognigy's real v3 widget — not a replacement for
   * it — so picking one never changes which chat renders.
   */
  var WEBCHAT = [
    { id: "aurora",    name: "Aurora",    note: "Blurple, soft gradients.",        swatch: ["#5865f2", "#404eed", "#f6f6fe"] },
    { id: "tech",      name: "Tech",      note: "Emerald on slate, dev-tool feel.", swatch: ["#10b981", "#1e293b", "#f1f5f9"] },
    { id: "bloom",     name: "Bloom",     note: "Violet and pink, friendly.",       swatch: ["#8b5cf6", "#ec4899", "#faf5ff"] },
    { id: "hibiscus",  name: "Hibiscus",  note: "Coral red, editorial.",            swatch: ["#e11d48", "#881337", "#fff1f2"] },
    { id: "trailhead", name: "Trailhead", note: "Forest green and cream.",          swatch: ["#166534", "#84cc16", "#fefce8"] },
    { id: "minimal",   name: "Minimal",   note: "Monochrome, no gradients, sharp.", swatch: ["#111827", "#6b7280", "#ffffff"] },
    { id: "nebula",    name: "Nebula",    note: "Purple to magenta, cosmic.",       swatch: ["#7c3aed", "#d946ef", "#1e1b4b"] },
    { id: "sunset",    name: "Sunset",    note: "Warm orange to pink header.",      swatch: ["#f97316", "#ec4899", "#fff7ed"] },
    { id: "ivory",     name: "Ivory",     note: "Cream and ink, luxury editorial.", swatch: ["#f5f0e6", "#1c1917", "#a8a29e"] }
  ];

  /*
   * WebRTC shells. Live transcript is a separate toggle, not three more themes,
   * so each of these works with it on or off.
   */
  /*
   * WebRTC. Cognigy Default is Cognigy's own click-to-call widget; Halo is the
   * voice shell Demo Studio draws. Bar, Pill and Card were removed — once the
   * real widget was being mounted, all three did was recolour it, so the names
   * promised layouts nothing produced.
   */
  var WEBRTC = [
    { id: "halo", name: "Halo", note: "White and vertical. Call status, live transcript, Mute and Call.",
      swatch: ["#ffffff", "#087aff", "#eef4fc"] }
  ];

  /*
   * Combined layouts. Cognigy Default here means BOTH of Cognigy's own widgets.
   *
   * "nebula" also exists in the Webchat list above — a CognigyWindowThemeBuilder
   * preset — and is an entirely different theme applied by an entirely different
   * mechanism. The theme FILES are namespaced by endpoint for exactly this
   * reason; the ids only have to be unique within a list.
   */
  /*
   * Combined layouts. One design, plus Custom.
   *
   * Nebula, Horizon and Prism were removed: each was a token file with no
   * layout behind it, so picking one restyled a few colours and left the same
   * shell. Cognigy Default is gone too — for the combination it means BOTH of
   * Cognigy's own widgets stacked, and the host page that mounts them does not
   * exist yet. They come back when there is something behind the name.
   */
  var COMBO = [
    { id: "halo", name: "Halo", note: "White and vertical. Identity up top, Chat and Voice in one panel, live transcript.",
      swatch: ["#ffffff", "#087aff", "#eef4fc"] }
  ];

  var BY_TEMPLATE = {
    "webchat": WEBCHAT,
    "webrtc": WEBRTC,
    "webchat-webrtc": COMBO
  };

  /* What GET /api/themes found on disk, by endpoint. Empty until load(). */
  var DISCOVERED = {};

  /*
   * The built-in table with the files on disk merged over it.
   *
   * A file WINS for an entry that is in both, because the file is the theme:
   * Halo's name and note are already written in its own halo.json, and
   * two copies of the same sentence is how they drift. A file with no built-in
   * entry is APPENDED, matching where demo-schema.registerThemes puts it, so
   * the first tile stays the theme an unset demo actually gets.
   */
  function mergedFor(template) {
    var out = (BY_TEMPLATE[template] || WEBCHAT).slice();
    (DISCOVERED[template] || []).forEach(function (found) {
      for (var i = 0; i < out.length; i++) {
        if (out[i].id === found.id) { out[i] = found; return; }
      }
      out.push(found);
    });
    return out;
  }

  /*
   * Refresh from the service. Resolves to true when the catalogue changed, so
   * the caller can repaint a picker that is already on screen; never rejects,
   * because a dashboard that can't reach /api/themes should still show the
   * built-in themes rather than an empty Theme section.
   */
  function load() {
    return fetch("/api/themes").then(function (r) { return r.json(); }).then(function (j) {
      var next = (j && j.themes) || {};
      var changed = JSON.stringify(next) !== JSON.stringify(DISCOVERED);
      DISCOVERED = next;
      return changed;
    }).catch(function () { return false; });
  }

  /*
   * The list for one endpoint, in display order: Cognigy Default, then a rule,
   * then that endpoint's themes, then Custom. The rule is a real entry so the
   * picker doesn't have to know where to draw it.
   */
  function listFor(template) {
    var themes = mergedFor(template);
    /*
     * The combination has no Cognigy Default — it would mean both of Cognigy's
     * own widgets stacked, and nothing mounts them yet. Offering it would be a
     * tile that silently renders something else. Kept in step with THEMES in
     * packages/shared/demo-schema.js, which is the source of truth.
     */
    if (template === "webchat-webrtc") {
      return themes.concat([{ rule: true }, CUSTOM_ENTRY]);
    }
    /*
     * WebRTC leads with Halo and keeps Cognigy Default below the rule. The
     * order here has to match THEMES in packages/shared/demo-schema.js, or the
     * tile shown first is not the one an unset demo actually gets.
     */
    if (template === "webrtc") {
      return themes.concat([{ rule: true }, DEFAULT_ENTRY, CUSTOM_ENTRY]);
    }
    return [DEFAULT_ENTRY, { rule: true }].concat(themes, [{ rule: true }, CUSTOM_ENTRY]);
  }

  function get(id, template) {
    var all = [DEFAULT_ENTRY, CUSTOM_ENTRY].concat(mergedFor(template));
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return DEFAULT_ENTRY;
  }

  root.CDSThemes = {
    listFor: listFor,
    load: load,
    get: get,
    // The theme an unset demo on this endpoint actually gets: the first entry,
    // matching pickTheme() in demo-schema.js. Not DEFAULT_ID — the combination
    // does not offer Cognigy Default, so falling back to it there picks a theme
    // the picker can't show and the schema replaces on save.
    defaultFor: function (template) {
      var list = listFor(template);
      for (var i = 0; i < list.length; i++) if (list[i].id) return list[i].id;
      return DEFAULT_ENTRY.id;
    },
    DEFAULT_ID: DEFAULT_ENTRY.id
  };
})(typeof self !== "undefined" ? self : this);
