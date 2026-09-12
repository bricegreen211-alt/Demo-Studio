/*
 * Cognigy Demo Studio — Webchat v3 host page script (see webchat3.html).
 *
 * Boots the real Cognigy Webchat v3 widget and otherwise gets out of its way.
 * Nothing about how the widget looks is set here: no colours, no preset, no
 * layout. All of that is configured on the Cognigy Endpoint, which is the whole
 * point — the demo should look exactly like the customer's own deployment.
 *
 * One deliberate exception: the "Custom" theme. Its demo.json colours are
 * merged into initWebchat's own settings.colors / settings.customColors below.
 * That is still the SE hand-authoring one demo's look — the same escape hatch
 * WebRTC's Custom already has through tokens/css — not Demo Studio imposing an
 * appearance on Webchat demos generally, which is what the rule above forbids.
 * Every other theme sends nothing and boots exactly as it did before.
 *
 * The one job this file does beyond booting the widget is MEASURING it. The
 * extension gives us a transparent iframe and sizes it to whatever we report,
 * so the customer's page stays clickable everywhere the widget isn't:
 *   CDS_SIZE  — the collapsed launcher's footprint
 *   CDS_OPEN  — open/closed plus the open window's footprint
 *
 * Option shapes were verified against @cognigy/webchat 3.49.0 itself, not the
 * public docs, which are wrong on several points: userId / sessionId are
 * top-level options (not under settings), and initWebchat returns a Promise
 * that RESOLVES even against a bad URL token — so "resolved" is not "working".
 */
