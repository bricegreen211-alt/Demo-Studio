/*
 * Cognigy Demo Studio MCP bridge — tool implementations.
 *
 * Every tool here is a thin proxy over Demo Studio's own local API
 * (apps/studio/service/server.js) — this file adds almost no logic of its
 * own, on purpose. The server's sanitize() (packages/shared/demo-schema.js)
 * is the single source of truth for what a valid demo looks like; this file
 * passes values through rather than re-validating them, exactly as this
 * repo's own CLAUDE.md says an external caller should.
 *
 * Two things this file does add, because nothing else can:
 *   - the health check every tool runs first (see guard() below)
 *   - the read-modify-write merge createOrUpdateGateway needs, because
 *     Demo Studio has no single-gateway endpoint (see its own comment)
 *
 * Result shape: every tool returns MCP tool content — one text block whose
 * text is a JSON string. "Not running" and "the server rejected this" are
 * both returned as normal (non-error) content with an {ok:false, ...} body,
 * not thrown — that is a deliberate choice from the plan this was built
 * against: a thrown/isError result reads to Claude as "something is broken
 * in the bridge," where these are just answers ("the app isn't running yet")
 * that deserve a plain reply to the SE, not an error banner. A genuinely
 * unexpected failure (the health check passed, then the call still failed)
 * DOES set isError, so that distinction stays visible.
 */
"use strict";

const { checkHealth, api } = require("./client.js");

