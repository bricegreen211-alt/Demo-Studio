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

  var allDemos = [];
  var folders = [];
  var collapsedFolders = {}; // session-local collapse state

  function loadList() {
    $("listView").hidden = false;
    $("editView").hidden = true;
    $("remoteView").hidden = true;
    editingId = null;
    Promise.all([api("/api/demos"), api("/api/settings")]).then(function (results) {
      allDemos = results[0].demos || [];
      folders = results[1].folders || [];
      $("presentationMode").checked = !!results[1].presentationMode;
      renderList();
      renderFolderOptions();
    });
  }

  var TEMPLATE_LABEL = { "webchat": "Webchat", "webrtc": "WebRTC", "webchat-webrtc": "Webchat + WebRTC" };

  function allFolderNames() {
    var names = folders.slice();
    allDemos.forEach(function (d) {
      if (d.folder && names.indexOf(d.folder) < 0) names.push(d.folder);
    });
    return names.sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderFolderOptions() {
    var dl = $("folderOptions");
    dl.innerHTML = "";
    allFolderNames().forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f;
      dl.appendChild(opt);
    });
  }

  function matchesFind(d, q) {
    if (!q) return true;
    return (d.name + " " + (d.website || "") + " " + (d.folder || "") + " " + TEMPLATE_LABEL[d.template])
      .toLowerCase().indexOf(q) >= 0;
  }

  function renderList() {
    var q = ($("findInput").value || "").trim().toLowerCase();
    var list = $("demoList");
    list.innerHTML = "";
    var visible = allDemos.filter(function (d) { return matchesFind(d, q); });
    $("emptyState").hidden = allDemos.length > 0;
    $("noMatches").hidden = !(allDemos.length > 0 && visible.length === 0);

    // Group: root demos first, then each folder (searching auto-expands).
    var groups = { "": [] };
    allFolderNames().forEach(function (f) { groups[f] = []; });
    visible.forEach(function (d) {
      var f = d.folder && groups[d.folder] ? d.folder : (d.folder || "");
      if (!groups[f]) groups[f] = [];
      groups[f].push(d);
    });

    (groups[""] || []).forEach(function (d) { list.appendChild(row(d)); });
    Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (f) {
      if (!f) return;
      if (q && groups[f].length === 0) return; // hide empty folders while searching
      var head = document.createElement("div");
      head.className = "folder-head" + (collapsedFolders[f] && !q ? " collapsed" : "");
      head.innerHTML = '<span class="folder-caret">▾</span><span class="folder-ico">📁</span> <b></b> <span class="folder-count"></span>';
      head.querySelector("b").textContent = f;
      head.querySelector(".folder-count").textContent = groups[f].length + (groups[f].length === 1 ? " demo" : " demos");
      head.addEventListener("click", function () {
        collapsedFolders[f] = !collapsedFolders[f];
        renderList();
      });
      list.appendChild(head);
      if (!collapsedFolders[f] || q) {
        groups[f].forEach(function (d) { list.appendChild(row(d, true)); });
      }
    });
  }

  function row(d, indented) {
    var el = document.createElement("div");
    el.className = "demo-row" + (indented ? " in-folder" : "");
    var chips = '<span class="chip chip-template">' + TEMPLATE_LABEL[d.template] + "</span>";
    if (d.hasLocked) chips += ' <span class="chip chip-locked">Locked</span>';
    if (!d.built) chips += ' <span class="chip chip-unbuilt">Building…</span>';
    el.innerHTML =
      '<div class="demo-row-main"><h3></h3><span class="demo-site"></span></div>' +
      '<div class="demo-row-chips">' + chips + "</div>" +
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

  $("findInput").addEventListener("input", renderList);

  $("newFolderBtn").addEventListener("click", function () {
    var name = prompt("Folder name:");
    if (!name || !name.trim()) return;
    name = name.trim().slice(0, 80);
    if (allFolderNames().indexOf(name) >= 0) { renderList(); return; }
    folders.push(name);
    api("/api/settings", putJson({ folders: folders })).then(function () {
      renderList();
      renderFolderOptions();
    });
  });

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
    $("remoteView").hidden = true;
    editingId = slug || null;
    $("formTitle").textContent = slug ? "Edit Demo Experience" : "New Demo Experience";
    $("saveBtn").textContent = slug ? "Save" : "Create Demo";
    $("f-template-set").style.opacity = slug ? ".5" : "1";
    $("f-template-set").style.pointerEvents = slug ? "none" : "auto";
    $("saveStatus").textContent = "";
    $("buildStatus").textContent = "";
    setVibecodeRow(null);
    renderFolderOptions();

    if (!slug) {
      fillForm(null);
      setPreview(null);
      return;
    }
    api("/api/demos/" + slug).then(function (res) {
      fillForm(res.demo);
      setPreview(slug);
      setVibecodeRow(res.demo);
      if (res.lastBuild && !res.lastBuild.ok) showBuildError(res.lastBuild.error);
    }).catch(function () { loadList(); });
  }

  // Vibe-code customization row: show the demo's project folder as soon as it
  // exists — Open (Electron) / Copy path (everywhere).
  function setVibecodeRow(demo) {
    var hasDemo = !!(demo && demo.path);
    $("openFolderBtn").hidden = !(hasDemo && window.cds && window.cds.openPath);
    $("copyPathBtn").hidden = !hasDemo;
    $("vibecodeHint").hidden = hasDemo;
    $("demoPath").textContent = hasDemo ? demo.path : "";
  }

  function fillForm(d) {
    $("f-name").value = d ? d.name : "";
    $("f-website").value = d ? d.website : "";
    $("f-folder").value = d ? (d.folder || "") : "";
    setRadio("template", d ? d.template : "webchat-webrtc");
    $("f-chat").value = d ? d.cognigy.chatEndpoint : "";
    $("f-voice").value = d ? d.cognigy.voiceEndpoint : "";
    setRadio("launcher", d ? d.launcher : "ai-orb");
    setRadio("side", d ? d.panelSide : "right");
    setRadio("panelStyle", d ? (d.panelStyle || "solid") : "solid");
    syncPanelStyleHint();
    $("f-width").value = d && [360, 420, 520, 650].indexOf(d.panelWidth) >= 0 ? String(d.panelWidth) : "0";
    $("f-agent").value = d ? d.agentName : "";
    $("f-label").value = d ? d.launcherText : "";
    $("f-showlabel").checked = d ? !!d.showLauncherText : true;
    $("f-welcome").value = d ? d.welcomeMessage : "";
    $("f-primary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.primaryColor) ? d.theme.primaryColor : "#3694fc";
    $("f-secondary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.secondaryColor) ? d.theme.secondaryColor : "#f1f5f9";
    $("f-logo").value = d ? d.theme.logo : "";
    $("f-userid").value = d ? d.userId : "followme";
    syncEndpointVisibility();
  }

  function formValues() {
    return {
      name: $("f-name").value.trim(),
      website: $("f-website").value.trim(),
      folder: $("f-folder").value.trim(),
      template: radio("template"),
      panelSide: radio("side"),
      panelStyle: radio("panelStyle"),
      panelWidth: parseInt($("f-width").value, 10) || 0,
      launcher: radio("launcher"),
      launcherText: $("f-label").value.trim(),
      showLauncherText: $("f-showlabel").checked,
      agentName: $("f-agent").value.trim() || "AI Assistant",
      welcomeMessage: $("f-welcome").value.trim(),
      userId: $("f-userid").value.trim() || "followme",
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

  var PANEL_STYLE_HINT = {
    solid: "Opaque panel — the classic slide-out.",
    clear: "See-through panel: the customer's site shows through, only the chat/voice elements paint.",
    phone: "Floating phone mockup — great for simulating a call on a mobile device.",
    overlay: "The demo draws its own launcher icon and panel — both vibe-codeable in src/shell/. The extension just supplies a transparent frame."
  };
  function syncPanelStyleHint() {
    $("panelStyleHint").textContent = PANEL_STYLE_HINT[radio("panelStyle")] || "";
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="panelStyle"]'), function (el) {
    el.addEventListener("change", syncPanelStyleHint);
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
      setVibecodeRow(d);
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
  $("copyPathBtn").addEventListener("click", function () {
    var p = $("demoPath").textContent;
    if (!p) return;
    try { navigator.clipboard.writeText(p); } catch (e) {}
    $("copyPathBtn").textContent = "Copied ✓";
    setTimeout(function () { $("copyPathBtn").textContent = "Copy folder path"; }, 1600);
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

  /* ---------------- sidebar router ---------------- */

  function route() {
    var hash = (location.hash || "#demos").split("&")[0];
    var isRemote = hash === "#remote";
    document.getElementById("nav-demos").classList.toggle("on", !isRemote);
    document.getElementById("nav-remote").classList.toggle("on", isRemote);
    if (isRemote) {
      $("listView").hidden = true;
      $("editView").hidden = true;
      $("remoteView").hidden = false;
      if (window.CDSRemote) window.CDSRemote.show();
    } else {
      loadList();
    }
  }
  window.addEventListener("hashchange", route);

  // Pop-out mode: compact Remote Control-only window (#remote&popout=1)
  if (/popout=1/.test(location.hash)) document.body.classList.add("popout");

  /* ---------------- boot ---------------- */
  route();
})();
