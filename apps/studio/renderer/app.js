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
    showView("listView");
    editingId = null;
    Promise.all([api("/api/demos"), api("/api/settings")]).then(function (results) {
      allDemos = results[0].demos || [];
      folders = results[1].folders || [];
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
      head.innerHTML = '<span class="folder-caret" data-ico="expand_more" data-size="18"></span>' +
        '<span class="folder-ico" data-ico="folder" data-size="16"></span> <b></b> <span class="folder-count"></span>';
      CDSIcons.hydrate(head);
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
    if (!d.built) chips += ' <span class="chip chip-unbuilt">Building…</span>';
    el.innerHTML =
      '<div class="demo-row-main"><h3></h3><span class="demo-site"></span></div>' +
      '<div class="demo-row-chips">' + chips + "</div>" +
      '<div class="demo-actions">' +
      '<button class="primary" data-act="launch">Launch</button>' +
      '<button class="ghost" data-act="edit">Edit</button>' +
      '<button class="ghost" data-act="duplicate">Duplicate</button>' +
      '<button class="ghost" data-act="preflight">Preflight</button>' +
      '<button class="ghost" data-act="sync" title="Refresh this demo\'s code from the current template (your source is backed up)">Sync</button>' +
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
    sync: function (d) {
      if (!confirm('Update "' + d.name + '" to the current template?\n\n' +
                   'This replaces the demo\'s source code with a fresh copy of the ' +
                   d.template + ' template — use it to pick up new features (like the ' +
                   'overlay launcher) on an older demo.\n\n' +
                   'Your current source is backed up inside the demo folder first, and ' +
                   'your settings and branding are kept.')) return;
      modal("Updating…", '<div class="soft">Copying the template and rebuilding.</div>');
      api("/api/demos/" + d.id + "/sync-template", { method: "POST" }).then(function (res) {
        var ok = res.lastBuild && res.lastBuild.ok;
        modal(ok ? "Demo updated" : "Updated, but the build failed",
          '<p style="font-size:13.5px;line-height:1.6">' +
          (ok ? "<b>" + esc(d.name) + "</b> now runs the latest " + esc(d.template) + " template."
              : "The template was copied but the rebuild failed:<br><code>" + esc(res.lastBuild && res.lastBuild.error) + "</code>") +
          '<br><br>Your previous source was saved to:<br><code style="font-size:11px;word-break:break-all">' +
          esc(res.backup) + "</code></p>");
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
    showView("editView");
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
    setRadio("chatUi", d ? (d.chatUi || "webchat3") : "webchat3");
    $("f-width").value = d && [360, 420, 520, 650].indexOf(d.panelWidth) >= 0 ? String(d.panelWidth) : "0";
    $("f-agent").value = d ? d.agentName : "";
    $("f-label").value = d ? d.launcherText : "";
    $("f-showlabel").checked = d ? !!d.showLauncherText : true;
    $("f-welcome").value = d ? d.welcomeMessage : "";
    $("f-primary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.primaryColor) ? d.theme.primaryColor : "#3694fc";
    $("f-secondary").value = d && /^#[0-9a-f]{6}$/i.test(d.theme.secondaryColor) ? d.theme.secondaryColor : "#f1f5f9";
    $("f-logo").value = d ? d.theme.logo : "";
    syncEndpointVisibility();
    syncChatUi();
  }

  function formValues() {
    return {
      name: $("f-name").value.trim(),
      website: $("f-website").value.trim(),
      folder: $("f-folder").value.trim(),
      template: radio("template"),
      panelSide: radio("side"),
      panelStyle: radio("panelStyle"),
      chatUi: radio("chatUi"),
      panelWidth: parseInt($("f-width").value, 10) || 0,
      launcher: radio("launcher"),
      launcherText: $("f-label").value.trim(),
      showLauncherText: $("f-showlabel").checked,
      agentName: $("f-agent").value.trim() || "AI Assistant",
      welcomeMessage: $("f-welcome").value.trim(),
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
    solid: "A white drawer slides in from the side when the chat opens — the classic slide-out.",
    clear: "Nothing of ours paints. Cognigy's own launcher and chat window float on the customer's site, exactly as if they had deployed it themselves.",
    overlay: "The demo draws its own launcher icon and panel — both vibe-codeable in src/shell/. Built-in chat UI only."
  };
  function syncPanelStyleHint() {
    $("panelStyleHint").textContent = PANEL_STYLE_HINT[radio("panelStyle")] || "";
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="panelStyle"]'), function (el) {
    el.addEventListener("change", syncPanelStyleHint);
  });

  var CHAT_UI_HINT = {
    webchat3: "The real Cognigy Webchat v3 widget, with its own launcher and window. Everything about how it looks — colors, logo, welcome text, style preset — comes from the Webchat v3 Endpoint in Cognigy, not from this form.",
    studio: "Demo Studio's own React chat, vibe-codeable in the demo's src/chat/. The only option that can run a simulated (mock) demo."
  };

  /*
   * Webchat v3 can't be combined with the voice half or with an overlay
   * launcher (demo-schema coerces those back to "studio"), so show that here
   * rather than let the SE pick something the save silently undoes.
   */
  function syncChatUi() {
    var allowed = radio("template") === "webchat" && radio("panelStyle") !== "overlay";
    if (!allowed) setRadio("chatUi", "studio");
    var on = allowed && radio("chatUi") === "webchat3";

    Array.prototype.forEach.call(document.querySelectorAll('input[name="chatUi"]'), function (el) {
      el.disabled = !allowed;
    });
    $("f-chatui-set").classList.toggle("is-disabled", !allowed);

    // Overlay is meaningless for the real widget — it draws its own launcher.
    $("ps-overlay").style.display = radio("chatUi") === "webchat3" && allowed ? "none" : "";

    $("chatUiHint").textContent = !allowed
      ? "Cognigy Webchat v3 needs the Webchat template and a non-overlay panel style — this demo uses the built-in chat."
      : (CHAT_UI_HINT[radio("chatUi")] || "");

    // Read only by the built-in chat. Webchat v3 takes all of this from the
    // Cognigy Endpoint, so editing it here would do nothing — say so rather
    // than leave the SE wondering why nothing changed.
    [["f-welcome", "Welcome Message"], ["f-agent", "AI Agent Name"],
     ["f-primary", "Primary Color"], ["f-secondary", "Secondary Color"],
     ["f-logo", "Logo URL"], ["f-label", "Launcher Label"]].forEach(function (pair) {
      var input = $(pair[0]);
      if (!input) return;
      var label = input.closest("label");
      if (label) label.classList.toggle("is-inert", on);
      input.title = on ? pair[1] + " comes from the Cognigy Endpoint when Chat UI is Cognigy Webchat v3." : "";
    });

    // Launcher choices belong to our launcher, which webchat3 doesn't draw.
    Array.prototype.forEach.call(document.querySelectorAll('input[name="launcher"]'), function (el) {
      var lbl = el.closest("label");
      if (lbl) lbl.classList.toggle("is-inert", on);
    });
  }
  Array.prototype.forEach.call(
    document.querySelectorAll('input[name="chatUi"], input[name="template"], input[name="panelStyle"]'),
    function (el) { el.addEventListener("change", syncChatUi); }
  );

  var followEl = $("f-followme");
  if (followEl) {
    var followSaveTimer = null;
    followEl.addEventListener("input", function () {
      clearTimeout(followSaveTimer);
      $("followMeStatus").textContent = "Saving…";
      // Debounced: this is a free-text field, and every keystroke would
      // otherwise be a settings write.
      followSaveTimer = setTimeout(function () {
        var v = followEl.value.trim() || "followme";
        api("/api/settings", putJson({ followMeUserId: v }))
          .then(function () {
            $("followMeStatus").textContent = v === "followme"
              ? "Live Follow will track this conversation."
              : 'Using "' + v + '" — Live Follow only tracks "followme".';
          })
          .catch(function () { $("followMeStatus").textContent = "Couldn't save."; });
      }, 400);
    });
  }

  var diagEl = $("f-diagnostics");
  if (diagEl) {
    diagEl.addEventListener("change", function () {
      $("diagnosticsStatus").textContent = "Saving…";
      api("/api/settings", putJson({ showDiagnostics: diagEl.checked }))
        .then(function () {
          $("diagnosticsStatus").textContent = diagEl.checked
            ? "On — refresh a demo to see the badge."
            : "Off — refresh a demo to hide it.";
        })
        .catch(function () { $("diagnosticsStatus").textContent = "Couldn't save."; });
    });
  }

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
    $("copyPathBtn").innerHTML = CDSIcons.svg("check", 15) + " Copied";
    setTimeout(function () { $("copyPathBtn").textContent = "Copy folder path"; }, 1600);
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
          return (r.ok ? CDSIcons.svg("check", 15) : CDSIcons.svg("close", 15)) + " " +
            esc(r.name) + (r.ok ? "" : " — " + esc(r.error || "failed"));
        });
        modal("Import complete", '<div style="font-size:13.5px;line-height:1.9">' + lines.join("<br>") + "</div>");
        location.hash = "#demos";
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
        html += '<div class="pf-check ' + (c.ok ? "ok" : "bad") + '"><span class="mark">' +
          CDSIcons.svg(c.ok ? "check" : "close", 16) + "</span><span>" +
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


  /* ---------------- settings ---------------- */

  function fmtDate(iso) {
    if (!iso) return "unknown";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function loadSettings() {
    api("/api/settings").then(function (st) {
      $("f-diagnostics").checked = st.showDiagnostics !== false;
      var fm = st.followMeUserId || "followme";
      $("f-followme").value = fm;
      $("followMeStatus").textContent = fm === "followme"
        ? "Live Follow will track this conversation."
        : 'Using "' + fm + '" — Live Follow only tracks "followme".';
    }).catch(function () {});

    api("/api/about").then(function (a) {
      $("aboutName").textContent = a.name;
      $("aboutVersion").textContent = "Version " + a.version + (a.commit ? " (" + a.commit + ")" : "");
      $("aboutUpdated").textContent = fmtDate(a.updatedAt);
      $("aboutCount").textContent = a.demoCount + (a.demoCount === 1 ? " demo" : " demos");
      $("dataDir").textContent = a.dataDir;
      $("repoRoot").textContent = a.repoRoot;
      $("extPath").textContent = a.extensionDir;
      $("openExtFolder").hidden = !(window.cds && window.cds.openFolder);

      // Someone who already has it working shouldn't have to read setup steps,
      // so collapse them once we've heard from the extension.
      var pill = $("extPill");
      var banner = $("extBanner");
      var steps = $("extSteps");
      if (a.extensionConnected) {
        pill.className = "pill ok";
        pill.textContent = "Installed";
        banner.hidden = false;
        banner.innerHTML = "The extension is installed and talking to Demo Studio. " +
          '<a href="#" id="showSteps">Show the setup steps</a> if you need to install it on another browser.';
        steps.hidden = true;
        var link = $("showSteps");
        if (link) link.addEventListener("click", function (ev) {
          ev.preventDefault();
          steps.hidden = false;
          banner.hidden = true;
        });
      } else {
        pill.className = "pill warn";
        pill.textContent = "Not set up yet";
        banner.hidden = true;
        steps.hidden = false;
      }
    }).catch(function (err) { alertErr(err); });
  }

  // Copy buttons: data-copy points at the element holding the value.
  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
    btn.addEventListener("click", function () {
      var el = $(btn.getAttribute("data-copy"));
      if (!el || !el.textContent) return;
      try { navigator.clipboard.writeText(el.textContent); } catch (e) {}
      var was = btn.textContent;
      btn.textContent = "Copied \u2713";
      setTimeout(function () { btn.textContent = was; }, 1600);
    });
  });

  $("openExtFolder").addEventListener("click", function () {
    if (window.cds && window.cds.openFolder) window.cds.openFolder($("extPath").textContent);
  });

  $("exportBtn").addEventListener("click", function () {
    // Let the browser save the file straight from the service.
    window.location.href = "/api/export";
  });

  /* ---------------- appearance ---------------- */

  /*
   * Theme + rail state live in settings.json (so they survive a reinstall and
   * are shared with the Remote Control pop-out, which loads the same origin),
   * and are mirrored into localStorage purely so the inline <head> script can
   * apply them before first paint. settings.json wins on boot.
   */
  var THEMES = ["system", "light", "dark"];
  var THEME_ICON = { system: "contrast", light: "light_mode", dark: "dark_mode" };
  var THEME_LABEL = { system: "Match my system", light: "Light", dark: "Dark" };
  var theme = "system";
  var railMini = false;

  function applyTheme(next) {
    theme = THEMES.indexOf(next) >= 0 ? next : "system";
    var root = document.documentElement;
    // No attribute at all = follow the OS, which the media query handles.
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try { localStorage.setItem("cdsTheme", theme); } catch (e) {}

    var btn = $("themeBtn");
    if (btn) {
      btn.innerHTML = CDSIcons.svg(THEME_ICON[theme], 18);
      btn.title = "Appearance: " + THEME_LABEL[theme];
      btn.setAttribute("aria-label", btn.title);
    }
    var seg = $("themeSeg");
    if (seg) {
      Array.prototype.forEach.call(seg.querySelectorAll("[data-theme-choice]"), function (b) {
        var on = b.getAttribute("data-theme-choice") === theme;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    var st = $("themeStatus");
    if (st) {
      st.textContent = theme === "system"
        ? "Following your system setting."
        : THEME_LABEL[theme] + " — always, whatever your system is set to.";
    }
  }

  function applyRail(mini) {
    railMini = !!mini;
    var root = document.documentElement;
    if (railMini) root.dataset.rail = "mini"; else delete root.dataset.rail;
    try { localStorage.setItem("cdsRail", railMini ? "mini" : "full"); } catch (e) {}

    var btn = $("railBtn");
    if (btn) {
      btn.innerHTML = CDSIcons.svg(railMini ? "chevron_right" : "chevron_left", 18);
      btn.title = railMini ? "Expand sidebar" : "Collapse sidebar";
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("aria-expanded", railMini ? "false" : "true");
    }
  }

  function saveAppearance(patch) {
    api("/api/settings", putJson(patch)).catch(function () {});
  }

  function initAppearance() {
    applyTheme(theme);
    applyRail(railMini);

    $("themeBtn").addEventListener("click", function () {
      var next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      applyTheme(next);
      saveAppearance({ theme: next });
    });
    $("railBtn").addEventListener("click", function () {
      applyRail(!railMini);
      saveAppearance({ sidebarCollapsed: railMini });
    });
    $("themeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-choice]");
      if (!b) return;
      var next = b.getAttribute("data-theme-choice");
      applyTheme(next);
      saveAppearance({ theme: next });
    });
    // Cmd/Ctrl+B is the conventional sidebar toggle.
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        applyRail(!railMini);
        saveAppearance({ sidebarCollapsed: railMini });
      }
    });

    // Reconcile the paint-time guess against the real source of truth.
    api("/api/settings").then(function (st) {
      if (st.theme !== theme) applyTheme(st.theme);
      if (!!st.sidebarCollapsed !== railMini) applyRail(st.sidebarCollapsed);
    }).catch(function () {});
  }

  /* ---------------- sidebar router ---------------- */

  /*
   * The sidebar sections. Adding one means an entry here plus a <main> in
   * index.html — the rail markup, the active state and the view switching all
   * follow from this array, so there is no third place to forget.
   */
  var NAV = [
    {
      id: "demos", hash: "#demos", label: "Demo Experiences", icon: "dashboard",
      /*
       * Deliberately declares no view. #demos owns TWO <main>s: loadList() and
       * openEdit() move between listView and editView without a hash change,
       * so they keep ownership of that pair. Giving this entry a view would
       * make route() slam the list back over the demo editor.
       */
      onShow: loadList
    },
    {
      id: "remote", hash: "#remote", label: "Remote Control", icon: "call",
      view: "remoteView",
      onShow: function () { if (window.CDSRemote) window.CDSRemote.show(); }
    },
    {
      id: "settings", hash: "#settings", label: "Settings", icon: "settings",
      view: "settingsView", onShow: loadSettings
    }
  ];

  // Every <main> the router owns; showView() reveals one and hides the rest.
  var VIEWS = ["listView", "editView", "remoteView", "settingsView"];

  function showView(id) {
    for (var i = 0; i < VIEWS.length; i++) $(VIEWS[i]).hidden = VIEWS[i] !== id;
  }

  function renderNav() {
    $("sideNav").innerHTML = NAV.map(function (n) {
      // title + aria-label unconditionally: the label collapses to zero width
      // when the rail is minimised, and the accessible name must not go with it.
      return '<a href="' + n.hash + '" id="nav-' + n.id + '" class="side-item"' +
             ' title="' + n.label + '" aria-label="' + n.label + '">' +
             '<span class="side-ico" data-ico="' + n.icon + '" data-size="19"></span>' +
             '<span class="side-label">' + n.label + "</span></a>";
    }).join("");
    CDSIcons.hydrate($("sideNav"));
  }

  function route() {
    var hash = (location.hash || "#demos").split("&")[0];
    var item = NAV[0];
    for (var i = 0; i < NAV.length; i++) if (NAV[i].hash === hash) item = NAV[i];

    for (var j = 0; j < NAV.length; j++) {
      var a = $("nav-" + NAV[j].id);
      if (a) a.classList.toggle("on", NAV[j] === item);
    }
    if (item.view) showView(item.view);
    if (item.onShow) item.onShow();
  }
  window.addEventListener("hashchange", route);

  // Pop-out mode: compact Remote Control-only window (#remote&popout=1)
  if (/popout=1/.test(location.hash)) document.body.classList.add("popout");

  /* ---------------- boot ---------------- */
  try {
    var t0 = localStorage.getItem("cdsTheme");
    if (THEMES.indexOf(t0) >= 0) theme = t0;
    railMini = localStorage.getItem("cdsRail") === "mini";
  } catch (e) {}
  CDSIcons.hydrate();
  renderNav();
  initAppearance();
  route();
})();
