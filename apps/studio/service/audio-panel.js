/*
 * Cognigy Demo Studio — the microphone gear on the widget.
 *
 * Injected into every voice surface alongside /_cds/audio-clean.js, so it
 * inherits that layer's universality: one gear, every theme, Cognigy Default
 * included — where we cannot touch the widget's internals at all, but can
 * perfectly well draw next to it.
 *
 * WHY A GEAR AND NOT JUST THE SETTINGS SCREEN:
 *
 * Choosing between RNNoise and GTCRN in a settings panel with no audio playing
 * is guesswork. Here the SE A/Bs them against their actual room, on a live
 * call, and hears the difference. That works because audio-clean.js never
 * replaces the outgoing track — switching engines is a reconnect behind a
 * MediaStreamAudioDestinationNode, so there is no replaceTrack, no SDP
 * renegotiation and no audio drop.
 *
 * VISIBILITY: the demo renders on the customer's site and is usually
 * screen-shared, so the gear follows showDiagnostics — the switch SEs already
 * flip before a customer call. With diagnostics off nothing renders and no
 * host element exists; only the hotkey stays armed, so a room that turns noisy
 * mid-call is still recoverable.
 */
(function () {
  "use strict";

  var CFG = window.__CDS_AUDIO__ || {};
  var HOTKEY_HINT = (navigator.platform || "").indexOf("Mac") >= 0 ? "⌘⇧A" : "Ctrl+Shift+A";
  // Roughly the popover's tallest form (gate open, all rows showing). Only used
  // to decide which way it opens, so an approximation is fine.
  var POP_HEIGHT = 320;

  if (!window.CDSAudio) return; // audio-clean.js didn't load; nothing to control.

  var host = null, root = null, open = false, meter = null, raf = 0, anchorRect = null;

  var ENGINES = [
    ["none", "Off", "No denoiser. Browser cancellation only."],
    ["rnnoise", "RNNoise", "Proven, light. Good on steady noise."],
    ["gtcrn", "GTCRN", "Newer, stronger on keyboards and chatter."],
    ["speex", "Speex", "Cheapest. For older machines."]
  ];

  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;z-index:2147483600;font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    ".gear{width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;",
    "background:rgba(20,22,28,.55);color:#fff;opacity:.35;transition:opacity .2s;backdrop-filter:blur(4px)}",
    ".gear:hover,.gear.on{opacity:1}",
    ".pop{position:absolute;bottom:32px;right:0;width:250px;padding:12px;border-radius:10px;",
    "background:#14161c;color:#e7e9ee;box-shadow:0 8px 32px rgba(0,0,0,.45);border:1px solid #2a2e39}",
    ".pop h4{margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.02em}",
    ".row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0}",
    "label{font-size:11px;color:#aab0bd}",
    "select,input[type=range]{width:100%}",
    "select{background:#1d212a;color:#e7e9ee;border:1px solid #2a2e39;border-radius:5px;padding:4px;font-size:11px}",
    ".hint{font-size:10px;color:#767d8c;margin:2px 0 8px;min-height:13px}",
    ".meter{position:relative;height:6px;border-radius:3px;background:#22262f;overflow:hidden;margin:6px 0 2px}",
    ".fill{position:absolute;inset:0 100% 0 0;background:#3694fc;transition:right .05s linear}",
    ".mark{position:absolute;top:-2px;width:2px;height:10px;background:#f0b429}",
    ".legend{display:flex;justify-content:space-between;font-size:10px;color:#767d8c}",
    ".dot{width:7px;height:7px;border-radius:50%;background:#3a4050;display:inline-block;margin-right:5px}",
    ".dot.open{background:#39d98a}",
    ".foot{margin-top:9px;padding-top:8px;border-top:1px solid #262b35;font-size:10px;color:#5d6472}"
  ].join("");

  /* ── state, mirrored to the service so it outlives the demo ──────────── */

  function state() { return window.CDSAudio.cfg(); }

  function save(patch) {
    window.CDSAudio.apply(patch);           // live, no call restart
    var s = state();
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: {
        echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl, engine: s.engine, gate: s.gate,
        gateOpenThreshold: s.gateOpenThreshold, gateCloseThreshold: s.gateCloseThreshold,
        gateHoldMs: s.gateHoldMs
      } })
    }).catch(function () { /* the live change already applied; persistence is a bonus */ });
  }

  /* ── rendering ───────────────────────────────────────────────────────── */

  function build() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-cds-audio", "");
    // Closed: a theme injects arbitrary CSS custom properties into this page,
    // and neither side should be able to reach into the other.
    root = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    var wrap = document.createElement("div");
    wrap.className = "wrap";
    root.appendChild(wrap);
    host.__wrap = wrap;
    document.documentElement.appendChild(host);
    place();
    draw();
  }

  function place() {
    if (!host) return;
    var w = host.__wrap;
    if (anchorRect) {
      // Driven by webrtc.js, which knows where Cognigy's widget actually is.
      w.style.top = Math.max(4, anchorRect.top - 32) + "px";
      w.style.left = Math.max(4, anchorRect.right - 26) + "px";
      w.style.right = "auto";
      w.style.bottom = "auto";
    } else {
      w.style.top = "6px";
      w.style.right = "6px";
      w.style.left = "auto";
      w.style.bottom = "auto";
    }
    orient();
  }

  /*
   * Open the popover away from the nearest edge. Called on every placement, not
   * just on draw: webrtc.js anchors the gear to the widget on its measuring
   * loop, so a popover opened at the top-right and then anchored to a bottom
   * widget would keep opening downward and run off the bottom of the frame.
   */
  function orient() {
    if (!host || !open) return;
    var pop = host.__wrap.querySelector(".pop");
    var gear = host.__wrap.querySelector(".gear");
    if (!pop || !gear) return;
    var box = gear.getBoundingClientRect();
    var below = window.innerHeight - box.bottom;
    // Prefer opening upward, which is where it fits next to a bottom-corner
    // widget; flip down only when there genuinely isn't room above.
    if (box.top < POP_HEIGHT && below >= POP_HEIGHT) {
      pop.style.bottom = "auto";
      pop.style.top = "32px";
    } else {
      pop.style.top = "auto";
      pop.style.bottom = "32px";
    }
  }

  function draw() {
    var w = host.__wrap;
    var s = state();
    w.innerHTML = "";

    var gear = document.createElement("button");
    gear.className = "gear" + (open ? " on" : "");
    gear.title = "Microphone (" + HOTKEY_HINT + ")";
    gear.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' +
      '<circle cx="12" cy="12" r="3.5"/></svg>';
    gear.addEventListener("click", function () { open = !open; draw(); });
    w.appendChild(gear);

    if (!open) { stopMeter(); announce(); return; }

    var pop = document.createElement("div");
    pop.className = "pop";
    pop.innerHTML = '<h4>Microphone</h4>';

    // engine
    var eRow = document.createElement("div");
    eRow.innerHTML = '<label for="eng">Noise suppression</label>';
    var sel = document.createElement("select");
    sel.id = "eng";
    ENGINES.forEach(function (e) {
      var o = document.createElement("option");
      o.value = e[0]; o.textContent = e[1];
      if (s.engine === e[0]) o.selected = true;
      sel.appendChild(o);
    });
    var hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = (ENGINES.filter(function (e) { return e[0] === s.engine; })[0] || ENGINES[0])[2];
    sel.addEventListener("change", function () { save({ engine: sel.value }); draw(); });
    eRow.appendChild(sel);
    pop.appendChild(eRow);
    pop.appendChild(hint);

    // gate
    pop.appendChild(check("Noise gate", s.gate, function (v) { save({ gate: v }); draw(); }));

    if (s.gate) {
      pop.appendChild(slider("Opens above", s.gateOpenThreshold, -90, -10, 1, "dB", function (v) {
        var patch = { gateOpenThreshold: v };
        if (state().gateCloseThreshold > v) patch.gateCloseThreshold = v - 10;
        save(patch);
      }));
      pop.appendChild(slider("Closes below", s.gateCloseThreshold, -100, -10, 1, "dB", function (v) {
        save({ gateCloseThreshold: Math.min(v, state().gateOpenThreshold) });
      }));
      pop.appendChild(slider("Hold", s.gateHoldMs, 0, 500, 10, "ms", function (v) {
        save({ gateHoldMs: v });
      }));
    }

    // level meter
    var m = document.createElement("div");
    m.className = "meter";
    var fill = document.createElement("div");
    fill.className = "fill";
    var mark = document.createElement("div");
    mark.className = "mark";
    m.appendChild(fill); m.appendChild(mark);
    pop.appendChild(m);
    var legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = '<span><span class="dot"></span><span class="lvl">quiet</span></span><span>-90 … 0 dB</span>';
    pop.appendChild(legend);

    pop.appendChild(check("Echo cancellation", s.echoCancellation, function (v) { save({ echoCancellation: v }); }));
    pop.appendChild(check("Browser suppression", s.noiseSuppression, function (v) { save({ noiseSuppression: v }); }));
    pop.appendChild(check("Auto gain", s.autoGainControl, function (v) { save({ autoGainControl: v }); }));

    var foot = document.createElement("div");
    foot.className = "foot";
    foot.textContent = window.CDSAudio.isActive()
      ? "Live — changes apply to this call instantly."
      : "Applies to the next call.";
    pop.appendChild(foot);

    w.appendChild(pop);
    orient();
    startMeter(fill, mark, legend);
    announce();
  }

  /*
   * The clip rect that webrtc.js reports to the extension is a union of the
   * widget and this gear. Opening the popover changes our half of it but
   * touches nothing the widget's MutationObserver watches, so tell it to
   * re-measure or the popover is drawn outside the clip and cropped away.
   */
  function announce() {
    try { window.dispatchEvent(new Event("cds-audio-panel-resize")); } catch (e) {}
  }

  function check(label, value, onChange) {
    var row = document.createElement("div");
    row.className = "row";
    var l = document.createElement("label");
    l.textContent = label;
    var i = document.createElement("input");
    i.type = "checkbox";
    i.checked = !!value;
    i.addEventListener("change", function () { onChange(i.checked); });
    row.appendChild(l); row.appendChild(i);
    return row;
  }

  function slider(label, value, min, max, step, unit, onChange) {
    var box = document.createElement("div");
    var row = document.createElement("div");
    row.className = "row";
    var l = document.createElement("label");
    l.textContent = label;
    var out = document.createElement("label");
    out.textContent = value + " " + unit;
    row.appendChild(l); row.appendChild(out);
    var i = document.createElement("input");
    i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = value;
    i.addEventListener("input", function () {
      out.textContent = i.value + " " + unit;
      onChange(parseFloat(i.value));
    });
    box.appendChild(row); box.appendChild(i);
    return box;
  }

  /* ── the meter ───────────────────────────────────────────────────────── */

  function startMeter(fill, mark, legend) {
    stopMeter();
    var dot = legend.querySelector(".dot");
    var lvl = legend.querySelector(".lvl");

    function frame() {
      var r = window.CDSAudio.level();
      if (!r && !meter) {
        // No call running — open our own preview so the threshold can still be
        // set against the room.
        meter = "pending";
        window.CDSAudio.monitor().then(function (m) { meter = m; })
          .catch(function () { meter = null; });
      } else if (!r && meter && meter !== "pending") {
        r = meter.read();
      }
      if (r) {
        var pct = Math.max(0, Math.min(100, (r.db + 90) / 90 * 100));
        fill.style.right = (100 - pct) + "%";
        var s = state();
        mark.style.left = Math.max(0, Math.min(100, (s.gateOpenThreshold + 90) / 90 * 100)) + "%";
        mark.style.display = s.gate ? "block" : "none";
        dot.className = "dot" + (r.open ? " open" : "");
        lvl.textContent = Math.round(r.db) + " dB";
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function stopMeter() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (meter && meter !== "pending") { meter.stop(); }
    meter = null;
  }

  /* ── public surface, driven by webrtc.js ─────────────────────────────── */

  function show() { build(); host.style.display = ""; }
  function hide() { if (host) { open = false; stopMeter(); host.style.display = "none"; } }

  window.CDSAudioPanel = {
    show: show,
    hide: hide,
    /** Place the gear next to Cognigy's widget, which webrtc.js measures. */
    anchor: function (rect) { anchorRect = rect; place(); },
    /**
     * The gear's own bounds, for webrtc.js to union into the clip rect it
     * reports. Without that union the gear is cropped away on Cognigy Default
     * and `clear` — visible in the DOM, invisible and unclickable on screen.
     */
    rect: function () {
      if (!host || host.style.display === "none") return null;
      var w = host.__wrap;
      if (!w) return null;
      /*
       * Union of the gear AND the open popover. The popover is absolutely
       * positioned, so it contributes nothing to .wrap's own border box —
       * returning that box alone would report the 26px gear while the popover
       * hung 250px outside the clip rect, cropped away the moment it opened.
       */
      var box = null;
      var els = [w].concat(Array.prototype.slice.call(w.children));
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        if (!r.width || !r.height) continue;
        box = box ? {
          left: Math.min(box.left, r.left), top: Math.min(box.top, r.top),
          right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom)
        } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      if (!box) return null;
      box.width = box.right - box.left;
      box.height = box.bottom - box.top;
      return box;
    },
    isOpen: function () { return open; }
  };

  // Diagnostics off: render nothing, but stay reachable. A room that goes
  // noisy mid-call shouldn't mean reopening Studio Settings.
  if (CFG.panel !== false && CFG.diagnostics) build();

  window.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      build();
      host.style.display = "";
      open = !open;
      draw();
    }
  });
  window.addEventListener("pagehide", stopMeter);
})();
