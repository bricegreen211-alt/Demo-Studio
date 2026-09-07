/*
 * Cognigy Demo Studio — click-to-call host page script (see webrtc.html).
 *
 * Boots the real Cognigy click-to-call widget and otherwise gets out of its
 * way. Nothing about how the widget looks is set here: no colours, no labels,
 * no layout. Its agent name, avatar, buttons and transcription setting all come
 * from the Cognigy Endpoint, which is the whole point — the demo should look
 * exactly like the customer's own deployment. A theme, when one is selected,
 * reaches the widget as CSS injected by the service (themes.js), never as
 * options passed here.
 *
 * The one job this file does beyond booting the widget is MEASURING it, using
 * the same CDS_WC3_CLIP protocol webchat3.js already speaks, so the extension
 * needs no new mount mode: it hands Cognigy's widget a bare transparent frame
 * and clips that frame to whatever we report, keeping the rest of the
 * customer's page clickable.
 *
 * Class names below were read off the rendered widget, not the docs:
 *   .webrtc_widget_outer_wrapper > .webrtc_widget_content_stack
 *     > .webrtc_widget_container            the pill itself (radius 999px)
 *       > .webrtc_widget_content_container  carries the state: _idle, etc.
 *     > .webrtc_widget_powered_by           sits OUTSIDE the pill, below it
 */
