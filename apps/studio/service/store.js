/*
 * Cognigy Demo Studio — demo store (filesystem CRUD).
 * A demo is a folder under ~/CognigyDemoStudio/demos/<slug>/ created by copying
 * a template's source. demo.json is the single source of truth for config; the
 * demo experience fetches it at runtime, so form edits need no rebuild.
 */
const fs = require("fs");
const path = require("path");
const { DEMOS_ROOT, TEMPLATES_ROOT, ensureDirs, demoDir } = require("./paths");
const schema = require("../../../packages/shared/demo-schema");
const themes = require("./themes");

/*
 * sanitize() falls back silently when a theme preset isn't registered for the
 * demo's endpoint — it has to, being pure and running on every read and every
 * write. Silent is the wrong answer for a theme, though: the SE dropped a file
 * in, picked it, saved, and got something else back with nothing to read. So
 * every place the store hands a config to sanitize also compares what went in
 * with what came out, and themes.warnDropped explains the difference once.
 */
function checkTheme(input, out, slug) {
  const asked = input && input.theme && input.theme.preset;
  if (asked && out.theme.preset !== asked) {
    themes.warnDropped(asked, out.template, out.theme.preset, slug || out.id || "(new)");
  }
  return out;
}

function slugify(name) {
  const base = String(name || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "demo";
  let slug = base, n = 2;
  while (fs.existsSync(path.join(DEMOS_ROOT, slug))) slug = base + "-" + n++;
  return slug;
}

function readDemo(slug) {
  const file = path.join(demoDir(slug), "demo.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  // On the read path too, deliberately: the rewrite happens on the next save of
  // any kind — including the drag-resize handler — so the warning has to be
  // available before that, not only once the value is already gone.
  const demo = checkTheme(raw, schema.sanitize(raw), slug);
  demo.id = slug;
  demo.built = fs.existsSync(path.join(demoDir(slug), "dist", "index.html"));
  demo.path = demoDir(slug); // shown in the dashboard's vibe-coding row
  return demo;
}

function list() {
  ensureDirs();
  return fs.readdirSync(DEMOS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(DEMOS_ROOT, e.name, "demo.json")))
    .map((e) => {
      try { return readDemo(e.name); } catch (err) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function writeDemoJson(slug, demo) {
  fs.writeFileSync(path.join(demoDir(slug), "demo.json"), JSON.stringify(demo, null, 2));
}

// Copy template source (everything except dist/node_modules) into the demo folder.
function copyTemplateSrc(templateName, destDir) {
  const srcDir = path.join(TEMPLATES_ROOT, templateName);
  if (!fs.existsSync(path.join(srcDir, "index.html"))) {
    throw new Error("Template not found or missing index.html: " + templateName);
  }
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(srcDir, src);
      return !/^((dist|node_modules)(\/|$)|demo\.json$)/.test(rel);
    }
  });
}

function create(input) {
  ensureDirs();
  const demo = checkTheme(input, schema.sanitize(input));
  if (!demo.name) throw new Error("Name is required");
  const slug = slugify(demo.name);
  const dir = path.join(DEMOS_ROOT, slug);
  copyTemplateSrc(demo.template, dir);
  demo.id = slug;
  demo.createdAt = demo.updatedAt = new Date().toISOString();
  writeDemoJson(slug, demo);
  return readDemo(slug);
}

function update(slug, input) {
  const current = readDemo(slug);
  const merged = Object.assign({}, current, input, {
    id: slug,
    createdAt: current.createdAt
  });
  const demo = checkTheme(merged, schema.sanitize(merged), slug);

  /*
   * A demo folder holds its own copy of one template's source, so changing the
   * template means the folder now holds the wrong code. Swap it, backing up
   * whatever was there exactly as Sync does.
   *
   * This used to be pinned to the current template with a note that in-place
   * changes "are not supported" — but the form's Template radios were never
   * disabled, so picking a different one looked like it worked, saved, and was
   * silently discarded. Either the radios had to be disabled or this had to
   * work; doing the copy is the useful half.
   *
   * The chokidar watcher sees the new source and rebuilds within ~350ms, so
   * there is nothing to trigger here.
   */
  if (demo.template !== current.template) {
    replaceSrc(demoDir(slug), demo.template);
  }

  demo.updatedAt = new Date().toISOString();
  writeDemoJson(slug, demo);
  return readDemo(slug);
}

function duplicate(slug, newName) {
  const src = readDemo(slug);
  const name = newName || src.name + " Copy";
  const newSlug = slugify(name);
  const dir = path.join(DEMOS_ROOT, newSlug);
  fs.cpSync(demoDir(slug), dir, { recursive: true });
  const dup = Object.assign({}, src, { id: newSlug, name });
  const demo = checkTheme(dup, schema.sanitize(dup), newSlug);
  demo.createdAt = demo.updatedAt = new Date().toISOString();
  writeDemoJson(newSlug, demo);
  return readDemo(newSlug);
}

function remove(slug) {
  fs.rmSync(demoDir(slug), { recursive: true, force: true });
}

/*
 * Refresh a demo's source from its template.
 *
 * A demo folder holds its own copy of the template source, so demos created
 * before a template change never get it (that's how the overlay shell can be
 * missing from an older demo). This re-copies the current template over the
 * demo, keeping demo.json — and snapshots the previous source first, so a
 * vibe-coded demo can always be recovered from the backup folder.
 */
/*
 * Back up a demo's source and lay down a fresh copy of `templateName`.
 *
 * Two callers want exactly this: Sync (re-copy the SAME template to pick up
 * template updates) and a template change on save (copy a DIFFERENT one).
 * Both must snapshot first, because the demo folder is where vibe-coded
 * customisation lives and it is about to be replaced.
 */
function replaceSrc(dir, templateName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(dir, "_backup-" + stamp);

  // Snapshot everything that isn't build output or a previous backup.
  fs.mkdirSync(backupDir, { recursive: true });
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules" || entry.startsWith("_backup-") || entry === ".vite-cache") continue;
    fs.cpSync(path.join(dir, entry), path.join(backupDir, entry), { recursive: true });
  }

  // Remove current source (keeping demo.json, build output and backups), then
  // lay down the fresh template.
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules" || entry.startsWith("_backup-") ||
        entry === ".vite-cache" || entry === "demo.json") continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  copyTemplateSrc(templateName, dir);
  return backupDir;
}

function syncTemplate(slug) {
  const dir = demoDir(slug);
  const demo = readDemo(slug);
  const backup = replaceSrc(dir, demo.template);
  return { demo: readDemo(slug), backup };
}

module.exports = { list, readDemo, create, update, duplicate, remove, syncTemplate, slugify };
