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

  /*
   * settings.folders IS the order — it used to be sorted alphabetically here,
   * which threw that away. Folders an SE dragged into an order stay in it; any
   * folder discovered only on a demo (imported, or hand-edited demo.json) is
   * appended, sorted, so it still shows up.
   */
  function allFolderNames() {
    var names = folders.slice();
    var extra = [];
    allDemos.forEach(function (d) {
      if (d.folder && names.indexOf(d.folder) < 0 && extra.indexOf(d.folder) < 0) extra.push(d.folder);
    });
    extra.sort(function (a, b) { return a.localeCompare(b); });
    return names.concat(extra);
  }

  /* ---------------- folders: drag, rename, delete ---------------- */
  /*
   * One module-level `drag` describes what is in flight — a demo being filed,
   * or a folder being reordered — because HTML5 drag-and-drop's dataTransfer is
   * unreadable during dragover, which is exactly when the drop target has to
   * decide whether it will accept.
   */
  var drag = null;

  function clearDropHints() {
    Array.prototype.forEach.call(
      document.querySelectorAll(".drop-into, .drop-before"),
      function (el) { el.classList.remove("drop-into", "drop-before"); }
    );
  }

  // A folder header accepts a demo (file it here) or a folder (drop before me).
  function wireFolderDrop(head, name) {
    head.addEventListener("dragstart", function (ev) {
      drag = { kind: "folder", name: name };
      try { ev.dataTransfer.setData("text/plain", name); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
    });
    head.addEventListener("dragend", function () { drag = null; clearDropHints(); });
    head.addEventListener("dragover", function (ev) {
      if (!drag) return;
      if (drag.kind === "demo" && drag.from === name) return;  // already here
      if (drag.kind === "folder" && drag.name === name) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      clearDropHints();
      head.classList.add(drag.kind === "demo" ? "drop-into" : "drop-before");
    });
    head.addEventListener("dragleave", function () { head.classList.remove("drop-into", "drop-before"); });
    head.addEventListener("drop", function (ev) {
      ev.preventDefault();
      var d = drag;
      clearDropHints();
      drag = null;
      if (!d) return;
      if (d.kind === "demo") return moveDemoToFolder(d.id, name);
      if (d.kind === "folder") return reorderFolder(d.name, name);
    });
  }

  function moveDemoToFolder(id, folder) {
    api("/api/demos/" + id, putJson({ folder: folder })).then(loadList).catch(alertErr);
  }

  // Drop `moved` immediately before `before`; passing null means send to the end.
  function reorderFolder(moved, before) {
    var order = allFolderNames().filter(function (f) { return f !== moved; });
    var at = before ? order.indexOf(before) : order.length;
    order.splice(at < 0 ? order.length : at, 0, moved);
    folders = order;
    api("/api/folders/reorder", postJson({ folders: order })).then(loadList).catch(alertErr);
  }

  var folderActions = {
    rename: function (name) {
      var next = prompt("Rename folder:", name);
      if (next === null) return;
      next = next.trim().slice(0, 80);
      if (!next || next === name) return;
      var merging = allFolderNames().indexOf(next) >= 0;
      if (merging && !confirm('"' + next + '" already exists.\n\nRenaming will merge the two folders. Continue?')) return;
      collapsedFolders[next] = collapsedFolders[name];   // carry the open/closed state over
      api("/api/folders/rename", postJson({ from: name, to: next })).then(loadList).catch(alertErr);
    },
    delete: function (name) {
      var count = allDemos.filter(function (d) { return d.folder === name; }).length;
      if (!confirm('Delete the folder "' + name + '"?\n\n' +
                   (count
                     ? count + (count === 1 ? " demo moves" : " demos move") + " back to the top level. Nothing is deleted."
                     : "It is empty."))) return;
      api("/api/folders/delete", postJson({ name: name })).then(loadList).catch(alertErr);
    }
  };

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
    // allFolderNames(), not a sort of the group keys — the stored order IS the
    // display order, or dragging a folder would persist and never show.
    allFolderNames().forEach(function (f) {
      if (!f || !groups[f]) return;
      if (q && groups[f].length === 0) return; // hide empty folders while searching
      var head = document.createElement("div");
      head.className = "folder-head" + (collapsedFolders[f] && !q ? " collapsed" : "");
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
      head.querySelector(".folder-count").textContent = groups[f].length + (groups[f].length === 1 ? " demo" : " demos");
      head.addEventListener("click", function (ev) {
        var act = ev.target.closest("[data-fact]");
        if (act) { ev.stopPropagation(); return folderActions[act.getAttribute("data-fact")](f); }
        if (ev.target.closest(".folder-grip")) return;   // grip is for dragging
        collapsedFolders[f] = !collapsedFolders[f];
        renderList();
      });
      wireFolderDrop(head, f);
      list.appendChild(head);
      if (!collapsedFolders[f] || q) {
        groups[f].forEach(function (d) { list.appendChild(row(d, true)); });
      }
    });
  }

  function row(d, indented) {
    var el = document.createElement("div");
    el.className = "demo-row" + (indented ? " in-folder" : "");
    el.draggable = true;
    el.setAttribute("data-demo", d.id);
    el.addEventListener("dragstart", function (ev) {
      drag = { kind: "demo", id: d.id, from: d.folder || "" };
      el.classList.add("dragging");
      try { ev.dataTransfer.setData("text/plain", d.id); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
    });
    el.addEventListener("dragend", function () { drag = null; clearDropHints(); el.classList.remove("dragging"); });
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

  /*
   * The list background is the "no folder" target, so a demo can be dragged
   * back out. Without it a demo could be filed but never unfiled by dragging.
   */
  (function () {
    var list = $("demoList");
    list.addEventListener("dragover", function (ev) {
      if (!drag || drag.kind !== "demo" || !drag.from) return;
      if (ev.target.closest(".folder-head") || ev.target.closest(".demo-row")) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      list.classList.add("drop-into");
    });
    list.addEventListener("dragleave", function () { list.classList.remove("drop-into"); });
    list.addEventListener("drop", function (ev) {
      if (!drag || drag.kind !== "demo") return;
      if (ev.target.closest(".folder-head") || ev.target.closest(".demo-row")) return;
      ev.preventDefault();
      var id = drag.id;
      drag = null;
      list.classList.remove("drop-into");
      moveDemoToFolder(id, "");
    });
  })();

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
    $("saveStatus").textContent = "";
    $("buildStatus").textContent = "";
    setVibecodeRow(null);
    renderFolderOptions();

    /*
     * Re-read the theme catalogue every time the form opens, so a theme file
     * dropped into assets/themes/ while the dashboard was open shows up on the
     * next Edit rather than on the next reload. Fire and forget: the built-in
     * list paints immediately and this repaints only if it found something new.
     */
    CDSThemes.load().then(function (changed) {
      if (changed && $("editView") && !$("editView").hidden) renderThemeList();
    });

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

  /* ---------------- demo form ---------------- */
  /*
   * Driven by two choices — Endpoint, then Theme — with everything else
   * following. Chat UI used to be a third radio here; it is now derived in
   * demo-schema.sanitize(), because it was always a consequence rather than a
   * decision, which is why it kept appearing greyed out.
   */

  // Live state for the controls that aren't plain inputs.
  var form = {
    template: "webchat-webrtc",
    theme: "cognigy-default",
    launcher: "ai-orb",
    launcherImage: "",
    side: "right",
    panelStyle: "overlay",
    startingBehavior: "greeting"
  };

  var LAUNCHER_ART = {
    "ai-orb":     { name: "AI Orb",      cls: "",      icon: "blur_on" },
    "ai-spark":   { name: "AI Spark",    cls: "spark", icon: "auto_awesome" },
    "voice-wave": { name: "Voice Wave",  cls: "",      icon: "graphic_eq" },
    "chat":       { name: "Chat Bubble", cls: "",      icon: "chat" }
  };

  var THEME_SUB = {
    "webchat": "Cognigy Default leaves the widget exactly as the Endpoint styles it. Custom overrides its colours from demo.json.",
    "webrtc": "Cognigy Default is Cognigy's own click-to-call widget. Halo is the voice shell Demo Studio draws."
  };

  var PANEL_STYLE_HINT = {
    overlay: "Nothing of ours paints. The widget floats on the customer's site exactly as if they had deployed it themselves.",
    solid: "A drawer slides in from the side, with a title bar, and the panel fills it."
  };


  var START_HINT = {
    greeting: "The assistant speaks first as soon as the panel opens.",
    button: "The visitor presses a button before anything is sent."
  };

  function isDefaultTheme() { return form.theme === "cognigy-default"; }

  function renderThemeList() {
    $("themeList").innerHTML = CDSThemes.listFor(form.template).map(function (t) {
      if (t.rule) return '<div class="theme-rule" role="presentation"></div>';
      var on = t.id === form.theme;
      return '<button type="button" class="theme-tile' + (on ? " on" : "") + '"' +
        ' role="radio" aria-checked="' + (on ? "true" : "false") + '" data-theme="' + t.id + '">' +
        '<span class="theme-swatch" aria-hidden="true">' +
          t.swatch.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") +
        '</span>' +
        '<span class="theme-name">' + esc(t.name) + '</span>' +
        '<span class="theme-note">' + esc(t.note) + '</span>' +
      '</button>';
    }).join("");
    $("themeSub").textContent = THEME_SUB[form.template] || "";
  }

  function renderLauncherList() {
    var tiles = Object.keys(LAUNCHER_ART).map(function (id) {
      var a = LAUNCHER_ART[id];
      var on = form.launcher === id && !form.launcherImage;
      return '<button type="button" class="launcher-tile' + (on ? " on" : "") + '"' +
        ' role="radio" aria-checked="' + (on ? "true" : "false") + '" data-launcher="' + id + '">' +
        '<span class="launcher-art ' + a.cls + '">' + CDSIcons.svg(a.icon, 20) + '</span>' +
        '<span class="launcher-name">' + esc(a.name) + '</span>' +
      '</button>';
    });
    /*
     * The upload tile shows the uploaded art once there is one, so the picker
     * reflects what the demo will actually draw.
     *
     * Disabled until the upload route exists. A control that opens a file
     * picker and then silently drops the file is the same bug the Template
     * radios had — it looks like it worked. Better to say so.
     */
    var upOn = !!form.launcherImage;
    tiles.push('<button type="button" class="launcher-tile' + (upOn ? " on" : "") + '"' +
      ' disabled title="Not wired up yet — the upload route is next."' +
      ' role="radio" aria-checked="' + (upOn ? "true" : "false") + '" data-launcher="__upload">' +
      '<span class="launcher-art upload">' +
        (upOn ? '<img src="' + esc(form.launcherImage) + '" alt="" />' : CDSIcons.svg("add_photo_alternate", 18)) +
      '</span>' +
      '<span class="launcher-name">' + (upOn ? "Your image" : "Upload") + '</span>' +
    '</button>');
    $("launcherList").innerHTML = tiles.join("");
  }

  function paintSeg(id, attr, value) {
    var seg = $(id);
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll("[data-" + attr + "]"), function (b) {
      var on = b.getAttribute("data-" + attr) === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  // The one function that keeps the form coherent.
  function syncForm() {
    $("l-chat").hidden = form.template === "webrtc";
    $("l-voice").hidden = form.template === "webchat";


    /*
     * Both styles are offered everywhere now. Overlay is the default; Panel is
     * always available, including on Halo — in that style the demo renders its
     * panel without its own shell and the extension supplies the launcher and
     * drawer, so there is no second launcher to collide with.
     */

    /*
     * Cognigy Default takes the launcher, agent name, greeting and starters
     * from the Endpoint, so these cards are hidden rather than greyed out —
     * the old half-state looked editable and did nothing.
     */
    $("appearanceCard").hidden = isDefaultTheme();
    $("automationsCard").hidden = isDefaultTheme();
    // Inside the Appearance card, which is already hidden for Cognigy Default,
    // so this only has to hide for the endpoint that has no voice at all.
    $("transcriptRow").hidden = form.template === "webchat";

    paintSeg("sideSeg", "side", form.side);
    paintSeg("styleSeg", "style", form.panelStyle);
    paintSeg("startSeg", "start", form.startingBehavior);
    $("panelStyleHint").textContent = PANEL_STYLE_HINT[form.panelStyle] || "";
    $("startHint").textContent = START_HINT[form.startingBehavior] || "";
    renderThemeList();
    renderLauncherList();
  }

  function fillForm(d) {
    $("f-name").value = d ? d.name : "";
    $("f-website").value = d ? d.website : "";
    $("f-folder").value = d ? (d.folder || "") : "";

    form.template = d ? d.template : "webchat-webrtc";
    // What it was when opened. Changing the endpoint re-copies the demo's
    // source, so the save path warns rather than doing it silently.
    form.openedAs = d ? d.template : null;
    form.theme = (d && d.theme && d.theme.preset) || "cognigy-default";
    form.launcher = (d && d.launcher) || "ai-orb";
    form.launcherImage = (d && d.launcherImage) || "";
    form.side = d ? d.panelSide : "right";
    form.panelStyle = d ? (d.panelStyle || "overlay") : "overlay";
    form.startingBehavior = (d && d.startingBehavior) || "greeting";

    $("f-endpoint").value = form.template;
    $("f-chat").value = d ? d.cognigy.chatEndpoint : "";
    $("f-voice").value = d ? d.cognigy.voiceEndpoint : "";
    /*
     * Read the widths off the <select> rather than repeating them. The list
     * used to be a literal here and was not updated when 800/1000/1200 were
     * added, so a demo at one of those showed "Endpoint default" — and saving
     * the form then wrote 0 back, silently resetting a width the SE had set.
     */
    var widthOpts = Array.prototype.map.call($("f-width").options, function (o) { return o.value; });
    $("f-width").value = d && widthOpts.indexOf(String(d.panelWidth)) >= 0 ? String(d.panelWidth) : "0";
    $("f-agent").value = d ? d.agentName : "";
    $("f-label").value = d ? d.launcherText : "";
    $("f-showlabel").checked = d ? !!d.showLauncherText : true;
    $("f-welcome").value = d ? d.welcomeMessage : "";
    $("f-teaser").value = (d && d.teaserMessage) || "";
    $("f-transcript").checked = d ? d.showTranscript !== false : true;

    var starters = (d && d.starters) || [];
    for (var i = 0; i < 3; i++) $("f-starter-" + i).value = starters[i] || "";

    syncForm();
  }

  function formValues() {
    var starters = [];
    for (var i = 0; i < 3; i++) starters.push($("f-starter-" + i).value);
    return {
      name: $("f-name").value.trim(),
      website: $("f-website").value.trim(),
      folder: $("f-folder").value.trim(),
      template: form.template,
      panelSide: form.side,
      panelStyle: form.panelStyle,
      panelWidth: parseInt($("f-width").value, 10) || 0,
      launcher: form.launcher,
      launcherImage: form.launcherImage,
      launcherText: $("f-label").value.trim(),
      showLauncherText: $("f-showlabel").checked,
      agentName: $("f-agent").value.trim() || "AI Assistant",
      welcomeMessage: $("f-welcome").value.trim(),
      starters: starters,
      startingBehavior: form.startingBehavior,
      teaserMessage: $("f-teaser").value.trim(),
      showTranscript: $("f-transcript").checked,
      cognigy: { chatEndpoint: $("f-chat").value.trim(), voiceEndpoint: $("f-voice").value.trim() },
      // chatUi is intentionally absent — sanitize() derives it from the above.
      theme: { preset: form.theme }
    };
  }

  $("f-endpoint").addEventListener("change", function () {
    form.template = $("f-endpoint").value;
    /*
     * Themes are per endpoint, so one selected for the previous endpoint may
     * not exist here. sanitize() would fall back silently on save; do it now
     * and visibly instead.
     */
    var ok = CDSThemes.listFor(form.template).some(function (t) { return t.id === form.theme; });
    /*
     * The new endpoint's FIRST theme, which is what sanitize() would pick.
     * This used to be Cognigy Default unconditionally — a theme the combination
     * does not offer, so switching to it selected a tile that wasn't there and
     * the save came back as Halo anyway.
     */
    if (!ok) form.theme = CDSThemes.defaultFor(form.template);
    syncForm();
  });

  $("themeList").addEventListener("click", function (e) {
    var tile = e.target.closest("[data-theme]");
    if (!tile) return;
    form.theme = tile.getAttribute("data-theme");
    syncForm();
  });

  $("launcherList").addEventListener("click", function (e) {
    var tile = e.target.closest("[data-launcher]");
    if (!tile) return;
    var v = tile.getAttribute("data-launcher");
    if (v === "__upload") return $("launcherFile").click();
    form.launcher = v;
    form.launcherImage = "";
    syncForm();
  });

  ["sideSeg:side", "styleSeg:style", "startSeg:start"].forEach(function (pair) {
    var bits = pair.split(":"), id = bits[0], attr = bits[1];
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("[data-" + attr + "]");
      if (!b) return;
      var v = b.getAttribute("data-" + attr);
      if (attr === "side") form.side = v;
      else if (attr === "style") form.panelStyle = v;
      else form.startingBehavior = v;
      syncForm();
    });
  });

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

  /* ---------------- microphone ----------------
   *
   * Global rather than per demo, like preferredMicId: it describes this
   * machine and this room. The same values reach every demo, every theme and
   * Remote Control through the injected audio layer, so this card and the gear
   * on the widget are two views of one setting.
   */

  var audioCfg = null;      // last known server state
  var audioMeter = null;    // live preview, only while Settings is on screen
  var audioRaf = 0;
  var audioSave = 0;

  function renderAudio() {
    if (!audioCfg || !$("f-audio-engine")) return;
    var c = audioCfg;
    $("f-audio-engine").value = c.engine;
    $("f-audio-gate").checked = !!c.gate;
    $("audioGateRows").hidden = !c.gate;
    $("f-audio-open").value = c.gateOpenThreshold;
    $("f-audio-close").value = c.gateCloseThreshold;
    $("f-audio-hold").value = c.gateHoldMs;
    $("f-audio-openVal").textContent = c.gateOpenThreshold + " dB";
    $("f-audio-closeVal").textContent = c.gateCloseThreshold + " dB";
    $("f-audio-holdVal").textContent = c.gateHoldMs + " ms";
    $("f-audio-ec").checked = c.echoCancellation !== false;
    $("f-audio-ns").checked = c.noiseSuppression !== false;
    $("f-audio-agc").checked = c.autoGainControl !== false;
    $("audioMeterMark").style.display = c.gate ? "block" : "none";
    $("audioMeterMark").style.left = pct(c.gateOpenThreshold) + "%";
    // Both at once is not wrong, but it is the usual cause of "why does my
    // voice sound thin" — worth saying before an SE debugs it on a live call.
    $("audioStackHint").textContent = (c.engine !== "none" && c.noiseSuppression !== false)
      ? "Browser suppression is stacked on top of " + c.engine + ". If speech sounds thin or pumpy, turn this one off first."
      : "";
    // The demo layer reads this, so the dashboard's own Remote Control pop-out
    // picks up a change without a reload.
    if (window.CDSAudio) window.CDSAudio.apply(c);
  }

  function pct(db) { return Math.max(0, Math.min(100, (db + 90) / 90 * 100)); }

  function saveAudio(patch) {
    audioCfg = Object.assign({}, audioCfg, patch);
    renderAudio();
    clearTimeout(audioSave);
    $("audioStatus").textContent = "Saving…";
    audioSave = setTimeout(function () {
      api("/api/settings", putJson({ audio: audioCfg }))
        .then(function (st) {
          // Trust the server's clamped values over ours.
          audioCfg = st.audio;
          renderAudio();
          $("audioStatus").textContent = audioCfg.engine === "none" && !audioCfg.gate
            ? "Browser processing only."
            : "Applies to every demo and to Remote Control.";
        })
        .catch(function () { $("audioStatus").textContent = "Couldn't save."; });
    }, 250);
  }

  function bindAudio() {
    if (!$("f-audio-engine")) return;
    $("f-audio-engine").addEventListener("change", function (e) { saveAudio({ engine: e.target.value }); });
    $("f-audio-gate").addEventListener("change", function (e) { saveAudio({ gate: e.target.checked }); });
    $("f-audio-ec").addEventListener("change", function (e) { saveAudio({ echoCancellation: e.target.checked }); });
    $("f-audio-ns").addEventListener("change", function (e) { saveAudio({ noiseSuppression: e.target.checked }); });
    $("f-audio-agc").addEventListener("change", function (e) { saveAudio({ autoGainControl: e.target.checked }); });
    $("f-audio-open").addEventListener("input", function (e) {
      var v = parseFloat(e.target.value);
      var patch = { gateOpenThreshold: v };
      // The gate can never close above where it opens, or it would never shut.
      if (audioCfg.gateCloseThreshold > v) patch.gateCloseThreshold = v - 10;
      saveAudio(patch);
    });
    $("f-audio-close").addEventListener("input", function (e) {
      saveAudio({ gateCloseThreshold: Math.min(parseFloat(e.target.value), audioCfg.gateOpenThreshold) });
    });
    $("f-audio-hold").addEventListener("input", function (e) { saveAudio({ gateHoldMs: parseFloat(e.target.value) }); });
  }

  /*
   * The meter opens its own microphone, so it runs ONLY while Settings is on
   * screen. Left running it would keep the OS mic indicator lit for as long as
   * the SE had the dashboard open, which looks exactly like a bug.
   */
  function startAudioMeter() {
    if (audioMeter || !window.CDSAudio || !$("audioMeterFill")) return;
    audioMeter = "pending";
    window.CDSAudio.monitor().then(function (m) {
      if (audioMeter !== "pending") { m.stop(); return; }   // navigated away while awaiting
      audioMeter = m;
      var fill = $("audioMeterFill"), dot = $("audioMeterDot"), text = $("audioMeterText");
      (function frame() {
        if (!audioMeter || audioMeter === "pending") return;
        var r = audioMeter.read();
        fill.style.right = (100 - pct(r.db)) + "%";
        dot.className = "audio-dot" + (r.open ? " open" : "");
        text.textContent = Math.round(r.db) + " dB" +
          (audioCfg && audioCfg.gate ? (r.open ? " — gate open" : " — gate closed") : "");
        audioRaf = requestAnimationFrame(frame);
      })();
    }).catch(function () {
      audioMeter = null;
      $("audioMeterText").textContent = "No microphone available.";
    });
  }

  function stopAudioMeter() {
    if (audioRaf) { cancelAnimationFrame(audioRaf); audioRaf = 0; }
    if (audioMeter && audioMeter !== "pending") audioMeter.stop();
    audioMeter = null;
    if ($("audioMeterText")) $("audioMeterText").textContent = "Open Settings to hear the room…";
    if ($("audioMeterFill")) $("audioMeterFill").style.right = "100%";
  }

  bindAudio();

  /* ---------------- starting up ----------------
   *
   * Only meaningful inside the Electron app: the toggle registers the
   * generated launcher (.app / .lnk) as a login item, so Login Items shows
   * "Cognigy Demo Studio" rather than "Electron".
   */
  function loadStartup() {
    if (!(window.cds && window.cds.loginItem)) return;   // plain browser tab
    $("startupCard").hidden = false;
    window.cds.loginItem().then(function (st) {
      if (!st || !st.supported) { $("startupCard").hidden = true; return; }
      $("f-login-item").checked = !!st.enabled;
      $("startupStatus").textContent = st.enabled
        ? "Demo Studio starts automatically and waits in the background."
        : "You'll need to open Demo Studio yourself before a demo.";
      $("startupStale").hidden = !st.stale;
    }).catch(function () { $("startupCard").hidden = true; });
  }

  if ($("f-login-item")) {
    $("f-login-item").addEventListener("change", function (e) {
      $("startupStatus").textContent = "Saving…";
      window.cds.loginItem(e.target.checked).then(function (st) {
        $("f-login-item").checked = !!(st && st.enabled);
        $("startupStatus").textContent = (st && st.enabled)
          ? "Demo Studio starts automatically and waits in the background."
          : "You'll need to open Demo Studio yourself before a demo.";
      }).catch(function () { $("startupStatus").textContent = "Couldn't change that."; });
    });
    $("rebuildLauncher").addEventListener("click", function () {
      window.cds.makeLauncher();
      $("startupStale").hidden = true;
      $("startupStatus").textContent = "Shortcuts recreated.";
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
    /*
     * Changing the endpoint changes which template the demo folder holds, so
     * store.update() re-copies the source and backs the old one up to
     * _backup-<timestamp>/. That is recoverable but it discards vibe-coded work
     * from the live folder, so it must never happen as a surprise.
     */
    if (editingId && form.openedAs && form.openedAs !== vals.template) {
      var ok = confirm(
        "Changing the endpoint replaces this demo's source with the " + vals.template +
        " template.\n\nYour current source is backed up inside the demo folder first, but any " +
        "vibe-coded changes will no longer be live.\n\nContinue?");
      if (!ok) { $("saveStatus").textContent = ""; return; }
    }

    var req = editingId
      ? api("/api/demos/" + editingId, putJson(vals))
      : api("/api/demos", postJson(vals));
    req.then(function (res) {
      var d = res.demo;
      var isNew = !editingId;
      editingId = d.id;
      $("formTitle").textContent = "Edit Demo Experience";
      $("saveBtn").textContent = "Save";
      form.openedAs = d.template;
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
      audioCfg = st.audio;
      renderAudio();
      startAudioMeter();
      loadStartup();
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
      if (a.extensionConnected && a.extensionStale) {
        // Loud, because the symptom otherwise looks like "the update did
        // nothing" rather than "the extension was never reloaded".
        pill.className = "pill warn";
        pill.textContent = "Needs reloading";
        banner.hidden = false;
        banner.innerHTML = "The extension is running version <b>" + a.extensionVersion +
          "</b> but Demo Studio is <b>" + a.version + "</b>. Open <b>chrome://extensions</b>, click " +
          "the reload arrow on Cognigy Demo Studio, then refresh any customer tab you have open.";
        steps.hidden = true;
      } else if (a.extensionConnected) {
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

      // The literal command `npm run mcp:register` runs for Claude Code, for
      // anyone who wants to see or run it themselves — built from the real
      // path rather than typed out, so it's never wrong for this machine.
      $("mcpManualCmd").textContent =
        'claude mcp add --scope user demo-studio -- node "' + a.repoRoot + '/mcp-server/index.js"';

      var mcp = a.mcp || { code: "unknown", desktop: "unknown", skillPath: "" };
      $("mcpSkillPath").textContent = mcp.skillPath || "";
      $("mcpSkillPathDrawer").textContent = mcp.skillPath || "";
      var mcpPill = $("mcpPill");
      var mcpBanner = $("mcpBanner");
      var mcpSteps = $("mcpSteps");
      var codeOk = mcp.code === "connected";
      // Desktop simply not being installed on this machine isn't a problem —
      // only report a gap when it IS installed and isn't hooked up.
      var desktopOk = mcp.desktop === "connected" || mcp.desktop === "not_installed";
      if (codeOk && desktopOk) {
        mcpPill.className = "pill ok";
        mcpPill.textContent = "Connected";
        mcpBanner.hidden = false;
        mcpBanner.innerHTML = "Connected in Claude Code" +
          (mcp.desktop === "connected" ? " and the Claude desktop app." : ".") +
          ' <a href="#" id="showMcpSteps">Show the details</a> if you need them.';
        mcpSteps.hidden = true;
        var mcpShowLink = $("showMcpSteps");
        if (mcpShowLink) mcpShowLink.addEventListener("click", function (ev) {
          ev.preventDefault();
          mcpSteps.hidden = false;
          mcpBanner.hidden = true;
        });
      } else {
        mcpPill.className = "pill warn";
        mcpPill.textContent = (mcp.code === "stale" || mcp.desktop === "stale") ? "Needs reconnecting" : "Not connected yet";
        mcpBanner.hidden = true;
        mcpSteps.hidden = false;
      }
    }).catch(function (err) { alertErr(err); });
  }

  /*
   * Copy-to-clipboard. In the Electron app this goes through window.cds's
   * native bridge (see preload.js) \u2014 the in-app permission handler only ever
   * grants microphone access, so a scripted navigator.clipboard.writeText()
   * from the page is silently DENIED there. It used to be tried anyway
   * inside a try/catch, which can't catch a rejected Promise, so the button
   * claimed "Copied" regardless of whether anything actually landed on the
   * clipboard. Every path below only reports success once a write has
   * actually gone through.
   */
  function copyToClipboard(text) {
    if (window.cds && window.cds.copyText) return Promise.resolve(window.cds.copyText(text));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    // Last resort for a plain browser tab with no Clipboard API (very old
    // browsers, or a non-secure context) \u2014 a hidden textarea + execCommand.
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("execCommand(copy) returned false"));
      } catch (err) { reject(err); }
    });
  }

  // Copy buttons: data-copy points at the element holding the value.
  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
    btn.addEventListener("click", function () {
      var el = $(btn.getAttribute("data-copy"));
      if (!el || !el.textContent) return;
      var was = btn.textContent;
      copyToClipboard(el.textContent).then(function () {
        btn.textContent = "Copied \u2713";
        setTimeout(function () { btn.textContent = was; }, 1600);
      }).catch(function () {
        btn.textContent = "Couldn't copy \u2014 select it manually";
        setTimeout(function () { btn.textContent = was; }, 2400);
      });
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
    // The meter holds a live microphone; nothing but the Settings view should.
    stopAudioMeter();
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
  // Themes on disk, merged over the built-in table before anything paints one.
  CDSThemes.load();
  renderNav();
  initAppearance();
  route();
})();
