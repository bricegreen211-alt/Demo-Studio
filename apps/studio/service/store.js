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

function slugify(name) {
  const base = String(name || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "demo";
  let slug = base, n = 2;
  while (fs.existsSync(path.join(DEMOS_ROOT, slug))) slug = base + "-" + n++;
  return slug;
}

function readDemo(slug) {
  const file = path.join(demoDir(slug), "demo.json");
  const demo = schema.sanitize(JSON.parse(fs.readFileSync(file, "utf8")));
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
  const demo = schema.sanitize(input);
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
  const demo = schema.sanitize(Object.assign({}, current, input, {
    id: slug,
    // template changes are not supported in-place (would need re-copying source)
    template: current.template,
    createdAt: current.createdAt
  }));
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
  const demo = schema.sanitize(Object.assign({}, src, { id: newSlug, name }));
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
function syncTemplate(slug) {
  const dir = demoDir(slug);
  const demo = readDemo(slug);
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
  copyTemplateSrc(demo.template, dir);

  return { demo: readDemo(slug), backup: backupDir };
}

module.exports = { list, readDemo, create, update, duplicate, remove, syncTemplate, slugify };
