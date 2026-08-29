/*
 * Cognigy Demo Studio — local demo service (http://localhost:41700).
 * One service for every demo (SOW §5): /api/* for the dashboard + extension,
 * /<slug>/ statically serves the demo's build (the locked snapshot when
 * Presentation Mode is on). Bound to 127.0.0.1 only.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const settingsStore = require("./settings");
const builder = require("./builder");
const preflight = require("./preflight");
const importer = require("./importer");
const outbound = require("./outbound");
const { demoDir } = require("./paths");
const normalize = require("../../../packages/shared/normalize");

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
    const s = settingsStore.read();
    ok(res, { ok: true, app: "cognigy-demo-studio", version: VERSION, presentationMode: !!s.presentationMode });
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

  app.post("/api/demos/:id/lock", (req, res) => {
    try { ok(res, { demo: store.lock(req.params.id) }); }
    catch (err) { fail(res, err); }
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
        panelSide: demo.panelSide, panelWidth: demo.panelWidth,
        launcher: demo.launcher, launcherText: demo.launcherText,
        showLauncherText: demo.showLauncherText, launcherSize: demo.launcherSize,
        agentName: demo.agentName, theme: demo.theme, built: demo.built
      },
      via,
      presentationMode: !!s.presentationMode
    });
  });

  app.get("/api/settings", (req, res) => ok(res, settingsStore.read()));
  app.put("/api/settings", (req, res) => {
    const body = req.body || {};
    const patch = {};
    if ("presentationMode" in body) patch.presentationMode = !!body.presentationMode;
    if ("overrideDemoId" in body) patch.overrideDemoId = body.overrideDemoId || null;
    if (Array.isArray(body.gateways)) {
      patch.gateways = body.gateways
        .filter((g) => g && typeof g === "object")
        .map((g) => ({ name: String(g.name || "Gateway").slice(0, 80), endpointUrl: String(g.endpointUrl || "").slice(0, 500) }));
    }
    if ("activeGateway" in body) patch.activeGateway = Math.max(0, parseInt(body.activeGateway, 10) || 0);
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

  /* ------------- dashboard ------------- */

  // The Studio dashboard is a static web app served at "/" — the Electron
  // window loads this same URL, and the extension popup can open it in a tab.
  app.use(express.static(path.join(__dirname, "..", "renderer"), { cacheControl: false, etag: false }));
  // Shared browser modules (endpoint normalization) for the dashboard.
  app.use("/shared", express.static(require("./paths").SHARED_ROOT, { cacheControl: false, etag: false }));

  /* ------------- demo experiences ------------- */

  // Serve /<slug>/... from the demo's dist (locked/dist in Presentation Mode).
  // demo.json is served from the matching config so the locked snapshot's
  // config travels with its build.
  app.use("/:slug", (req, res, next) => {
    const slug = req.params.slug;
    if (slug === "api" || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return next();
    let dir;
    try { dir = demoDir(slug); } catch (e) { return next(); }
    if (!fs.existsSync(path.join(dir, "demo.json"))) return next();

    const presentation = !!settingsStore.read().presentationMode;
    const useLocked = presentation && fs.existsSync(path.join(dir, "locked", "dist", "index.html"));
    const root = useLocked ? path.join(dir, "locked", "dist") : path.join(dir, "dist");

    if (req.path === "/demo.json" || req.path === "demo.json") {
      const cfg = useLocked ? path.join(dir, "locked", "demo.json") : path.join(dir, "demo.json");
      res.set("Cache-Control", "no-store");
      return res.sendFile(cfg);
    }
    if (!fs.existsSync(path.join(root, "index.html"))) {
      return res.status(503).send("<h3 style='font-family:sans-serif'>Demo \"" + slug + "\" has no build yet.</h3><p style='font-family:sans-serif'>Save a source file or click Rebuild in Cognigy Demo Studio.</p>");
    }
    express.static(root, { cacheControl: false, etag: false, lastModified: false, setHeaders: (r) => r.set("Cache-Control", "no-store") })(req, res, next);
  });

  return app;
}

function start() {
  const { ensureDirs } = require("./paths");
  ensureDirs();
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