(function () {
  "use strict";

  var START_TIMEOUT_MS = 15000;
  var CONTAINER_SEL = ".webrtc_widget_container";
  var WRAPPER_SEL = ".webrtc_widget_outer_wrapper";

  var cfg = {};
  try {
    cfg = JSON.parse(document.getElementById("cds-config").textContent) || {};
  } catch (e) { /* fail() reports it */ }

  document.title = cfg.name || "Demo Experience";
  log("config", cfg);

  document.documentElement.classList.add(
    cfg.panelSide === "left" ? "cds-side-left" : "cds-side-right");

  if (!cfg.endpoint) return fail("No Cognigy voice endpoint configured for this demo.");
  if (typeof window.initWebRTCWidget !== "function") {
    return fail("The click-to-call bundle didn't load. Reinstall Cognigy Demo Studio.");
  }

  /*
   * userId is the only option passed, and it is functional rather than
   * cosmetic: Cognigy Live Follow and the Interaction Panel find a demo call by
   * it. Load-bearing, too — left unset, the widget invents one and persists it
   * in localStorage (verified in the bundle), which would silently break Follow
   * Me for every demo on this machine.
   */
  var opts = { userId: cfg.userId || undefined };

  var rendered = false;

  function root() {
    var c = document.querySelector(CONTAINER_SEL);
    if (!c) return null;
    return c.closest(WRAPPER_SEL) || c;
  }

  var failTimer = setTimeout(function () {
    if (!rendered) {
      fail("Couldn't start the click-to-call widget against " + cfg.endpoint +
           " — check the voice endpoint in Cognigy Demo Studio and that the " +
           "Click-to-Call endpoint is active in Cognigy.");
    }
  }, START_TIMEOUT_MS);

  var tries = 0;
  var settle = setInterval(function () {
    if (root()) return onRendered();
    if (++tries > 40) clearInterval(settle);
  }, 400);

  /*
   * A bad token does not throw: the widget mounts its container and then leaves
   * it visibility:hidden, which is the only signal there is. Remote Control
   * checks the same thing, at the same 3.5s mark.
   */
  setTimeout(function () {
    var c = document.querySelector(CONTAINER_SEL);
    if (c && window.getComputedStyle(c).visibility === "hidden") {
      fail("The voice gateway didn't accept this endpoint — check the endpoint " +
           "URL, and that the Click-to-Call endpoint is active in Cognigy.");
    }
  }, 3500);

  try {
    window.initWebRTCWidget(cfg.endpoint, opts, function (instance) {
      // Exposed for debugging from the console; this is a Studio-owned page,
      // never the customer's, so there is nothing to leak.
      window.cdsVoiceWidget = instance;
      log("initWebRTCWidget returned");
      if (root()) onRendered();
    });
  } catch (err) {
    clearInterval(settle);
    return fail(String((err && err.message) || err || "The widget failed to start."));
  }

  function onRendered() {
    if (rendered) return;
    rendered = true;
    clearInterval(settle);
    clearTimeout(failTimer);
    log("widget rendered");
    startMeasuring();
  }

  /* ---------------------------------------------------------------- *
   * Measuring — identical in shape to webchat3.js, see the long note
   * there for why the frame stays full-viewport and is clipped instead
   * of being sized to the widget.
   * ---------------------------------------------------------------- */

  var CLIP_PAD = 28;   // room for the widget's shadow; matches webchat3.js

  // Union of everything the widget paints. A union rather than one element
  // because "Powered by Cognigy.AI" sits outside the pill, below it.
  function widgetRect() {
    var r0 = root();
    if (!r0) return null;
    var box = null;
    var parts = [r0].concat(Array.prototype.slice.call(r0.querySelectorAll("*")));
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

  // rAF does not fire in a hidden tab, and the pending callback would hold the
  // only queued measure forever. A demo panel is easily left in a background
  // tab, so fall back to a timer when no frames are coming.
  function soon(fn) {
    if (document.hidden) return setTimeout(fn, 0);
    return requestAnimationFrame(fn);
  }
  function cancelSoon(id) { cancelAnimationFrame(id); clearTimeout(id); }

  function startMeasuring() {
    var lastKey = "";
    var queued = 0;

    function measure() {
      cancelSoon(queued);
      queued = soon(function () {
        var r = widgetRect();
        if (!r) return;

        var clip = {
          top: Math.max(0, Math.floor(r.top - CLIP_PAD)),
          right: Math.max(0, Math.floor(window.innerWidth - r.right - CLIP_PAD)),
          bottom: Math.max(0, Math.floor(window.innerHeight - r.bottom - CLIP_PAD)),
          left: Math.max(0, Math.floor(r.left - CLIP_PAD))
        };

        var key = [clip.top, clip.right, clip.bottom, clip.left].join(",");
        if (key === lastKey) return;
        lastKey = key;

        /*
         * open is always false, and that is a decision rather than a stub. In
         * the extension, open only ever means "paint a full-height drawer
         * behind this" for panelStyle: solid. Cognigy's voice widget is a
         * floating pill that grows in place during a call — a white drawer
         * behind it would be an invention, and the clip already follows the
         * widget's real bounds either way. So solid and clear look the same
         * here, which is the honest answer for a widget Cognigy owns.
         */
        post({ type: "CDS_WC3_CLIP", open: false, top: clip.top, right: clip.right,
               bottom: clip.bottom, left: clip.left });
        log("clip", clip);
        debugBadge(r, clip);
      });
    }

    measure();
    var r0 = root();
    if (r0) new MutationObserver(measure).observe(r0, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"]
    });
    window.addEventListener("resize", measure);
    // The widget keeps animating for a few hundred ms after its DOM settles,
    // and this is also the safety net if a mutation is ever missed.
    setInterval(measure, 400);
  }

  /* ---------------------------------------------------------------- *
   * Diagnostics
   * ---------------------------------------------------------------- */
  function log() {
    var args = ["[cds:webrtc]"];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    try { console.log.apply(console, args); } catch (e) {}
  }

  function debugBadge(r, clip) {
    if (!cfg.debug) return;
    var el = document.getElementById("cds-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "cds-debug";
      document.body.appendChild(el);
    }
    var ep = String(cfg.endpoint || "");
    var state = document.querySelector(CONTAINER_SEL + " > [class*='_content_container_']");
    var phase = "";
    if (state) {
      var m = String(state.className).match(/_content_container_([a-z]+)/i);
      phase = m ? m[1] : "";
    }
    el.textContent =
      "style " + (cfg.panelStyle || "?") + " " + (cfg.panelSide || "right") +
      " · click-to-call" + (phase ? " · " + phase : "") +
      " · theme " + (cfg.theme || "cognigy-default") +
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
    console.error("[cds:webrtc]", msg);
  }
})();