function json(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const NOT_RUNNING_MESSAGE =
  "Demo Studio isn't running. Launch the Cognigy Demo Studio app (or run " +
  "`npm run service` from the Demo-Studio folder) and try again.";
const PORT_CONFLICT_MESSAGE =
  "Something other than Demo Studio answered on port 41700. Close whatever " +
  "that is and relaunch Demo Studio.";

/*
 * Wraps every tool handler: health-check first (the one call that must
 * happen before any other), then run the real handler and turn a thrown
 * api() error into a structured, non-crashing result instead of an
 * unhandled rejection reaching the MCP transport.
 */
function guard(handler) {
  return async (args) => {
    const status = await checkHealth();
    if (!status.running) {
      return json({
        ok: false,
        error: status.reason,
        message: status.reason === "not_running" ? NOT_RUNNING_MESSAGE : PORT_CONFLICT_MESSAGE
      });
    }
    try {
      return await handler(args || {});
    } catch (err) {
      return errorResult((err && err.message) || String(err));
    }
  };
}

/* Only send fields that were actually given — never fight the server's own
   defaulting with an explicit undefined/null, and never let a tool schema
   even have a place to put "chatUi" (it's derived, sanitize() always
   overwrites it, so there is nothing for this bridge to set there). */
function withoutUndefined(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function demoBody(args, opts) {
  opts = opts || {};
  const body = withoutUndefined({
    name: opts.includeName ? args.name : undefined,
    template: args.template,
    website: args.website,
    folder: args.folder,
    agentName: args.agentName,
    welcomeMessage: args.welcomeMessage,
    panelStyle: args.panelStyle
  });
  if (args.themePreset !== undefined) body.theme = { preset: args.themePreset };
  if (args.chatEndpoint !== undefined || args.voiceEndpoint !== undefined) {
    body.cognigy = withoutUndefined({ chatEndpoint: args.chatEndpoint, voiceEndpoint: args.voiceEndpoint });
  }
  return body;
}

/*
 * chat only -> webchat, voice only -> webrtc, both -> the combination, and
 * neither falls through to the server's own default (webchat). Used only
 * when the caller didn't say which template they want — an explicit
 * `template` always wins.
 */
function inferTemplate(chatEndpoint, voiceEndpoint) {
  if (chatEndpoint && voiceEndpoint) return "webchat-webrtc";
  if (voiceEndpoint) return "webrtc";
  return "webchat";
}

/* A trimmed projection for list results — just enough to spot a duplicate
   or pick the right id, not the full sanitized object (theme tokens,
   starters, launcher art, etc.) that create/update/get already return. */
function trimDemo(d) {
  return {
    id: d.id, name: d.name, folder: d.folder, template: d.template,
    website: d.website, built: d.built,
    cognigy: { chatEndpoint: (d.cognigy || {}).chatEndpoint, voiceEndpoint: (d.cognigy || {}).voiceEndpoint }
  };
}

const checkStatus = guard(async () => {
  const status = await checkHealth();
  return json(status.running
    ? { ok: true, running: true, version: status.version }
    : { ok: false, running: false, error: status.reason,
        message: status.reason === "not_running" ? NOT_RUNNING_MESSAGE : PORT_CONFLICT_MESSAGE });
});

const listDemos = guard(async (args) => {
  const { demos } = await api("GET", "/api/demos");
  const nameContains = (args.nameContains || "").toLowerCase();
  const folder = args.folder;
  const filtered = demos.filter((d) =>
    (!nameContains || d.name.toLowerCase().includes(nameContains)) &&
    (folder === undefined || d.folder === folder)
  );
  return json({ ok: true, demos: filtered.map(trimDemo) });
});

const getDemo = guard(async (args) => {
  const result = await api("GET", "/api/demos/" + encodeURIComponent(args.id));
  return json({ ok: true, demo: result.demo, lastBuild: result.lastBuild });
});

const createDemo = guard(async (args) => {
  if (!args.name) return errorResult("name is required.");
  const template = args.template || inferTemplate(args.chatEndpoint, args.voiceEndpoint);
  const body = demoBody(Object.assign({}, args, { template }), { includeName: true });
  const { demo } = await api("POST", "/api/demos", body);
  const templateWasInferred = !args.template;
  return json({
    ok: true, demo,
    note: "A build for this demo started in the background — call rebuild_demo with this id " +
      "for a synchronous, confirmed result, then preflight_demo before telling the SE it's ready." +
      (templateWasInferred ? " template was inferred as \"" + template + "\" from the endpoints given." : "")
  });
});

const updateDemo = guard(async (args) => {
  if (!args.id) return errorResult("id is required.");
  // Deliberately no template inference here: changing an EXISTING demo's
  // template swaps its source folder server-side (store.js's update()), a
  // more consequential move than picking one at creation — it only happens
  // if the caller explicitly asks for it.
  const body = demoBody(args, { includeName: false });
  const { demo } = await api("PUT", "/api/demos/" + encodeURIComponent(args.id), body);
  return json({ ok: true, demo });
});

const rebuildDemo = guard(async (args) => {
  if (!args.id) return errorResult("id is required.");
  const { result } = await api("POST", "/api/demos/" + encodeURIComponent(args.id) + "/rebuild");
  return json({ ok: true, result });
});

const preflightDemo = guard(async (args) => {
  if (!args.id) return errorResult("id is required.");
  const result = await api("POST", "/api/demos/" + encodeURIComponent(args.id) + "/preflight");
  return json(Object.assign({ ok: true }, result));
});

const listThemes = guard(async (args) => {
  const { themes } = await api("GET", "/api/themes");
  return json({ ok: true, themes: args.template ? { [args.template]: themes[args.template] || [] } : themes });
});

/*
 * The one tool with real logic: there is no single-gateway endpoint on Demo
 * Studio's API, only "PUT the whole settings.gateways array" — the same
 * read-modify-write apps/studio/renderer/remote.js's own save path uses. This
 * always re-reads settings immediately before merging rather than caching
 * anything across calls, so it carries no more staleness risk than the
 * dashboard already has with itself.
 */
const createOrUpdateGateway = guard(async (args) => {
  if (!args.name) return errorResult("name is required.");
  if (!args.voiceEndpoint) return errorResult("voiceEndpoint is required.");
  const settings = await api("GET", "/api/settings");
  const gateways = (settings.gateways || []).slice();
  let entry;
  let idx = -1;
  if (args.gatewayId) idx = gateways.findIndex((g) => g.id === args.gatewayId);
  if (idx >= 0) {
    entry = Object.assign({}, gateways[idx], {
      name: args.name, endpointUrl: args.voiceEndpoint,
      folder: args.folder !== undefined ? args.folder : gateways[idx].folder
    });
    gateways[idx] = entry;
  } else {
    // No id sent — the server assigns one, matching how a gateway created
    // straight from the dashboard gets its id.
    entry = { name: args.name, endpointUrl: args.voiceEndpoint, folder: args.folder || "" };
    gateways.push(entry);
  }
  const updated = await api("PUT", "/api/settings", { gateways, gatewayFolders: settings.gatewayFolders || [] });
  const saved = (updated.gateways || []).find((g) =>
    idx >= 0 ? g.id === args.gatewayId : g.name === entry.name && g.endpointUrl === entry.endpointUrl
  ) || entry;
  return json({ ok: true, gateway: saved, gatewaysTotal: (updated.gateways || []).length });
});

const listGateways = guard(async () => {
  const settings = await api("GET", "/api/settings");
  return json({ ok: true, gateways: settings.gateways || [] });
});

module.exports = {
  checkStatus, listDemos, getDemo, createDemo, updateDemo, rebuildDemo,
  preflightDemo, listThemes, createOrUpdateGateway, listGateways
};
