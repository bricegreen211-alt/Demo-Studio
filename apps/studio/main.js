/*
 * Cognigy Demo Studio — Electron shell.
 * Starts the local demo service (http://localhost:41700) and opens the
 * dashboard, which is the same web app the service serves at "/". SEs launch
 * the app like any other program — no terminal, ever (SOW §2).
 */
const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain, session, systemPreferences, nativeTheme } =
  require("electron");
const path = require("path");
const http = require("http");
const { demoDir } = require("./service/paths");
const launcher = require("./launcher");

let win = null;
let remoteWin = null;
let service = null;
let tray = null;

/*
 * Closing the window HIDES the app; only an explicit Quit ends it. Demos on a
 * customer's site are served by the local service running in this process, so
 * the old `window-all-closed -> quit` meant closing the Studio window silently
 * killed every live demo. INSTALL.md's "leave the terminal open" warning box
 * existed to paper over exactly that.
 */
let isQuitting = false;

// Launched by the login item: go straight to the tray, no window.
const startHidden = process.argv.includes("--hidden");

const ICON_PNG = path.join(__dirname, "..", "..", "assets", "icon-512.png");
/*
 * Tray art. macOS wants a small template image that follows the menu-bar
 * theme; Windows and Linux take the full-colour icon. Electron resizes, but
 * starting from the 512 would be blurry on macOS, so use the iconset's 32.
 */
const ICON_TRAY = path.join(__dirname, "..", "..", "assets", "icon.iconset",
  process.platform === "darwin" ? "icon_16x16@2x.png" : "icon_32x32.png");

// Microphone access for the Remote Control voice widget (ported from the
// NiCE Voice Agent app): OS-level prompt on macOS + auto-grant media
// permission requests inside our windows.
async function requestMicrophoneAccess() {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  return systemPreferences.askForMediaAccess("microphone");
}

// One studio per machine — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (double-clicking the icon again while it sits in the tray)
  // brings the existing window back rather than starting a rival service.
  app.on("second-instance", () => showStudio());

  /*
 * The window's own background, painted before the page loads. Without it
 * Chromium shows a white frame on every launch — which in dark mode is a
 * flash of exactly the wrong colour. settings.js is a synchronous
 * readFileSync module the service already requires, so this costs nothing.
 */
function windowBackground() {
  let pref = "system";
  try { pref = require("./service/settings").read().theme || "system"; } catch (e) {}
  const dark = pref === "dark" || (pref !== "light" && nativeTheme.shouldUseDarkColors);
  return dark ? "#16161d" : "#f2f0eb";   // --bg, dark and light
}

/* ── tray ─────────────────────────────────────────────────────────────────
 *
 * The tray is what makes "is Demo Studio running?" answerable at a glance, and
 * it is the only place Quit lives now that closing the window just hides it.
 */

function showStudio() {
  if (!win || win.isDestroyed()) return;
  if (process.platform === "darwin" && app.dock) app.dock.show();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

let warnedAboutHiding = false;
function notifyFirstHide() {
  if (warnedAboutHiding) return;
  warnedAboutHiding = true;
  // Silently not-quitting is its own kind of confusing — say it once.
  if (tray && tray.displayBalloon && process.platform === "win32") {
    try {
      tray.displayBalloon({
        title: "Still running",
        content: "Demo Studio keeps your demos live in the background. Quit from this icon to stop."
      });
    } catch (e) {}
  } else if (tray) {
    try { tray.setToolTip("Cognigy Demo Studio — still running, demos are live"); } catch (e) {}
  }
}

async function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const healthy = (await probeHealth(1000)) === "studio";
  tray.setToolTip(healthy
    ? "Cognigy Demo Studio — running, demos are live"
    : "Cognigy Demo Studio — service not responding");
  buildTrayMenu(healthy);
}

