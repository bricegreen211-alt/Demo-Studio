/*
 * Cognigy Remote Control.
 *
 * Voice Agent tab — a gateway LIST mirroring the Demo Experiences layout:
 * Find at the top, collapsible folders, and per-row actions — inline
 * 📞 Call / Mute / End (via the vendored @cognigy/click-to-call-sdk bundle,
 * window.CdsVoice), Edit, ⧉ Pop Out (full widget view with mic/speaker
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

  function gwFolderNames() {
    var names = (settings.gatewayFolders || []).slice();
    gateways().forEach(function (g) {
      if (g.folder && names.indexOf(g.folder) < 0) names.push(g.folder);
    });
    return names.sort(function (a, b) { return a.localeCompare(b); });
  }

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
    Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (f) {
      if (!f) return;
      if (q && groups[f].length === 0) return;
      var head = document.createElement("div");
      head.className = "folder-head" + (gwCollapsed[f] && !q ? " collapsed" : "");
      head.innerHTML = '<span class="folder-caret">▾</span><span class="folder-ico">📁</span> <b></b> <span class="folder-count"></span>';
      head.querySelector("b").textContent = f;
      head.querySelector(".folder-count").textContent = groups[f].length + (groups[f].length === 1 ? " gateway" : " gateways");
      head.addEventListener("click", function () { gwCollapsed[f] = !gwCollapsed[f]; renderGwList(); });
      list.appendChild(head);
      if (!gwCollapsed[f] || q) groups[f].forEach(function (g) { list.appendChild(gwRow(g, true)); });
    });
  }

  function gwRow(g, indented) {
    var el = document.createElement("div");
    el.className = "demo-row" + (indented ? " in-folder" : "");
    el.dataset.gwId = g.id;
    var onCall = inlineCall && inlineCall.gwId === g.id;
    var host = "";
    try { host = new URL(normVoice(g.endpointUrl)).hostname; } catch (e) {}

    var callControls;
    if (!onCall) {
      callControls = '<button class="primary" data-act="call"' + (inlineCall ? " disabled" : "") + ">📞 Call</button>";
    } else {
      callControls =
        '<span class="gw-state ' + inlineCall.status + '"><i class="gw-dot"></i>' +
        (inlineCall.status === "active" ? '<span data-role="timer">' + fmtSecs(inlineCall.seconds) + "</span>" :
         inlineCall.status === "ringing" ? "Calling…" : "Connecting…") +
        "</span>" +
        (inlineCall.status === "active"
          ? '<button class="ghost gw-mute' + (inlineCall.muted ? " on" : "") + '" data-act="mute">' + (inlineCall.muted ? "🔇 Unmute" : "🎙 Mute") + "</button>"
          : "") +
        '<button class="gw-end" data-act="end">✕ End</button>';
    }

    el.innerHTML =
      '<div class="demo-row-main"><h3></h3><span class="demo-site"></span></div>' +
      '<div class="demo-actions">' +
      callControls +
      '<button class="ghost" data-act="edit">Edit</button>' +
      '<button class="ghost" data-act="popout" title="Full view with mic/speaker devices — move it off-screen during the demo">⧉ Pop Out</button>' +
      '<button class="danger" data-act="delete">✕</button>' +
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

    inlineCall = { gwId: g.id, client: null, status: "connecting", muted: false, seconds: 0, timer: null };
    renderGwList();

    window.CdsVoice.createWebRTCClient({ endpointUrl: endpointUrl, userId: "followme" })
      .then(function (client) {
        if (!inlineCall || inlineCall.gwId !== g.id) { client.destroy().catch(function () {}); return; }
        inlineCall.client = client;
        client.on("ringing", function () { if (inlineCall) { inlineCall.status = "ringing"; renderGwList(); } });
        client.on("answered", function () {
          if (!inlineCall) return;
          inlineCall.status = "active";
          inlineCall.timer = setInterval(function () {
            if (!inlineCall) return;
            inlineCall.seconds++;
            var t = document.querySelector('[data-gw-id="' + g.id + '"] [data-role="timer"]');
            if (t) t.textContent = fmtSecs(inlineCall.seconds);
          }, 1000);
          renderGwList();
        });
        client.on("muted", function () { if (inlineCall) { inlineCall.muted = true; renderGwList(); } });
        client.on("unmuted", function () { if (inlineCall) { inlineCall.muted = false; renderGwList(); } });
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

  function cleanupInlineCall() {
    if (inlineCall && inlineCall.timer) clearInterval(inlineCall.timer);
    var c = inlineCall && inlineCall.client;
    inlineCall = null;
    if (c) c.destroy().catch(function () {});
    renderGwList();
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

  var sidFound = false;
  var SID_RE = /webrtc-voice-[A-Za-z0-9_-]+/;

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
    btn.textContent = "✓";
    setTimeout(function () { btn.classList.remove("copied"); btn.textContent = "⧉"; }, 1600);
  }
  $("rc-sid").addEventListener("click", copySid);

  function trySid(text) {
    if (sidFound) return;
    var m = String(text || "").match(SID_RE);
    if (m) { sidFound = true; showSid(m[0], true); }
  }

  function pollSid() {
    var polls = 0;
    var t = setInterval(function () {
      if (sidFound || ++polls > 60) { clearInterval(t); return; }
      var blobs = [];
      try { for (var i = 0; i < localStorage.length; i++) blobs.push(localStorage.getItem(localStorage.key(i))); } catch (e) {}
      try { for (var j = 0; j < sessionStorage.length; j++) blobs.push(sessionStorage.getItem(sessionStorage.key(j))); } catch (e) {}
      blobs.forEach(trySid);
      if (!sidFound) trySid($("rc-widget-wrap").innerText);
    }, 500);
  }

  function wireUa(ua) {
    if (!ua || typeof ua.on !== "function") return false;
    ua.on("newRTCSession", function (data) {
      var session = data.session;
      setCallState("connecting");
      sidFound = false;
      $("rc-sid").hidden = true;
      function registerPC() { if (session.connection) activePCs.add(session.connection); }
      registerPC();
      session.on("answered", registerPC);
      session.on("accepted", registerPC);
      session.on("answered", function () { setCallState("active"); });
      ["ended", "terminated", "failed"].forEach(function (ev) {
        session.on(ev, function () { setCallState("idle"); });
      });
      trySid(session.id);
      session.on("newInfo", function (e) { trySid(e.info && e.info.body); });
      pollSid();
    });
    return true;
  }

  function popoutGateway() {
    var all = gateways();
    for (var i = 0; i < all.length; i++) if (all[i].id === POPOUT_GW) return all[i];
    return all[0] || null;
  }

  function loadWidget() {
    showError("");
    setCallState("idle");
    var gw = popoutGateway();
    var endpoint = gw ? normVoice(gw.endpointUrl) : "";
    if (!endpoint) { showError("No voice gateway configured — add one on the Voice Agent list."); return; }
    document.title = "Cognigy Remote Control — " + (gw.name || "Voice");
    try { if (window.destroyWebRTCWidget) window.destroyWebRTCWidget(); } catch (e) {}
    if (typeof window.initWebRTCWidget !== "function") { showError("Voice widget failed to load."); return; }
    window.initWebRTCWidget(endpoint, {}, function (instance) {
      if (!wireUa(instance)) pollSid();
      relocateWidget();
    });
    setTimeout(relocateWidget, 400);
    setTimeout(loadDevices, 1500);
    setTimeout(function () {
      var c = document.querySelector(".webrtc_widget_container");
      if (c && getComputedStyle(c).visibility === "hidden") {
        showError("The voice gateway didn't accept this endpoint — check the endpoint URL (and that the Click-to-Call endpoint is active in Cognigy).");
      }
    }, 3500);
  }

  function relocateWidget() {
    var container = document.querySelector(".webrtc_widget_container");
    if (!container) return;
    var rootDiv = container;
    while (rootDiv.parentElement && rootDiv.parentElement !== document.body) rootDiv = rootDiv.parentElement;
    if (rootDiv.parentElement === document.body && rootDiv !== $("rc-widget-wrap")) {
      $("rc-widget-wrap").appendChild(rootDiv);
    }
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
        '<button class="ob-call" data-act="voice">📞 Call</button>' +
        '<button class="ob-beta" data-act="sms">SMS<small>beta</small></button>' +
        '<button class="ob-beta" data-act="email">Email<small>beta</small></button>' +
        '<button class="ghost" data-act="edit">Edit</button>' +
        '<button class="danger" data-act="del">✕</button>' +
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
        rcToast("✓ Outbound " + label + " triggered — session <code>" + esc(res.sessionId) + "</code>" +
          (res.flowReply ? "<br>Flow says: " + esc(res.flowReply) : ""), true);
      })
      .catch(function (err) {
        rcToast("✗ Trigger failed: " + esc(String(err.message || err)) +
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
        // Migrate pre-list-view gateways that have no id yet.
        (settings.gateways || []).forEach(function (g, i) {
          if (!g.id) g.id = "g-legacy-" + i;
        });
        if (POPOUT) {
          $("rcVoice").hidden = true;
          $("rcOutbound").hidden = true;
          $("rcPopout").hidden = false;
          loadWidget();
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
