/*
 * Cognigy Demo Studio — filesystem layout.
 *
 * SE data lives OUTSIDE the app install, so app updates never touch demos:
 *   <Documents>/CognigyDemoStudio/
 *     demos/<slug>/   demo.json + index.html + src/ + dist/
 *     settings.json
 *
 * Documents (rather than the bare home folder) because that's where people
 * expect their own files on both macOS and Windows, and it survives the
 * corporate Windows setups that don't allow writing to the drive root.
 *
 * On Windows that means the LOCAL Documents folder — see resolveDocumentsDir.
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

const IS_WIN = process.platform === "win32";
const LEGACY_DATA_ROOT = path.join(os.homedir(), "CognigyDemoStudio");

/** The Documents folder the OS reports. On Windows this is the OneDrive copy under KFM. */
function knownDocumentsDir() {
  if (!process.versions.electron) return null; // only the app has this API
  try {
    const { app } = require("electron");
    return (app && app.getPath && app.getPath("documents")) || null;
  } catch (e) {
    return null; // not in the main process
  }
}

/**
 * Is this path inside a OneDrive sync root? Resolves junctions first, and
 * matches the business sync roots too ("OneDrive - Contoso"), not just the
 * personal "OneDrive".
 */
function isInOneDrive(dir) {
  if (!dir) return false;
  let real = dir;
  try { real = fs.realpathSync(dir); } catch (e) { /* doesn't exist yet — test the literal path */ }
  return real.split(/[\\/]/).some((seg) => seg.toLowerCase().startsWith("onedrive"));
}

/*
 * Where should the user's own files go?
 *
 * On Windows: %USERPROFILE%\Documents LITERALLY, deliberately NOT Electron's
 * known-folder API. OneDrive's Known Folder Move repoints the Documents known
 * folder at <home>/OneDrive/Documents, and putting the data root there is what
 * kills OneDrive on a work machine: every demo carries its own template copy
 * and the builder rewrites dist/ on every single file save, so the sync client
 * never stops. KFM normally leaves the original folder behind, but not always,
 * so create it.
 *
 * On macOS: the known folder is right, and there's no redirection to dodge.
 */
function resolveDocumentsDir() {
  const home = os.homedir();

  if (IS_WIN) {
    const local = path.join(home, "Documents");
    try { fs.mkdirSync(local, { recursive: true }); } catch (e) { /* the check below decides */ }
    if (!isInOneDrive(local)) return local;

    // Some KFM setups leave %USERPROFILE%\Documents as a junction INTO the sync
    // root, so even the literal path isn't local. LocalAppData never syncs.
    return process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  }

  const docs = knownDocumentsDir();
  if (docs) return docs;
  const fallback = path.join(home, "Documents");
  try { if (fs.statSync(fallback).isDirectory()) return fallback; } catch (e) { /* next */ }
  return home; // last resort — never fail to start over a missing folder
}

const DATA_ROOT = process.env.CDS_DATA_DIR || path.join(resolveDocumentsDir(), "CognigyDemoStudio");
const DEMOS_ROOT = path.join(DATA_ROOT, "demos");
const SETTINGS_FILE = path.join(DATA_ROOT, "settings.json");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TEMPLATES_ROOT = path.join(REPO_ROOT, "templates");
const EXTENSION_ROOT = path.join(REPO_ROOT, "extension");
const SHARED_ROOT = path.join(REPO_ROOT, "packages", "shared");

/*
 * Every place demos have lived before now, newest first. Checked in order by
 * migrateLegacyData; the first one that exists is moved and wins.
 */
function legacyDataRoots() {
  const roots = [];
  const known = knownDocumentsDir();
  // The OneDrive-redirected Documents folder we used to resolve to. Only the
  // app sees this one...
  if (known) roots.push(path.join(known, "CognigyDemoStudio"));
  // ...so spell out the usual redirect target as well, or `npm run service`
  // would silently start empty on a machine the app would have migrated.
  roots.push(path.join(os.homedir(), "OneDrive", "Documents", "CognigyDemoStudio"));
  // Older still: straight off the home folder.
  roots.push(LEGACY_DATA_ROOT);
  return roots;
}

/*
 * Move demos from wherever they used to live, once, so existing installs keep
 * working without the SE doing anything. No-op for fresh installs and for
 * anyone who already migrated.
 */
let migrationChecked = false;
function migrateLegacyData() {
  if (migrationChecked) return null;
  migrationChecked = true;
  if (process.env.CDS_DATA_DIR) return null;          // explicit override wins
  if (fs.existsSync(DATA_ROOT)) return null;          // already using the new home

  for (const from of legacyDataRoots()) {
    if (path.resolve(from) === path.resolve(DATA_ROOT)) continue; // that IS the new home
    if (!fs.existsSync(from)) continue;                           // nothing there to move

    fs.mkdirSync(path.dirname(DATA_ROOT), { recursive: true });
    try {
      fs.renameSync(from, DATA_ROOT);
    } catch (err) {
      // Different volume (network home, a redirect onto another drive, …):
      // copy then remove the original.
      if (err.code !== "EXDEV") throw err;
      fs.cpSync(from, DATA_ROOT, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    }
    console.log("[paths] moved your demos:\n  from " + from + "\n    to " + DATA_ROOT);
    return { from, to: DATA_ROOT };
  }
  return null;
}

function ensureDirs() {
  migrateLegacyData();
  fs.mkdirSync(DEMOS_ROOT, { recursive: true });
}

function demoDir(slug) {
  // Slugs are generated by the store; belt-and-braces against traversal.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Bad demo id: " + slug);
  return path.join(DEMOS_ROOT, slug);
}

module.exports = {
  DATA_ROOT, DEMOS_ROOT, SETTINGS_FILE, REPO_ROOT, TEMPLATES_ROOT, EXTENSION_ROOT, SHARED_ROOT,
  LEGACY_DATA_ROOT, resolveDocumentsDir, isInOneDrive, legacyDataRoots,
  migrateLegacyData, ensureDirs, demoDir
};