function buildTrayMenu(healthy) {
  const atLogin = launcher.supported && launcher.loginItemEnabled();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: healthy ? "Demos are live" : "Service not responding", enabled: false },
    { type: "separator" },
    { label: "Open Demo Studio", click: () => showStudio() },
    {
      label: "Start at login",
      type: "checkbox",
      checked: atLogin,
      enabled: launcher.supported,
      click: (item) => {
        launcher.setLoginItem(item.checked);
        refreshTray();
      }
    },
    { type: "separator" },
    {
      label: "Quit (stops all demos)",
      click: () => { isQuitting = true; app.quit(); }
    }
  ]));
}

function createTray() {
  try {
    tray = new Tray(ICON_TRAY);
    if (process.platform === "darwin") tray.setIgnoreDoubleClickEvents(true);
    tray.on("click", () => { if (process.platform === "win32") showStudio(); });
    buildTrayMenu(true);
    refreshTray();
    setInterval(refreshTray, 30000);
  } catch (err) {
    console.error("Tray unavailable:", err.message);
  }
}

/*
 * Is something already serving on 41700, and is it us?
 *
 * The old code assumed any occupant was another Studio and loaded the URL
 * regardless — so an unrelated program on that port left the SE staring at a
 * blank window or someone else's page with no explanation.
 */
function probeHealth(timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: 41700, path: "/api/health", timeout: timeoutMs || 1500 },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            const data = parsed.data || parsed;
            resolve(data && data.app === "cognigy-demo-studio" ? "studio" : "foreign");
          } catch (e) { resolve("foreign"); }
        });
      });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

