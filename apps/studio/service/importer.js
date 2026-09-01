/*
 * Cognigy Demo Studio — CognigyInjector v3.x demo importer.
 * Accepts the old extension's export ("cognigy-injector-demos.json":
 * { demos: [{ name, websiteUrl, webchatUrl, webrtcUrl, userId, webrtcCss }] })
 * and creates equivalent Demo Studio demos. webrtcCss has no equivalent here
 * (branding is config-driven now) and is dropped.
 */
function templateFor(old) {
  const chat = !!(old.webchatUrl && String(old.webchatUrl).trim());
  const voice = !!(old.webrtcUrl && String(old.webrtcUrl).trim());
  if (chat && voice) return "webchat-webrtc";
  if (voice) return "webrtc";
  return "webchat";
}

const APP_ID = "cognigy-demo-studio";

/*
 * Two import formats are accepted:
 *   - a Demo Studio export (app: "cognigy-demo-studio") — full demo config
 *   - a Cognigy Injector v3.x export — the old {name, webchatUrl, …} shape
 */
function importDemos(store, buildDemo, payload) {
  const isNative = payload && payload.app === APP_ID;
  const incoming = Array.isArray(payload) ? payload : (payload && payload.demos);
  if (!Array.isArray(incoming)) throw new Error("No demos array found in import file.");

  const results = [];
  for (const entry of incoming) {
    if (!entry || typeof entry !== "object") continue;
    const name = entry.name || "(imported demo)";
    try {
      // A native export is already in demo.json shape; drop the id so the
      // import can't collide with an existing demo folder.
      const input = isNative
        ? Object.assign({}, entry, { id: "", createdAt: "", updatedAt: "" })
        : {
            name,
            website: entry.websiteUrl || "",
            template: templateFor(entry),
            userId: entry.userId || "",
            cognigy: { chatEndpoint: entry.webchatUrl || "", voiceEndpoint: entry.webrtcUrl || "" }
          };
      const demo = store.create(input);
      buildDemo(demo.id).catch(() => {});
      results.push({ ok: true, id: demo.id, name: demo.name });
    } catch (err) {
      results.push({ ok: false, name, error: String(err.message || err) });
    }
  }
  return results;
}

/*
 * Export is configuration only — demo.json for every demo plus the folder and
 * Remote Control settings. Vibe-coded source lives in the demo folders and
 * isn't included; copy those folders (or use git) to move custom code.
 */
function exportAll(store, settings) {
  const demos = store.list().map((d) => {
    const copy = Object.assign({}, d);
    delete copy.built;      // runtime-only fields
    delete copy.path;
    return copy;
  });
  return {
    app: APP_ID,
    exportedAt: new Date().toISOString(),
    demos,
    settings: {
      folders: settings.folders || [],
      gateways: settings.gateways || [],
      gatewayFolders: settings.gatewayFolders || [],
      outbound: settings.outbound || { endpointUrl: "", endpointKey: "" }
    }
  };
}

module.exports = { importDemos, exportAll };
