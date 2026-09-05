/*
 * Cognigy Demo Studio Extension — content script.
 * Asks the background worker which Demo Experience maps to this site, then
 * mounts a closed Shadow DOM shell: the animated AI launcher plus the
 * slide-out panel that hosts the demo (panel.html -> localhost iframe).
 *
 * The customer page is never modified beyond hosting this one shadow root;
 * styling is fully isolated and nothing here reads page data (SOW §21).
 */
(function () {
  "use strict";

  if (window.top !== window) return; // top frame only
  if (document.documentElement.dataset.cdsMounted) return;

  var SIZES = { small: 48, medium: 60, large: 72 };
  var MIN_W = 300;

  /* ------------------------------------------------------------------ *
   * Stacking. Third-party chat widgets routinely park at the very top of
   * the z-index range — Chatbase's launcher is 2147483645 and its window
   * 2147483646 — so anything short of the CSS maximum paints underneath
   * them. 2147483647 is that maximum; the only remaining tie-break is DOM
   * order, which we win by being the last child of <html>.
   *
   * !important on an inline style is the highest-priority author
   * declaration in the cascade, so a page stylesheet can't demote us.
   * ------------------------------------------------------------------ */
  /*
   * Verbose by default and deliberately so: the extension runs on the
   * customer's page where there is no other way to see what it decided, and
   * "the panel looks wrong" is otherwise unfalsifiable. Prefixed so it's easy
   * to filter, and it never logs page content.
   */
  function log() {
    var args = ["[cds]"];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    try { console.log.apply(console, args); } catch (e) {}
  }

  var API_ORIGIN = "http://localhost:41700";
  var TOP_Z = "2147483647";

  function makeHost() {
    var host = document.createElement("div");
    host.id = "cds-shell-host";
    host.style.cssText = "all:initial;position:fixed;z-index:" + TOP_Z + ";";
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("z-index", TOP_Z, "important");
    return host;
  }

  /*
   * Sites re-render their shell, and a few sweep unknown children off
   * <html>. Re-assert our inline stacking, and re-attach if we've been
   * detached — but NEVER move a still-attached host: moving an element
   * re-attaches the panel iframe inside it, which reloads the demo and
   * loses the conversation mid-sentence. DOM order only decides exact
   * z-index ties, and we start last, so staying put is the right trade.
   */
  function keepInFront(host) {
    var obs = new MutationObserver(schedule);
    var queued = false, hits = 0, windowStart = Date.now();

    function observe() {
      obs.observe(document.documentElement, { childList: true });
      obs.observe(host, { attributes: true, attributeFilter: ["style"] });
    }
    function apply() {
      obs.disconnect(); // our own writes must not retrigger us
      if (!host.isConnected) document.documentElement.appendChild(host);
      if (host.style.zIndex !== TOP_Z ||
          host.style.getPropertyPriority("z-index") !== "important") {
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("z-index", TOP_Z, "important");
      }
      observe(); // records queued while disconnected are dropped
    }
    // rAF coalesces to a paint, which is what we want while visible — but it
    // does NOT fire at all in a hidden tab, and `queued` would latch true and
    // stall every later mutation. A page can rewrite our host while the SE is
    // on another tab, so fall back to a timer when there are no frames.
    function soon(fn) {
      if (document.hidden) setTimeout(fn, 0);
      else requestAnimationFrame(fn);
    }
    function schedule() {
      if (queued) return;
      queued = true;
      soon(function () {
        queued = false;
        if (Date.now() - windowStart > 10000) { hits = 0; windowStart = Date.now(); }
        // A page script that also insists on being last would ping-pong with
        // us forever; give up loudly rather than burn every frame.
        if (++hits > 50) {
          obs.disconnect();
          console.warn("[cds] stopped re-asserting stacking (page keeps fighting)");
          return;
        }
        apply();
      });
    }
    apply();
    return obs;
  }

  /*
   * Paint check. Whatever is topmost at the element's centre should be our
   * host — a closed shadow root reports the host, and top-layer elements
   * (dialog.showModal(), popover) report themselves. Anything else means
   * we're covered by something no z-index can beat. Diagnostic only:
   * tag/id/z-index, never page content.
   */
  function warnIfCovered(host, el) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (!hit || hit === host) return;
    console.warn("[cds] Demo shell is covered by",
      hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : ""),
      "z-index", getComputedStyle(hit).zIndex);
  }

  // Master switch (popup). Nothing is injected anywhere while this is off, so
  // demos don't follow you around every tab when you're not demoing.
  chrome.storage.local.get({ cdsEnabled: false }, function (state) {
    if (!state.cdsEnabled) return;
    chrome.runtime.sendMessage({ type: "CDS_RESOLVE", host: location.hostname }, function (res) {
      if (chrome.runtime.lastError) { log("resolve failed", chrome.runtime.lastError.message); return; }
      if (!res || !res.ok || !res.data || !res.data.demo) {
        log("no demo mapped to", location.hostname, res && res.data && res.data.via);
        return;
      }
      var demo = res.data.demo;
      log("resolved", { demo: demo.id, via: res.data.via, chatUi: demo.chatUi,
                        panelStyle: demo.panelStyle, built: demo.built });
      if (!demo.built) { log("demo has no build yet — nothing to show"); return; }
      document.documentElement.dataset.cdsMounted = "1";
      mount(demo);
    });
  });

  /*
   * Overlay mode: the extension contributes nothing visual — just a
   * transparent iframe that resizes to whatever the Demo Experience asks for.
   * The launcher icon, the panel, the close button and any device frame are
   * all drawn by the demo itself, which means they're vibe-codeable.
   *
   * Protocol (demo -> panel.html -> here):
   *   { type: "CDS_SIZE", width, height }  collapsed launcher's measured size
   *   { type: "CDS_OPEN", open: true|false }
   */
  function mountOverlay(demo) {
    var side = demo.panelSide === "left" ? "left" : "right";
    var openW = Math.max(MIN_W, demo.panelWidth || 420);

    var host = makeHost();
    var root = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial;}" +
      ".cds-overlay-frame{position:fixed;bottom:20px;" + side + ":20px;border:0;" +
      "background:transparent;z-index:1;display:block;" +
      "transition:width .28s cubic-bezier(.32,.72,.28,1),height .28s cubic-bezier(.32,.72,.28,1);}";
    root.appendChild(style);

    var frame = document.createElement("iframe");
    frame.className = "cds-overlay-frame";
    frame.title = "Demo Experience";
    frame.setAttribute("allow", "microphone; autoplay; clipboard-write");
    frame.style.width = "240px";   // provisional until the demo measures itself
    frame.style.height = "120px";
    frame.src = chrome.runtime.getURL("panel.html") +
      "?slug=" + encodeURIComponent(demo.id) +
      "&name=" + encodeURIComponent(demo.name || "") +
      "&agent=" + encodeURIComponent(demo.agentName || "") +
      "&style=overlay";
    root.appendChild(frame);
    document.documentElement.appendChild(host);
    keepInFront(host);
    setTimeout(function () { warnIfCovered(host, frame); }, 800);

    var collapsed = { w: 240, h: 120 };
    var opened = { w: openW, h: 560 };  // the demo tells us its opened size
    var isOpen = false;

    function applySize() {
      if (isOpen) {
        frame.style.width = Math.round(Math.min(window.innerWidth * 0.92, opened.w)) + "px";
        frame.style.height = Math.round(Math.min(window.innerHeight - 40, opened.h)) + "px";
      } else {
        frame.style.width = collapsed.w + "px";
        frame.style.height = collapsed.h + "px";
      }
    }
    window.addEventListener("resize", applySize);

    window.addEventListener("message", function (ev) {
      if (ev.source !== frame.contentWindow) return;
      var d = ev.data || {};
      if (d.type === "CDS_SIZE") {
        collapsed = {
          w: Math.max(48, Math.min(600, Math.ceil(d.width) || 240)),
          h: Math.max(48, Math.min(400, Math.ceil(d.height) || 120))
        };
        if (!isOpen) applySize();
      } else if (d.type === "CDS_OPEN") {
        isOpen = !!d.open;
        if (d.width) opened.w = Math.max(MIN_W, Math.min(900, Math.ceil(d.width)));
        if (d.height) opened.h = Math.max(200, Math.min(900, Math.ceil(d.height)));
        applySize();
      }
    });
  }

  /*
   * Cognigy Webchat v3 mode.
   *
   * The whole point of this mode is that the demo is indistinguishable from the
   * customer having deployed Webchat v3 themselves, so the extension draws
   * NOTHING of its own — no launcher, no title bar, no resize handle. Cognigy's
   * widget brings its own launcher bubble, its own window and its own close
   * button.
   *
   * The frame is full-viewport and never resized. That is the important bit:
   * the widget positions itself with position:fixed against the frame's
   * viewport, so a frame sized to the widget would change the very viewport the
   * widget measures itself against — measure, resize, re-measure, forever. At
   * full size Cognigy lays itself out exactly as it would on the customer's own
   * page, and the frame is clipped to the widget's footprint instead, because
   * clip-path blocks hit-testing as well as painting. Everything outside the
   * clip stays the customer's page, fully clickable.
   *
   * Protocol (host page -> panel.html -> here):
   *   { type: "CDS_WC3_CLIP", open, top, right, bottom, left }  clip insets
   *
   * Two paint styles, one code path:
   *   clear — the frame paints nothing; Cognigy's own shape is what shows
   *   solid — closed, still just the launcher; opened, the frame paints a
   *           full-height drawer behind the widget, which the host page pins
   *           to the same edge and width
   */
  function mountWebchat3(demo) {
    var side = demo.panelSide === "left" ? "left" : "right";
    var panelStyle = demo.panelStyle === "clear" ? "clear" : "solid";
    var drawerW = Math.max(MIN_W, demo.panelWidth || 420);

    var host = makeHost();
    var root = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial;}" +
      ".cds-wc3{position:fixed;inset:0;width:100vw;height:100vh;border:0;display:block;" +
        "background:transparent;z-index:1;" +
        /* Clip changes are stepwise, so don't tween them — but the drawer's
           background fading in as it opens is worth animating. */
        "transition:background-color .2s ease, box-shadow .2s ease;}" +
      /* Solid, open: paint the drawer. The clip is what limits it to the
         drawer's edge and width, so this can safely be a full-viewport box. */
      ".cds-wc3-drawer{background:#fff;" +
        "box-shadow:" + (side === "right" ? "-12px" : "12px") + " 0 40px rgba(15,23,42,.25);}";
    root.appendChild(style);

    /*
     * Where to clip before the host page has reported anything.
     *
     * NOT "hide everything": the frame is where the widget renders AND where
     * its failure card renders, so clipping it away means every downstream
     * problem — service down, bad endpoint, widget bundle missing — shows up
     * as a silently blank page with nothing to go on. Reserve the corner the
     * widget is about to appear in instead. Worst case that corner stops being
     * clickable on the customer's site; that is a far better failure than
     * "nothing happened and there is no way to tell why".
     */
    var FALLBACK_W = 460, FALLBACK_H = 680;
    function fallbackClip() {
      var top = Math.max(0, window.innerHeight - FALLBACK_H);
      var edge = Math.max(0, window.innerWidth - FALLBACK_W);
      return side === "right"
        ? "inset(" + top + "px 0px 0px " + edge + "px)"
        : "inset(" + top + "px " + edge + "px 0px 0px)";
    }

    var frame = document.createElement("iframe");
    frame.className = "cds-wc3";
    frame.title = "Demo Experience";
    frame.setAttribute("allow", "microphone; autoplay; clipboard-write");
    frame.style.clipPath = fallbackClip();
    frame.src = chrome.runtime.getURL("panel.html") +
      "?slug=" + encodeURIComponent(demo.id) +
      "&name=" + encodeURIComponent(demo.name || "") +
      "&agent=" + encodeURIComponent(demo.agentName || "") +
      "&style=" + encodeURIComponent(panelStyle) +
      "&chatui=webchat3";
    root.appendChild(frame);
    document.documentElement.appendChild(host);
    keepInFront(host);

    log("webchat3 mounted", { demo: demo.id, panelStyle: panelStyle, side: side, drawerW: drawerW });

    /*
     * A visible state readout on the customer's page, so "it didn't work" can
     * be a screenshot instead of a description. Lives in our shadow root, so it
     * can't inherit or disturb the site's styling. Settings -> Show demo
     * diagnostics turns it off.
     */
    var badge = null;
    if (demo.debug) {
      badge = document.createElement("div");
      badge.className = "cds-badge";
      var bstyle = document.createElement("style");
      bstyle.textContent =
        ".cds-badge{position:fixed;left:6px;bottom:6px;z-index:9;max-width:calc(100vw - 12px);" +
        "padding:4px 8px;border-radius:6px;background:rgba(15,23,42,.82);color:#fff;" +
        "font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;" +
        "pointer-events:none;}";
      root.appendChild(bstyle);
      root.appendChild(badge);
    }
    function setBadge(state) {
      if (!badge) return;
      badge.textContent = "ext · " + demo.id + " · " + panelStyle + " " + side +
        " · webchat3 · " + state;
    }
    setBadge("waiting for demo page…");

    var clipped = false;
    // Keep the reserved corner correct if the window is resized before the
    // host page ever reports, so the fallback stays where the widget will be.
    window.addEventListener("resize", function () {
      if (!clipped) frame.style.clipPath = fallbackClip();
    });
    setTimeout(function () {
      if (clipped) return;
      setBadge("NO REPORT after 8s — demo page never answered");
      console.warn("[cds] Webchat v3 never reported its position after 8s. The frame is showing its " +
        "fallback corner, so whatever the demo page rendered (widget or error) should be visible there. " +
        "If that corner is blank, open " + API_ORIGIN + "/" + demo.id + "/ in a tab to see the demo " +
        "page's own console. If it shows the widget but nothing is clickable, panel.js may be stale — " +
        "reload the extension at chrome://extensions.");
    }, 8000);

    window.addEventListener("message", function (ev) {
      if (!frame.contentWindow || ev.source !== frame.contentWindow) return;
      var d = ev.data || {};
      if (d.type !== "CDS_WC3_CLIP") return;

      var open = !!d.open;
      var ins = [d.top, d.right, d.bottom, d.left].map(function (v) {
        return Math.max(0, Math.round(Number(v) || 0)) + "px";
      });

      if (open && panelStyle === "solid") {
        // Drawer: flush to the edge, full height, exactly panelWidth wide. The
        // host page pins the widget to match, so the two agree.
        var w = Math.min(window.innerWidth, drawerW);
        frame.style.clipPath = side === "right"
          ? "inset(0px 0px 0px " + (window.innerWidth - w) + "px)"
          : "inset(0px " + (window.innerWidth - w) + "px 0px 0px)";
      } else {
        frame.style.clipPath = "inset(" + ins.join(" ") + ")";
      }
      frame.className = "cds-wc3" + (open && panelStyle === "solid" ? " cds-wc3-drawer" : "");

      if (!clipped) { clipped = true; log("first clip received"); }
      log("clip", { open: open, insets: ins.join(" "), drawer: open && panelStyle === "solid" });
      setBadge((open ? (panelStyle === "solid" ? "OPEN (drawer)" : "OPEN") : "closed") +
               " · clip " + ins.join("/"));
    });
  }

  function mount(demo) {
    // Cognigy Webchat v3 brings its own launcher and window, so it gets a
    // bare transparent frame rather than this file's launcher and panel.
    if (demo.chatUi === "webchat3") return mountWebchat3(demo);
    if ((demo.panelStyle || "solid") === "overlay") return mountOverlay(demo);

    var size = SIZES[demo.launcherSize] || SIZES.medium;
    var side = demo.panelSide === "left" ? "left" : "right";
    var primary = (demo.theme && demo.theme.primaryColor) || "#3694fc";
    var panelStyle = demo.panelStyle || "solid";
    var width = Math.max(MIN_W, demo.panelWidth || 420);

    var host = makeHost();
    var root = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = css(size, side, primary, panelStyle);
    root.appendChild(style);

    /* ---------- launcher ---------- */
    var launcherWrap = document.createElement("div");
    launcherWrap.className = "cds-launcher-wrap cds-side-" + side;

    var launcher = document.createElement("button");
    launcher.className = "cds-launcher cds-l-" + demo.launcher + " cds-vstate-idle";
    launcher.setAttribute("aria-label", "Open " + (demo.name || "demo") + " assistant");
    launcher.innerHTML = launcherInner(demo.launcher);
    launcherWrap.appendChild(launcher);

    if (demo.showLauncherText && demo.launcherText) {
      var label = document.createElement("div");
      label.className = "cds-label";
      label.textContent = demo.launcherText;
      launcherWrap.insertBefore(label, launcher);
    }

    /* ---------- panel ---------- */
    var panel = document.createElement("div");
    panel.className = "cds-panel cds-side-" + side + " cds-style-" + panelStyle + " cds-hidden";

    var handle = document.createElement("div");
    handle.className = "cds-resize";
    panel.appendChild(handle);

    var frameSlot = document.createElement("div");
    frameSlot.className = "cds-frame-slot";
    panel.appendChild(frameSlot);

    // solid and clear are both full-height; only the width varies.
    function layoutPanel(w) {
      width = Math.round(Math.min(window.innerWidth * 0.9, Math.max(MIN_W, w)));
      panel.style.width = width + "px";
      panel.style.height = "";
    }
    layoutPanel(width);
    window.addEventListener("resize", function () { layoutPanel(width); });

    var overlay = document.createElement("div"); // drag shield
    overlay.className = "cds-drag-overlay";

    root.appendChild(launcherWrap);
    root.appendChild(panel);
    document.documentElement.appendChild(host);
    keepInFront(host);
    // Let the page finish injecting its own widgets before checking who won.
    setTimeout(function () { warnIfCovered(host, launcher); }, 800);

    var frame = null;
    var open = false;
    var fullscreen = false;

    function panelUrl() {
      return chrome.runtime.getURL("panel.html") +
        "?slug=" + encodeURIComponent(demo.id) +
        "&name=" + encodeURIComponent(demo.name || "") +
        "&agent=" + encodeURIComponent(demo.agentName || "") +
        "&style=" + encodeURIComponent(panelStyle);
    }

    function ensureFrame() {
      if (frame) return;
      frame = document.createElement("iframe");
      frame.className = "cds-frame";
      frame.setAttribute("allow", "microphone; autoplay; clipboard-write");
      frame.src = panelUrl();
      frameSlot.appendChild(frame);
    }

    function show() {
      ensureFrame();
      open = true;
      panel.classList.remove("cds-hidden");
      launcherWrap.classList.add("cds-launcher-open");
      requestAnimationFrame(function () { warnIfCovered(host, panel); });
    }
    function hide(destroy) {
      open = false;
      fullscreen = false;
      panel.classList.remove("cds-full");
      panel.classList.add("cds-hidden");
      launcherWrap.classList.remove("cds-launcher-open");
      if (destroy && frame) { frame.remove(); frame = null; }
    }

    launcher.addEventListener("click", function () {
      open ? hide(false) : show();
    });

    /* control messages from panel.html (close/minimize/fullscreen/voice state) */
    window.addEventListener("message", function (ev) {
      if (!frame || ev.source !== frame.contentWindow) return;
      var d = ev.data || {};
      if (d.type === "CDS_PANEL_CLOSE") hide(true);
      else if (d.type === "CDS_PANEL_MIN") hide(false);
      else if (d.type === "CDS_PANEL_FULL") {
        fullscreen = !fullscreen;
        panel.classList.toggle("cds-full", fullscreen);
      } else if (d.type === "CDS_VOICE_STATE") {
        launcher.className = launcher.className.replace(/cds-vstate-\S+/, "cds-vstate-" + (d.state || "idle"));
      }
    });

    /* ---------- drag-to-resize ---------- */
    handle.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      root.appendChild(overlay);
      var startX = ev.clientX;
      var startW = panel.getBoundingClientRect().width;

      function move(e) {
        var dx = side === "right" ? startX - e.clientX : e.clientX - startX;
        layoutPanel(startW + dx);
      }
      function up() {
        overlay.remove();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        var w = Math.round(panel.getBoundingClientRect().width);
        chrome.runtime.sendMessage({ type: "CDS_SAVE_PANEL", demoId: demo.id, panelWidth: w }, function () {
          void chrome.runtime.lastError;
        });
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  /* ---------- launcher markup per style ---------- */
  function launcherInner(kind) {
    if (kind === "ai-spark") {
      return '<span class="cds-spark">✦</span>' +
             '<span class="cds-particle p1"></span><span class="cds-particle p2"></span><span class="cds-particle p3"></span>';
    }
    if (kind === "voice-wave") {
      return '<span class="cds-bars"><i></i><i></i><i></i><i></i><i></i></span>';
    }
    // ai-orb (default)
    return '<span class="cds-orb-swirl"></span><span class="cds-orb-shine"></span>';
  }

  /* ---------- styles ---------- */
  function css(size, side, primary, panelStyle) {
    var edge = side === "right" ? "-12px" : "12px";
    return [
      ":host{all:initial;}",
      "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}",

      /* launcher */
      ".cds-launcher-wrap{position:fixed;bottom:24px;" + side + ":24px;display:flex;align-items:center;gap:10px;z-index:1;flex-direction:" + (side === "right" ? "row" : "row-reverse") + ";}",
      ".cds-launcher-open{opacity:0;pointer-events:none;transition:opacity .25s;}",
      ".cds-label{background:#fff;color:#0f172a;font-size:13px;font-weight:600;padding:8px 14px;border-radius:999px;box-shadow:0 2px 12px rgba(15,23,42,.18);white-space:nowrap;}",
      ".cds-launcher{position:relative;width:" + size + "px;height:" + size + "px;border-radius:50%;border:0;cursor:pointer;overflow:hidden;display:grid;place-items:center;" +
        "background:radial-gradient(circle at 32% 28%, color-mix(in srgb," + primary + " 45%, #fff), " + primary + " 72%);" +
        "box-shadow:0 6px 24px color-mix(in srgb," + primary + " 55%, transparent);transition:transform .22s ease, box-shadow .22s ease;animation:cdsPulse 3.4s ease-in-out infinite;}",
      ".cds-launcher:hover{transform:scale(1.1);box-shadow:0 10px 32px color-mix(in srgb," + primary + " 70%, transparent);}",
      "@keyframes cdsPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.045);}}",

      /* AI Orb internals */
      ".cds-orb-swirl{position:absolute;inset:-30%;border-radius:50%;" +
        "background:conic-gradient(from 0deg, transparent 0 40%, rgba(255,255,255,.55) 50%, transparent 60% 100%);" +
        "animation:cdsSwirl 6s linear infinite;filter:blur(6px);}",
      "@keyframes cdsSwirl{to{transform:rotate(360deg);}}",
      ".cds-orb-shine{position:absolute;top:16%;left:20%;width:34%;height:26%;border-radius:50%;background:rgba(255,255,255,.7);filter:blur(5px);}",

      /* AI Spark internals */
      ".cds-l-ai-spark{background:radial-gradient(circle at 50% 55%, #0f172a, #1e293b);}",
      ".cds-spark{color:#fff;font-size:" + Math.round(size * 0.44) + "px;line-height:1;animation:cdsShimmer 2.6s ease-in-out infinite;text-shadow:0 0 12px " + primary + ",0 0 26px " + primary + ";}",
      "@keyframes cdsShimmer{0%,100%{opacity:.85;transform:scale(1) rotate(0deg);}50%{opacity:1;transform:scale(1.12) rotate(8deg);}}",
      ".cds-particle{position:absolute;width:4px;height:4px;border-radius:50%;background:#fff;opacity:0;animation:cdsFloat 3.2s ease-in-out infinite;}",
      ".cds-particle.p1{top:22%;left:26%;animation-delay:0s;}",
      ".cds-particle.p2{top:30%;right:22%;animation-delay:1.1s;}",
      ".cds-particle.p3{bottom:24%;left:38%;animation-delay:2.2s;}",
      "@keyframes cdsFloat{0%,100%{opacity:0;transform:translateY(0);}50%{opacity:.9;transform:translateY(-6px);}}",

      /* Voice Wave internals + states */
      ".cds-bars{display:flex;gap:3px;align-items:center;height:" + Math.round(size * 0.5) + "px;}",
      ".cds-bars i{width:4px;height:30%;border-radius:2px;background:#fff;animation:cdsBar 1.15s ease-in-out infinite;animation-play-state:paused;}",
      ".cds-bars i:nth-child(2){animation-delay:.12s}.cds-bars i:nth-child(3){animation-delay:.24s}.cds-bars i:nth-child(4){animation-delay:.36s}.cds-bars i:nth-child(5){animation-delay:.48s}",
      "@keyframes cdsBar{0%,100%{height:26%;}50%{height:78%;}}",
      ".cds-vstate-connecting .cds-bars i{animation-play-state:running;animation-duration:.5s;opacity:.7;}",
      ".cds-vstate-listening .cds-bars i{animation-play-state:running;}",
      ".cds-vstate-speaking .cds-bars i{animation-play-state:running;animation-duration:.55s;}",
      ".cds-vstate-error{background:radial-gradient(circle at 32% 28%, #fca5a5, #dc2626 72%) !important;}",

      /* panel — shared. The z-indexes in this stylesheet are small on
         purpose: the host element owns the page-level stacking (TOP_Z),
         so these only order siblings inside the shadow root. */
      ".cds-panel{position:fixed;max-width:90vw;z-index:2;display:flex;" +
        "transition:transform .34s cubic-bezier(.32,.72,.28,1),opacity .3s ease;}",
      ".cds-frame-slot{flex:1;height:100%;min-width:0;}",
      ".cds-frame{width:100%;height:100%;border:0;display:block;background:transparent;}",
      ".cds-resize{position:absolute;top:0;" + (side === "right" ? "left" : "right") + ":-3px;width:8px;height:100%;cursor:ew-resize;z-index:3;}",
      ".cds-resize:hover{background:color-mix(in srgb," + primary + " 35%, transparent);}",
      ".cds-drag-overlay{position:fixed;inset:0;z-index:3;cursor:ew-resize;}",

      /* edge-anchored styles (solid + clear) */
      ".cds-style-solid,.cds-style-clear{top:0;" + side + ":0;height:100vh;}",
      ".cds-style-solid.cds-hidden,.cds-style-clear.cds-hidden{transform:translateX(" + (side === "right" ? "110%" : "-110%") + ");}",
      ".cds-style-solid.cds-full,.cds-style-clear.cds-full{width:100vw !important;max-width:100vw;}",

      /* solid — opaque panel (default) */
      ".cds-style-solid{background:#fff;box-shadow:" + edge + " 0 40px rgba(15,23,42,.25);}",

      /* clear — see straight through to the customer's site; only the demo's
         own UI elements (bubbles, orb, controls) paint anything. */
      ".cds-style-clear{background:transparent;box-shadow:none;}",

    ].join("\n");
  }
})();
