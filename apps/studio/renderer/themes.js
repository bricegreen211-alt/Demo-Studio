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
 * file and never will. Cognigy Default composes to nothing on purpose and Custom
 * lives in demo.json, so nothing on disk could describe either. It is also what
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
   * Custom means something different on Webchat, so the tile has to say so.
   * Everywhere else it is CSS tokens over a theme Demo Studio draws; on Webchat
   * the widget is Cognigy's and untouchable by CSS from here, so Custom is its
   * own colour options (theme.custom.colors) handed to initWebchat instead.
   * "Starts as a copy of the selected theme" would be doubly wrong there — the
   * only other theme is Cognigy Default, which is a copy of nothing.
   */
  var CUSTOM_NOTE = {
    "webchat": "Cognigy's widget in your own colours, hand-edited in demo.json."
  };

  /*
   * Webchat: Cognigy Default and Custom, which listFor() adds around this list.
   *
   * Aurora, Tech, Bloom, Hibiscus, Trailhead, Minimal, Nebula, Sunset and Ivory
   * were removed. They were CognigyWindowThemeBuilder preset NAMES whose styling
   * lives on the Endpoint, so Demo Studio composed nothing for any of them —
   * nine tiles with swatches and descriptions that all rendered identically to
   * Cognigy Default. A tile that promises a look and delivers the default one is
   * worse than no tile, which is the same call made for Bar, Pill and Card below.
   *
   * Empty rather than deleted: a theme dropped into assets/themes/webchat/ still
   * merges in here through mergedFor(), so the real theme mechanism the next
   * version builds has somewhere to land with no edit to this file.
   */
  var WEBCHAT = [];

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
   * Theme FILES are namespaced by endpoint, so the same id can mean entirely
   * different things on two endpoints and be applied by entirely different
   * mechanisms; ids only have to be unique within one list.
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
    // Same tile, endpoint-specific sentence where Custom does a different job.
    var custom = CUSTOM_NOTE[template]
      ? Object.assign({}, CUSTOM_ENTRY, { note: CUSTOM_NOTE[template] })
      : CUSTOM_ENTRY;
    /*
     * The combination has no Cognigy Default — it would mean both of Cognigy's
     * own widgets stacked, and nothing mounts them yet. Offering it would be a
     * tile that silently renders something else. Kept in step with THEMES in
     * packages/shared/demo-schema.js, which is the source of truth.
     */
    if (template === "webchat-webrtc") {
      return themes.concat([{ rule: true }, custom]);
    }
    /*
     * WebRTC used to lead with Halo and put Cognigy Default below the rule,
     * on the theory that picker order had to match THEMES in
     * packages/shared/demo-schema.js so the tile shown first was the one an
     * unset demo actually got. That coupling was never real: an unset demo's
     * theme comes from themesFor(template)[0] in the schema, which this file
     * never reads — get() and listFor() only ever consult mergedFor(), so the
     * picker's display order and the schema's default are independent. Halo
     * stays the default for a new WebRTC demo (THEMES.webrtc still leads with
     * it); only where it's shown in the LIST changes here, falling through to
     * the same Default-first order every other endpoint uses.
     */
    /*
     * With no themes between them the two rules would stack into a double
     * divider — which is exactly the Webchat case now that its presets are
     * gone, and would be any endpoint's case before its first theme file is
     * dropped in. One rule, one gap.
     */
    if (!themes.length) return [DEFAULT_ENTRY, { rule: true }, custom];
    return [DEFAULT_ENTRY, { rule: true }].concat(themes, [{ rule: true }, custom]);
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
