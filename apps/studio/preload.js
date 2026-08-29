/*
 * Preload — the only bridge the dashboard gets. Feature-detected by app.js,
 * so the same dashboard also runs in a plain browser tab (without these).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cds", {
  openExternal: (url) => ipcRenderer.send("cds-open-external", url),
  openPath: true, // capability flag for the dashboard
  openDemoFolder: (slug) => ipcRenderer.send("cds-open-demo-folder", slug)
});
