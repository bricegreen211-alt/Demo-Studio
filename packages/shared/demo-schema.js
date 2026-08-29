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
  var LAUNCHERS = ["ai-orb", "ai-spark", "voice-wave"];
  var SIDES = ["left", "right"];
  var SIZES = ["small", "medium", "large"];

  var DEFAULT_PANEL_WIDTH = { "webchat": 420, "webrtc": 400, "webchat-webrtc": 500 };
  var DEFAULT_LAUNCHER = { "webchat": "ai-orb", "webrtc": "voice-wave", "webchat-webrtc": "ai-orb" };

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function defaults() {
    return {
      id: "",
      name: "",
      website: "",
      template: "webchat",
      panelSide: "right",
      panelWidth: 0,           // 0 = template default
      launcher: "",            // "" = template default
      launcherText: "",
      showLauncherText: true,
      launcherSize: "medium",
      agentName: "AI Assistant",
      welcomeMessage: "",
      userId: "",
      cognigy: { chatEndpoint: "", voiceEndpoint: "" },
      theme: { primaryColor: "#3694fc", secondaryColor: "#f1f5f9", logo: "" },
      createdAt: "",
      updatedAt: ""
    };
  }

  // Merge arbitrary input onto the defaults, keeping only known fields sane.
  function sanitize(input) {
    input = input || {};
    var d = defaults();
    var out = {
      id: String(input.id || d.id),
      name: String(input.name || d.name),
      website: String(input.website || ""),
      template: pick(input.template, TEMPLATES, d.template),
      panelSide: pick(input.panelSide, SIDES, d.panelSide),
      panelWidth: Math.max(0, Math.min(1200, parseInt(input.panelWidth, 10) || 0)),
      launcher: pick(input.launcher, LAUNCHERS, ""),
      launcherText: String(input.launcherText || ""),
      showLauncherText: input.showLauncherText !== false,
      launcherSize: pick(input.launcherSize, SIZES, d.launcherSize),
      agentName: String(input.agentName || d.agentName),
      welcomeMessage: String(input.welcomeMessage || ""),
      userId: String(input.userId || ""),
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
    return out;
  }

  return {
    TEMPLATES: TEMPLATES,
    LAUNCHERS: LAUNCHERS,
    SIDES: SIDES,
    SIZES: SIZES,
    DEFAULT_PANEL_WIDTH: DEFAULT_PANEL_WIDTH,
    DEFAULT_LAUNCHER: DEFAULT_LAUNCHER,
    defaults: defaults,
    sanitize: sanitize
  };
});
