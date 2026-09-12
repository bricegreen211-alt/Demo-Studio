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
   * Cognigy pins its widget to one corner and offers no way to move it. That
   * is normally right — the demo should sit where the customer's own
   * deployment would — but a customer site can have its own furniture in that
   * corner (forthepeople.com parks a "TEXT US" tab against the right edge,
   * over the panel) and no stacking trick reliably wins against a widget in
   * the browser's top layer. Being able to nudge the panel a little is the
   * fix that does not depend on beating someone else's z-index.
   *
   * Deliberately invisible: no grip, no handle, nothing that would show up in
   * front of a customer. Drag the window by its header strip, or drag the
   * collapsed launcher itself; anything shorter than a few pixels is still
   * delivered as a normal click, so the chat stays fully usable.
   *
   * The offset is a CSS variable on <html>, not an inline style on the widget,
   * because the widget replaces its whole subtree when it opens and closes —
   * an inline transform would be thrown away on the first toggle. Same
   * reasoning as --cds-drawer-w above.
   *
   * Overlay only. In "solid" the extension paints a drawer behind this page
   * and the widget is pinned to fill it, so a widget that slid away from the
   * drawer would just look broken.
   * ---------------------------------------------------------------- */

  var DRAG_ZONE_H = 52;   // header strip of the open window that acts as a title bar
  var DRAG_SLOP = 4;      // movement below this is a click, not a drag
  var KEEP_ON_SCREEN = 60;

  function posKey() { return "cds-wc3-pos:" + location.pathname; }

  function loadOffset() {
    try {
      var raw = JSON.parse(localStorage.getItem(posKey()) || "null");
      if (raw && isFinite(raw.x) && isFinite(raw.y)) return { x: raw.x, y: raw.y };
    } catch (e) { /* private mode, or something else wrote the key */ }
    return { x: 0, y: 0 };
  }

  function applyOffset(off) {
    var r = document.documentElement.style;
    r.setProperty("--cds-drag-x", Math.round(off.x) + "px");
    r.setProperty("--cds-drag-y", Math.round(off.y) + "px");
  }

  function saveOffset(off) {
    try {
      if (!off.x && !off.y) localStorage.removeItem(posKey());
      else localStorage.setItem(posKey(), JSON.stringify({ x: Math.round(off.x), y: Math.round(off.y) }));
    } catch (e) { /* the position just won't survive a reload */ }
  }

  function startDragging() {
    if (cfg.panelStyle === "solid") return;

    var offset = loadOffset();
    applyOffset(offset);
    if (offset.x || offset.y) log("restored position", offset);

    /*
     * Which parts of the widget can be grabbed. The open window is grabbed by
     * its top strip only — that is the title-bar idiom, and it keeps the
     * transcript, the composer and every button behaving normally. Geometry
     * rather than Cognigy's own header class, so this does not break the next
     * time they rename something internal.
     */
    function grabTarget(ev) {
      var win = document.querySelector(WINDOW_SEL);
      if (win) {
        var r = win.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top && ev.clientY <= r.top + DRAG_ZONE_H) return win;
      }
      var toggle = document.querySelector(TOGGLE_SEL);
      if (toggle) {
        var t = toggle.getBoundingClientRect();
        if (ev.clientX >= t.left && ev.clientX <= t.right &&
            ev.clientY >= t.top && ev.clientY <= t.bottom) return toggle;
      }
      return null;
    }

    function clamp(off) {
      var el = document.querySelector(WINDOW_SEL) || document.querySelector(TOGGLE_SEL);
      if (!el) return off;
      var r = el.getBoundingClientRect();
      // r already includes the current offset, so work out the untransformed box.
      var left = r.left - offset.x, top = r.top - offset.y;
      var minX = KEEP_ON_SCREEN - (left + r.width);
      var maxX = window.innerWidth - KEEP_ON_SCREEN - left;
      var minY = -top;                                   // never above the viewport
      var maxY = window.innerHeight - KEEP_ON_SCREEN - top;
      return {
        x: Math.max(minX, Math.min(maxX, off.x)),
        y: Math.max(minY, Math.min(maxY, off.y))
      };
    }

    document.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      if (!grabTarget(ev)) return;

      // screenX/screenY, not clientX/clientY: same reasoning as Halo's resize
      // grip — the thing being measured against is moving under the cursor.
      var start = { x: ev.screenX, y: ev.screenY };
      var from = { x: offset.x, y: offset.y };
      var dragging = false;

      function move(e) {
        var dx = e.screenX - start.x, dy = e.screenY - start.y;
        if (!dragging && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        dragging = true;
        offset = clamp({ x: from.x + dx, y: from.y + dy });
        applyOffset(offset);
        remeasure();   // keep the clip under the widget while it moves
      }

      function up() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!dragging) return;
        saveOffset(offset);
        log("moved to", offset);
        /*
         * Swallow the click this drag ends with, or letting go over the
         * launcher would toggle the chat open as well as move it.
         *
         * It has to expire on a timer, not just on the click it is waiting
         * for: a drag does not always produce a trailing click (it doesn't
         * when the pointer ends over a different element than it started on),
         * and a listener left armed would eat the SE's next real click
         * instead — dragging the launcher once and then finding it dead is a
         * far worse bug than the double-action this prevents. The click
         * follows pointerup in the same task, so one turn of the loop is
         * enough to catch it.
         */
        var swallow = function (e) { e.stopPropagation(); e.preventDefault(); done(); };
        var done = function () {
          window.removeEventListener("click", swallow, true);
          clearTimeout(expire);
        };
        var expire = setTimeout(done, 0);
        window.addEventListener("click", swallow, true);
        remeasure();
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }, true);

    // Double-click the same strip to put it back where Cognigy would have it.
    document.addEventListener("dblclick", function (ev) {
      if (!grabTarget(ev)) return;
      offset = { x: 0, y: 0 };
      applyOffset(offset);
      saveOffset(offset);
      log("position reset");
      remeasure();
    }, true);
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
