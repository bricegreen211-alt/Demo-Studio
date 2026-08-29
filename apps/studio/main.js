/*
 * Cognigy Demo Studio — Electron shell.
 * Starts the local demo service (http://localhost:41700) and opens the
 * dashboard, which is the same web app the service serves at "/". SEs launch
 * the app like any other program — no terminal, ever (SOW §2).
 */
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { demoDir } = require("./service/paths");

let win = null;
let service = null;

// One studio per machine — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    try {
      service = require("./service/server").start();
    } catch (err) {
      // Most likely another Studio (or dev service) already owns the port —
      // the dashboard still works against it.
      console.error("Service start failed (already running?):", err.message);
    }

    win = new BrowserWindow({
      width: 1240,
      height: 860,
      title: "Cognigy Demo Studio",
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
}