/** Wait for our own service to answer before pointing a window at it. */
async function waitForService(attempts) {
  for (let i = 0; i < (attempts || 40); i++) {
    if (await probeHealth(500) === "studio") return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

app.whenReady().then(async () => {
    try {
      service = require("./service/server").start();
    } catch (err) {
      console.error("Service start failed:", err.message);
    }

    /*
     * If our listen failed, find out who owns the port before showing anything.
     * Another Studio: hand over rather than run a second builder against the
     * same demo folders. Anything else: say so plainly.
     */
    const listening = service ? await service.ready : false;
    if (!listening) {
      const who = await probeHealth(2000);
      if (who === "studio") {
        dialog.showMessageBoxSync({
          type: "info",
          title: "Cognigy Demo Studio",
          message: "Demo Studio is already running.",
          detail: "Look for the icon in your menu bar or system tray."
        });
        isQuitting = true;
        app.quit();
        return;
      }
      dialog.showMessageBoxSync({
        type: "error",
        title: "Cognigy Demo Studio",
        message: "Port 41700 is being used by another program.",
        detail: "Demo Studio needs port 41700. Close whatever is using it, then start Demo Studio again."
      });
      isQuitting = true;
      app.quit();
      return;
    }

    await requestMicrophoneAccess();
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "media"));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === "media");

    if (process.platform === "darwin" && app.dock) {
      try { app.dock.setIcon(ICON_PNG); } catch (e) {}
      // Started by the login item: live in the menu bar only.
      if (startHidden) try { app.dock.hide(); } catch (e) {}
    }

    win = new BrowserWindow({
      width: 1240,
      height: 860,
      title: "Cognigy Demo Studio",
      icon: ICON_PNG,
      backgroundColor: windowBackground(),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.removeMenu();
    win.once("ready-to-show", () => { if (!startHidden) win.show(); });

    /*
     * app.listen() is async and the old code called loadURL immediately after
     * it, racing the bind — a slow start showed an error page instead of the
     * dashboard.
     */
    if (await waitForService()) {
      win.loadURL("http://localhost:41700/");
    } else {
      win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
        '<body style="font:14px -apple-system,Segoe UI,sans-serif;padding:40px;color:#16161d;background:#f2f0eb">' +
        "<h2>Demo Studio's service didn't start</h2>" +
        "<p>The dashboard couldn't reach it on port 41700.</p>" +
        "<p>Quit from the menu bar or system tray icon and start Demo Studio again. " +
        "If it keeps happening, open the project folder in a terminal and run " +
        "<code>npm run doctor</code>.</p></body>"));
      if (startHidden) win.show();   // a failure is worth surfacing even at login
    }

    // Closing the window keeps the service — and therefore every live demo —
    // running. Quit is explicit, from the tray.
    win.on("close", (ev) => {
      if (isQuitting) return;
      ev.preventDefault();
      win.hide();
      if (process.platform === "darwin" && app.dock) app.dock.hide();
      notifyFirstHide();
    });

    createTray();

    // External links (Launch website, web_url buttons) open in the real browser
    // where the extension lives — never inside the Studio window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  });

  /*
   * Deliberately NOT app.quit(). The service lives in this process; quitting
   * here would stop every demo the SE has open on a customer's site the moment
   * they closed the Studio window.
   */
  app.on("window-all-closed", () => { /* stay alive in the tray */ });

  app.on("before-quit", () => { isQuitting = true; });

  app.on("quit", () => {
    if (service && service.server) try { service.server.close(); } catch (e) {}
    if (service && service.watcher) try { service.watcher.close(); } catch (e) {}
  });

  // macOS: clicking the dock icon reopens the hidden window.
  app.on("activate", () => showStudio());

  ipcMain.on("cds-open-external", (ev, url) => {
    if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
  });
  ipcMain.on("cds-open-demo-folder", (ev, slug) => {
    try { shell.openPath(demoDir(String(slug))); } catch (e) {}
  });

  // Settings page — open a folder we own (extension dir, data dir).
  ipcMain.on("cds-open-folder", (ev, dir) => {
    const { REPO_ROOT, DATA_ROOT } = require("./service/paths");
    const target = path.resolve(String(dir || ""));
    if (target.startsWith(REPO_ROOT) || target.startsWith(DATA_ROOT)) shell.openPath(target);
  });

  /*
   * Start-at-login, driven from Settings. Registers the GENERATED LAUNCHER,
   * never Electron's binary: app.setLoginItemSettings would show "Electron" in
   * Login Items when running from source, and on Windows would launch Electron
   * with no app path at all.
   */
  ipcMain.handle("cds-login-item", (ev, enabled) => {
    if (typeof enabled === "boolean") {
      launcher.setLoginItem(enabled);
      if (tray && !tray.isDestroyed()) refreshTray();
    }
    return {
      supported: launcher.supported,
      enabled: launcher.supported ? launcher.loginItemEnabled() : false,
      // True when the project folder moved out from under the launcher, which
      // otherwise fails in a way that looks like the app is broken.
      stale: launcher.supported ? launcher.isStale() : false,
      path: launcher.primaryLauncher()
    };
  });

  ipcMain.on("cds-make-launcher", () => { launcher.create(); });

  // Cognigy Remote Control pop-out — the compact window the SE drags
  // off-screen while presenting (successor to the NiCE Voice Agent app).
  ipcMain.on("cds-open-remote", (ev, gatewayId) => {
    const gw = /^[A-Za-z0-9_-]*$/.test(String(gatewayId || "")) ? String(gatewayId || "") : "";
    if (remoteWin && !remoteWin.isDestroyed()) {
      remoteWin.loadURL("http://localhost:41700/#remote&popout=1" + (gw ? "&gw=" + gw : ""));
      remoteWin.focus();
      return;
    }
    remoteWin = new BrowserWindow({
      width: 480,
      height: 720,
      minWidth: 360,
      minHeight: 540,
      title: "Cognigy Remote Control",
      icon: ICON_PNG,
      backgroundColor: windowBackground(),
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    remoteWin.removeMenu();
    remoteWin.once("ready-to-show", () => remoteWin.show());
    remoteWin.loadURL("http://localhost:41700/#remote&popout=1" + (gw ? "&gw=" + gw : ""));
    remoteWin.on("closed", () => { remoteWin = null; });
  });
}
