/*
 * Cognigy Remote Control.
 *
 * Voice Agent tab — a gateway LIST mirroring the Demo Experiences layout:
 * Find at the top, collapsible folders, and per-row actions — inline
 * Call / Mute / End (via the vendored @cognigy/click-to-call-sdk bundle,
 * window.CdsVoice), Edit, Pop Out (full widget view with mic/speaker
 * devices and end-call, in a compact window for off-screen use), Delete.
 *
 * Outbound Trigger tab — contacts mini-CRM posting to a Cognigy Agent flow
 * REST endpoint (voice primary; SMS/email beta).
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var api = function (path, options) {
    return fetch(path, options).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
        return j;
      });
    });
  };
  function postJson(body) { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
  function putJson(body) { return { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
  function esc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  var settings = null;
  var demos = [];
  var booted = false;
  var POPOUT = /popout=1/.test(location.hash);
  var POPOUT_GW = (location.hash.match(/gw=([A-Za-z0-9_-]+)/) || [])[1] || "";

  function normVoice(url) {
    return window.CognigyNormalize ? window.CognigyNormalize.voiceEndpoint(url || "") : (url || "");
  }

  /* ══════════════ Gateway list (Voice Agent tab) ══════════════ */

  var gwCollapsed = {};

  function gateways() { return settings.gateways || []; }

  function persistGateways() {
    return api("/api/settings", putJson({ gateways: gateways(), gatewayFolders: settings.gatewayFolders || [] }))
      .then(function (s) { settings = s; });
  }

  /*
   * settings.gatewayFolders IS the order — exactly as settings.folders is on
   * the demos side — so a folder dragged into place stays there. This used to
   * sort alphabetically, which threw that order away. A folder discovered only
   * on a gateway (imported, or a hand-edited settings.json) is appended,
   * sorted, so it can still never go missing.
   */
  function gwFolderNames() {
    var names = (settings.gatewayFolders || []).slice();
    var extra = [];
    gateways().forEach(function (g) {
      if (g.folder && names.indexOf(g.folder) < 0 && extra.indexOf(g.folder) < 0) extra.push(g.folder);
    });
    extra.sort(function (a, b) { return a.localeCompare(b); });
    return names.concat(extra);
  }

  /* ---------------- folders: drag, rename, delete ---------------- */
  /*
   * Same gestures as Demo Experiences, but the writes stay on this side. A
   * demo's folder lives in its own demo.json on disk, so renaming there had to
   * be a service route or N files could drift apart halfway through. A
   * gateway and the folder list are both fields of settings.json, written by
   * one atomic PUT, so a route would be ceremony with nothing to protect.
   *
   * One module-level `gwDrag` describes what is in flight, because HTML5
   * drag-and-drop's dataTransfer is unreadable during dragover — which is
   * exactly when the drop target has to decide whether it will accept.
   */
  var gwDrag = null;

  function clearGwDropHints() {
    Array.prototype.forEach.call(
      $("gwList").querySelectorAll(".drop-into, .drop-before"),
      function (el) { el.classList.remove("drop-into", "drop-before"); }
    );
    $("gwList").classList.remove("drop-into");
  }

  // A folder header accepts a gateway (file it here) or a folder (land above me).
  function wireGwFolderDrop(head, name) {
    head.addEventListener("dragstart", function (ev) {
      gwDrag = { kind: "folder", name: name };
      try { ev.dataTransfer.setData("text/plain", name); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
    });
    head.addEventListener("dragend", function () { gwDrag = null; clearGwDropHints(); });
    head.addEventListener("dragover", function (ev) {
      if (!gwDrag) return;
      if (gwDrag.kind === "gw" && gwDrag.from === name) return;      // already here
      if (gwDrag.kind === "folder" && gwDrag.name === name) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      clearGwDropHints();
      head.classList.add(gwDrag.kind === "gw" ? "drop-into" : "drop-before");
    });
    head.addEventListener("dragleave", function () { head.classList.remove("drop-into", "drop-before"); });
    head.addEventListener("drop", function (ev) {
      ev.preventDefault();
      var d = gwDrag;
      clearGwDropHints();
      gwDrag = null;
      if (!d) return;
      if (d.kind === "gw") return moveGwToFolder(d.id, name);
      if (d.kind === "folder") return reorderGwFolder(d.name, name);
    });
  }

  function afterFolderChange() {
    return persistGateways().then(function () { renderGwList(); renderGwOptions(); });
  }

  function moveGwToFolder(id, folder) {
    gateways().forEach(function (g) { if (g.id === id) g.folder = folder; });
    afterFolderChange().catch(function (e) { rcToast(e.message, false); });
  }

  // Drop `moved` immediately before `before`; a null `before` sends it to the end.
  function reorderGwFolder(moved, before) {
    var order = gwFolderNames().filter(function (f) { return f !== moved; });
    var at = before ? order.indexOf(before) : order.length;
    order.splice(at < 0 ? order.length : at, 0, moved);
    settings.gatewayFolders = order;
    afterFolderChange().catch(function (e) { rcToast(e.message, false); });
  }

  var gwFolderActions = {
    rename: function (name) {
      var next = prompt("Rename folder:", name);
      if (next === null) return;
      next = next.trim().slice(0, 80);
      if (!next || next === name) return;
      var merging = gwFolderNames().indexOf(next) >= 0;
      if (merging && !confirm('"' + next + '" already exists.\n\nRenaming will merge the two folders. Continue?')) return;
      var seen = [];
      settings.gatewayFolders = gwFolderNames()
        .map(function (f) { return f === name ? next : f; })
        .filter(function (f) { if (seen.indexOf(f) >= 0) return false; seen.push(f); return true; });
      gateways().forEach(function (g) { if (g.folder === name) g.folder = next; });
      gwCollapsed[next] = gwCollapsed[name];   // carry the open/closed state over
      afterFolderChange().catch(function (e) { rcToast(e.message, false); });
    },
    // Deletes the label, never the gateways: they return to the top level.
    delete: function (name) {
      var count = gateways().filter(function (g) { return g.folder === name; }).length;
      if (!confirm('Delete the folder "' + name + '"?\n\n' +
                   (count
                     ? count + (count === 1 ? " gateway moves" : " gateways move") + " back to the top level. Nothing is deleted."
                     : "It is empty."))) return;
      settings.gatewayFolders = gwFolderNames().filter(function (f) { return f !== name; });
      gateways().forEach(function (g) { if (g.folder === name) g.folder = ""; });
      afterFolderChange().catch(function (e) { rcToast(e.message, false); });
    }
  };

  function renderGwOptions() {
    var fl = $("gwFolderOptions");
    fl.innerHTML = "";
    gwFolderNames().forEach(function (f) {
      var o = document.createElement("option");
      o.value = f;
      fl.appendChild(o);
    });
    // Endpoint suggestions from demos that carry a voice endpoint.
    var el = $("gwEndpointOptions");
    el.innerHTML = "";
    demos.forEach(function (d) {
      if (d.cognigy && d.cognigy.voiceEndpoint) {
        var o = document.createElement("option");
        o.value = d.cognigy.voiceEndpoint;
        o.label = "Demo — " + d.name;
        el.appendChild(o);
      }
    });
  }

  function gwMatches(g, q) {
    if (!q) return true;
    return (g.name + " " + (g.endpointUrl || "") + " " + (g.folder || "")).toLowerCase().indexOf(q) >= 0;
  }

  function renderGwList() {
    var q = ($("gwFind").value || "").trim().toLowerCase();
    var list = $("gwList");
    list.innerHTML = "";
    var all = gateways();
    var visible = all.filter(function (g) { return gwMatches(g, q); });
    $("gwEmpty").hidden = all.length > 0;
    $("gwNoMatches").hidden = !(all.length > 0 && visible.length === 0);

    var groups = { "": [] };
    gwFolderNames().forEach(function (f) { groups[f] = []; });
    visible.forEach(function (g) {
      var f = g.folder || "";
      if (!groups[f]) groups[f] = [];
      groups[f].push(g);
    });

    (groups[""] || []).forEach(function (g) { list.appendChild(gwRow(g)); });
    // gwFolderNames(), not a sort of the group keys — the stored order is the
    // display order, or dragging a folder would persist and never show.
    gwFolderNames().forEach(function (f) {
      if (!f || !groups[f]) return;
      if (q && groups[f].length === 0) return;
      var head = document.createElement("div");
      head.className = "folder-head" + (gwCollapsed[f] && !q ? " collapsed" : "");
      head.setAttribute("data-folder", f);
      head.draggable = true;
      head.innerHTML =
        '<span class="folder-grip" data-ico="drag_indicator" data-size="16" title="Drag to reorder"></span>' +
        '<span class="folder-caret" data-ico="expand_more" data-size="18"></span>' +
        '<span class="folder-ico" data-ico="folder" data-size="16"></span> <b></b> ' +
        '<span class="folder-count"></span>' +
        '<span class="folder-tools">' +
          '<button class="icon-btn" data-fact="rename" title="Rename folder" aria-label="Rename folder"></button>' +
          '<button class="icon-btn" data-fact="delete" title="Delete folder" aria-label="Delete folder"></button>' +
        '</span>';
      head.querySelector('[data-fact="rename"]').innerHTML = CDSIcons.svg("edit", 15);
      head.querySelector('[data-fact="delete"]').innerHTML = CDSIcons.svg("delete", 15);
      CDSIcons.hydrate(head);
      head.querySelector("b").textContent = f;
      head.querySelector(".folder-count").textContent = groups[f].length + (groups[f].length === 1 ? " gateway" : " gateways");
      head.addEventListener("click", function (ev) {
        var act = ev.target.closest("[data-fact]");
        if (act) { ev.stopPropagation(); return gwFolderActions[act.getAttribute("data-fact")](f); }
        if (ev.target.closest(".folder-grip")) return;   // the grip is for dragging
        gwCollapsed[f] = !gwCollapsed[f];
        renderGwList();
      });
      wireGwFolderDrop(head, f);
      list.appendChild(head);
      if (!gwCollapsed[f] || q) groups[f].forEach(function (g) { list.appendChild(gwRow(g, true)); });
    });
  }

  var WAVE = [5, 10, 17, 11, 20, 13, 8, 17, 11, 6, 10];

  /*
   * The gateway on a call becomes a Halo voice panel in place of its row —
   * the same shape the WebRTC demos use: call status strip, live transcript,
   * Mute and End.
   *
   * It takes the dashboard's own tokens rather than Halo's literal white,
   * because this one is app chrome and has to follow light and dark like
   * everything else around it. The layout is the design; the palette is the
   * app's.
   */
  function gwCallPanel(g) {
    /*
     * Idle or in-call, one panel. The gateway list only shows it while a call
     * is running; the pop-out shows it always, which is why the idle state has
     * to be a real state here rather than "the row you see when not calling".
     */
    var call = inlineCall && inlineCall.gwId === g.id ? inlineCall : null;
    var live = !!call && call.status === "active";
    var status = !call ? "Ready to call"
      : (call.muted && live) ? "Microphone muted"
      : live ? "Call in progress"
      : call.status === "ringing" ? "Calling\u2026" : "Connecting\u2026";

    var el = document.createElement("div");
    el.className = "rc-halo";
    el.dataset.gwId = g.id;

    el.innerHTML =
      '<div class="cds-head">' +
        '<div class="cds-avatar">' + CDSIcons.svg("graphic_eq", 22) + '</div>' +
        '<div class="cds-head-text"><h3 class="cds-agent"></h3><p class="cds-sub"></p></div>' +
        (POPOUT ? "" :
          '<button class="icon-btn" data-act="popout" title="Full view with mic and speaker devices">' +
            CDSIcons.svg("open_in_new", 16) + '</button>') +
      '</div>' +
      '<div class="cds-strip">' +
        '<span class="cds-dot' + (live ? " on" : "") + '"></span>' +
        '<span role="status" class="rc-halo-status"></span>' +
        (live ? '<span class="cds-clock" data-role="timer"></span>' : "") +
        '<div class="cds-wave" aria-hidden="true">' +
          WAVE.map(function (h, i) {
            return '<i style="--h:' + h + 'px;--delay:-' + (i * 0.13) + 's"></i>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<h4 class="cds-tt">Live transcript</h4>' +
      '<div class="cds-scroll" role="log" aria-live="polite"></div>' +
      '<div class="cds-vfoot">' +
        '<button class="cds-mute" data-act="mute" aria-pressed="' + (call && call.muted ? "true" : "false") + '"' +
          (live ? "" : " disabled") + ">" +
          CDSIcons.svg(call && call.muted ? "mic_off" : "mic", 18) +
          "<span>" + (call && call.muted ? "Unmute" : "Mute") + "</span></button>" +
        (call
          ? '<button class="cds-call end" data-act="end">' + CDSIcons.svg("call_end", 18) +
            "<span>End call</span></button>"
          : '<button class="cds-call" data-act="call"' + (inlineCall ? " disabled" : "") + ">" +
            CDSIcons.svg("call", 18) + "<span>Start a call</span></button>") +
      "</div>";

    el.querySelector(".cds-agent").textContent = g.name || "Voice agent";
    el.querySelector(".cds-sub").textContent = hostOf(g);
    el.querySelector(".rc-halo-status").textContent = status;
    var t = el.querySelector('[data-role="timer"]');
    if (t) t.textContent = "\u00b7 " + fmtSecs(call ? call.seconds : 0);

    var log = el.querySelector(".cds-scroll");
    if (call && call.lines.length) {
      call.lines.forEach(function (l) { log.appendChild(utteranceEl(l.role, l.text, l.at)); });
    } else {
      var empty = document.createElement("div");
      empty.className = "cds-empty";
      empty.innerHTML = CDSIcons.svg("mic", 26) +
        "<strong>" + (call ? "Listening\u2026" : "Ready when you are.") + "</strong>";
      var p = document.createElement("p");
      p.textContent = call
        ? "Whatever " + (g.name || "the agent") + " transcribes appears here."
        : "Start a call and the conversation appears here as it is transcribed.";
      empty.appendChild(p);
      log.appendChild(empty);
    }

    el.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      var act = btn && btn.getAttribute("data-act");
      if (!act || btn.disabled) return;
      if (act === "call") startInlineCall(g);
      else if (act === "mute") toggleInlineMute();
      else if (act === "end") endInlineCall();
      else if (act === "popout") popOut(g);
    });
    return el;
  }

  /*
   * Where the call surface lives depends on the window. The gateway list and
   * the pop-out render the SAME panel from the same state — the pop-out is the
   * same thing with device controls and no list around it.
   */
  function renderCallSurfaces() {
    if (POPOUT) return renderPopout();
    renderGwList();
  }

  function renderPopout() {
    var g = popoutGateway();
    if (!g) return;
    var wrap = $("rc-widget-wrap");
    wrap.innerHTML = "";
    wrap.appendChild(gwCallPanel(g));
  }

  function hostOf(g) {
    try { return new URL(normVoice(g.endpointUrl)).hostname; } catch (e) { return g.endpointUrl || ""; }
  }

  function gwRow(g, indented) {
    // On a call, this gateway is shown as the Halo panel instead of a row.
    if (inlineCall && inlineCall.gwId === g.id) return gwCallPanel(g);
    var el = document.createElement("div");
    el.className = "demo-row" + (indented ? " in-folder" : "");
    el.dataset.gwId = g.id;
    el.draggable = true;
    el.addEventListener("dragstart", function (ev) {
      gwDrag = { kind: "gw", id: g.id, from: g.folder || "" };
      el.classList.add("dragging");
      try { ev.dataTransfer.setData("text/plain", g.id); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
    });
    el.addEventListener("dragend", function () { gwDrag = null; clearGwDropHints(); el.classList.remove("dragging"); });
    var onCall = false;   // an active call renders as gwCallPanel above
    var host = hostOf(g);

    var callControls;
    if (!onCall) {
      callControls = '<button class="primary" data-act="call"' + (inlineCall ? " disabled" : "") + ">" +
        CDSIcons.svg("call", 15) + " Call</button>";
    } else {
      callControls =
        '<span class="gw-state ' + inlineCall.status + '"><i class="gw-dot"></i>' +
        (inlineCall.status === "active" ? '<span data-role="timer">' + fmtSecs(inlineCall.seconds) + "</span>" :
         inlineCall.status === "ringing" ? "Calling…" : "Connecting…") +
        "</span>" +
        (inlineCall.status === "active"
          ? '<button class="ghost gw-mute' + (inlineCall.muted ? " on" : "") + '" data-act="mute">' +
            (inlineCall.muted ? CDSIcons.svg("mic_off", 15) + " Unmute" : CDSIcons.svg("mic", 15) + " Mute") + "</button>"
          : "") +
        '<button class="gw-end" data-act="end">' + CDSIcons.svg("close", 15) + " End</button>";
    }

    el.innerHTML =
      '<div class="demo-row-main"><h3></h3><span class="demo-site"></span></div>' +
      '<div class="demo-actions">' +
      callControls +
      '<button class="ghost" data-act="edit">Edit</button>' +
      '<button class="ghost" data-act="popout" title="Full view with mic/speaker devices — move it off-screen during the demo">' +
      CDSIcons.svg("open_in_new", 15) + ' Pop Out</button>' +
      '<button class="danger" data-act="delete" aria-label="Delete">' + CDSIcons.svg("close", 15) + '</button>' +
      "</div>";
    el.querySelector("h3").textContent = g.name || "(unnamed gateway)";
    el.querySelector(".demo-site").textContent = host || g.endpointUrl || "No endpoint";
    el.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      var act = btn && btn.getAttribute("data-act");
      if (!act || (btn && btn.disabled)) return;
      if (act === "call") startInlineCall(g);
      else if (act === "mute") toggleInlineMute();
      else if (act === "end") endInlineCall();
      else if (act === "edit") showGwForm(g);
      else if (act === "popout") popOut(g);
      else if (act === "delete") deleteGw(g);
    });
    return el;
  }

  function fmtSecs(s) {
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* ── gateway CRUD ── */

  function showGwForm(g) {
    $("gwForm").hidden = false;
    $("gwId").value = g ? g.id : "";
    $("gwName").value = g ? g.name : "";
    $("gwEndpoint").value = g ? g.endpointUrl : "";
    $("gwFolder").value = g ? (g.folder || "") : "";
    renderGwOptions();
    $("gwName").focus();
  }

  $("gwNewBtn").addEventListener("click", function () { showGwForm(null); });
  $("gwCancelBtn").addEventListener("click", function () { $("gwForm").hidden = true; });
  $("gwSaveBtn").addEventListener("click", function () {
    var name = $("gwName").value.trim();
    var endpointUrl = $("gwEndpoint").value.trim();
    var folder = $("gwFolder").value.trim();
    if (!name) { rcToast("Gateway name is required.", false); return; }
    if (!endpointUrl) { rcToast("Paste the voice endpoint (Click-to-Call link, endpoint URL, or token).", false); return; }
    var id = $("gwId").value;
    if (id) {
      gateways().forEach(function (g) {
        if (g.id === id) { g.name = name; g.endpointUrl = endpointUrl; g.folder = folder; }
      });
    } else {
      settings.gateways = gateways().concat([{ id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: name, endpointUrl: endpointUrl, folder: folder }]);
    }
    persistGateways().then(function () { $("gwForm").hidden = true; renderGwList(); renderGwOptions(); });
  });

  function deleteGw(g) {
    if (!confirm('Delete gateway "' + g.name + '"?')) return;
    if (inlineCall && inlineCall.gwId === g.id) endInlineCall();
    settings.gateways = gateways().filter(function (x) { return x.id !== g.id; });
    persistGateways().then(renderGwList);
  }

  $("gwFind").addEventListener("input", renderGwList);

  /*
   * The list background is the "no folder" target, so a gateway can be dragged
   * back out. Without it one could be filed but never unfiled by dragging.
   */
  (function () {
    var list = $("gwList");
    list.addEventListener("dragover", function (ev) {
      if (!gwDrag || gwDrag.kind !== "gw" || !gwDrag.from) return;
      if (ev.target.closest(".folder-head") || ev.target.closest(".demo-row")) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      list.classList.add("drop-into");
    });
    list.addEventListener("dragleave", function () { list.classList.remove("drop-into"); });
    list.addEventListener("drop", function (ev) {
      if (!gwDrag || gwDrag.kind !== "gw") return;
      if (ev.target.closest(".folder-head") || ev.target.closest(".demo-row")) return;
      ev.preventDefault();
      var id = gwDrag.id;
      gwDrag = null;
      list.classList.remove("drop-into");
      moveGwToFolder(id, "");
    });
  })();

  $("gwNewFolderBtn").addEventListener("click", function () {
    var name = prompt("Folder name:");
    if (!name || !name.trim()) return;
    name = name.trim().slice(0, 80);
    if (gwFolderNames().indexOf(name) < 0) {
      settings.gatewayFolders = (settings.gatewayFolders || []).concat([name]);
      persistGateways().then(function () { renderGwList(); renderGwOptions(); });
    }
  });

  /* ── inline Call / Mute / End (SDK, no widget UI) ── */

  var inlineCall = null;

  function startInlineCall(g) {
    if (inlineCall) { rcToast("End the current call first.", false); return; }
    if (!window.CdsVoice) { rcToast("Voice SDK failed to load.", false); return; }
    var support = window.CdsVoice.checkWebRTCSupport();
    if (!support.supported) { rcToast("This browser doesn't support WebRTC calls.", false); return; }
    var endpointUrl = normVoice(g.endpointUrl);
    if (!endpointUrl) { rcToast("This gateway has no valid endpoint — click Edit.", false); return; }

    inlineCall = { gwId: g.id, gwName: g.name || "Voice agent", client: null, status: "connecting",
                   muted: false, seconds: 0, timer: null, lines: [], startedAt: 0, speaking: 0 };
    setCallState("connecting");
    renderCallSurfaces();

    window.CdsVoice.createWebRTCClient({
      endpointUrl: endpointUrl,
      userId: (settings && settings.followMeUserId) || "followme"
    })
      .then(function (client) {
        if (!inlineCall || inlineCall.gwId !== g.id) { client.destroy().catch(function () {}); return; }
        inlineCall.client = client;
        client.on("ringing", function () { if (inlineCall) { inlineCall.status = "ringing"; renderCallSurfaces(); } });
        client.on("answered", function () {
          if (!inlineCall) return;
          inlineCall.status = "active";
          inlineCall.startedAt = Date.now();
          setCallState("active");
          inlineCall.timer = setInterval(function () {
            if (!inlineCall) return;
            inlineCall.seconds++;
            var t = document.querySelector('[data-role="timer"]');
            if (t) t.textContent = fmtSecs(inlineCall.seconds);
          }, 1000);
          renderCallSurfaces();
        });
        client.on("muted", function () { if (inlineCall) { inlineCall.muted = true; renderCallSurfaces(); } });
        client.on("unmuted", function () { if (inlineCall) { inlineCall.muted = false; renderCallSurfaces(); } });
        /*
         * Live transcript. Remote Control had no transcription handling at all
         * — the SDK was emitting these and nothing listened, so an SE on a
         * Remote Control call saw a timer and nothing else.
         *
         * Two events, because the SDK splits them: a SIP INFO body carrying
         * "_transcription" becomes "transcription" (with the inner value
         * only), and every other body becomes "infoReceived", which is also
         * where mid-call cards and xApp payloads arrive. Both are read; the
         * shared reader returns null for anything with no speech in it.
         */
        client.on("transcription", function (payload) { pushLine(payload); });
        client.on("infoReceived", function (payload) { pushLine(payload); });
        client.on("ended", function () { cleanupInlineCall(); });
        client.on("failed", function (s, info) {
          rcToast("Call failed" + (info && (info.description || info.cause) ? ": " + (info.description || info.cause) : "") + ".", false);
          cleanupInlineCall();
        });
        client.on("error", function (err) {
          rcToast("Voice error: " + String((err && err.message) || err), false);
        });
        return client.connectAndCall();
      })
      .catch(function (err) {
        rcToast("Could not start the call: " + String((err && err.message) || err), false);
        cleanupInlineCall();
      });
  }

  function toggleInlineMute() {
    if (!inlineCall || !inlineCall.client) return;
    var c = inlineCall.client;
    (inlineCall.muted ? c.unmute() : c.mute()).catch(function () {});
  }

  function endInlineCall() {
    if (!inlineCall) return;
    var c = inlineCall.client;
    if (c) {
      c.endCall().catch(function () {}).then(function () { c.destroy().catch(function () {}); });
    }
    cleanupInlineCall();
  }

  /*
   * Append one transcript line. Renders in place rather than re-rendering the
   * whole list: a full renderGwList() on every utterance would rebuild the
   * call controls under the SE's cursor mid-call.
   */
  function pushLine(payload) {
    if (!inlineCall || !window.CDSVoiceTranscript) return;
    var lines = window.CDSVoiceTranscript.readTranscription(payload);
    for (var i = 0; i < lines.length; i++) appendLine(lines[i]);
  }

  function appendLine(line) {
    if (!inlineCall) return;
    // Cognigy re-sends lines; drop an immediate repeat. See pushLine in the
    // templates' useCognigyVoice.ts, which does the same.
    var last = inlineCall.lines[inlineCall.lines.length - 1];
    if (last && last.role === line.role && last.text === line.text) return;
    var at = Math.max(0, Math.round((Date.now() - (inlineCall.startedAt || Date.now())) / 1000));
    inlineCall.lines.push({ role: line.role, text: line.text, at: at });
    if (line.role === "ai") {
      inlineCall.speaking = Date.now();
      var w = document.querySelector(".rc-halo .cds-wave");
      if (w) {
        w.classList.add("on");
        clearTimeout(inlineCall.waveTimer);
        inlineCall.waveTimer = setTimeout(function () { w.classList.remove("on"); }, 2600);
      }
    }
    var log = document.querySelector(".rc-halo .cds-scroll");
    if (!log) return;
    var empty = log.querySelector(".cds-empty");
    if (empty) empty.remove();
    var bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.appendChild(utteranceEl(line.role, line.text, at));
    if (bottom) log.scrollTop = log.scrollHeight;
  }

  function utteranceEl(role, text, at) {
    var row = document.createElement("div");
    row.className = "cds-utt cds-utt-" + (role === "user" ? "user" : "ai");
    var icon = document.createElement("div");
    icon.className = "cds-utt-icon";
    icon.textContent = role === "user" ? "You" : "AI";
    var body = document.createElement("div");
    body.className = "cds-utt-body";
    var who = document.createElement("p");
    who.className = "cds-utt-who";
    who.textContent = role === "user" ? "You" : (inlineCall ? inlineCall.gwName : "Voice agent");
    var t = document.createElement("time");
    t.textContent = "\u00b7 " + fmtSecs(at);
    who.appendChild(t);
    var p = document.createElement("p");
    p.className = "cds-utt-text";
    p.textContent = text;                        // textContent, never innerHTML
    body.appendChild(who); body.appendChild(p);
    row.appendChild(icon); row.appendChild(body);
    return row;
  }

  function cleanupInlineCall() {
    if (inlineCall && inlineCall.timer) clearInterval(inlineCall.timer);
    if (inlineCall && inlineCall.waveTimer) clearTimeout(inlineCall.waveTimer);
    var c = inlineCall && inlineCall.client;
    inlineCall = null;
    if (c) c.destroy().catch(function () {});
    setCallState("idle");
    renderCallSurfaces();
  }

  window.addEventListener("beforeunload", function () { endInlineCall(); });

  /* ── pop out ── */

  function popOut(g) {
    if (window.cds && window.cds.openRemote) window.cds.openRemote(g.id);
    else window.open(location.origin + "/#remote&popout=1&gw=" + encodeURIComponent(g.id), "cds-remote-" + g.id, "width=480,height=720");
  }

  /* ══════════════ Pop-out view: full widget (mic/speaker, end call) ══════════════ */

  var activePCs = new Set();
  if (POPOUT) {
    // Track RTCPeerConnections for live mic replaceTrack switching.
    var NativePC = window.RTCPeerConnection;
    if (NativePC) {
      window.RTCPeerConnection = function (cfg) {
        var pc = new NativePC(cfg);
        activePCs.add(pc);
        pc.addEventListener("connectionstatechange", function () {
          if (["closed", "failed", "disconnected"].indexOf(pc.connectionState) >= 0) activePCs.delete(pc);
        });
        return pc;
      };
      window.RTCPeerConnection.prototype = NativePC.prototype;
    }
  }

  function setCallState(state) {
    var group = $("rc-call-state"), dot = $("rc-call-dot"), text = $("rc-call-text");
    if (state === "idle") { group.hidden = true; dot.classList.remove("connecting"); }
    else if (state === "connecting") { group.hidden = false; dot.classList.add("connecting"); text.textContent = "Connecting…"; }
    else if (state === "active") { group.hidden = false; dot.classList.remove("connecting"); text.textContent = "In Call"; }
  }

  function showError(msg) {
    var el = $("rc-error");
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function showSid(id, autoCopy) {
    $("rcSidText").textContent = id;
    $("rc-sid").hidden = false;
    if (autoCopy) copySid();
  }
  function copySid() {
    var id = $("rcSidText").textContent;
    if (!id) return;
    try { navigator.clipboard.writeText(id); } catch (e) {}
    var btn = $("rcSidCopy");
    btn.classList.add("copied");
    btn.innerHTML = CDSIcons.svg("check", 15);
    setTimeout(function () {
      btn.classList.remove("copied");
      btn.innerHTML = CDSIcons.svg("content_copy", 15);
    }, 1600);
  }
  $("rc-sid").addEventListener("click", copySid);




  function popoutGateway() {
    var all = gateways();
    for (var i = 0; i < all.length; i++) if (all[i].id === POPOUT_GW) return all[i];
    return all[0] || null;
  }

  /*
   * The pop-out used to mount Cognigy's real click-to-call widget here and
   * relocate its DOM into the shell. It now renders the same Halo panel the
   * gateway list does, running the call on the headless SDK — so what an SE
   * sees off-screen during a demo is what the customer sees on the page, and
   * the transcript is available in both.
   *
   * That also removed the two ugliest things in this file: a monkey-patched
   * walk up the widget's DOM to move it, and a 30-second poll across
   * localStorage, sessionStorage and rendered text scraping for the session id
   * the widget had generated. We pass the user id in, so it is simply known.
   */
  function loadPopout() {
    showError("");
    setCallState("idle");
    var g = popoutGateway();
    if (!g) { showError("No voice gateway configured — add one on the Voice Agent list."); return; }
    if (!normVoice(g.endpointUrl)) {
      showError("This gateway has no valid endpoint — edit it on the Voice Agent list.");
      return;
    }
    document.title = "Cognigy Remote Control — " + (g.name || "Voice");
    renderPopout();
    // Live Follow finds the call by this, so it is worth showing and copying.
    showSid((settings && settings.followMeUserId) || "followme", false);
    loadDevices();
  }

  /* devices — live mic swap via replaceTrack, speaker setSinkId (pop-out only) */

  var activeSpeakerId = "";
  var replacementMicStream = null;

  function applySpeaker(deviceId) {
    activeSpeakerId = deviceId;
    document.querySelectorAll("audio, video").forEach(function (el) {
      if (el.setSinkId) el.setSinkId(deviceId || "").catch(function () {});
    });
  }

  new MutationObserver(function (muts) {
    if (!activeSpeakerId) return;
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType !== 1) return;
        var els = (n.tagName === "AUDIO" || n.tagName === "VIDEO") ? [n] : Array.prototype.slice.call(n.querySelectorAll("audio, video"));
        els.forEach(function (el) {
          if (el.setSinkId && !el.dataset.sinkApplied) {
            el.dataset.sinkApplied = "1";
            el.setSinkId(activeSpeakerId).catch(function () {});
          }
        });
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  async function applyMic(deviceId) {
    saveDevicePrefs();
    try {
      var constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false };
      var stream = await navigator.mediaDevices.getUserMedia(constraints);
      var newTrack = stream.getAudioTracks()[0];
      if (!newTrack) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      var swapped = false;
      for (var pc of activePCs) {
        var sender = pc.getSenders().find(function (s) { return s.track && s.track.kind === "audio"; });
        if (sender) { await sender.replaceTrack(newTrack); swapped = true; }
      }
      if (swapped) {
        if (replacementMicStream) replacementMicStream.getTracks().forEach(function (t) { t.stop(); });
        replacementMicStream = stream;
      } else {
        stream.getTracks().forEach(function (t) { t.stop(); });
      }
    } catch (err) {
      console.warn("Mic switch failed:", err);
    }
  }

  async function loadDevices() {
    var devices = [];
    try {
      var probe = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(function () { return null; });
      devices = await navigator.mediaDevices.enumerateDevices();
      if (probe) probe.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { return; }
    var micSel = $("rcMicSelect"), spkSel = $("rcSpeakerSelect");
    micSel.innerHTML = '<option value="">Default microphone</option>';
    spkSel.innerHTML = '<option value="">Default speaker</option>';
    devices.forEach(function (d) {
      if (!d.deviceId || d.deviceId === "default") return;
      var opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || (d.kind === "audioinput" ? "Microphone" : "Speaker");
      if (d.kind === "audioinput") micSel.appendChild(opt);
      if (d.kind === "audiooutput") spkSel.appendChild(opt);
    });
    if (settings.preferredMicId) micSel.value = settings.preferredMicId;
    if (settings.preferredSpeakerId) { spkSel.value = settings.preferredSpeakerId; applySpeaker(settings.preferredSpeakerId); }
  }

  function saveDevicePrefs() {
    settings.preferredMicId = $("rcMicSelect").value;
    settings.preferredSpeakerId = $("rcSpeakerSelect").value;
    api("/api/settings", putJson({ preferredMicId: settings.preferredMicId, preferredSpeakerId: settings.preferredSpeakerId })).catch(function () {});
  }

  $("rcMicSelect").addEventListener("change", function (e) { applyMic(e.target.value); });
  $("rcSpeakerSelect").addEventListener("change", function (e) { saveDevicePrefs(); applySpeaker(e.target.value); });

  /* ══════════════ Outbound Trigger ══════════════ */

  var contacts = [];

  function renderContacts() {
    var body = $("obTableBody");
    body.innerHTML = "";
    $("obEmpty").hidden = contacts.length > 0;
    contacts.forEach(function (c) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + esc(c.name) + "</td>" +
        "<td>" + esc(c.phone) + "</td>" +
        "<td>" + esc(c.sms) + "</td>" +
        "<td>" + esc(c.email) + "</td>" +
        '<td><div class="ob-actions">' +
        '<button class="ob-call" data-act="voice">' + CDSIcons.svg("call", 15) + ' Call</button>' +
        '<button class="ob-beta" data-act="sms">SMS<small>beta</small></button>' +
        '<button class="ob-beta" data-act="email">Email<small>beta</small></button>' +
        '<button class="ghost" data-act="edit">Edit</button>' +
        '<button class="danger" data-act="del" aria-label="Delete">' + CDSIcons.svg("close", 15) + '</button>' +
        "</div></td>";
      tr.addEventListener("click", function (ev) {
        var act = ev.target.closest("button") && ev.target.closest("button").getAttribute("data-act");
        if (!act) return;
        if (act === "edit") return showContactForm(c);
        if (act === "del") return deleteContact(c);
        trigger(c, act);
      });
      body.appendChild(tr);
    });
  }

  function loadContacts() {
    api("/api/contacts").then(function (res) {
      contacts = res.contacts || [];
      renderContacts();
    });
  }

  function showContactForm(c) {
    $("obForm").hidden = false;
    $("obcId").value = c ? c.id : "";
    $("obcName").value = c ? c.name : "";
    $("obcPhone").value = c ? c.phone : "";
    $("obcSms").value = c ? c.sms : "";
    $("obcEmail").value = c ? c.email : "";
    $("obcName").focus();
  }
  function deleteContact(c) {
    if (!confirm('Delete contact "' + c.name + '"?')) return;
    api("/api/contacts/" + c.id, { method: "DELETE" }).then(loadContacts);
  }

  $("obAddContact").addEventListener("click", function () { showContactForm(null); });
  $("obcCancelBtn").addEventListener("click", function () { $("obForm").hidden = true; });
  $("obcSaveBtn").addEventListener("click", function () {
    var body = {
      name: $("obcName").value.trim(),
      phone: $("obcPhone").value.trim(),
      sms: $("obcSms").value.trim(),
      email: $("obcEmail").value.trim()
    };
    if (!body.name) { rcToast("Name is required.", false); return; }
    var id = $("obcId").value;
    var req = id ? api("/api/contacts/" + id, putJson(body)) : api("/api/contacts", postJson(body));
    req.then(function () { $("obForm").hidden = true; loadContacts(); })
       .catch(function (err) { rcToast(String(err.message || err), false); });
  });

  $("obSaveBtn").addEventListener("click", function () {
    api("/api/settings", putJson({
      outbound: { endpointUrl: $("obEndpoint").value.trim(), endpointKey: $("obKey").value.trim() }
    })).then(function (s) { settings = s; rcToast("Agent flow connection saved.", true); })
      .catch(function (err) { rcToast(String(err.message || err), false); });
  });

  function trigger(c, channel) {
    var label = channel === "voice" ? "call" : channel;
    rcToast("Triggering outbound " + label + " to " + esc(c.name) + "…", true);
    api("/api/contacts/" + c.id + "/trigger", postJson({ channel: channel }))
      .then(function (res) {
        rcToast(CDSIcons.svg("check", 15) + " Outbound " + label + " triggered — session <code>" + esc(res.sessionId) + "</code>" +
          (res.flowReply ? "<br>Flow says: " + esc(res.flowReply) : ""), true);
      })
      .catch(function (err) {
        rcToast(CDSIcons.svg("close", 15) + " Trigger failed: " + esc(String(err.message || err)) +
          "<br>Check the Flow REST Endpoint above and that your Agent flow is deployed.", false);
      });
  }

  var toastTimer = null;
  function rcToast(html, ok) {
    var el = $("obToast");
    el.className = "ob-toast " + (ok ? "ok" : "err");
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 7000);
  }

  /* ── tabs ── */

  function showTab(which) {
    $("rcTabVoice").classList.toggle("on", which === "voice");
    $("rcTabOutbound").classList.toggle("on", which === "outbound");
    $("rcVoice").hidden = which !== "voice";
    $("rcOutbound").hidden = which !== "outbound";
  }
  $("rcTabVoice").addEventListener("click", function () { showTab("voice"); });
  $("rcTabOutbound").addEventListener("click", function () { showTab("outbound"); loadContacts(); });

  /* ══════════════ boot ══════════════ */

  window.CDSRemote = {
    show: function () {
      if (booted) return;
      booted = true;
      Promise.all([api("/api/settings"), api("/api/demos")]).then(function (results) {
        settings = results[0];
        demos = results[1].demos || [];
        /*
         * Hand the microphone settings to the injected audio layer. applyMic()
         * below goes through the patched getUserMedia, so the pop-out's mic
         * switcher gets the same cleanup every demo gets — including mid-call,
         * where the replaceTrack path picks up an already-processed track.
         */
        if (window.CDSAudio && settings.audio) window.CDSAudio.apply(settings.audio);
        // Migrate pre-list-view gateways that have no id yet.
        (settings.gateways || []).forEach(function (g, i) {
          if (!g.id) g.id = "g-legacy-" + i;
        });
        if (POPOUT) {
          $("rcVoice").hidden = true;
          $("rcOutbound").hidden = true;
          $("rcPopout").hidden = false;
          loadPopout();
          /*
           * The mic gear (noise suppression engine, gate + thresholds, echo
           * cancellation, auto gain, live meter) — the pop-out is the one
           * voice surface in the app that had no way to reach any of this
           * short of the Settings page, which lives in the OTHER window an
           * SE has usually dragged this one off-screen from.
           *
           * .show() rather than relying on audio-panel.js's own auto-open
           * (gated on Settings > diagnostics, which exists to keep the gear
           * off a CUSTOMER's screen during a real demo). Nothing here is ever
           * customer-facing, so that gate would just as often hide it when
           * it's most wanted — mid-call, off-screen, with the customer none
           * the wiser either way.
           */
          if (window.CDSAudioPanel) window.CDSAudioPanel.show();
          return;
        }
        $("obEndpoint").value = (settings.outbound && settings.outbound.endpointUrl) || "";
        $("obKey").value = (settings.outbound && settings.outbound.endpointKey) || "";
        renderGwList();
        renderGwOptions();
        loadContacts();
      });
    }
  };

  // app.js routes before this script defines CDSRemote — self-boot when the
  // page loads directly on #remote (including pop-out windows).
  if (POPOUT || (location.hash || "").split("&")[0] === "#remote") window.CDSRemote.show();
})();