(function () {
  "use strict";

  var START_TIMEOUT_MS = 15000;
  var ROOT_SEL = "[data-cognigy-webchat-root]";
  var WINDOW_SEL = "[data-cognigy-webchat-root] [data-cognigy-webchat].webchat";
  var TOGGLE_SEL = "[data-cognigy-webchat-toggle]";

  var cfg = {};
  try {
    cfg = JSON.parse(document.getElementById("cds-config").textContent) || {};
  } catch (e) { /* fail() reports it */ }

  document.title = cfg.name || "Demo Experience";
  log("config", cfg);

  // The drawer's edge and width come from the demo form; the extension paints a
  // matching background behind this page.
  document.documentElement.classList.add(
    cfg.panelSide === "left" ? "cds-side-left" : "cds-side-right");
  if (cfg.panelWidth) {
    document.documentElement.style.setProperty("--cds-drawer-w", cfg.panelWidth + "px");
  }

  if (!cfg.endpoint) return fail("No Cognigy chat endpoint configured for this demo.");
  if (typeof window.initWebchat !== "function") {
    return fail("The Webchat v3 bundle didn't load. Run npm install in the Demo Studio folder.");
  }

  var opts = {
    // Cognigy Live Follow / the Interaction Panel find a demo conversation by
    // this id, which is why demo.json defaults it to "followme".
    userId: cfg.userId || undefined,
    // A fresh session per page load, so a demo never opens onto the last one.
    sessionId: "cds-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    settings: {
      embeddingConfiguration: {
        // Wait for the Endpoint config before first paint, so the Endpoint's own
        // theme and style preset are what render — never a default flash.
        awaitEndpointConfig: true,
        // Load-bearing, not hygiene: by default the widget generates a random
        // userId and persists it in localStorage, which would win over the
        // userId above and silently break Live Follow.
        disableLocalStorage: true,
        disablePersistentHistory: true
      }
    }
  };

  /*
   * Custom theme colours (see the exception in this file's header). server.js
   * only fills these in for theme.preset === "custom"; everything else arrives
   * as {} and nothing below runs, so opts stays byte-identical to what every
   * demo sent before this existed.
   *
   * Verified against @cognigy/webchat 3.49.0 — re-check on upgrade. The nine
   * field names that actually do something are listed in CLAUDE.md, under
   * "Things the public Webchat v3 docs get wrong". Anything else passes through
   * and is ignored by the widget (it reads them as settings?.colors?.x), which
   * is why a typo shows up as "nothing changed" rather than an error — the
   * debug badge below is what distinguishes that from the wiring not firing.
   */
  var colorsApplied = false;
  if (cfg.themeColors && Object.keys(cfg.themeColors).length) {
    opts.settings.colors = cfg.themeColors;
    colorsApplied = true;
  }
  if (cfg.themeCustomColors && Object.keys(cfg.themeCustomColors).length) {
    opts.settings.customColors = cfg.themeCustomColors;
    colorsApplied = true;
  }

  var rendered = false;
  var webchatRef = null;
  var openTries = 0;

  /*
   * "Working" means the widget actually rendered, NOT that initWebchat's promise
   * resolved. Verified against 3.49.0: with a wrong URL token the promise still
   * resolves, the endpoint config fetch 404s, and nothing renders at all.
   */
  function isRendered() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return false;
    // Collapsed is the normal initial state now that Cognigy's own launcher is
    // enabled, so "has any child" is the signal — not "has a chat window".
    return root.children.length > 0 || !!root.querySelector(TOGGLE_SEL);
  }

  var failTimer = setTimeout(function () {
    if (!isRendered()) {
      fail("Couldn't start Webchat v3 against " + cfg.endpoint +
           " — check the endpoint in Cognigy Demo Studio and that the AI Agent is running.");
    }
  }, START_TIMEOUT_MS);

  var settle = setInterval(function () {
    if (isRendered()) return onRendered();
    if (++openTries > 40) return clearInterval(settle);
  }, 400);

  function onRendered() {
    if (rendered) return;
    rendered = true;
    clearInterval(settle);
    clearTimeout(failTimer);
    log("widget rendered");
    startMeasuring();
    startDragging();
  }

  Promise.resolve(window.initWebchat(cfg.endpoint, opts)).then(function (webchat) {
    webchatRef = webchat;
    // Exposed for debugging from the console; this is a Studio-owned page, never
    // the customer's, so there's nothing to leak.
    window.cdsWebchat = webchat;
    log("initWebchat resolved");
    if (isRendered()) onRendered();
  }).catch(function (err) {
    clearInterval(settle);
    fail(String((err && err.message) || err || "Webchat v3 failed to start."));
  });

  /* ---------------------------------------------------------------- *
   * Measuring
   *
   * The extension's iframe is full-viewport and transparent, and it clips
   * itself to the rectangle we report here. That is deliberate: the widget
   * positions itself with position:fixed against OUR viewport, so a frame
   * sized to the widget would change the very viewport the widget measures
   * itself against — measure, resize, re-measure, forever. Keeping the frame
   * at full size means Cognigy lays itself out exactly as it would on the
   * customer's own page, and clip-path (which blocks hit-testing as well as
   * painting) is what keeps the rest of their page clickable.
   *
   * We report insets from each viewport edge, ready to drop into
   * clip-path: inset(top right bottom left).
   * ---------------------------------------------------------------- */

  // Breathing room so drop shadows and the open/close animation aren't clipped.
  var CLIP_PAD = 28;

  /*
   * Union of everything Cognigy currently paints. A union rather than one
   * element because the widget shows several things at once: while the chat
   * window is open its launcher stays in the corner as a collapse chevron, and
   * an Endpoint can add a teaser/unread bubble above it.
   */
  function widgetRect() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return null;
    var box = null;
    var parts = root.querySelectorAll("*");
    for (var i = 0; i < parts.length; i++) {
      var el = parts[i];
      var cs = window.getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue;
      box = box ? {
        left: Math.min(box.left, r.left), top: Math.min(box.top, r.top),
        right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom)
      } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return box;
  }

  function post(msg) {
    try { window.parent.postMessage(msg, "*"); } catch (e) { /* not embedded */ }
  }

  /*
   * rAF coalesces measurement to a paint, which is what we want while visible —
   * but it does NOT fire at all in a hidden tab, and the pending callback would
   * hold the only queued measure forever. A demo panel can easily be opened and
   * then left in a background tab, so fall back to a timer when there are no
   * frames coming.
   */
  function soon(fn) {
    if (document.hidden) return setTimeout(fn, 0);
    return requestAnimationFrame(fn);
  }
  function cancelSoon(id) {
    cancelAnimationFrame(id);
    clearTimeout(id);
  }

  /*
   * Set by startMeasuring so dragging can force a measurement on every move.
   * Without it the widget would slide but its clip — which is what the customer
   * can actually see and click — would lag 400ms behind on the interval.
   */
  var remeasure = function () {};

  function startMeasuring() {
    var lastKey = "";
    var queued = 0;

    function measure() {
      cancelSoon(queued);
      queued = soon(function () {
        var open = !!document.querySelector(WINDOW_SEL);

        // In solid mode the extension paints a drawer once we say we're open,
        // so pin the widget to that drawer before measuring it.
        document.documentElement.classList.toggle("cds-drawer", open && cfg.panelStyle === "solid");

        var r = widgetRect();
        if (!r) return;

        var clip = {
          top: Math.max(0, Math.floor(r.top - CLIP_PAD)),
          right: Math.max(0, Math.floor(window.innerWidth - r.right - CLIP_PAD)),
          bottom: Math.max(0, Math.floor(window.innerHeight - r.bottom - CLIP_PAD)),
          left: Math.max(0, Math.floor(r.left - CLIP_PAD))
        };

        var key = (open ? "o" : "c") + [clip.top, clip.right, clip.bottom, clip.left].join(",");
        if (key === lastKey) return;
        lastKey = key;

        post({ type: "CDS_WC3_CLIP", open: open, top: clip.top, right: clip.right,
               bottom: clip.bottom, left: clip.left });
        log(open ? "open" : "closed", clip);
        debugBadge(open, r, clip);
      });
    }

    remeasure = measure;
    measure();
    // The widget swaps its whole subtree between launcher and window, so watch
    // the root's children rather than elements that get replaced wholesale.
    var root = document.querySelector(ROOT_SEL);
    if (root) new MutationObserver(measure).observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    // The open/close animation keeps moving for a few hundred ms after the DOM
    // settles, and this is also the safety net if a mutation is ever missed.
    setInterval(measure, 400);
  }

  /* ---------------------------------------------------------------- *
   * Drag to reposition
   *
   * The mechanism lives in drag-widget.js, shared with webrtc.js — see the
   * long note there for why this exists and why it draws nothing. This is
   * only the part that is specific to Webchat v3: which pieces can be
   * grabbed.
   *
   * Overlay only. In "solid" the extension paints a drawer behind this page
   * and the widget is pinned to fill it, so a widget that slid away from the
   * drawer would just look broken.
   * ---------------------------------------------------------------- */

  // Header strip of the open window, which acts as its title bar.
  var DRAG_ZONE_H = 52;

  function startDragging() {
    if (!window.CDSDrag) return;   // asset missing; everything else still works
    window.CDSDrag.enable({
      enabled: cfg.panelStyle !== "solid",
      remeasure: function () { remeasure(); },
      log: log,
      /*
       * The window is grabbed by its top strip only — that is the title-bar
       * idiom, and it leaves the transcript selectable and every button and
       * the composer behaving normally. Geometry rather than Cognigy's own
       * header class, so this does not break when they rename something
       * internal. The collapsed launcher is small enough to grab anywhere.
       */
      targets: function () {
        return [
          { el: document.querySelector(WINDOW_SEL), zoneHeight: DRAG_ZONE_H },
          { el: document.querySelector(TOGGLE_SEL) }
        ];
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Diagnostics
   * ---------------------------------------------------------------- */
  function log() {
    var args = ["[cds:webchat3]"];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    try { console.log.apply(console, args); } catch (e) {}
  }

  function debugBadge(open, r, clip) {
    if (!cfg.debug) return;
    var el = document.getElementById("cds-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "cds-debug";
      document.body.appendChild(el);
    }
    var ep = String(cfg.endpoint || "");
    var state = open ? (cfg.panelStyle === "solid" ? "open (drawer)" : "open") : "closed";
    el.textContent =
      "style " + (cfg.panelStyle || "?") + " " + (cfg.panelSide || "right") +
      " · webchat3 · " + state +
      // Present means the colours reached initWebchat. If this shows and the
      // widget still looks stock, the field NAMES are wrong, not the wiring.
      (colorsApplied ? " · custom colors" : "") +
      " · widget " + Math.round(r.right - r.left) + "x" + Math.round(r.bottom - r.top) +
      " · clip " + [clip.top, clip.right, clip.bottom, clip.left].join("/") +
      " · vp " + window.innerWidth + "x" + window.innerHeight +
      " · user " + (cfg.userId || "-") +
      " · ep …" + ep.slice(-8);
  }

  function fail(msg) {
    clearTimeout(failTimer);
    clearInterval(settle);
    var box = document.getElementById("cds-fallback");
    var text = document.getElementById("cds-fallback-msg");
    if (text) text.textContent = msg;          // textContent, never innerHTML
    if (box) box.hidden = false;
    console.error("[cds:webchat3]", msg);
  }
})();
