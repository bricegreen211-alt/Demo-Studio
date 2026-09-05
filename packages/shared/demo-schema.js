/*
 * Cognigy Demo Studio — demo.json schema defaults + sanitizer.
 * The demo.json in each demo folder is the single source of truth the
 * dashboard form writes and the demo experience reads at runtime.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CdsDemoSchema = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TEMPLATES = ["webchat", "webrtc", "webchat-webrtc"];
  var LAUNCHERS = ["ai-orb", "ai-spark", "voice-wave", "chat"];
  var SIDES = ["left", "right"];
  var SIZES = ["small", "medium", "large"];
  /*
   * How the frame renders over the customer's website. Only two the SE picks,
   * because the frame's whole job is to get out of Cognigy Webchat v3's way:
   *   solid — the frame expands into a full-height drawer when the chat opens
   *   clear — the frame paints nothing, so Cognigy's own launcher and window
   *           float on the customer's site as if they'd deployed it themselves
   *
   * overlay stays valid but only means anything for the built-in chat UI, where
   * the demo's own src/shell/ draws the launcher and card.
   */
  var PANEL_STYLES = ["solid", "clear", "overlay"];

  /*
   * Retired styles, mapped to the nearest survivor. Aliasing rather than
   * dropping matters because sanitize() runs on every read AND every write: an
   * unknown value gets silently rewritten to "solid" the next time anything
   * saves the demo — including POST /api/demos/:id/panel, the drag-resize
   * handler, which no SE would think of as a config change.
   */
  var PANEL_STYLE_ALIASES = { phone: "solid", "solid-lower": "solid", opaque: "clear" };

  // Which chat UI a demo renders:
  //   webchat3 — the real Cognigy Webchat v3 widget (default). How it looks is
  //              configured on the Cognigy Endpoint, never here.
  //   studio   — the hand-built React chat in the demo's own source; the only
  //              path that supports simulated "mock" demos
  var CHAT_UIS = ["webchat3", "studio"];

  var DEFAULT_PANEL_WIDTH = { "webchat": 420, "webrtc": 400, "webchat-webrtc": 500 };
  var DEFAULT_LAUNCHER = { "webchat": "ai-orb", "webrtc": "voice-wave", "webchat-webrtc": "ai-orb" };

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function pickPanelStyle(value, fallback) {
    var v = PANEL_STYLE_ALIASES[value] || value;
    return PANEL_STYLES.indexOf(v) >= 0 ? v : fallback;
  }

  function defaults() {
    return {
      id: "",
      name: "",
      website: "",
      folder: "",
      template: "webchat",
      chatUi: "webchat3",
      panelSide: "right",
      panelStyle: "solid",
      panelWidth: 0,           // 0 = template default
      launcher: "",            // "" = template default
      launcherText: "",
      showLauncherText: true,
      launcherSize: "medium",
      agentName: "AI Assistant",
      welcomeMessage: "",
      // DEPRECATED — Follow Me is now global, in settings.json as
      // followMeUserId. Kept in the schema on purpose: sanitize() runs on
      // every read AND every write, so dropping the field would silently
      // rewrite every demo.json on disk the next time anything saved. Nothing
      // reads it any more; the service migrates a non-default value once.
      userId: "followme",
      cognigy: { chatEndpoint: "", voiceEndpoint: "" },
      theme: { primaryColor: "#3694fc", secondaryColor: "#f1f5f9", logo: "" },
      createdAt: "",
      updatedAt: ""
    };
  }

  /*
   * Whether a demo is actually served by the real Webchat v3 widget.
   *
   * Deliberately not folded into sanitize(): the template and panelStyle
   * constraints ARE coerced there, because they're structural, but the "mock"
   * check can't be — the endpoint field can flip mock <-> real on its own, so
   * only the code holding a current config can decide. Shared from here so the
   * service, preflight and the dashboard can't drift apart on the answer.
   */
  function usesWebchat3(cfg) {
    if (!cfg) return false;
    var ep = (cfg.cognigy && cfg.cognigy.chatEndpoint) || "";
    var isMock = String(ep).trim().toLowerCase() === "mock";
    return cfg.chatUi === "webchat3"
      && cfg.template === "webchat"
      && (cfg.panelStyle || "solid") !== "overlay"
      && !isMock;
  }

  // Merge arbitrary input onto the defaults, keeping only known fields sane.
  function sanitize(input) {
    input = input || {};
    var d = defaults();
    var out = {
      id: String(input.id || d.id),
      name: String(input.name || d.name),
      website: String(input.website || ""),
      folder: String(input.folder || "").slice(0, 80),
      template: pick(input.template, TEMPLATES, d.template),
      chatUi: pick(input.chatUi, CHAT_UIS, d.chatUi),
      panelSide: pick(input.panelSide, SIDES, d.panelSide),
      panelStyle: pickPanelStyle(input.panelStyle, d.panelStyle),
      panelWidth: Math.max(0, Math.min(1200, parseInt(input.panelWidth, 10) || 0)),
      launcher: pick(input.launcher, LAUNCHERS, ""),
      launcherText: String(input.launcherText || ""),
      showLauncherText: input.showLauncherText !== false,
      launcherSize: pick(input.launcherSize, SIZES, d.launcherSize),
      agentName: String(input.agentName || d.agentName),
      welcomeMessage: String(input.welcomeMessage || ""),
      userId: String(input.userId || d.userId), // deprecated, see defaults()
      cognigy: {
        chatEndpoint: String((input.cognigy && input.cognigy.chatEndpoint) || ""),
        voiceEndpoint: String((input.cognigy && input.cognigy.voiceEndpoint) || "")
      },
      theme: {
        primaryColor: String((input.theme && input.theme.primaryColor) || d.theme.primaryColor),
        secondaryColor: String((input.theme && input.theme.secondaryColor) || d.theme.secondaryColor),
        logo: String((input.theme && input.theme.logo) || "")
      },
      createdAt: String(input.createdAt || ""),
      updatedAt: String(input.updatedAt || "")
    };
    if (!out.launcher) out.launcher = DEFAULT_LAUNCHER[out.template];
    if (!out.panelWidth) out.panelWidth = DEFAULT_PANEL_WIDTH[out.template];
    // Webchat v3 replaces the whole panel body, so it can't coexist with the
    // voice half or with an overlay launcher drawn by the demo's own source.
    // Coerced here rather than at the route so the invalid combination can't
    // be represented in demo.json at all.
    if (out.template !== "webchat" || out.panelStyle === "overlay") out.chatUi = "studio";
    return out;
  }

  return {
    TEMPLATES: TEMPLATES,
    LAUNCHERS: LAUNCHERS,
    SIDES: SIDES,
    SIZES: SIZES,
    PANEL_STYLES: PANEL_STYLES,
    CHAT_UIS: CHAT_UIS,
    DEFAULT_PANEL_WIDTH: DEFAULT_PANEL_WIDTH,
    DEFAULT_LAUNCHER: DEFAULT_LAUNCHER,
    defaults: defaults,
    sanitize: sanitize,
    usesWebchat3: usesWebchat3
  };
});
