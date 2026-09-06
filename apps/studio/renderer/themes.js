/*
 * Cognigy Demo Studio — the theme catalogue the demo form picks from.
 *
 * Names and order come from packages/shared/demo-schema.js THEMES; this file
 * adds only what a *picker* needs — a human label, one line of description, and
 * a few swatches to render a tile. The actual token values live in
 * assets/themes/<endpoint>/<id>.json and are applied by the service, not here.
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
  var WEBRTC = [
    { id: "bar",  name: "Bar",  note: "Wide dock across the foot of the page, with a waveform.", swatch: ["#ffffff", "#12b39a", "#d92d3c"] },
    { id: "pill", name: "Pill", note: "Compact capsule, centred. The smallest footprint.",       swatch: ["#ffffff", "#111827", "#f2564f"] },
    { id: "card", name: "Card", note: "Modal card with an orb — the most present of the three.", swatch: ["#ffffff", "#8b5cf6", "#f2564f"] }
  ];

  /*
   * Combined layouts. Cognigy Default here means BOTH of Cognigy's own widgets.
   *
   * "nebula" also exists in the Webchat list above — a CognigyWindowThemeBuilder
   * preset — and is an entirely different theme applied by an entirely different
   * mechanism. The theme FILES are namespaced by endpoint for exactly this
   * reason; the ids only have to be unique within a list.
   */
  var COMBO = [
    { id: "nebula",  name: "Nebula",  note: "Immersive dark glass. A luminous orb is the centrepiece, transcript beneath.",
      swatch: ["#0b1020", "#6ea8ff", "#c4b5fd"] },
    { id: "halo",    name: "Halo",    note: "White and vertical. Call status, transcript, then the xApp embedded below it.",
      swatch: ["#ffffff", "#3b82f6", "#e3e9f5"] },
    { id: "horizon", name: "Horizon", note: "Wide, across the lower page. Transcript left, xApp right, toolbars top and bottom.",
      swatch: ["#ffffff", "#0f5f5c", "#9cedd1"] },
    { id: "prism",   name: "Prism",   note: "Compact assistant with the xApp as a separate companion card beside it.",
      swatch: ["#faf8ff", "#6d28d9", "#c4b5fd"] }
  ];

  var BY_TEMPLATE = {
    "webchat": WEBCHAT,
    "webrtc": WEBRTC,
    "webchat-webrtc": COMBO
  };

  /*
   * The list for one endpoint, in display order: Cognigy Default, then a rule,
   * then that endpoint's themes, then Custom. The rule is a real entry so the
   * picker doesn't have to know where to draw it.
   */
  function listFor(template) {
    var themes = BY_TEMPLATE[template] || WEBCHAT;
    return [DEFAULT_ENTRY, { rule: true }].concat(themes, [{ rule: true }, CUSTOM_ENTRY]);
  }

  function get(id, template) {
    var all = [DEFAULT_ENTRY, CUSTOM_ENTRY].concat(BY_TEMPLATE[template] || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return DEFAULT_ENTRY;
  }

  root.CDSThemes = {
    listFor: listFor,
    get: get,
    DEFAULT_ID: DEFAULT_ENTRY.id
  };
})(typeof self !== "undefined" ? self : this);
