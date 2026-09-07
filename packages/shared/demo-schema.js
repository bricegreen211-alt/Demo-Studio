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

  /*
   * Which chat UI a demo renders. NOT chosen any more — derived from the theme
   * (see sanitize). "Cognigy Default" means Cognigy's own widget; any other
   * theme means the demo draws its own UI.
   *   webchat3 — the real Cognigy Webchat v3 widget. How it looks comes from
   *              the Cognigy Endpoint.
   *   studio   — the hand-built React chat in the demo's own source; the only
   *              path that supports simulated "mock" demos
   */
  var CHAT_UIS = ["webchat3", "studio"];

  /*
   * Themes, per endpoint. The first entry is always Cognigy's own presentation
   * and is what "no theme" means; "custom" is the vibe-code slot and is offered
   * everywhere.
   *
   *   webchat        — the presets CognigyWindowThemeBuilder already ships, so
   *                    its exported { version, name, light, dark? } JSON drops
   *                    straight in rather than being re-authored.
   *   webrtc         — three shells. Live transcript is a separate toggle
   *                    (showTranscript), not three more themes.
   *   webchat-webrtc — four combined layouts. Note "nebula" appears in BOTH
   *                    this list and the webchat one and is a different theme
   *                    in each, which is why the files are namespaced by
   *                    endpoint under assets/themes/<endpoint>/.
   */
  var COGNIGY_DEFAULT = "cognigy-default";
  var THEMES = {
    "webchat": [COGNIGY_DEFAULT, "aurora", "tech", "bloom", "hibiscus", "trailhead",
                "minimal", "nebula", "sunset", "ivory", "custom"],
    "webrtc": [COGNIGY_DEFAULT, "bar", "pill", "card", "custom"],
    /*
     * One design, plus Custom. Nebula, Horizon and Prism were token files with
     * no layout behind them, so choosing one moved a few colours and nothing
     * else; Cognigy Default needed a host page mounting BOTH of Cognigy's own
     * widgets, which does not exist. Rather than leave four entries that do
     * not do what their names say, the picker offers what works. The others
     * come back when there is a layout to go with them.
     */
    "webchat-webrtc": ["halo", "custom"]
  };

  // Greeting on connect, or a button the visitor presses first. Cognigy's own
  // "Starting Behavior" vocabulary, so nothing has to be re-learned.
  var START_BEHAVIORS = ["greeting", "button"];

  function themesFor(template) {
    return THEMES[template] || THEMES["webchat"];
  }

  /*
   * An unknown theme falls back to the FIRST entry for that endpoint, not to
   * COGNIGY_DEFAULT — the combination no longer offers Cognigy Default, and a
   * fallback that is not in its own list would persist an invalid value on
   * every read.
   */
  function pickTheme(value, template) {
    var list = themesFor(template);
    return list.indexOf(value) >= 0 ? value : list[0];
  }

  // Cognigy Default is the one theme where Demo Studio contributes nothing.
  function isCognigyDefault(cfg) {
    return !cfg || !cfg.theme || (cfg.theme.preset || COGNIGY_DEFAULT) === COGNIGY_DEFAULT;
  }

  // The combination is doubled to match Halo's own default panel. The other two
  // are Cognigy's widgets, which size themselves, so they are unchanged.
  var DEFAULT_PANEL_WIDTH = { "webchat": 420, "webrtc": 400, "webchat-webrtc": 1000 };
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
      // clear is the honest default: the frame paints nothing, so a demo looks
      // like the customer's own deployment rather than like our drawer.
      panelStyle: "clear",
      panelWidth: 0,           // 0 = template default
      launcher: "",            // "" = template default
      launcherText: "",
      showLauncherText: true,
      launcherSize: "medium",
      launcherImage: "",       // uploaded launcher art, relative to the demo folder
      agentName: "AI Assistant",
      welcomeMessage: "",
      /*
       * Cognigy's Home Screen "Conversation Starters" — the prompts that help a
       * visitor begin. Cognigy allows five; the form offers three, which is what
       * fits a demo panel without crowding the welcome message.
       */
      starters: [],
      // Cognigy's "Starting Behavior" and "Teaser Message".
      startingBehavior: "greeting",
      teaserMessage: "",
      // WebRTC live transcript. A toggle rather than a separate theme, so it
      // works the same in every voice shell.
      showTranscript: true,
      // DEPRECATED — Follow Me is now global, in settings.json as
      // followMeUserId. Kept in the schema on purpose: sanitize() runs on
      // every read AND every write, so dropping the field would silently
      // rewrite every demo.json on disk the next time anything saved. Nothing
      // reads it any more; the service migrates a non-default value once.
      userId: "followme",
      cognigy: { chatEndpoint: "", voiceEndpoint: "" },
      theme: {
        preset: COGNIGY_DEFAULT,
        primaryColor: "#3694fc",
        secondaryColor: "#f1f5f9",
        logo: "",
        /*
         * The "Custom" slot. Lives here rather than in the demo's src/ because
         * demo.json is the only per-demo file Sync preserves (store.js
         * replaceSrc keeps it explicitly) — anything in src/ is backed up and
         * replaced. tokens override the template's :root; css is a free block
         * appended after it.
         */
        custom: { tokens: {}, css: "" }
      },
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
      /*
       * Still webchat-only, deliberately. "Cognigy Default" on the combination
       * means BOTH real widgets — v3 for chat and click-to-call for voice — and
       * the host page that mounts both does not exist yet. Opening this to
       * "webchat-webrtc" before it does would serve webchat3.html on its own and
       * silently drop the voice half. Change this line together with that page,
       * not before.
       */
      && cfg.template === "webchat"
      && (cfg.panelStyle || "solid") !== "overlay"
      && !isMock;
  }

  /*
   * Whether a demo is served by Cognigy's real click-to-call widget.
   *
   * WebRTC demos used to render Demo Studio's own voice UI on the headless SDK
   * in every theme, so the widget the SE is actually demoing — the one the
   * customer would deploy — never appeared in a demo at all. It only ever
   * showed up in Remote Control's pop-out. The giveaway was in the themes:
   * every file in assets/themes/webrtc/ carries all 12 documented --webrtc-*
   * variables, and they were being injected into a page that had no widget to
   * style.
   *
   * So the theme is CSS applied to Cognigy's widget, never a replacement for
   * it, and picking one does not change which UI renders — exactly the rule
   * that already holds on the Webchat side.
   *
   * Not folded into sanitize(), for the same reason usesWebchat3 isn't: the
   * endpoint can flip mock <-> real on its own, so only code holding a current
   * config can answer.
   */
  function usesVoiceWidget(cfg) {
    if (!cfg) return false;
    var ep = (cfg.cognigy && cfg.cognigy.voiceEndpoint) || "";
    var isMock = String(ep).trim().toLowerCase() === "mock";
    return cfg.template === "webrtc"
      // An overlay launcher is always drawn by the demo's own src/shell/, so
      // it can never be Cognigy's widget.
      && (cfg.panelStyle || "solid") !== "overlay"
      // "mock" is the scripted offline call the Samples run on. There is no
      // endpoint for a real widget to connect to, so those keep our own UI.
      && !isMock;
  }

  /*
   * Either of Cognigy's own widgets floats on the page under its own steam, so
   * the extension hands it a bare transparent frame and clips that frame,
   * instead of drawing a launcher and panel of its own.
   *
   * The wire value stays "webchat3" (see /api/resolve): it names the MOUNT MODE
   * — bare clipped frame for a Cognigy-owned widget — not the channel. Keeping
   * it means a WebRTC demo works on an already-installed extension with no
   * reload, and both widgets speak the same CDS_WC3_CLIP protocol anyway.
   */
  function usesCognigyWidget(cfg) {
    return usesWebchat3(cfg) || usesVoiceWidget(cfg);
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
      launcherImage: String(input.launcherImage || ""),
      agentName: String(input.agentName || d.agentName),
      welcomeMessage: String(input.welcomeMessage || ""),
      // Up to three, trimmed, blanks dropped — an empty box in the form must
      // not become an empty starter chip in the demo.
      starters: (Array.isArray(input.starters) ? input.starters : [])
        .map(function (s) { return String(s || "").slice(0, 120).trim(); })
        .filter(Boolean)
        .slice(0, 3),
      startingBehavior: pick(input.startingBehavior, START_BEHAVIORS, d.startingBehavior),
      teaserMessage: String(input.teaserMessage || "").slice(0, 200),
      showTranscript: input.showTranscript !== false,
      userId: String(input.userId || d.userId), // deprecated, see defaults()
      cognigy: {
        chatEndpoint: String((input.cognigy && input.cognigy.chatEndpoint) || ""),
        voiceEndpoint: String((input.cognigy && input.cognigy.voiceEndpoint) || "")
      },
      theme: {
        // Validated against the list for THIS template, so switching endpoint
        // can't leave a theme selected that doesn't exist there.
        preset: pickTheme((input.theme && input.theme.preset) || d.theme.preset,
                          pick(input.template, TEMPLATES, d.template)),
        primaryColor: String((input.theme && input.theme.primaryColor) || d.theme.primaryColor),
        secondaryColor: String((input.theme && input.theme.secondaryColor) || d.theme.secondaryColor),
        logo: String((input.theme && input.theme.logo) || ""),
        custom: {
          tokens: (input.theme && input.theme.custom && typeof input.theme.custom.tokens === "object" &&
                   input.theme.custom.tokens) || {},
          css: String((input.theme && input.theme.custom && input.theme.custom.css) || "")
        }
      },
      createdAt: String(input.createdAt || ""),
      updatedAt: String(input.updatedAt || "")
    };
    if (!out.launcher) out.launcher = DEFAULT_LAUNCHER[out.template];
    if (!out.panelWidth) out.panelWidth = DEFAULT_PANEL_WIDTH[out.template];

    /*
     * chatUi is DERIVED, never chosen. It used to be a radio in the form, which
     * was confusing because it was really a consequence of the endpoint and the
     * theme:
     *
     *   webchat          -> always Cognigy's real v3 widget. Every Webchat theme
     *                       is CSS applied to that widget, not a replacement for
     *                       it, so the theme never changes which UI renders.
     *   webrtc           -> no chat at all.
     *   webchat-webrtc   -> Cognigy Default means both of Cognigy's own widgets;
     *                       any other theme means the demo draws its own UI,
     *                       which is the only thing those themes can style.
     *
     * An overlay launcher is always drawn by the demo's own src/shell/, so it
     * can never be Cognigy's widget.
     *
     * Note the consequence for demos made under the old form: a Webchat demo
     * that had chatUi pinned to "studio" now renders Cognigy's widget instead,
     * because a Webchat endpoint no longer has a built-in-chat option — every
     * Webchat theme styles the real widget. That is the redesign working as
     * intended rather than a migration bug, but it is a visible change to an
     * existing demo, so the service logs it once at start (migrateChatUi in
     * server.js) instead of letting it happen quietly.
     *
     * This block is deliberately pure: sanitize() runs on every read AND every
     * write, so anything conditional on "was this field present in the input"
     * would make it non-idempotent — the first read writes the field, and the
     * second read then sees it and decides differently.
     */
    if (out.template === "webrtc") {
      out.chatUi = "studio";
    } else if (out.template === "webchat") {
      out.chatUi = "webchat3";
    } else {
      out.chatUi = isCognigyDefault(out) ? "webchat3" : "studio";
    }
    if (out.panelStyle === "overlay") out.chatUi = "studio";

    /*
     * The combination is always overlay. Halo ships its own launcher and card,
     * so any other style would have the extension draw a second launcher right
     * beside it. Coerced rather than offered, the same way chatUi is: it is a
     * structural consequence of the design, not a preference.
     *
     * This DOES rewrite existing combination demos that were set to clear or
     * solid. That is the visible half of the change and is reported at start
     * (reportChatUiChanges in server.js) rather than happening quietly.
     */
    if (out.template === "webchat-webrtc") out.panelStyle = "overlay";
    return out;
  }

  return {
    TEMPLATES: TEMPLATES,
    LAUNCHERS: LAUNCHERS,
    SIDES: SIDES,
    SIZES: SIZES,
    PANEL_STYLES: PANEL_STYLES,
    CHAT_UIS: CHAT_UIS,
    THEMES: THEMES,
    COGNIGY_DEFAULT: COGNIGY_DEFAULT,
    START_BEHAVIORS: START_BEHAVIORS,
    DEFAULT_PANEL_WIDTH: DEFAULT_PANEL_WIDTH,
    DEFAULT_LAUNCHER: DEFAULT_LAUNCHER,
    defaults: defaults,
    sanitize: sanitize,
    themesFor: themesFor,
    isCognigyDefault: isCognigyDefault,
    usesWebchat3: usesWebchat3,
    usesVoiceWidget: usesVoiceWidget,
    usesCognigyWidget: usesCognigyWidget
  };
});
