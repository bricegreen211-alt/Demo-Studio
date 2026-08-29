/*
 * Cognigy Remote Control — ported from the NiCE Voice Agent desktop app and
 * rebranded, plus the new Outbound Trigger mini-CRM.
 *
 * Voice Agent tab: hosts the Cognigy click-to-call widget (vendored bundle) so
 * the SE can take/place WebRTC calls OFF-SCREEN during a demo — with live
 * mic/speaker switching mid-call, a call-state indicator, and a session-ID
 * badge (auto-copied for Live Follow / Interaction Panel).
 *
 * Outbound Trigger tab: contacts (name/phone/SMS/email) with one-click
 * triggers that POST to a Cognigy Agent flow's REST endpoint via the service
 * (voice first; SMS/email wired the same way, labeled beta).
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
  var widgetLoaded = false;

  /* ══════════════ Voice Agent ══════════════ */

  // Track every RTCPeerConnection the widget creates so live mic switching
  // works even if the widget instance doesn't expose the JsSIP UA. (The UA
  // path below also feeds this set when available.)
  var activePCs = new Set();
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

  var sidFound = false;
  var SID_RE = /webrtc-voice-[A-Za-z0-9_-]+/;

  function setCallState(state) {
    var group = $("rc-call-state"), dot = $("rc-call-dot"), text = $("rc-call-text");
    if (state === "idle") {
      group.hidden = true;
      dot.classList.remove("connecting");
    } else if (state === "connecting") {
      group.hidden = false;
      dot.classList.add("connecting");
      text.textContent = "Connecting…";
    } else if (state === "active") {
      group.hidden = false;
      dot.classList.remove("connecting");
      text.textContent = "In Call";
    }
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

  // Short-lived storage/DOM poll after a call starts (fallback SID discovery,
  // carried over from the Voice Agent).
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

      function registerPC() {
        var pc = session.connection;
        if (pc) activePCs.add(pc);
      }
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

  function currentEndpoint() {
    var val = $("gwSelect").value || "";
    if (val.indexOf("demo:") === 0) {
      var slug = val.slice(5);
      for (var i = 0; i < demos.length; i++) {
        if (demos[i].id === slug) return demos[i].cognigy && demos[i].cognigy.voiceEndpoint;
      }
      return "";
    }
    if (val.indexOf("gw:") === 0) {
      var gw = (settings.gateways || [])[parseInt(val.slice(3), 10)];
      return gw && gw.endpointUrl;
    }
    return "";
  }

  function loadWidget() {
    showError("");
    setCallState("idle");
    var endpoint = window.CognigyNormalize
      ? window.CognigyNormalize.voiceEndpoint(currentEndpoint() || "")
      : (currentEndpoint() || "");
    if (!endpoint) {
      showError("No voice gateway selected — add one with + Add, or give a demo a voice endpoint.");
      return;
    }
    try { if (window.destroyWebRTCWidget) window.destroyWebRTCWidget(); } catch (e) {}
    if (typeof window.initWebRTCWidget !== "function") {
      showError("Voice widget failed to load.");
      return;
    }
    widgetLoaded = true;
    window.initWebRTCWidget(endpoint, {}, function (instance) {
      // Prefer the UA event bus when the widget exposes it; the PC-tracking
      // shim + SID poll cover the rest either way.
      if (!wireUa(instance)) pollSid();
      relocateWidget();
    });
    // The bundle appends its root to <body>; pull it into our shell.
    setTimeout(relocateWidget, 400);
    setTimeout(loadDevices, 1500);
    // The widget hides itself when the endpoint rejects its config fetch —
    // surface that instead of showing an empty shell.
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

  /* ── devices (ported: live mic swap via replaceTrack, speaker setSinkId) ── */

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
      // A one-shot permission probe so device labels populate.
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

  /* ── gateways ── */

  function renderGateways() {
    var sel = $("gwSelect");
    sel.innerHTML = "";
    var gws = settings.gateways || [];
    gws.forEach(function (g, i) {
      var opt = document.createElement("option");
      opt.value = "gw:" + i;
      opt.textContent = g.name || "Gateway " + (i + 1);
      sel.appendChild(opt);
    });
    demos.forEach(function (d) {
      if (d.cognigy && d.cognigy.voiceEndpoint) {
        var opt = document.createElement("option");
        opt.value = "demo:" + d.id;
        opt.textContent = "Demo — " + d.name;
        sel.appendChild(opt);
      }
    });
    if (!sel.options.length) {
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "No gateways — click + Add";
      sel.appendChild(none);
    } else {
      var want = "gw:" + (settings.activeGateway || 0);
      sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === want; }) ? want : sel.options[0].value;
    }
  }

  $("gwSelect").addEventListener("change", function () {
    var v = $("gwSelect").value;
    if (v.indexOf("gw:") === 0) {
      settings.activeGateway = parseInt(v.slice(3), 10);
      api("/api/settings", putJson({ activeGateway: settings.activeGateway })).catch(function () {});
    }
    loadWidget();
  });

  $("gwAddBtn").addEventListener("click", function () {
    var name = prompt("Gateway name (e.g. Trial US):");
    if (name === null) return;
    var url = prompt("Voice endpoint — paste the Click-to-Call link, endpoint URL, or bare token:");
    if (!url) return;
    settings.gateways = settings.gateways || [];
    settings.gateways.push({ name: name || "Gateway", endpointUrl: url.trim() });
    settings.activeGateway = settings.gateways.length - 1;
    api("/api/settings", putJson({ gateways: settings.gateways, activeGateway: settings.activeGateway }))
      .then(function () { renderGateways(); loadWidget(); });
  });

  $("rcReloadBtn").addEventListener("click", loadWidget);

  /* ── pop out ── */

  $("popoutBtn").addEventListener("click", function () {
    if (window.cds && window.cds.openRemote) window.cds.openRemote();
    else window.open(location.origin + "/#remote&popout=1", "cds-remote", "width=480,height=720");
  });

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
        if (act === "edit") return editContact(c);
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
  function editContact(c) { showContactForm(c); }
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
    if (!body.name) { toast("Name is required.", false); return; }
    var id = $("obcId").value;
    var req = id ? api("/api/contacts/" + id, putJson(body)) : api("/api/contacts", postJson(body));
    req.then(function () { $("obForm").hidden = true; loadContacts(); })
       .catch(function (err) { toast(String(err.message || err), false); });
  });

  $("obSaveBtn").addEventListener("click", function () {
    api("/api/settings", putJson({
      outbound: { endpointUrl: $("obEndpoint").value.trim(), endpointKey: $("obKey").value.trim() }
    })).then(function (s) { settings = s; toast("Agent flow connection saved.", true); })
      .catch(function (err) { toast(String(err.message || err), false); });
  });

  function trigger(c, channel) {
    var label = channel === "voice" ? "call" : channel;
    toast("Triggering outbound " + label + " to " + esc(c.name) + "…", true);
    api("/api/contacts/" + c.id + "/trigger", postJson({ channel: channel }))
      .then(function (res) {
        toast("✓ Outbound " + label + " triggered — session <code>" + esc(res.sessionId) + "</code>" +
          (res.flowReply ? "<br>Flow says: " + esc(res.flowReply) : ""), true);
      })
      .catch(function (err) {
        toast("✗ Trigger failed: " + esc(String(err.message || err)) +
          "<br>Check the Flow REST Endpoint above and that your Agent flow is deployed.", false);
      });
  }

  var toastTimer = null;
  function toast(html, ok) {
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
        $("obEndpoint").value = (settings.outbound && settings.outbound.endpointUrl) || "";
        $("obKey").value = (settings.outbound && settings.outbound.endpointKey) || "";
        renderGateways();
        loadContacts();
        loadWidget();
      });
    }
  };

  // Pop-out window boots straight into the voice view.
  if (/popout=1/.test(location.hash)) window.CDSRemote.show();
})();
