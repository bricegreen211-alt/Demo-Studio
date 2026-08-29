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
  demo.hasLocked = fs.existsSync(path.join(demoDir(slug), "locked", "dist", "index.html"));
  demo.built = fs.existsSync(path.join(demoDir(slug), "dist", "index.html"));
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
      return !/^((dist|node_modules|locked)(\/|$)|demo\.json$)/.test(rel);
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
  // Copy everything except locked snapshots; the duplicate starts unlocked.
  fs.cpSync(demoDir(slug), dir, {
    recursive: true,
    filter: (p) => !/(^|\/)locked(\/|$)/.test(path.relative(demoDir(slug), p))
  });
  const demo = schema.sanitize(Object.assign({}, src, { id: newSlug, name }));
  demo.createdAt = demo.updatedAt = new Date().toISOString();
  writeDemoJson(newSlug, demo);
  return readDemo(newSlug);
}

function remove(slug) {
  fs.rmSync(demoDir(slug), { recursive: true, force: true });
}

// Lock = snapshot the current build + config as the known-good presentation copy.
function lock(slug) {
  const dir = demoDir(slug);
  if (!fs.existsSync(path.join(dir, "dist", "index.html"))) {
    throw new Error("Demo has no build to lock — run Preflight/rebuild first.");
  }
  const lockedDir = path.join(dir, "locked");
  fs.rmSync(lockedDir, { recursive: true, force: true });
  fs.mkdirSync(lockedDir, { recursive: true });
  fs.cpSync(path.join(dir, "dist"), path.join(lockedDir, "dist"), { recursive: true });
  fs.copyFileSync(path.join(dir, "demo.json"), path.join(lockedDir, "demo.json"));
  fs.writeFileSync(path.join(lockedDir, "locked-at.txt"), new Date().toISOString());
  return readDemo(slug);
}

module.exports = { list, readDemo, create, update, duplicate, remove, lock, slugify };
