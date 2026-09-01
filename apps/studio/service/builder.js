/*
 * Cognigy Demo Studio — invisible build pipeline.
 * Demo folders contain only source; Vite + React + the Cognigy SDKs live once
 * in the Studio's own node_modules ("shared toolchain"). We invoke Vite
 * programmatically with the demo folder as root and alias every bare import to
 * the Studio's copies, so demos never need npm install.
 *
 * A single chokidar watcher covers every demo's source: save a file (from any
 * AI coding tool / editor) and the demo rebuilds automatically — the SOW's
 * vibe-coding loop with no terminal.
 */
const path = require("path");
const fs = require("fs");
const { DEMOS_ROOT, REPO_ROOT, SHARED_ROOT, demoDir } = require("./paths");

const NM = path.join(REPO_ROOT, "node_modules");

// Alias replacements are substituted into import specifiers, so they must use
// forward slashes even on Windows — a raw path.join() result there would carry
// backslashes into the module id and fail to resolve.
const p = (...parts) => path.join(...parts).replace(/\\/g, "/");

// Prefix aliases: "react/jsx-runtime" -> <NM>/react/jsx-runtime, etc.
const ALIASES = [
  { find: /^react-dom/, replacement: p(NM, "react-dom") },
  { find: /^react/, replacement: p(NM, "react") },
  { find: /^@cognigy\/socket-client/, replacement: p(NM, "@cognigy", "socket-client") },
  { find: /^@cognigy\/click-to-call-sdk/, replacement: p(NM, "@cognigy", "click-to-call-sdk") },
  { find: /^@cds\/shared/, replacement: p(SHARED_ROOT) },
  // Both Cognigy SDKs import Node's "events"; alias to the browser shim.
  { find: /^events$/, replacement: p(NM, "events") }
];

const state = {
  building: new Map(),   // slug -> Promise
  queued: new Set(),
  lastResult: new Map(), // slug -> { ok, error, at }
  listeners: new Set()
};

function onBuild(fn) { state.listeners.add(fn); }
function emit(slug, result) {
  state.lastResult.set(slug, result);
  for (const fn of state.listeners) { try { fn(slug, result); } catch (e) {} }
}

async function buildDemo(slug) {
  if (state.building.has(slug)) { state.queued.add(slug); return state.building.get(slug); }
  const job = (async () => {
    const { build } = await import("vite");
    // realpath: a symlinked data dir (e.g. /tmp on macOS) breaks Vite's
    // root-relative html emission otherwise.
    const root = fs.realpathSync(demoDir(slug));
    try {
      await build({
        root,
        base: "./",
        logLevel: "error",
        configFile: false,
        envFile: false,
        cacheDir: path.join(root, ".vite-cache"),
        resolve: { alias: ALIASES, dedupe: ["react", "react-dom"] },
        esbuild: { jsx: "automatic" },
        build: {
          outDir: "dist",
          emptyOutDir: true,
          sourcemap: false,
          // The shared UMD modules live outside node_modules; include them in CJS interop.
          commonjsOptions: { include: [/node_modules/, /packages[\/\\]shared/] }
        }
      });
      emit(slug, { ok: true, error: null, at: new Date().toISOString() });
      console.log("[builder] built", slug);
    } catch (err) {
      emit(slug, { ok: false, error: String(err && err.message || err), at: new Date().toISOString() });
      console.error("[builder] FAILED", slug, err && err.message);
    }
  })();
  state.building.set(slug, job);
  await job;
  state.building.delete(slug);
  if (state.queued.delete(slug)) return buildDemo(slug); // a save landed mid-build
}

function lastResult(slug) {
  return state.lastResult.get(slug) || null;
}

// Watch every demo's source for the vibe-coding loop. demo.json and dist/ are
// excluded — config is read at runtime and builds shouldn't retrigger builds.
function startWatcher() {
  const chokidar = require("chokidar");
  const timers = new Map();
  const watcher = chokidar.watch(DEMOS_ROOT, {
    ignored: (p) => /(^|[\/\\])(dist|locked|node_modules|\.vite-cache|\.git)([\/\\]|$)/.test(p) || /demo\.json$/.test(p),
    ignoreInitial: true,
    depth: 8
  });
  watcher.on("all", (ev, file) => {
    const rel = path.relative(DEMOS_ROOT, file);
    const slug = rel.split(path.sep)[0];
    if (!slug || slug.startsWith(".")) return;
    if (!fs.existsSync(path.join(DEMOS_ROOT, slug, "demo.json"))) return;
    clearTimeout(timers.get(slug));
    timers.set(slug, setTimeout(() => buildDemo(slug).catch(() => {}), 350));
  });
  return watcher;
}

module.exports = { buildDemo, startWatcher, lastResult, onBuild };
