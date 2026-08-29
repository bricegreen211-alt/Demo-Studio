/*
 * Cognigy Demo Studio — preflight (server-side half).
 * Runs only the checks that apply to the demo's template (SOW §18) and returns
 * actionable messages. Browser-only checks (WebRTC support, microphone
 * permission, audio output) are run by the dashboard in the preview frame and
 * merged client-side — Node can't answer those.
 */
const fs = require("fs");
const path = require("path");
const { demoDir } = require("./paths");
const settings = require("./settings");
const builder = require("./builder");
const normalize = require("../../../packages/shared/normalize");

const EXTENSION_FRESH_MS = 90 * 1000;

function check(id, label, ok, detail) {
  return { id, label, ok: !!ok, detail: detail || "" };
}

// "Reachable" = we got ANY http response (Cognigy endpoints answer non-2xx to
// bare GETs; a network/DNS failure is what actually breaks a demo).
async function reachable(url, timeoutMs) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(timeoutMs || 6000) });
    return { ok: true, detail: "HTTP " + res.status };
  } catch (err) {
    return { ok: false, detail: String(err && err.cause && err.cause.message || err && err.message || err) };
  }
}

async function run(store, slug) {
  const demo = store.readDemo(slug);
  const wantsChat = demo.template === "webchat" || demo.template === "webchat-webrtc";
  const wantsVoice = demo.template === "webrtc" || demo.template === "webchat-webrtc";
  const checks = [];

  checks.push(check("studio", "Cognigy Demo Studio running", true, "Service is up"));

  const lastSeen = settings.read().extensionLastSeen || 0;
  const extOk = Date.now() - lastSeen < EXTENSION_FRESH_MS;
  checks.push(check("extension", "Demo Studio Extension connected", extOk,
    extOk ? "Heartbeat received" : "No recent heartbeat — is the extension installed and enabled in Chrome/Edge?"));

  const built = fs.existsSync(path.join(demoDir(slug), "dist", "index.html"));
  const lastBuild = builder.lastResult(slug);
  checks.push(check("built", "Demo Experience loaded", built && !(lastBuild && !lastBuild.ok),
    !built ? "No build output — save a source file or use Rebuild." :
    (lastBuild && !lastBuild.ok) ? "Last build failed: " + lastBuild.error : "Build output present"));

  if (wantsChat) {
    const ep = normalize.chatEndpoint(demo.cognigy.chatEndpoint);
    if (!ep) {
      checks.push(check("chat", "Cognigy chat endpoint reachable", false, "No chat endpoint configured — paste your Webchat endpoint URL in the demo form."));
    } else {
      const r = await reachable(ep);
      checks.push(check("chat", "Cognigy chat endpoint reachable", r.ok, r.ok ? r.detail : "Could not reach " + ep + " — " + r.detail));
    }
  }

  if (wantsVoice) {
    const ep = normalize.voiceEndpoint(demo.cognigy.voiceEndpoint);
    if (!ep) {
      checks.push(check("voice", "Voice Gateway reachable", false, "No voice endpoint configured — paste your Click-to-Call link in the demo form."));
    } else {
      const r = await reachable(ep);
      checks.push(check("voice", "Voice Gateway reachable", r.ok, r.ok ? r.detail : "Could not reach " + ep + " — " + r.detail));
    }
  }

  if (demo.website) {
    const site = /^https?:\/\//i.test(demo.website) ? demo.website : "https://" + demo.website;
    const r = await reachable(site, 8000);
    checks.push(check("website", "Customer website reachable", r.ok, r.ok ? r.detail : "Could not reach " + site + " — " + r.detail));
  } else {
    checks.push(check("website", "Customer website mapped", false, "No customer website set — the launcher won't auto-appear anywhere. Set the Website field (or use manual override in the extension popup)."));
  }

  const ready = checks.every((c) => c.ok);
  return { demoId: slug, template: demo.template, ready, verdict: ready ? "READY TO DEMO" : "ISSUES FOUND", checks, browserChecksPending: wantsVoice };
}

module.exports = { run };
