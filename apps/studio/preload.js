/*
 * Preload — the only bridge the dashboard gets. Feature-detected by app.js,
 * so the same dashboard also runs in a plain browser tab (without these).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cds", {
  openExternal: (url) => ipcRenderer.send("cds-open-external", url),
  openPath: true, // capability flag for the dashboard
  openDemoFolder: (slug) => ipcRenderer.send("cds-open-demo-folder", slug),
  openRemote: (gatewayId) => ipcRenderer.send("cds-open-remote", gatewayId || ""),
  openFolder: (dir) => ipcRenderer.send("cds-open-folder", dir),
  // Goes through Electron's native clipboard (main process) rather than the
  // page's own navigator.clipboard — the permission handler in main.js only
  // ever grants "media", so a scripted clipboard write from the page is
  // silently denied. See the cds-copy-text handler for the full story.
  copyText: (text) => ipcRenderer.invoke("cds-copy-text", text),
  // Start-at-login. Call with no argument to read current state.
  loginItem: (enabled) => ipcRenderer.invoke("cds-login-item", enabled),
  makeLauncher: () => ipcRenderer.send("cds-make-launcher")
});
