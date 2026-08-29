/*
 * Cognigy Demo Studio Extension — background service worker.
 * The only piece that talks to the local Demo Studio service. Content scripts
 * ask it which Demo Experience belongs on the current site; it also heartbeats
 * so the Studio's preflight can confirm the extension is connected.
 *
 * No page security is touched — the customer website is scenery (SOW §21).
 */
var API = "http://localhost:41700";

async function api(path, options) {
  var res = await fetch(API + path, options);
  if (!res.ok) throw new Error("Studio API " + res.status);
  return res.json();
}

async function heartbeat() {
  try { await api("/api/extension/heartbeat", { method: "POST" }); } catch (e) { /* studio not running */ }
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create("cds-heartbeat", { periodInMinutes: 1 });
  heartbeat();
});
chrome.runtime.onStartup.addListener(heartbeat);
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "cds-heartbeat") heartbeat();
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === "CDS_RESOLVE") {
    heartbeat();
    api("/api/resolve?host=" + encodeURIComponent(msg.host || ""))
      .then(function (data) { sendResponse({ ok: true, data: data }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err.message || err) }); });
    return true; // async
  }

  if (msg.type === "CDS_SAVE_PANEL") {
    api("/api/demos/" + encodeURIComponent(msg.demoId) + "/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ panelWidth: msg.panelWidth })
    })
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err.message || err) }); });
    return true;
  }
});
