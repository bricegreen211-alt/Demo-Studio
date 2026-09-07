/*
 * Cognigy Demo Studio — local demo service (http://localhost:41700).
 * One service for every demo (SOW §5): /api/* for the dashboard + extension,
 * /<slug>/ statically serves the demo's build. Bound to 127.0.0.1 only.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const settingsStore = require("./settings");
const builder = require("./builder");
const preflight = require("./preflight");
const importer = require("./importer");
const themes = require("./themes");
const outbound = require("./outbound");
const { demoDir } = require("./paths");
const normalize = require("../../../packages/shared/normalize");
const schema = require("../../../packages/shared/demo-schema");

const PORT = 41700;
const VERSION = require("../../../package.json").version;

function createApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // CORS: the extension (chrome-extension://) and local pages only.
  app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    if (/^chrome-extension:\/\//.test(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const ok = (res, data) => res.json(data);
  const fail = (res, err, code) => res.status(code || 400).json({ error: String((err && err.message) || err) });

  /* ---------------- API ---------------- */

  app.get("/api/health", (req, res) => {
    ok(res, { ok: true, app: "cognigy-demo-studio", version: VERSION });
  });

  app.get("/api/demos", (req, res) => ok(res, { demos: store.list() }));

  app.post("/api/demos", (req, res) => {
    try {
      const demo = store.create(req.body || {});
      builder.buildDemo(demo.id).catch(() => {});
      ok(res, { demo });
    } catch (err) { fail(res, err); }
  });

  app.get("/api/demos/:id", (req, res) => {
    try { ok(res, { demo: store.readDemo(req.params.id), lastBuild: builder.lastResult(req.params.id) }); }
    catch (err) { fail(res, err, 404); }
  });

  app.put("/api/demos/:id", (req, res) => {
    try { ok(res, { demo: store.update(req.params.id, req.body || {}) }); }
    catch (err) { fail(res, err); }
  });

  app.delete("/api/demos/:id", (req, res) => {
    try { store.remove(req.params.id); ok(res, { ok: true }); }
    catch (err) { fail(res, err); }
  });

  app.post("/api/demos/:id/duplicate", (req, res) => {
    try {
      const demo = store.duplicate(req.params.id, (req.body || {}).name);
      ok(res, { demo });
    } catch (err) { fail(res, err); }
  });

  app.post("/api/demos/:id/sync-template", async (req, res) => {
    try {
      const result = store.syncTemplate(req.params.id);
      await builder.buildDemo(req.params.id);
      ok(res, { demo: result.demo, backup: result.backup, lastBuild: builder.lastResult(req.params.id) });
    } catch (err) { fail(res, err); }
  });

  app.post("/api/demos/:id/rebuild", async (req, res) => {
    try {
      await builder.buildDemo(req.params.id);
      const r = builder.lastResult(req.params.id);
      ok(res, { result: r });
    } catch (err) { fail(res, err); }
  });

  app.post("/api/demos/:id/panel", (req, res) => {
    // Per-demo panel size persistence from the extension's drag-to-resize.
    try {
      const body = req.body || {};
      const patch = {};
      if (body.panelWidth) patch.panelWidth = body.panelWidth;
      if (body.panelSide) patch.panelSide = body.panelSide;
      ok(res, { demo: store.update(req.params.id, patch) });
    } catch (err) { fail(res, err); }
  });

  app.post("/api/demos/:id/preflight", async (req, res) => {
    try { ok(res, await preflight.run(store, req.params.id)); }
    catch (err) { fail(res, err); }
  });

  // Which demo belongs on this hostname? Manual override wins; else domain mapping.
  app.get("/api/resolve", (req, res) => {
    const host = String(req.query.host || "");
    const s = settingsStore.read();
    const demos = store.list();
    let demo = null, via = "none";
    if (s.overrideDemoId) {
      demo = demos.find((d) => d.id === s.overrideDemoId) || null;
      if (demo) via = "override";
    }
    if (!demo) {
      demo = demos.find((d) => normalize.matchesDomain(d.website, host)) || null;
      if (demo) via = "mapping";
    }
    ok(res, {
      demo: demo && {
        id: demo.id, name: demo.name, template: demo.template,
        panelSide: demo.panelSide, panelWidth: demo.panelWidth, panelStyle: demo.panelStyle,
        // The extension needs this to decide whether to draw its own launcher
        // and panel at all, or just hand Cognigy's widget a bare frame. The
        // value names the MOUNT MODE, not the channel: click-to-call demos
        // send "webchat3" too, because both widgets float on the page and
        // speak the same CDS_WC3_CLIP protocol. See usesCognigyWidget().
        chatUi: schema.usesCognigyWidget(demo) ? "webchat3" : "studio",
        launcher: demo.launcher, launcherText: demo.launcherText,
        showLauncherText: demo.showLauncherText, launcherSize: demo.launcherSize,
        agentName: demo.agentName, theme: demo.theme,
        // The extension reads this as "is there anything to show" and refuses
        // to mount the launcher when it's false. A demo served by one of
        // Cognigy's own widgets — Webchat v3 or click-to-call — gets the
        // Studio's host page and has no build of its own, so its dist/ being
        // absent is normal rather than a reason to stay hidden.
        built: demo.built || schema.usesCognigyWidget(demo),
        debug: settingsStore.read().showDiagnostics !== false
      },
      via
    });
  });

  app.get("/api/settings", (req, res) => ok(res, settingsStore.read()));
  app.put("/api/settings", (req, res) => {
    const body = req.body || {};
    const patch = {};
    if ("overrideDemoId" in body) patch.overrideDemoId = body.overrideDemoId || null;
    if ("showDiagnostics" in body) patch.showDiagnostics = body.showDiagnostics !== false;
    // Appearance. Whitelisted like everything else — an unknown key sent to
    // this route is dropped silently, so a new setting that skips this block
    // appears to save and then vanishes on restart.
    if ("theme" in body) {
      patch.theme = ["light", "dark", "system"].indexOf(body.theme) >= 0 ? body.theme : "system";
    }
    if ("sidebarCollapsed" in body) patch.sidebarCollapsed = body.sidebarCollapsed === true;
    if ("followMeUserId" in body) {
      patch.followMeUserId = String(body.followMeUserId || "").trim().slice(0, 120) || "followme";
    }
    if (Array.isArray(body.gateways)) {
      patch.gateways = body.gateways
        .filter((g) => g && typeof g === "object")
        .map((g) => ({
          id: String(g.id || "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
          name: String(g.name || "Gateway").slice(0, 80),
          endpointUrl: String(g.endpointUrl || "").slice(0, 500),
          folder: String(g.folder || "").slice(0, 80)
        }));
    }
    if (Array.isArray(body.gatewayFolders)) {
      patch.gatewayFolders = body.gatewayFolders.map((f) => String(f || "").slice(0, 80)).filter(Boolean);
    }
    if ("activeGateway" in body) patch.activeGateway = Math.max(0, parseInt(body.activeGateway, 10) || 0);
    if (Array.isArray(body.folders)) {
      patch.folders = body.folders.map((f) => String(f || "").slice(0, 80)).filter(Boolean);
    }
    if ("preferredMicId" in body) patch.preferredMicId = String(body.preferredMicId || "");
    if ("preferredSpeakerId" in body) patch.preferredSpeakerId = String(body.preferredSpeakerId || "");
    if (body.outbound && typeof body.outbound === "object") {
      patch.outbound = {
        endpointUrl: String(body.outbound.endpointUrl || "").slice(0, 500),
        endpointKey: String(body.outbound.endpointKey || "").slice(0, 300)
      };
    }
    ok(res, settingsStore.write(patch));
  });

  /* ------------- folders -------------
   *
   * A folder is only a name: it lives in settings.folders and is referenced by
   * demo.folder. So renaming one means rewriting BOTH, and doing it here rather
   * than as N calls from the dashboard keeps the two from drifting apart if
   * something fails halfway.
   */

  function renameFolder(from, to) {
    const s = settingsStore.read();
    const folders = (s.folders || []).map((f) => (f === from ? to : f));
    // Renaming onto an existing name merges the two, which is what dragging one
    // folder's name onto another's would mean anyway. De-duplicate.
    settingsStore.write({ folders: folders.filter((f, i) => folders.indexOf(f) === i) });
    let moved = 0;
    for (const d of store.list()) {
      if (d.folder === from) { store.update(d.id, { folder: to }); moved++; }
    }
    return moved;
  }

  app.post("/api/folders/rename", (req, res) => {
    const from = String((req.body || {}).from || "").trim();
    const to = String((req.body || {}).to || "").trim().slice(0, 80);
    if (!from || !to) return fail(res, new Error("Both the old and new folder names are required."));
    if (from === to) return ok(res, { moved: 0 });
    try { ok(res, { moved: renameFolder(from, to) }); }
    catch (err) { fail(res, err); }
  });

  app.post("/api/folders/delete", (req, res) => {
    const name = String((req.body || {}).name || "").trim();
    if (!name) return fail(res, new Error("Folder name is required."));
    try {
      const s = settingsStore.read();
      settingsStore.write({ folders: (s.folders || []).filter((f) => f !== name) });
      /*
       * Demos move to the root rather than being deleted. A folder is a label,
       * so removing the label must never remove the work — and there is no undo
       * for a deleted demo folder on disk.
       */
      let moved = 0;
      for (const d of store.list()) {
        if (d.folder === name) { store.update(d.id, { folder: "" }); moved++; }
      }
      ok(res, { moved });
    } catch (err) { fail(res, err); }
  });

  // Explicit order, so the dashboard can drag folders into the order an SE
  // wants rather than being stuck with alphabetical.
  app.post("/api/folders/reorder", (req, res) => {
    const order = Array.isArray((req.body || {}).folders) ? req.body.folders : null;
    if (!order) return fail(res, new Error("folders must be an array."));
    try {
      const clean = order.map((f) => String(f || "").slice(0, 80)).filter(Boolean);
      ok(res, { folders: settingsStore.write({ folders: clean.filter((f, i) => clean.indexOf(f) === i) }).folders });
    } catch (err) { fail(res, err); }
  });

  /* ------------- Outbound Trigger (Remote Control) ------------- */

  app.get("/api/contacts", (req, res) => ok(res, { contacts: outbound.list() }));
  app.post("/api/contacts", (req, res) => {
    try { ok(res, { contact: outbound.create(req.body || {}) }); } catch (err) { fail(res, err); }
  });
  app.put("/api/contacts/:id", (req, res) => {
    try { ok(res, { contact: outbound.update(req.params.id, req.body || {}) }); } catch (err) { fail(res, err); }
  });
  app.delete("/api/contacts/:id", (req, res) => {
    try { outbound.remove(req.params.id); ok(res, { ok: true }); } catch (err) { fail(res, err); }
  });
  app.post("/api/contacts/:id/trigger", async (req, res) => {
    try {
      ok(res, await outbound.trigger(settingsStore.read(), req.params.id, (req.body || {}).channel || "voice"));
    } catch (err) { fail(res, err); }
  });

  app.post("/api/extension/heartbeat", (req, res) => {
    settingsStore.write({ extensionLastSeen: Date.now() });
    ok(res, { ok: true });
  });

  app.post("/api/import", (req, res) => {
    try { ok(res, { results: importer.importDemos(store, builder.buildDemo, req.body) }); }
    catch (err) { fail(res, err); }
  });

  app.get("/api/export", (req, res) => {
    try {
      const data = importer.exportAll(store, settingsStore.read());
      res.set("Content-Type", "application/json; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="cognigy-demo-studio-export.json"');
      res.send(JSON.stringify(data, null, 2));
    } catch (err) { fail(res, err); }
  });

  // About: version + when the app's code was last updated, for the Settings page.
  app.get("/api/about", (req, res) => {
    const { REPO_ROOT, DATA_ROOT, EXTENSION_ROOT } = require("./paths");
    let updatedAt = "";
    let commit = "";
    try {
      // execFileSync, not execSync: through cmd.exe on Windows the %cI|%h
      // format string would be mangled by %VAR% expansion and the | pipe.
      const { execFileSync } = require("child_process");
      const out = execFileSync("git", ["log", "-1", "--format=%cI|%h"],
        { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      const parts = out.split("|");
      updatedAt = parts[0] || "";
      commit = parts[1] || "";
    } catch (e) {
      // Not a git checkout (e.g. downloaded as a ZIP) — fall back to file dates.
      try { updatedAt = fs.statSync(path.join(REPO_ROOT, "package.json")).mtime.toISOString(); } catch (e2) {}
    }
    const lastSeen = settingsStore.read().extensionLastSeen || 0;
    ok(res, {
      name: "Cognigy Demo Studio",
      version: VERSION,
      updatedAt,
      commit,
      repoRoot: REPO_ROOT,
      dataDir: DATA_ROOT,
      extensionDir: EXTENSION_ROOT,
      demoCount: store.list().length,
      extensionConnected: Date.now() - lastSeen < 90 * 1000,
      extensionLastSeen: lastSeen
    });
  });

  /* ------------- dashboard ------------- */

  // The Studio dashboard is a static web app served at "/" — the Electron
  // window loads this same URL, and the extension popup can open it in a tab.
  //
  // no-store, not just "no Cache-Control": with no header, no ETag and no
  // Last-Modified, browsers fall back to heuristic freshness and happily serve
  // a stale style.css or app.js — so an SE updates the app and still sees the
  // old dashboard. Same treatment the demo routes already give their assets.
  const noStore = (res) => res.set("Cache-Control", "no-store");
  app.use(express.static(path.join(__dirname, "..", "renderer"),
    { cacheControl: false, etag: false, lastModified: false, setHeaders: noStore }));
  // Shared browser modules (endpoint normalization) for the dashboard.
  app.use("/shared", express.static(require("./paths").SHARED_ROOT,
    { cacheControl: false, etag: false, lastModified: false, setHeaders: noStore }));

  // The Webchat v3 bundle, straight from the pinned npm package. Unlike the
  // small Studio assets below, this keeps sendFile's ETag/304 defaults instead
  // of no-store — it's ~3 MB and the version is pinned exactly, so re-opening a
  // panel should be a 304 rather than a re-download.
  app.get("/_cds/webchat.js", (req, res) => {
    const file = path.join(require("./paths").REPO_ROOT,
      "node_modules", "@cognigy", "webchat", "dist", "webchat.js");
    if (!fs.existsSync(file)) {
      return res.status(503).type("application/javascript")
        .send("/* @cognigy/webchat is not installed - run npm install in the Demo Studio folder */");
    }
    res.type("application/javascript");
    res.sendFile(file);
  });

  /*
   * The click-to-call widget bundle. Vendored (the dashboard loads the same
   * file from renderer/vendor/) rather than pulled from Cognigy's CDN, so a
   * demo on customer wifi never depends on an outbound request mid-demo — the
   * same argument that self-hosts the typeface. ~500 KB and version-pinned, so
   * like webchat.js it keeps sendFile's ETag/304 defaults instead of no-store.
   */
  app.get("/_cds/webrtc-widget.js", (req, res) => {
    const file = path.join(__dirname, "..", "renderer", "vendor", "webRTCWidget.js");
    if (!fs.existsSync(file)) {
      return res.status(503).type("application/javascript")
        .send("/* the click-to-call widget bundle is missing from apps/studio/renderer/vendor */");
    }
    res.type("application/javascript");
    res.sendFile(file);
  });

  // Studio-owned assets injected into (or serving as) demo pages. Whitelisted
  // by name so this route can never be walked out of the service folder.
  // Registered AFTER the webchat.js route above: this ":file" pattern also
  // matches "webchat.js", and Express takes the first route that matches.
  const CDS_ASSETS = {
    "clear-mode.css": "text/css; charset=utf-8",
    "webchat3.css": "text/css; charset=utf-8",
    "webchat3.js": "application/javascript; charset=utf-8",
    "webrtc.css": "text/css; charset=utf-8",
    "webrtc.js": "application/javascript; charset=utf-8"
  };
  app.get("/_cds/:file", (req, res) => {
    const type = CDS_ASSETS[req.params.file];
    if (!type) return res.sendStatus(404);
    res.set("Content-Type", type);
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, req.params.file));
  });

  /*
   * Serve the Studio-owned Webchat v3 host page in place of a demo's own
   * build. Config is inlined as JSON so the page needs no extra round-trip,
   * and the endpoint is normalized here, on the trusted side, with the same
   * helper the templates use.
   */
  function sendWebchat3Host(res, cfg) {
    const data = {
      name: cfg.name || "",
      endpoint: normalize.chatEndpoint((cfg.cognigy || {}).chatEndpoint),
      // Global, not per demo: Live Follow tracks one user ID, and the same
      // value has to reach webchat, WebRTC and Remote Control alike.
      userId: settingsStore.read().followMeUserId || "followme",
      panelStyle: cfg.panelStyle || "solid",
      panelSide: cfg.panelSide === "left" ? "left" : "right",
      panelWidth: cfg.panelWidth || 0,
      debug: settingsStore.read().showDiagnostics !== false
    };
    // Escaping "<" makes a </script> breakout impossible.
    const blob = '<script type="application/json" id="cds-config">' +
      JSON.stringify(data).replace(/</g, "\\u003c") + "</script>";
    const html = fs.readFileSync(path.join(__dirname, "webchat3.html"), "utf8");
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html.replace("<!--CDS_CONFIG-->", blob));
  }

  /*
   * Serve the Studio-owned click-to-call host page in place of a demo's own
   * build — the exact counterpart of sendWebchat3Host, and the same reasoning
   * throughout: config inlined so the page needs no extra round-trip, and the
   * endpoint normalized here on the trusted side with the helper the templates
   * use, so a pasted static widget link works as well as an endpoint URL.
   */
  function sendVoiceWidgetHost(res, cfg) {
    const data = {
      name: cfg.name || "",
      endpoint: normalize.voiceEndpoint((cfg.cognigy || {}).voiceEndpoint),
      // Global, not per demo: Live Follow tracks one user ID, and the same
      // value has to reach webchat, WebRTC and Remote Control alike.
      userId: settingsStore.read().followMeUserId || "followme",
      panelStyle: cfg.panelStyle || "solid",
      panelSide: cfg.panelSide === "left" ? "left" : "right",
      panelWidth: cfg.panelWidth || 0,
      // Reported on the debug badge only. The theme itself reaches the widget
      // as injected CSS below, never as an option handed to the widget.
      theme: (cfg.theme && cfg.theme.preset) || "cognigy-default",
      debug: settingsStore.read().showDiagnostics !== false
    };
    // Escaping "<" makes a </script> breakout impossible.
    const blob = '<script type="application/json" id="cds-config">' +
      JSON.stringify(data).replace(/</g, "\\u003c") + "</script>";
    let html = fs.readFileSync(path.join(__dirname, "webrtc.html"), "utf8");
    html = html.replace("<!--CDS_CONFIG-->", blob);
    /*
     * Unlike the Webchat host page, this one carries the theme: a WebRTC theme
     * is exactly the 12 documented --webrtc-* variables plus layout CSS scoped
     * to the widget's own classes, and there is nowhere else for it to go.
     * Empty string for Cognigy Default, which contributes nothing by design.
     */
    const themeStyle = themes.styleFor(cfg);
    if (themeStyle) html = html.replace("</head>", themeStyle + "</head>");
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }

  // Studio-owned stylesheets injected into a demo's page, keyed by panelStyle.
  // Every file named here must also be in CDS_ASSETS above to be servable.
  /*
   * Empty since "clear" was retired. That style existed to render Demo
   * Studio's own chat and then unpaint its surfaces so the customer's site
   * showed through; overlay does the honest version, so there is nothing left
   * for clear-mode.css to attach to. The file and its CDS_ASSETS entry stay —
   * a vibe-coded demo may still link it deliberately — but nothing is injected
   * automatically any more.
   */
  const PANEL_STYLE_SHEETS = {};

  /* ------------- demo experiences ------------- */

  // Serve /<slug>/... from the demo's dist.
  app.use("/:slug", (req, res, next) => {
    const slug = req.params.slug;
    if (slug === "api" || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return next();
    let dir;
    try { dir = demoDir(slug); } catch (e) { return next(); }
    if (!fs.existsSync(path.join(dir, "demo.json"))) return next();

    const root = path.join(dir, "dist");

    if (req.path === "/demo.json" || req.path === "demo.json") {
      const cfg = path.join(dir, "demo.json");
      res.set("Cache-Control", "no-store");
      return res.sendFile(cfg);
    }
    // Read through the store rather than parsing demo.json raw: sanitize() is
    // what the extension sees via /api/resolve, and the two deciding different
    // things about the same demo is a bug that only shows up on one surface.
    const isIndex = req.path === "/" || req.path === "/index.html";
    let demoCfg = null;
    if (isIndex) {
      try { demoCfg = store.readDemo(slug); } catch (e) {}
    }

    // Webchat v3 demos are served by the Studio's own host page, so their
    // dist/ is irrelevant — this has to come before the "no build yet" check
    // or a demo that never needed a build would be reported as broken.
    if (isIndex && schema.usesWebchat3(demoCfg)) return sendWebchat3Host(res, demoCfg);
    // Same for WebRTC: Cognigy's own click-to-call widget, not our voice UI.
    if (isIndex && schema.usesVoiceWidget(demoCfg)) return sendVoiceWidgetHost(res, demoCfg);

    if (!fs.existsSync(path.join(root, "index.html"))) {
      return res.status(503).send("<h3 style='font-family:sans-serif'>Demo \"" + slug + "\" has no build yet.</h3><p style='font-family:sans-serif'>Save a source file or click Rebuild in Cognigy Demo Studio.</p>");
    }

    // "Clear" panels need the built-in chat's own surfaces to stop painting so
    // the customer's website shows through. Injected here rather than built
    // into the templates so it reaches existing demos too, since a demo folder
    // holds its own copy of the template source (see clear-mode.css). Webchat
    // v3 demos never reach this — they return above with their own host page.
    if (isIndex) {
      const panelStyle = (demoCfg && demoCfg.panelStyle) || "solid";
      const sheets = PANEL_STYLE_SHEETS[panelStyle] || [];
      /*
       * The theme has to be composed per demo — it carries theme.custom from
       * demo.json — so it cannot be a static file in CDS_ASSETS. Inlining it
       * also saves a round-trip, the same reasoning as sendWebchat3Host's
       * config blob. Empty string for Cognigy Default, which contributes
       * nothing by design.
       */
      const themeStyle = themes.styleFor(demoCfg);
      if (themeStyle || sheets.length) {
        let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
        /*
         * Order is load-bearing. The theme goes first so the demo's own
         * stylesheet is overridden on equal specificity; clear-mode.css goes
         * LAST because it is entirely !important and must win over both.
         */
        const tags = themeStyle +
          sheets.map((f) => '<link rel="stylesheet" href="/_cds/' + f + '">').join("");
        html = html.includes("</head>") ? html.replace("</head>", tags + "</head>") : html + tags;
        res.set("Cache-Control", "no-store");
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      }
    }

    express.static(root, { cacheControl: false, etag: false, lastModified: false, setHeaders: (r) => r.set("Cache-Control", "no-store") })(req, res, next);
  });

  return app;
}

/*
 * Follow Me used to be per demo (demo.json userId). It is global now, so a
 * machine upgrading from the old layout would silently lose a customised
 * value. Adopt it once, only when the global setting is still untouched and
 * exactly one non-default value exists — anything ambiguous is left alone and
 * logged rather than guessed at.
 */
function migrateFollowMe() {
  try {
    const current = settingsStore.read();
    if ((current.followMeUserId || "followme") !== "followme") return;
    const custom = [...new Set(
      store.list()
        .map((d) => String(d.userId || "").trim())
        .filter((v) => v && v !== "followme")
    )];
    if (custom.length === 1) {
      settingsStore.write({ followMeUserId: custom[0] });
      console.log('[service] Follow Me is now a single global setting; adopted "' + custom[0] + '" from your demos.');
    } else if (custom.length > 1) {
      console.log("[service] Follow Me is now a single global setting, but your demos used " +
        custom.length + " different values (" + custom.join(", ") + "). Left as \"followme\" — " +
        "set the one you want in Settings.");
    }
  } catch (e) {
    console.error("[service] Follow Me migration skipped:", e.message);
  }
}

/*
 * Chat UI stopped being a choice and became a consequence of endpoint + theme.
 * A Webchat demo that had it pinned to "studio" under the old form now renders
 * Cognigy's real widget, because a Webchat endpoint no longer has a built-in
 * chat option — every Webchat theme styles the real widget instead of replacing
 * it. That is intended, but it changes an existing demo, so say so once rather
 * than let the SE discover it mid-demo.
 */
function reportChatUiChanges() {
  try {
    const moved = store.list()
      // Panel style no longer decides this — the theme does — so it is not a
      // filter here either.
      .filter((d) => d.template === "webchat" &&
                     String((d.cognigy || {}).chatEndpoint || "").trim().toLowerCase() !== "mock")
      .filter((d) => d.chatUi === "webchat3")
      .map((d) => d.name);
    if (!moved.length) return;
    console.log("[service] Chat UI is now derived from the endpoint and theme. These demos use " +
      "Cognigy's Webchat v3 widget: " + moved.join(", ") + ". Pick a theme in the demo form to " +
      "restyle it, or switch the endpoint to Webchat + WebRTC for the built-in chat.");
  } catch (e) {
    console.error("[service] chat UI report skipped:", e.message);
  }
}

function start() {
  const { ensureDirs } = require("./paths");
  ensureDirs();
  migrateFollowMe();
  reportChatUiChanges();
  const app = createApp();
  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log("[service] Cognigy Demo Studio service on http://localhost:" + PORT);
  });
  // Don't crash the app if another Studio/dev service already owns the port —
  // the dashboard simply talks to that one.
  server.on("error", (err) => {
    console.error("[service] not started:", err.code || err.message);
  });
  const watcher = builder.startWatcher();
  return { server, watcher, port: PORT };
}

module.exports = { createApp, start, PORT };
