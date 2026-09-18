/*
 * Cognigy Demo Studio — the Logs page.
 *
 * WHAT THIS IS FOR: an SE whose demo just misbehaved, mid-call, in front of a
 * customer. So the page is built to answer "what just happened?" with no
 * typing, and to hand over a clean transcript in one click. Everything that
 * isn't that is behind the "More filters" drawer.
 *
 * Three deliberate choices follow from that:
 *
 *   1. It opens on the last Project used and the newest conversations, with no
 *      filters set. NOT pre-filtered to the Follow-me user, even though every
 *      demo runs as one: measured against a live org, the recent sessions came
 *      from `followme` (a demo), `brice.green@nice.com` (the Cognigy admin
 *      console tester) and `brice` (a REST test) — pre-filtering would have
 *      hidden two of the three. Each row shows its user instead, and the Find
 *      box narrows instantly.
 *   2. One row per CONVERSATION, not per log line, rendered as a .demo-row —
 *      the same row language as Demo Experiences and Remote Control. An SE
 *      almost never knows a session id up front, so the page finds them.
 *   3. The raw log is a DOCK on the whole app (#logDock), not a tab over the
 *      conversations and not a second window. What an SE actually does is
 *      drive the agent — from Remote Control, or from a Demo Experience —
 *      and watch what Cognigy logs about it. A tab shows one at a time, a
 *      pop-out window hides behind the main one on a laptop, and a panel
 *      that belongs to the Logs page disappears the moment they navigate to
 *      the thing they are testing. So the dock lives outside every view,
 *      keeps tailing across navigation, and carries its own controls —
 *      Project, levels and limits, Reset — because from Remote Control the
 *      Logs page is not on screen to reach them.
 *
 * Structure copies remote.js: an IIFE with its own small helpers, one exported
 * entry point, lazily booted, because app.js's route() runs before this file is
 * parsed.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  /* Same reader as app.js/remote.js — a non-JSON reply is nearly always
     Express's HTML 404 for a route the running service doesn't have yet. */
  var api = function (path, options) {
    return fetch(path, options).then(function (r) {
      return r.text().then(function (body) {
        var j = null;
        try { j = body ? JSON.parse(body) : {}; } catch (e) { /* handled below */ }
        if (j) {
          if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
          return j;
        }
        if (r.status === 404) {
          throw new Error("The running Demo Studio service doesn't have " + path + " yet. " +
            "That happens after an update: the dashboard reloads from disk but the service " +
            "only picks up changes on restart. Quit Demo Studio (menu bar / system tray -> " +
            "Quit) and start it again.");
        }
        throw new Error("The service answered HTTP " + r.status + " with something that isn't JSON.");
      });
    });
  };
  function putJson(body) { return { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
  function postJson(body) { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
  function esc(s) { var d = document.createElement("i"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  /*
   * Three-tier copy. navigator.clipboard.writeText() is SILENTLY DENIED in
   * Electron — the window's permission handler grants only "media" and the
   * rejected Promise can't be caught — so the IPC bridge has to come first or
   * the button lies about having worked.
   */
  function copyText(text) {
    if (window.cds && window.cds.copyText) return Promise.resolve(window.cds.copyText(text));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var okay = false;
      try { okay = document.execCommand("copy"); } catch (e) { okay = false; }
      ta.remove();
      okay ? resolve(true) : reject(new Error("copy blocked"));
    });
  }
  function flash(btn, msg) {
    var was = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = was; }, 1600);
  }

  var T = window.CDSLogTranscript;
  var TAIL_MS = 4000;
  /*
   * There is no pop-out button any more — the raw log is docked instead — but
   * #logs&popout=1 still resolves, because the dashboard is also served to a
   * plain browser tab and someone may have that URL open or bookmarked. There
   * the page is the panel and nothing else.
   */
  var POPOUT = /popout=1/.test(location.hash || "") &&
               (location.hash || "").split("&")[0] === "#logs";
  if (POPOUT) document.title = "Cognigy Logs";

  var booted = false;      // wire() has run
  var loaded = false;      // settings + Projects have been read successfully
  var projects = [];
  /** The three exact-match filters: input id -> state key. */
  var FIELDS = [["logFlow", "flowName"], ["logUser", "userId"], ["logSession", "sessionId"]];
  /*
   * Request sequence, not a boolean "loading" lock. A lock looked right and
   * was wrong: the live tail fires every 4s, so a tab switch or a filter
   * change landing during an in-flight poll was silently DROPPED and the page
   * kept showing the old view. Every request runs; only the newest one is
   * allowed to render, which also fixes out-of-order replies.
   */
  var seq = 0;
  var inFlightTail = false;
  var state = {
    projectId: "", find: "", flowName: "", userId: "", sessionId: "",
    /*
     * 6 hours, not 1. The page has to be useful the moment it opens, and a
     * one-hour window showed "nothing has run" for a demo tested two hours
     * earlier — which is exactly when an SE goes looking. Cognigy's own Logs
     * page defaults to 2h; the API accepts only 1, 6 or 12, so 6 is the
     * nearest bound that still covers a working session.
     */
    window: 6, levels: ["info", "error"],
    /* The dock: closed until asked for, and it opens on Raw log. */
    dock: POPOUT, tab: "raw",
    /*
     * Reset stamps this. Everything older is hidden until "Show everything
     * again" — which is what "start a new test" means in practice: the SE
     * wants the screen to contain their test and nothing else, and the 6-hour
     * window is full of the four they ran before it.
     */
    since: 0,
    /* Which conversation the panel's Conversation tab is showing. */
    focus: "",
    sessions: [], entries: [], open: {}
  };
  var tailTimer = 0;

  /* ---------------- setup gate ---------------- */

  function showSetup(reason) {
    loaded = false;
    $("logSetup").hidden = false;
    $("logMain").hidden = true;
    // A Project picker and a Live button that cannot do anything are worse
    // than no controls at all.
    $("logTools").hidden = true;
    $("logFilters").hidden = true;
    // The dock says it too, in one line: an SE who opened it from Remote
    // Control cannot see the Logs page's setup card.
    $("logDockGate").hidden = false;
    $("logDockGateText").textContent = reason || "Demo Studio needs a Cognigy API key to read logs.";
    $("logRaw").hidden = true;
    $("logDockConv").hidden = true;
    stopTail();
    $("logSetupHint").textContent = reason || "";
    api("/api/cognigy/discover").then(function (d) {
      $("logImportMcp").hidden = !d.found;
      if (d.found) {
        $("logSetupHint").textContent = (reason ? reason + " " : "") +
          "Found a Cognigy key in " + d.source + " — import it and you're done.";
      }
    }).catch(function () { /* discovery is a convenience; never block on it */ });
  }

  /* ---------------- boot ---------------- */

  function boot(forceProjectId) {
    return api("/api/settings").then(function (s) {
      state.projectId = forceProjectId || s.logsProjectId || "";
      var cg = s.cognigy || {};
      if (!cg.baseUrl || !cg.apiKeySet) {
        showSetup("Demo Studio needs a Cognigy API key to read logs.");
        return false;
      }
      loaded = true;
      $("logSetup").hidden = true;
      $("logMain").hidden = false;
      $("logDockGate").hidden = true;
      $("logTools").hidden = POPOUT;
      $("logFilters").hidden = POPOUT;   // the pop-out is for watching, not filtering
      setTab(state.tab);                 // un-hide whichever dock tab is current
      return loadProjects().then(function () { return true; });
    });
  }

  function loadProjects() {
    return api("/api/cognigy/projects").then(function (r) {
      projects = r.data || [];
      var options = '<option value="">Pick a Project…</option>' +
        projects.map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>";
        }).join("");
      // Keep the remembered project only if it still exists.
      if (!projects.some(function (p) { return p.id === state.projectId; })) state.projectId = "";
      if (!state.projectId && projects.length === 1) state.projectId = projects[0].id;
      ["logProject", "logDockProject"].forEach(function (id) {
        $(id).innerHTML = options;
        $(id).value = state.projectId;
      });
      if (state.projectId) { loadFlows(); return refresh(); }
      renderEmpty("Pick a Project to see its logs.", "");
    });
  }

  function loadFlows() {
    if (!state.projectId) return;
    api("/api/cognigy/flows?projectId=" + encodeURIComponent(state.projectId)).then(function (r) {
      $("logFlowOptions").innerHTML = (r.data || []).map(function (f) {
        return '<option value="' + esc(f.name) + '"></option>';
      }).join("");
    }).catch(function () { /* suggestions only */ });
  }

  /* ---------------- fetch ---------------- */

  function query() {
    var q = ["projectId=" + encodeURIComponent(state.projectId), "window=" + state.window];
    if (state.flowName) q.push("flowName=" + encodeURIComponent(state.flowName));
    if (state.userId) q.push("userId=" + encodeURIComponent(state.userId));
    if (state.sessionId) q.push("sessionId=" + encodeURIComponent(state.sessionId));
    /*
     * ONE request feeds both halves of the page, so it asks for the union of
     * what each half needs.
     *
     * The conversation rollup needs info + error + fatal. info alone is enough
     * for the TURNS — both canonical transcript messages are info — but a call
     * that died before saying anything has only error entries, and those are
     * the ones carrying flowName. Without them the session that matters most
     * renders as "unknown flow · 0 turns" with no error count, which is
     * precisely the case an SE is hunting for.
     *
     * The raw panel adds whatever the Levels boxes tick on top. warn/debug are
     * only ever asked for while that panel is OPEN, because they can never
     * become a turn and would otherwise spend the 100-entry page budget on
     * entries nothing on screen displays. Unticking Info does not remove it
     * from the request — the rows are filtered to the ticked levels in
     * renderEntries(), so the conversation rows keep their turns either way.
     */
    var levels = ["info", "error", "fatal"];
    if (state.dock) {
      state.levels.forEach(function (l) { if (levels.indexOf(l) < 0) levels.push(l); });
    }
    q.push("type=" + encodeURIComponent(levels.join(",")));
    return q.join("&");
  }

  function refresh() {
    if (!state.projectId) return Promise.resolve();
    var mine = ++seq;
    return api("/api/logs?" + query()).then(function (r) {
      if (mine !== seq) return;              // a newer request already answered
      state.sessions = r.sessions || [];
      state.entries = r.items || [];
      render();
    }).catch(function (err) {
      if (mine !== seq) return;
      renderEmpty("Couldn't read the logs", String(err.message || err));
    });
  }

  function refreshCounts() {
    if (!state.projectId || !$("logSetup").hidden) return;
    api("/api/logs/count?" + query()).then(function (r) {
      var c = (r.data && r.data.counts) || {};
      var parts = Object.keys(c).map(function (k) {
        var v = c[k] || {};
        return k + " " + (v.count || 0) + (v.capped ? "+" : "");
      });
      $("logCounts").textContent = parts.length ? "In this window: " + parts.join(" · ") : "";
    }).catch(function () { $("logCounts").textContent = ""; });
  }

  /* ---------------- render ---------------- */

  function matchesFind(s) {
    if (!state.find) return true;
    var q = state.find.toLowerCase();
    return [s.sessionId, s.userId, s.flowName, s.channel].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function renderEmpty(title, hint) {
    $("logSessions").innerHTML = "";
    $("logEmpty").hidden = false;
    $("logEmptyTitle").textContent = title;
    $("logEmptyHint").textContent = hint || "";
  }

  /** The Reset marker: hide anything from before the SE started this test. */
  function afterSince(at) {
    if (!state.since) return true;
    var t = Date.parse(at || "");
    return isNaN(t) ? true : t >= state.since;
  }

  function sinceClock() { return T.clock(new Date(state.since).toISOString()); }

  function render() {
    renderSessions();
    paintSuggestions();
    renderDock();
  }

  function filterHint() {
    var set = [];
    if (state.userId) set.push("user " + state.userId);
    if (state.flowName) set.push("flow " + state.flowName);
    if (state.sessionId) set.push("session " + state.sessionId);
    if (!set.length) {
      if (state.since) {
        return "Nothing has run since " + sinceClock() + ". Start your test — this page " +
          "refreshes itself every few seconds.";
      }
      return "Nothing has run in the last " + state.window + (state.window === 1 ? " hour." : " hours.");
    }
    return "No match for " + set.join(", ") + ". Cognigy matches these exactly and " +
      "case-sensitively, so a partial value returns nothing.";
  }

  /** The conversations the SE can currently see — find box and Reset applied. */
  function visibleSessions() {
    return state.sessions.filter(function (s) { return matchesFind(s) && afterSince(s.lastAt); });
  }

  function renderSessions() {
    var rows = visibleSessions();
    var host = $("logSessions");
    $("logEmpty").hidden = rows.length > 0;
    if (!rows.length) {
      host.innerHTML = "";
      $("logEmptyTitle").textContent = "No conversations";
      $("logEmptyHint").textContent = filterHint();
      return;
    }
    host.innerHTML = "";
    rows.forEach(function (s) { host.appendChild(sessionRow(s)); });
  }

  function sessionRow(s) {
    var wrap = document.createElement("div");

    var row = document.createElement("div");
    row.className = "demo-row" + (state.focus === s.sessionId ? " on" : "");

    var main = document.createElement("div");
    main.className = "demo-row-main";
    // Clicking the row picks the conversation the panel shows. The action
    // buttons are a sibling of this element, so they are unaffected.
    main.addEventListener("click", function () { focusSession(s.sessionId); });
    var h = document.createElement("h3");
    h.textContent = s.userId || "(no user id)";
    var sub = document.createElement("span");
    sub.className = "demo-site soft";
    // Date AND time: a 12-hour window straddles midnight, and "21:58" alone
    // reads as today when it was yesterday.
    sub.textContent = (s.flowName || "unknown flow") + " · " +
      T.stamp(s.firstAt) + "–" + T.clock(s.lastAt) + " · " +
      s.turns + (s.turns === 1 ? " turn" : " turns");
    // The row is one line and a flow name is often longer than it, so the
    // full text has to be reachable somehow.
    sub.title = sub.textContent + "\nSession " + s.sessionId;
    main.appendChild(h);
    main.appendChild(sub);

    var chips = document.createElement("div");
    chips.className = "demo-row-chips";
    if (s.channel) chips.appendChild(chip("chip-template", s.channel));
    if (s.errors) chips.appendChild(chip("chip-unbuilt", s.errors + (s.errors === 1 ? " error" : " errors")));
    main.appendChild(chips);

    var actions = document.createElement("div");
    actions.className = "demo-actions";
    var open = !!state.open[s.sessionId];

    var tBtn = document.createElement("button");
    tBtn.className = "ghost";
    tBtn.textContent = open ? "Hide transcript" : "Transcript";
    tBtn.addEventListener("click", function () {
      state.open[s.sessionId] = !state.open[s.sessionId];
      renderSessions();
    });

    var cBtn = document.createElement("button");
    cBtn.className = "ghost";
    cBtn.textContent = "Copy";
    cBtn.addEventListener("click", function () {
      var text = T.toText(T.readEntries(s.entries, { sessionId: s.sessionId }), { agentName: "Agent" });
      if (!text.trim()) { flash(cBtn, "Nothing to copy"); return; }
      copyText(text).then(function () { flash(cBtn, "Copied ✓"); })
        .catch(function () { flash(cBtn, "Couldn't copy"); });
    });

    var dBtn = document.createElement("button");
    dBtn.className = "ghost";
    dBtn.textContent = "Download";
    dBtn.addEventListener("click", function () {
      // Served with Content-Disposition, the same way /api/export is — no Blob
      // and no Electron save-dialog bridge needed.
      window.location.href = "/api/logs/transcript.txt?" + query() +
        "&sessionId=" + encodeURIComponent(s.sessionId);
    });

    var idBtn = document.createElement("button");
    idBtn.className = "ghost";
    idBtn.title = s.sessionId;
    idBtn.textContent = "Copy ID";
    idBtn.addEventListener("click", function () {
      copyText(s.sessionId).then(function () { flash(idBtn, "Copied ✓"); })
        .catch(function () { flash(idBtn, "Couldn't copy"); });
    });

    actions.appendChild(tBtn);
    actions.appendChild(cBtn);
    actions.appendChild(dBtn);
    actions.appendChild(idBtn);

    row.appendChild(main);
    row.appendChild(actions);
    wrap.appendChild(row);

    if (open) wrap.appendChild(transcriptPanel(s));
    return wrap;
  }

  function chip(cls, text) {
    var c = document.createElement("span");
    c.className = "chip " + cls;
    c.textContent = text;
    return c;
  }

  /*
   * The transcript, in Halo's own bubbles. Wrapping in .rc-halo is the whole
   * trick: every .cds-utt* rule in style.css is scoped under it, so this looks
   * identical to Remote Control's live transcript with no new CSS.
   */
  function transcriptPanel(s) {
    var lines = T.readEntries(s.entries, { sessionId: s.sessionId });
    var panel = document.createElement("div");
    panel.className = "rc-halo";

    var head = document.createElement("h4");
    head.className = "cds-tt";
    head.textContent = "Transcript · " + lines.length + (lines.length === 1 ? " turn" : " turns") +
      (lines.length ? " · " + T.day(lines[0].at) : "");
    panel.appendChild(head);

    var log = document.createElement("div");
    log.className = "cds-scroll";
    log.setAttribute("role", "log");
    if (!lines.length) {
      var e = document.createElement("p");
      e.className = "soft";
      e.textContent = "No user or agent messages in this window — only system entries. " +
        "Check the Raw log panel.";
      log.appendChild(e);
    } else {
      lines.forEach(function (l) { log.appendChild(utterance(l)); });
    }
    panel.appendChild(log);
    return panel;
  }

  function utterance(l) {
    var row = document.createElement("div");
    row.className = "cds-utt cds-utt-" + (l.role === "user" ? "user" : "ai");
    var icon = document.createElement("div");
    icon.className = "cds-utt-icon";
    icon.textContent = l.role === "user" ? "You" : "AI";
    var body = document.createElement("div");
    body.className = "cds-utt-body";
    var who = document.createElement("p");
    who.className = "cds-utt-who";
    who.textContent = l.role === "user" ? "User" : "Agent";
    var time = document.createElement("time");
    time.textContent = "· " + T.clock(l.at);
    who.appendChild(time);
    var p = document.createElement("p");
    p.className = "cds-utt-text";
    p.textContent = l.text;                    // textContent, never innerHTML
    body.appendChild(who);
    body.appendChild(p);
    row.appendChild(icon);
    row.appendChild(body);
    return row;
  }

  /* ---------------- the docked panel ---------------- */

  function renderDock() {
    if (!state.dock) return;
    if (state.tab === "raw") renderEntries(); else renderDockTranscript();
  }

  function renderEntries() {
    var q = state.find.toLowerCase();
    var lv = state.levels;
    var rows = state.entries.filter(function (e) {
      if (!afterSince(e.timestamp)) return false;
      // query() asks for a superset of the ticked levels, so the ticks are
      // honoured here. fatal rides with error: there is no box for it and it
      // is the one level nobody wants hidden.
      var lvl = T.levelOf(e) || "info";
      if (lvl === "fatal") lvl = "error";
      if (lv.indexOf(lvl) < 0) return false;
      if (!q) return true;
      return (e.msg + " " + JSON.stringify(e.meta || {})).toLowerCase().indexOf(q) >= 0;
    });
    var host = $("logEntries");
    $("logRawEmpty").hidden = rows.length > 0;
    $("logRawEmpty").textContent = !state.levels.length
      ? "No levels are ticked — tick one under \u201cLog levels and limits\u201d."
      : (state.since ? "Nothing logged since " + sinceClock() + "." : "Nothing in this window.");
    host.innerHTML = "";
    // Oldest last: the tail returns newest-first and that is the right order
    // for a log the SE is watching grow.
    rows.forEach(function (e) { host.appendChild(entryRow(e)); });
  }

  /*
   * The panel's second tab: ONE conversation, in full, beside the raw stream.
   * The same turns as the left-hand row's inline transcript — deliberately, so
   * there is nothing new to learn — but pinned, so the SE can read a
   * conversation while the raw log keeps scrolling in the other tab.
   */
  function renderDockTranscript() {
    var rows = visibleSessions();
    var sel = $("logDockSession");
    // Rebuilt only when the set of conversations actually changes: the tail
    // re-renders every 4s and that would otherwise close an open dropdown.
    var ids = rows.map(function (x) { return x.sessionId; }).join("|");
    if (sel.getAttribute("data-ids") !== ids) {
      sel.setAttribute("data-ids", ids);
      sel.innerHTML = rows.map(function (x) {
        return '<option value="' + esc(x.sessionId) + '">' +
          esc((x.userId || "(no user id)") + " · " + (x.flowName || "unknown flow") +
              " · " + T.clock(x.lastAt)) + "</option>";
      }).join("");
    }
    // Newest conversation unless the SE picked one — during a live test the
    // newest IS the one being tested.
    if (!rows.some(function (x) { return x.sessionId === state.focus; })) {
      state.focus = rows.length ? rows[0].sessionId : "";
    }
    sel.value = state.focus;

    var host = $("logDockTranscript");
    host.innerHTML = "";
    var s = rows.filter(function (x) { return x.sessionId === state.focus; })[0];
    if (!s) {
      var p = document.createElement("p");
      p.className = "soft";
      p.textContent = state.since
        ? "No conversation since " + sinceClock() + " yet."
        : "No conversation yet — pick one above, or run a test.";
      host.appendChild(p);
      return;
    }
    host.appendChild(transcriptPanel(s));
  }

  function focusSession(id) {
    state.focus = id;
    if (state.dock) setTab("conv");
    renderSessions();
  }

  function entryRow(e) {
    var meta = e.meta || {};
    var lvl = T.levelOf(e) || "info";
    var row = document.createElement("div");
    row.className = "log-row log-lvl-" + lvl;

    var t = document.createElement("time");
    t.className = "log-time";
    t.textContent = T.stamp(e.timestamp);

    var l = document.createElement("span");
    l.className = "log-lvl";
    l.textContent = lvl;

    var m = document.createElement("span");
    m.className = "log-msg";
    m.textContent = e.msg || "";

    var x = document.createElement("span");
    x.className = "log-extra soft";
    var bits = [];
    if (meta.text) bits.push('"' + meta.text + '"');
    if (meta.flowName) bits.push(meta.flowName);
    if (meta.userId) bits.push(meta.userId);
    x.textContent = bits.join(" · ");

    row.appendChild(t);
    row.appendChild(l);
    row.appendChild(m);
    row.appendChild(x);
    return row;
  }

  /* ---------------- live tail ---------------- */

  /*
   * A plain re-poll rather than cursor paging: the tail's newest-first page is
   * the whole visible state, sessions are rebuilt from it server-side, and at
   * 4s a re-render is imperceptible. Cursor paging would buy nothing and could
   * drift out of step with the session rollup.
   */
  function startTail() {
    stopTail();
    tailTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;      // don't poll a hidden window
      // The dock is the whole reason this keeps running off the Logs page:
      // the SE is on Remote Control making the agent do something.
      if (!state.dock && (location.hash || "").split("&")[0] !== "#logs") { stopTail(); return; }
      // Skip a tick rather than stack requests on a slow link.
      if (inFlightTail) return;
      inFlightTail = true;
      refresh().then(function () { inFlightTail = false; });
    }, TAIL_MS);
    paintTailDot();
  }
  function stopTail() {
    if (tailTimer) { clearInterval(tailTimer); tailTimer = 0; }
    paintTailDot();
  }
  function paintTailDot() {
    var d = $("logDockDot");
    if (d) d.classList.toggle("on", !!tailTimer);
  }

  /*
   * Called by app.js's route() on every navigation — see stopAudioMeter().
   * Leaving the Logs page stops the poll ONLY when the dock is closed; with
   * it open, navigating away is the normal way to use this feature.
   */
  function pauseTail() { if (!state.dock) stopTail(); }

  /* ---------------- wiring ---------------- */

  function saveProject() {
    api("/api/settings", putJson({ logsProjectId: state.projectId })).catch(function () {});
  }

  function wire() {
    // Two Project pickers — the Logs page's and the dock's — one state.
    ["logProject", "logDockProject"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        pickProject(this.value);
      });
    });

    $("logFind").addEventListener("input", function () {
      state.find = this.value.trim();
      render();
    });

    $("logRefresh").addEventListener("click", function () { refresh(); refreshCounts(); });

    $("logRawToggle").addEventListener("click", function () { openDock(!state.dock); });
    $("logDockClose").addEventListener("click", function () { openDock(false); });
    $("logDockSettings").addEventListener("click", function () { location.hash = "#settings"; });

    // Reset and "show everything" exist on the page AND in the dock: from
    // Remote Control the page is not on screen, and starting a new test is
    // exactly what an SE does from there.
    $("logReset").addEventListener("click", resetForNewTest);
    $("logDockReset").addEventListener("click", resetForNewTest);
    var showAll = function () {
      state.since = 0;
      paintSince();
      render();
    };
    $("logSinceAll").addEventListener("click", showAll);
    $("logDockSinceAll").addEventListener("click", showAll);

    $("logTabRaw").addEventListener("click", function () { setTab("raw"); });
    $("logTabConv").addEventListener("click", function () { setTab("conv"); });
    $("logDockSession").addEventListener("change", function () {
      state.focus = this.value;
      renderDockTranscript();
      renderSessions();
    });

    FIELDS.forEach(function (f) {
      var el = $(f[0]), key = f[1];
      var apply = function () {
        var v = el.value.trim();
        paintClears();
        if (v === state[key]) return;
        state[key] = v;
        state.open = {};
        refresh();
        refreshCounts();
      };
      el.addEventListener("change", apply);
      el.addEventListener("input", paintClears);
      el.addEventListener("keydown", function (ev) { if (ev.key === "Enter") apply(); });
      var clear = document.querySelector('[data-clear="' + f[0] + '"]');
      if (clear) clear.addEventListener("click", function () {
        el.value = "";
        apply();
        el.focus();
      });
    });

    $("logWindowSeg").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-window]");
      if (!b) return;
      state.window = parseInt(b.getAttribute("data-window"), 10) || 1;
      paintWindow();
      refresh();
      refreshCounts();
    });

    $("logLevels").addEventListener("change", function () {
      state.levels = Array.prototype.slice
        .call($("logLevels").querySelectorAll("input[data-level]"))
        .filter(function (i) { return i.checked; })
        .map(function (i) { return i.getAttribute("data-level"); });
      // Ticking warn or debug widens what query() asks Cognigy for, so this
      // needs a new request, not just a re-render of what is already here.
      render();
      refresh();
    });

    $("logGoSettings").addEventListener("click", function () { location.hash = "#settings"; });
    $("logImportMcp").addEventListener("click", function () {
      var b = this;
      b.disabled = true;
      api("/api/cognigy/discover/import", postJson({})).then(function () {
        b.disabled = false;
        return boot();
      }).then(function () { refreshCounts(); startTail(); })
        .catch(function (err) {
          b.disabled = false;
          $("logSetupHint").textContent = String(err.message || err);
        });
    });

    $("logMore").addEventListener("toggle", function () { if (this.open) refreshCounts(); });

    /*
     * #logs&popout=1 in a browser tab: there the dock IS the page — no app
     * chrome to sit beside and nothing to navigate to.
     */
    if (POPOUT) {
      document.body.classList.add("logs-popout", "dock-open");
      $("logDock").hidden = false;
      $("logDockClose").hidden = true;
    }
  }

  /* Which tab the PANEL shows. No re-request: one query() covers both. */
  function setTab(tab) {
    state.tab = tab;
    $("logTabRaw").classList.toggle("on", tab === "raw");
    $("logTabConv").classList.toggle("on", tab === "conv");
    $("logRaw").hidden = tab !== "raw";
    $("logDockConv").hidden = tab !== "conv";
    renderDock();
  }

  /*
   * The dock, opened and closed from anywhere in the app: the Raw logs button
   * on the Logs page, the rail button in the sidebar, or its own ✕.
   *
   * It may be opened having never visited the Logs page, so it boots the
   * module itself rather than assuming show() has run — otherwise the first
   * thing an SE sees when they open it from Remote Control is an empty panel
   * with no Projects in its picker.
   */
  function openDock(on) {
    state.dock = !!on;
    $("logDock").hidden = !state.dock;
    document.body.classList.toggle("dock-open", state.dock);
    paintDockToggles();

    if (!state.dock) {
      // Nothing left watching unless the Logs page itself is on screen.
      if ((location.hash || "").split("&")[0] !== "#logs") stopTail();
      return;
    }

    ensureBooted();
    renderDock();
    if (loaded) {
      refresh();        // opening the dock widens the levels query() asks for
      refreshCounts();
      startTail();
      return;
    }
    boot("").then(function (configured) {
      if (configured === false) return;
      refreshCounts();
      startTail();
    }).catch(function (err) { showSetup(String(err.message || err)); });
  }

  /** Both entry points to the dock show whether it is open. */
  function paintDockToggles() {
    [$("logRawToggle"), document.getElementById("dockBtn")].forEach(function (b) {
      if (!b) return;
      b.classList.toggle("on", state.dock);
      b.setAttribute("aria-pressed", state.dock ? "true" : "false");
    });
  }

  function ensureBooted() {
    if (booted) return;
    booted = true;
    wire();
    paintWindow();
    paintClears();
    paintSince();
  }

  function pickProject(id) {
    state.projectId = id;
    state.open = {};
    state.focus = "";
    $("logProject").value = id;
    $("logDockProject").value = id;
    saveProject();
    loadFlows();
    refresh();
    refreshCounts();
  }

  /*
   * "Start a new test." Clears the filters AND draws a line under everything
   * already on screen, because the 6-hour window is full of the tests the SE
   * ran before this one and the whole point is to watch THIS one arrive.
   * Nothing is deleted — "Show everything again" puts it back.
   */
  function resetForNewTest() {
    state.since = Date.now();
    state.find = ""; state.flowName = ""; state.userId = ""; state.sessionId = "";
    state.open = {}; state.focus = "";
    // Back to Raw log: a new test starts by watching it arrive, and the
    // Conversation tab has nothing to show until it does.
    if (state.dock) setTab("raw");
    $("logFind").value = "";
    FIELDS.forEach(function (f) { $(f[0]).value = ""; });
    paintClears();
    paintSince();
    // Blank the held data too, or the previous test's rows sit there for the
    // four seconds until the next poll answers.
    state.sessions = []; state.entries = [];
    render();
    refresh();
    refreshCounts();
  }

  function paintSince() {
    var on = !!state.since;
    $("logSince").hidden = !on;
    $("logDockSince").hidden = !on;
    if (!on) return;
    $("logSinceText").textContent = "Filters cleared — showing only what has happened since " +
      sinceClock() + ".";
    $("logDockSinceText").textContent = "Since " + sinceClock() + ".";
  }

  /** The ✕ on a filter only exists while there is something to clear. */
  function paintClears() {
    FIELDS.forEach(function (f) {
      var btn = document.querySelector('[data-clear="' + f[0] + '"]');
      if (btn) btn.hidden = !$(f[0]).value.trim();
    });
  }

  /*
   * Datalists for User ID and Session ID, from what is actually on screen.
   * Cognigy matches both EXACTLY and case-sensitively, so typing one from
   * memory is the most reliable way to get an empty page — every value here
   * is one the API has just confirmed exists.
   */
  function paintSuggestions() {
    var users = [], sess = [];
    state.sessions.forEach(function (s) {
      if (s.userId && users.indexOf(s.userId) < 0) users.push(s.userId);
      if (s.sessionId && sess.indexOf(s.sessionId) < 0) sess.push(s.sessionId);
    });
    var opts = function (list) {
      return list.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join("");
    };
    $("logUserOptions").innerHTML = opts(users);
    $("logSessionOptions").innerHTML = opts(sess);
  }

  function paintWindow() {
    Array.prototype.forEach.call($("logWindowSeg").querySelectorAll("[data-window]"), function (b) {
      var on = parseInt(b.getAttribute("data-window"), 10) === state.window;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  /* ---------------- entry point ---------------- */

  window.CDSLogs = {
    show: function (opts) {
      var o = opts || {};
      ensureBooted();
      if (o.project) state.projectId = o.project;
      var ready = boot(o.project || "");
      // A deep link from a demo or gateway row resolves the Project for the SE.
      if (o.demo || o.gw) {
        ready = ready.then(function (configured) {
          if (configured === false) return false;   // gated: nothing to resolve against
          return api("/api/cognigy/resolve?" + (o.demo ? "demo=" + encodeURIComponent(o.demo)
                                                       : "gw=" + encodeURIComponent(o.gw)));
        }).then(function (r) {
          // `false` here is the gate flag from the step above, not a resolve
          // result — pass it through, or the `return true` at the end of this
          // block silently un-gates the page and the tail starts polling an
          // unconfigured service.
          if (r === false) return false;
          if (r && r.projectId) {
            state.projectId = r.projectId;
            $("logProject").value = r.projectId;
            $("logDockProject").value = r.projectId;
            saveProject();
            loadFlows();
            return refresh().then(function () { return true; });
          }
          if (r && r.reason) {
            $("logEmptyHint").textContent = r.reason + " Pick a Project above.";
          }
          return true;
        });
      }
      ready.then(function (configured) {
        if (configured === false) return;
        refreshCounts();
        startTail();
      }).catch(function (err) { showSetup(String(err.message || err)); });
    },
    pauseTail: pauseTail,
    /* The sidebar's rail button — the dock's entry point from every other
       page — and app.js's initial paint of it. */
    toggleDock: function () { openDock(!state.dock); },
    dockOpen: function () { return state.dock; }
  };

  // route() runs before this script is parsed, so a direct load on #logs
  // needs its own kick — same as remote.js.
  if ((location.hash || "").split("&")[0] === "#logs") window.CDSLogs.show(hashOpts());

  function hashOpts() {
    var h = location.hash || "";
    var demo = /[&?]demo=([^&]+)/.exec(h);
    var gw = /[&?]gw=([^&]+)/.exec(h);
    var project = /[&?]project=([^&]+)/.exec(h);
    return {
      demo: demo ? decodeURIComponent(demo[1]) : "",
      gw: gw ? decodeURIComponent(gw[1]) : "",
      project: project ? decodeURIComponent(project[1]) : ""
    };
  }
  window.CDSLogs.hashOpts = hashOpts;
})();
