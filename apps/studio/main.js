/*
 * Cognigy Demo Studio — Electron shell.
 * Starts the local demo service (http://localhost:41700) and opens the
 * dashboard, which is the same web app the service serves at "/". SEs launch
 * the app like any other program — no terminal, ever (SOW §2).
 */
const { app, BrowserWindow, shell, ipcMain, session, systemPreferences } = require("electron");
const path = require("path");
const { demoDir } = require("./service/paths");

let win = null;
let remoteWin = null;
let service = null;

const ICON_PNG = path.join(__dirname, "..", "..", "assets", "icon-512.png");
const ICON_ICNS = path.join(__dirname, "..", "..", "assets", "icon.icns");

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
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    try {
      service = require("./service/server").start();
    } catch (err) {
      // Most likely another Studio (or dev service) already owns the port —
      // the dashboard still works against it.
      console.error("Service start failed (already running?):", err.message);
    }

    await requestMicrophoneAccess();
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "media"));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === "media");

    if (process.platform === "darwin" && app.dock) {
      try { app.dock.setIcon(ICON_PNG); } catch (e) {}
    }

    win = new BrowserWindow({
      width: 1240,
      height: 860,
      title: "Cognigy Demo Studio",
      icon: ICON_PNG,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.removeMenu();
    win.loadURL("http://localhost:41700/");

    // External links (Launch website, web_url buttons) open in the real browser
    // where the extension lives — never inside the Studio window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("quit", () => {
    if (service && service.server) try { service.server.close(); } catch (e) {}
    if (service && service.watcher) try { service.watcher.close(); } catch (e) {}
  });

  ipcMain.on("cds-open-external", (ev, url) => {
    if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
  });
  ipcMain.on("cds-open-demo-folder", (ev, slug) => {
    try { shell.openPath(demoDir(String(slug))); } catch (e) {}
  });

  // Cognigy Remote Control pop-out — the compact window the SE drags
  // off-screen while presenting (successor to the NiCE Voice Agent app).
  ipcMain.on("cds-open-remote", () => {
    if (remoteWin && !remoteWin.isDestroyed()) { remoteWin.focus(); return; }
    remoteWin = new BrowserWindow({
      width: 480,
      height: 720,
      minWidth: 360,
      minHeight: 540,
      title: "Cognigy Remote Control",
      icon: ICON_PNG,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    remoteWin.removeMenu();
    remoteWin.loadURL("http://localhost:41700/#remote&popout=1");
    remoteWin.on("closed", () => { remoteWin = null; });
  });
}
