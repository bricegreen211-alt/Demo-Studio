/*
 * Cognigy Demo Studio — dashboard logic.
 * A thin client over the local service API. Runs identically inside the
 * Electron window and a plain browser tab; Electron adds window.cds
 * (openPath/openExternal) via the preload for folder/website actions.
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
  var radio = function (name) { return document.querySelector('input[name="' + name + '"]:checked').value; };
  var setRadio = function (name, value) {
    var el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  };

  var editingId = null; // slug when editing, null when creating

  /* ---------------- list view ---------------- */

  function loadList() {
    $("listView").hidden = false;
    $("editView").hidden = true;
    editingId = null;
    api("/api/demos").then(function (data) {
      var demos = data.demos || [];
      var list = $("demoList");
      list.innerHTML = "";
      $("emptyState").hidden = demos.length > 0;
      demos.forEach(function (d) { list.appendChild(card(d)); });
    });
    api("/api/settings").then(function (s) { $("presentationMode").checked = !!s.presentationMode; });
  }

  var TEMPLATE_LABEL = { "webchat": "Webchat", "webrtc": "WebRTC", "webchat-webrtc": "Webchat + WebRTC" };

  function card(d) {
    var el = document.createElement("div");
    el.className = "demo-card";
    var chips = '<span class="chip chip-template">' + TEMPLATE_LABEL[d.template] + "</span>";
    if (d.hasLocked) chips += ' <span class="chip chip-locked">Locked</span>';
    if (!d.built) chips += ' <span class="chip chip-unbuilt">Building…</span>';
    el.innerHTML =
      '<div class="row1"><h3></h3>' + chips + "</div>" +
      '<div class="demo-site"></div>' +
      '<div class="demo-actions">' +
      '<button class="primary" data-act="launch">Launch</button>' +
      '<button class="ghost" data-act="edit">Edit</button>' +
      '<button class="ghost" data-act="duplicate">Duplicate</button>' +
      '<button class="ghost" data-act="preflight">Preflight</button>' +
      '<button class="ghost" data-act="lock">Lock</button>' +
      '<button class="danger" data-act="delete">Delete</button>' +
      "</div>";
    el.querySelector("h3").textContent = d.name;
    el.querySelector(".demo-site").textContent = d.website || "No website mapped";
    el.addEventListener("click", function (ev) {
      var act = ev.target && ev.target.getAttribute("data-act");
      if (act) actions[act](d);
    });
    return el;
  }

  var actions = {
    launch: function (d) {
      if (!d.website) { openEdit(d.id); return; }
      var url = /^https?:\/\//i.test(d.website) ? d.website : "https://" + d.website;
      if (window.cds && window.cds.openExternal) window.cds.openExternal(url);
      else window.open(url, "_blank");
    },
    edit: function (d) { openEdit(d.id); },
    duplicate: function (d) {
      var name = prompt("Name for the duplicate:", d.name + " Copy");
      if (name === null) return;
      api("/api/demos/" + d.id + "/duplicate", postJson({ name: name })).then(function (res) {
        openEdit(res.demo.id);
      }).catch(alertErr);
    },
    preflight: function (d) { runPreflight(d); },
    lock: function (d) {
      api("/api/demos/" + d.id + "/lock", { method: "POST" }).then(function () {
        modal("Demo locked", '<p style="font-size:13.5px;line-height:1.6">A known-good snapshot of <b>' + esc(d.name) + "</b> was saved.<br>Turn on <b>Presentation Mode</b> before the customer meeting to present this locked version while you keep developing.</p>");
        loadList();
      }).catch(alertErr);
    },
    delete: function (d) {
      if (!confirm('Delete demo "' + d.name + '"? This removes its project folder.')) return;
      api("/api/demos/" + d.id, { method: "DELETE" }).then(loadList).catch(alertErr);
    }
  };

  function postJson(body) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  function putJson(body) {
    return { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  function alertErr(err) { alert(String(err.message || err)); }
  function esc(s) { var d = document.createElement("i"); d.textContent = s; return d.innerHTML; }

  /* ---------------- edit view ---------------- */

  function openEdit(slug) {
    $("listView").hidden = true;
    $("editView").hidden = false;
    editingId = slug || null;
    $("formTitle").textContent = slug ? "Edit Demo Experience" : "New Demo Experience";
    $("saveBtn").textContent = slug ? "Save" : "Create Demo";
    $("f-template-set").style.opacity = slug ? ".5" : "1";
    $("f-template-set").style.pointerEvents = slug ? "none" : "auto";
    $("saveStatus").textContent = "";
    $("buildStatus").textContent = "";
    $("demoPath").textContent = "";
    $("folderRow").hidden = !(window.cds && window.cds.openPath);

    if (!slug) {
      fillForm(null);
      setPreview(null);
      return;
    }
    api("/api/demos/" + slug).then(function (res) {
      fillForm(res.demo);
      setPreview(slug);
      if (res.lastBuild && !res.lastBuild.ok) showBuildError(res.lastBuild.error);
    }).catch(function () { loadList(); });
  }

  function fillForm(d) {
    $("f-name").value = d ? d.name : "";
    $("f-website").value = d ? d.website : "";
    setRadio("template", d ? d.template : "webchat-webrtc");
    $("f-chat").value = d ? d.cognigy.chatEndpoint : "";
    $("f-voice").value = d ? d.cognigy.voiceEndpoint : "";
    setRadio("launcher", d ? d.launcher : "ai-orb");
    setRadio("side", d ? d.panelSide : "right");
    $("f-width").value = d && [360, 420, 520, 650].indexOf(d.panelWidth) >= 0 ? String(d.panelWidth) : "0";
    $("f-agent").value = d ? d.agentName : "";
    $("f-label").value = d ? d.launcherText : "";
    $("f-showlabel").checked = d ? !!d.showLauncherText : true;
    $("f-welcome").value = d ? d.welcomeMessage : "";
    $("f-primary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.primaryColor) ? d.theme.primaryColor : "#0284c7";
    $("f-secondary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.secondaryColor) ? d.theme.secondaryColor : "#f1f5f9";
    $("f-logo").value = d ? d.theme.logo : "";
    $("f-userid").value = d ? d.userId : "";
    syncEndpointVisibility();
  }

  function formValues() {
    return {
      name: $("f-name").value.trim(),
      website: $("f-website").value.trim(),
      template: radio("template"),
      panelSide: radio("side"),
      panelWidth: parseInt($("f-width").value, 10) || 0,
      launcher: radio("launcher"),
      launcherText: $("f-label").value.trim(),
      showLauncherText: $("f-showlabel").checked,
      agentName: $("f-agent").value.trim() || "AI Assistant",
      welcomeMessage: $("f-welcome").value.trim(),
      userId: $("f-userid").value.trim(),
      cognigy: { chatEndpoint: $("f-chat").value.trim(), voiceEndpoint: $("f-voice").value.trim() },
      theme: { primaryColor: $("f-primary").value, secondaryColor: $("f-secondary").value, logo: $("f-logo").value.trim() }
    };
  }

  function syncEndpointVisibility() {
    var t = radio("template");
    $("l-chat").style.display = t === "webrtc" ? "none" : "block";
    $("l-voice").style.display = t === "webchat" ? "none" : "block";
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="template"]'), function (el) {
    el.addEventListener("change", syncEndpointVisibility);
  });

  function setPreview(slug) {
    var frame = $("previewFrame");
    var empty = $("previewEmpty");
    if (!slug) {
      frame.src = "about:blank";
      empty.style.display = "grid";
      return;
    }
    empty.style.display = "none";
    frame.src = "/" + slug + "/?ts=" + Date.now();
  }

  function showBuildError(err) {
    $("buildStatus").className = "err";
    $("buildStatus").textContent = "Build issue: " + err;
  }

  $("saveBtn").addEventListener("click", function () {
    var vals = formValues();
    if (!vals.name) { $("saveStatus").textContent = "Customer name is required."; return; }
    $("saveStatus").textContent = "Saving…";
    var req = editingId
      ? api("/api/demos/" + editingId, putJson(vals))
      : api("/api/demos", postJson(vals));
    req.then(function (res) {
      var d = res.demo;
      var isNew = !editingId;
      editingId = d.id;
      $("formTitle").textContent = "Edit Demo Experience";
      $("saveBtn").textContent = "Save";
      $("f-template-set").style.pointerEvents = "none";
      $("f-template-set").style.opacity = ".5";
      $("saveStatus").textContent = "Saved.";
      setTimeout(function () { $("saveStatus").textContent = ""; }, 2000);
      if (isNew) {
        // First build runs in the background; poll until it lands, then preview.
        $("buildStatus").className = "";
        $("buildStatus").textContent = "Building demo…";
        pollBuilt(d.id, 40, function (ok) {
          $("buildStatus").textContent = ok ? "" : "Still building — click Reload in a moment.";
          setPreview(d.id);
        });
      } else {
        setPreview(editingId); // config is read at runtime; reload shows it
      }
    }).catch(function (err) { $("saveStatus").textContent = String(err.message || err); });
  });

  function pollBuilt(slug, tries, done) {
    api("/api/demos/" + slug).then(function (res) {
      if (res.demo.built) return done(true);
      if (res.lastBuild && !res.lastBuild.ok) { showBuildError(res.lastBuild.error); return done(false); }
      if (tries <= 0) return done(false);
      setTimeout(function () { pollBuilt(slug, tries - 1, done); }, 700);
    }).catch(function () { done(false); });
  }

  $("backBtn").addEventListener("click", loadList);
  $("newDemoBtn").addEventListener("click", function () { openEdit(null); });
  $("reloadPreviewBtn").addEventListener("click", function () { if (editingId) setPreview(editingId); });
  $("rebuildBtn").addEventListener("click", function () {
    if (!editingId) return;
    $("buildStatus").className = "";
    $("buildStatus").textContent = "Rebuilding…";
    api("/api/demos/" + editingId + "/rebuild", { method: "POST" }).then(function (res) {
      if (res.result && !res.result.ok) showBuildError(res.result.error);
      else { $("buildStatus").textContent = ""; setPreview(editingId); }
    }).catch(alertErr);
  });
  $("openFolderBtn").addEventListener("click", function () {
    if (editingId && window.cds && window.cds.openDemoFolder) window.cds.openDemoFolder(editingId);
  });

  /* ---------------- presentation mode ---------------- */

  $("presentationMode").addEventListener("change", function () {
    api("/api/settings", putJson({ presentationMode: $("presentationMode").checked }));
  });

  /* ---------------- import ---------------- */

  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { alert("Not a valid JSON export."); return; }
      api("/api/import", postJson(parsed)).then(function (res) {
        var lines = (res.results || []).map(function (r) {
          return r.ok ? "✓ " + esc(r.name) : "✗ " + esc(r.name) + " — " + esc(r.error || "failed");
        });
        modal("Import complete", '<div style="font-size:13.5px;line-height:1.9">' + lines.join("<br>") + "</div>");
        loadList();
      }).catch(alertErr);
    };
    reader.readAsText(file);
    ev.target.value = "";
  });

  /* ---------------- preflight ---------------- */

  function browserChecks(demo) {
    var out = [];
    var wantsVoice = demo.template === "webrtc" || demo.template === "webchat-webrtc";
    if (!wantsVoice) return Promise.resolve(out);
    var rtc = !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    out.push({ id: "webrtc", label: "WebRTC supported", ok: rtc, detail: rtc ? "" : "This browser lacks WebRTC — use Chrome or Edge." });
    if (!rtc) return Promise.resolve(out);
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      out.push({ id: "mic", label: "Microphone permission available", ok: true, detail: "" });
      return out;
    }).catch(function (err) {
      out.push({ id: "mic", label: "Microphone permission available", ok: false, detail: "Microphone blocked: " + err.name + ". Allow mic access for this page." });
      return out;
    });
  }

  function runPreflight(d) {
    modal("Preflight — " + esc(d.name), '<div class="soft">Running checks…</div>');
    Promise.all([
      api("/api/demos/" + d.id + "/preflight", { method: "POST" }),
      browserChecks(d)
    ]).then(function (results) {
      var server = results[0];
      var checks = server.checks.concat(results[1]);
      var ready = checks.every(function (c) { return c.ok; });
      var html = '<div class="pf-verdict ' + (ready ? "ok" : "bad") + '">' + (ready ? "READY TO DEMO" : "ISSUES FOUND") + "</div>";
      checks.forEach(function (c) {
        html += '<div class="pf-check ' + (c.ok ? "ok" : "bad") + '"><span class="mark">' + (c.ok ? "✓" : "✗") + "</span><span>" +
          esc(c.label) + (c.detail && !c.ok ? '<span class="detail">' + esc(c.detail) + "</span>" : "") + "</span></div>";
      });
      $("modalBody").innerHTML = html;
    }).catch(function (err) {
      $("modalBody").innerHTML = '<div class="pf-verdict bad">PREFLIGHT FAILED</div><div class="soft">' + esc(String(err.message || err)) + "</div>";
    });
  }

  /* ---------------- modal ---------------- */

  function modal(title, bodyHtml) {
    $("modalTitle").innerHTML = title;
    $("modalBody").innerHTML = bodyHtml;
    $("modal").hidden = false;
  }
  $("modalClose").addEventListener("click", function () { $("modal").hidden = true; });
  $("modal").addEventListener("click", function (ev) { if (ev.target === $("modal")) $("modal").hidden = true; });

  /* ---------------- boot ---------------- */
  loadList();
})();
