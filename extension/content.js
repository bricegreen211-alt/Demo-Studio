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

  // Master switch (popup). Nothing is injected anywhere while this is off, so
  // demos don't follow you around every tab when you're not demoing.
  chrome.storage.local.get({ cdsEnabled: false }, function (state) {
    if (!state.cdsEnabled) return;
    chrome.runtime.sendMessage({ type: "CDS_RESOLVE", host: location.hostname }, function (res) {
      if (chrome.runtime.lastError) return;
      if (!res || !res.ok || !res.data || !res.data.demo) return;
      var demo = res.data.demo;
      if (!demo.built) return; // nothing to show yet
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

    var host = document.createElement("div");
    host.id = "cds-shell-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483000;";
    var root = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial;}" +
      ".cds-overlay-frame{position:fixed;bottom:20px;" + side + ":20px;border:0;" +
      "background:transparent;z-index:2147483002;display:block;" +
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

  function mount(demo) {
    if ((demo.panelStyle || "solid") === "overlay") return mountOverlay(demo);

    var size = SIZES[demo.launcherSize] || SIZES.medium;
    var side = demo.panelSide === "left" ? "left" : "right";
    var primary = (demo.theme && demo.theme.primaryColor) || "#3694fc";
    var panelStyle = demo.panelStyle || "solid";
    var width = Math.max(MIN_W, demo.panelWidth || 420);

    var host = document.createElement("div");
    host.id = "cds-shell-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483000;";
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

    // Phone mockup keeps a real device aspect ratio, so width and height are
    // computed together and clamped to the viewport; the other styles are
    // full-height and only the width varies.
    var PHONE_AR = 375 / 812;
    function layoutPanel(w) {
      width = Math.round(Math.min(window.innerWidth * 0.9, Math.max(MIN_W, w)));
      if (panelStyle === "phone") {
        var h = Math.min(window.innerHeight - 40, width / PHONE_AR);
        var phoneW = Math.round(h * PHONE_AR);
        panel.style.width = phoneW + "px";
        panel.style.height = Math.round(h) + "px";
      } else {
        panel.style.width = width + "px";
        panel.style.height = "";
      }
    }
    layoutPanel(width);
    window.addEventListener("resize", function () { layoutPanel(width); });

    var overlay = document.createElement("div"); // drag shield
    overlay.className = "cds-drag-overlay";

    root.appendChild(launcherWrap);
    root.appendChild(panel);
    document.documentElement.appendChild(host);

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
        if (panelStyle === "phone") {
          // A phone can't go full-bleed without stopping being a phone — grow
          // it to the tallest the viewport allows instead.
          layoutPanel(fullscreen ? window.innerWidth : (demo.panelWidth || 420));
        } else {
          panel.classList.toggle("cds-full", fullscreen);
        }
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
    return [
      ":host{all:initial;}",
      "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}",

      /* launcher */
      ".cds-launcher-wrap{position:fixed;bottom:24px;" + side + ":24px;display:flex;align-items:center;gap:10px;z-index:2147483001;flex-direction:" + (side === "right" ? "row" : "row-reverse") + ";}",
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

      /* panel — shared */
      ".cds-panel{position:fixed;max-width:90vw;z-index:2147483002;display:flex;" +
        "transition:transform .34s cubic-bezier(.32,.72,.28,1),opacity .3s ease;}",
      ".cds-frame-slot{flex:1;height:100%;min-width:0;}",
      ".cds-frame{width:100%;height:100%;border:0;display:block;background:transparent;}",
      ".cds-resize{position:absolute;top:0;" + (side === "right" ? "left" : "right") + ":-3px;width:8px;height:100%;cursor:ew-resize;z-index:3;}",
      ".cds-resize:hover{background:color-mix(in srgb," + primary + " 35%, transparent);}",
      ".cds-drag-overlay{position:fixed;inset:0;z-index:2147483003;cursor:ew-resize;}",

      /* edge-anchored styles (solid + clear) */
      ".cds-style-solid,.cds-style-clear{top:0;" + side + ":0;height:100vh;}",
      ".cds-style-solid.cds-hidden,.cds-style-clear.cds-hidden{transform:translateX(" + (side === "right" ? "110%" : "-110%") + ");}",
      ".cds-style-solid.cds-full,.cds-style-clear.cds-full{width:100vw !important;max-width:100vw;}",

      /* solid — opaque panel (default) */
      ".cds-style-solid{background:#fff;" +
        "box-shadow:" + (side === "right" ? "-12px" : "12px") + " 0 40px rgba(15,23,42,.25);}",

      /* clear — see straight through to the customer's site; only the demo's
         own UI elements (bubbles, orb, controls) paint anything. */
      ".cds-style-clear{background:transparent;box-shadow:none;}",

      /* phone — floating device mockup, fully transparent around the body */
      ".cds-style-phone{bottom:20px;" + side + ":24px;background:#0f0f12;" +
        "border-radius:54px;padding:12px;" +
        "box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.07) inset;}",
      ".cds-style-phone.cds-hidden{transform:translateY(120%);opacity:0;}",
      // Screen is black edge-to-edge; the demo is inset into the safe area so
      // the dynamic island and home indicator never sit on top of its UI.
      ".cds-style-phone .cds-frame-slot{border-radius:42px;overflow:hidden;background:#000;" +
        "padding:34px 0 22px;}",
      /* dynamic island */
      ".cds-style-phone::before{content:'';position:absolute;top:24px;left:50%;transform:translateX(-50%);" +
        "width:32%;height:24px;background:#0f0f12;border-radius:999px;z-index:4;pointer-events:none;}",
      /* home indicator */
      ".cds-style-phone::after{content:'';position:absolute;bottom:20px;left:50%;transform:translateX(-50%);" +
        "width:34%;height:4px;background:rgba(255,255,255,.55);border-radius:999px;z-index:4;pointer-events:none;}"
    ].join("\n");
  }
})();
