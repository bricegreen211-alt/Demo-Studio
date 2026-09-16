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
 * Documents, unless Documents is inside OneDrive — which on a corporate machine
 * it very often is. Putting the data root in a sync root is what kills OneDrive:
 * every demo carries its own template copy and the builder rewrites dist/ on
 * every single file save, so the sync client never stops.
 *
 * Known Folder Move does this on BOTH platforms, by different mechanisms:
 *
 *   Windows  the Documents known folder is repointed at <home>\OneDrive\Documents,
 *            so we use %USERPROFILE%\Documents literally and never ask the API.
 *            KFM usually leaves that original folder behind; create it if not.
 *
 *   macOS    ~/Documents is replaced by a SYMLINK into
 *            ~/Library/CloudStorage/OneDrive-<tenant>/Documents, and
 *            app.getPath("documents") follows it straight back in. The literal
 *            path is no escape here — there is no local Documents left — so we
 *            fall back to Application Support, which is never synced.
 *
 * Both fallbacks are the platform's own "local app data" location, and both are
 * printed by `npm run doctor` so the SE can find their demos.
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

  for (const dir of [knownDocumentsDir(), path.join(home, "Documents")]) {
    if (!dir) continue;
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch (e) { continue; }
    if (isInOneDrive(dir)) continue;   // KFM symlinked it into the sync root
    return dir;
  }

  // Every Documents candidate is inside OneDrive, or there isn't one.
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support");
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
  const home = os.homedir();
  const roots = [];

  // The OneDrive-redirected Documents folder we used to resolve to. Only the
  // app can ask for this one...
  const known = knownDocumentsDir();
  if (known) roots.push(path.join(known, "CognigyDemoStudio"));

  // ...so spell out the redirect targets as well, or `npm run service` — which
  // has no Electron API to ask — starts empty on a machine the app would have
  // migrated. On macOS ~/Documents IS the symlink into the sync root, so the
  // literal path is the one that finds the demos.
  roots.push(path.join(home, "Documents", "CognigyDemoStudio"));
  roots.push(path.join(home, "OneDrive", "Documents", "CognigyDemoStudio"));

  // macOS parks each tenant's sync root under Library/CloudStorage —
  // "OneDrive-NiCELtd", "OneDrive-Contoso". Covers the case where KFM is on but
  // the ~/Documents symlink has since been removed or repointed.
  const cloud = path.join(home, "Library", "CloudStorage");
  try {
    for (const entry of fs.readdirSync(cloud)) {
      if (/^onedrive/i.test(entry)) roots.push(path.join(cloud, entry, "Documents", "CognigyDemoStudio"));
    }
  } catch (e) { /* no CloudStorage: not a Mac, or no cloud providers signed in */ }

  // Older still: straight off the home folder.
  roots.push(LEGACY_DATA_ROOT);

  // Several of these resolve to the same place on a given machine.
  return roots.filter((r, i) => roots.indexOf(r) === i);
}

/**
 * Same folder as DATA_ROOT? Compared through symlinks: on macOS the candidate
 * ~/Documents/CognigyDemoStudio and the real location are the same directory
 * under two names, and moving one onto the other would destroy it.
 */
function sameDir(a, b) {
  const real = (p) => { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } };
  return real(a) === real(b);
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
    if (!fs.existsSync(from)) continue;        // nothing there to move
    if (sameDir(from, DATA_ROOT)) continue;    // that IS the new home, under another name

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
