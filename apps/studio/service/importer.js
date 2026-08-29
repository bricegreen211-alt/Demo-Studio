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

function importDemos(store, buildDemo, payload) {
  const incoming = Array.isArray(payload) ? payload : (payload && payload.demos);
  if (!Array.isArray(incoming)) throw new Error("No demos array found in import file.");
  const results = [];
  for (const old of incoming) {
    if (!old || typeof old !== "object") continue;
    try {
      const demo = store.create({
        name: old.name || "(imported demo)",
        website: old.websiteUrl || "",
        template: templateFor(old),
        userId: old.userId || "",
        cognigy: { chatEndpoint: old.webchatUrl || "", voiceEndpoint: old.webrtcUrl || "" }
      });
      buildDemo(demo.id).catch(() => {});
      results.push({ ok: true, id: demo.id, name: demo.name });
    } catch (err) {
      results.push({ ok: false, name: old.name || "?", error: String(err.message || err) });
    }
  }
  return results;
}

module.exports = { importDemos };
