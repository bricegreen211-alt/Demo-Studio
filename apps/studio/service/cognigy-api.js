/*
 * Cognigy Demo Studio — Cognigy.AI management API client, for the Logs page.
 *
 * This is the FIRST thing in Demo Studio that talks to the management API and
 * the first place an org-wide API key is held. Everything else in the app deals
 * only in Endpoint URLs and Endpoint tokens, which are per-flow and harmless by
 * comparison. Two rules follow from that and neither is optional:
 *
 *   1. The key never leaves this process. The dashboard calls /api/logs/* and
 *      this module calls Cognigy. (That also sidesteps CORS, which would block
 *      the dashboard from calling api-<region>.cognigy.ai directly anyway.)
 *   2. The key never enters a `debug` envelope, a log line, or an error string
 *      — only `keySent: true/false`. Same rule as outbound.js, for the same
 *      reason: those objects get rendered into the page.
 *
 * Shape and error handling are cloned from outbound.js's callViaVoiceGateway()
 * so there is one house style for "we called Cognigy and it went wrong".
 *
 * Endpoints used (verified against api-trial-us.cognigy.ai):
 *   GET /v2.1/projects/:id/logs/tail   userId, flowName, sessionId, type[], lastTimeWindow
 *   GET /v2.1/projects/:id/logs/count  same filters, per level
 *   GET /v2.0/projects                 the project picker
 *   GET /v2.0/flows?projectId=         flow-name suggestions
 *
 * The tail and count endpoints need `x-cognigy-log-model-version: v2`, without
 * which count 400s outright and tail returns the older entry shape.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const TIMEOUT_MS = 15000;

/* The windows every cluster accepts for lastTimeWindow. Anything else is a
 * 400 listing the accepted set, so the UI offers exactly these. */
const WINDOWS = [1, 6, 12];

/** Log levels the API will filter on. `trace` exists but is never counted. */
const LEVELS = ["fatal", "error", "warn", "info", "debug"];

function creds(settings) {
  const c = (settings && settings.cognigy) || {};
  return {
    baseUrl: String(c.baseUrl || "").trim().replace(/\/+$/, ""),
    apiKey: String(c.apiKey || "").trim()
  };
}

/**
 * Names every missing field at once rather than failing on the first, the way
 * callViaVoiceGateway does — an SE fixing one thing at a time is an SE making
 * three round trips.
 */
function assertConfigured(cfg) {
  const missing = [];
  if (!cfg.baseUrl) missing.push("API Base URL");
  if (!cfg.apiKey) missing.push("API Key");
  if (missing.length) {
    throw new Error("Cognigy API is not set up yet — missing: " + missing.join(", ") +
      ". Add it under Settings > Cognigy API.");
  }
}

function qs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach((x) => { if (x) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(x)); });
    else parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
  });
  return parts.length ? "?" + parts.join("&") : "";
}

/**
 * One GET against the management API.
 *
 * Never throws for a network or HTTP failure — returns { ok: false, error,
 * debug } so the page can show what happened and keep the SE's filters. Only a
 * missing-configuration error throws, which server.js turns into a 400.
 *
 * @returns {Promise<{ok: boolean, data?: any, error?: string, debug: object}>}
 */
async function get(cfg, apiPath, params, extraHeaders) {
  assertConfigured(cfg);
  const url = cfg.baseUrl + apiPath + qs(params);
  // keySent is a boolean. Never the key — this object is rendered into the page.
  const debug = { endpoint: url, keySent: !!cfg.apiKey, status: null, ms: 0, response: "" };
  const started = Date.now();

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: Object.assign({
        "X-API-Key": cfg.apiKey,
        Accept: "application/json"
      }, extraHeaders || {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    debug.ms = Date.now() - started;
    // err.cause carries the real DNS/TLS/connection reason for fetch.
    return {
      ok: false,
      error: "Could not reach " + cfg.baseUrl + " — " +
        String((err.cause && err.cause.message) || err.message || err),
      debug
    };
  }

  debug.ms = Date.now() - started;
  debug.status = res.status;
  const text = await res.text();
  debug.response = text.slice(0, 4000);

  if (!res.ok) {
    return { ok: false, error: "Cognigy returned HTTP " + res.status + hintFor(res.status), debug };
  }

  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch (e) {
    return { ok: false, error: "Cognigy answered HTTP 200 with something that isn't JSON.", debug };
  }
  return { ok: true, data, debug };
}

/*
 * The remediation an SE actually needs. 401 is the one that costs time: a
 * Cognigy API key is a USER key from My Profile, and people reach for the
 * flow's Endpoint Key or the Voice Gateway account key instead, both of which
 * are already stored elsewhere in this app.
 */
function hintFor(status) {
  if (status === 401) {
    return " — the API key is wrong or expired. It is a user API key from " +
      "Cognigy > My Profile > API Keys, not a flow Endpoint Key and not the Voice Gateway key.";
  }
  /*
   * 403 is NOT necessarily a bad key: Cognigy answers it for a Project the key
   * has no access to, and for one that does not exist. Leading with "your key
   * is wrong" sent people to re-paste a working key, so name both causes.
   */
  if (status === 403) {
    return " — no access to that Project. Either the Project id is wrong, or this API key's user " +
      "is not a member of it. If every Project fails, the key itself is the problem.";
  }
  if (status === 404) {
    return " — check the API Base URL for your region, and that the Project still exists.";
  }
  if (status === 400) {
    return " — Cognigy rejected the filters. Time window must be one of " + WINDOWS.join(", ") + " hours.";
  }
  if (status === 402) return " — the Cognigy plan's quota is exhausted.";
  if (status === 429) return " — too many requests. Pause the live tail for a moment.";
  return "";
}

/* ---------------- resources ---------------- */

async function projects(cfg) {
  const r = await get(cfg, "/v2.0/projects", { limit: 100, sort: "name:asc" });
  if (!r.ok) return r;
  const items = ((r.data && r.data.items) || []).map((p) => ({ id: p._id, name: p.name }));
  return { ok: true, data: items, debug: r.debug };
}

async function flows(cfg, projectId) {
  const r = await get(cfg, "/v2.0/flows", { projectId, limit: 100, sort: "name:asc" });
  if (!r.ok) return r;
  const items = ((r.data && r.data.items) || []).map((f) => ({ id: f._id, name: f.name }));
  return { ok: true, data: items, debug: r.debug };
}

/*
 * The log feed. `tail` is the right endpoint for troubleshooting rather than
 * GET /logs: it is the only one that filters by sessionId, and it needs no
 * date range. It caps at 100 entries, newest first, and its `total` is ALWAYS
 * -1 — never render a count from it; call count() instead.
 */
function logParams(f) {
  const p = {
    userId: f.userId || "",
    flowName: f.flowName || "",
    sessionId: f.sessionId || "",
    type: Array.isArray(f.type) ? f.type.filter((t) => LEVELS.indexOf(t) >= 0) : undefined,
    next: f.next || "",
    previous: f.previous || ""
  };
  const w = parseInt(f.window, 10);
  if (WINDOWS.indexOf(w) >= 0) p.lastTimeWindow = w;
  return p;
}

const V2 = { "x-cognigy-log-model-version": "v2" };

async function tail(cfg, projectId, filters) {
  if (!projectId) throw new Error("Pick a Project first.");
  const r = await get(cfg, "/v2.1/projects/" + encodeURIComponent(projectId) + "/logs/tail",
    logParams(filters || {}), V2);
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      items: (r.data && r.data.items) || [],
      nextCursor: (r.data && r.data.nextCursor) || null
    },
    debug: r.debug
  };
}

async function count(cfg, projectId, filters) {
  if (!projectId) throw new Error("Pick a Project first.");
  const f = filters || {};
  return get(cfg, "/v2.1/projects/" + encodeURIComponent(projectId) + "/logs/count", {
    userId: f.userId || "", flowName: f.flowName || "", sessionId: f.sessionId || "",
    lastTimeWindow: WINDOWS.indexOf(parseInt(f.window, 10)) >= 0 ? parseInt(f.window, 10) : undefined
  }, V2);
}

/* ---------------- endpoint token -> Project ---------------- */

/*
 * Which Project does a demo's Endpoint URL belong to?
 *
 * There is no cheap answer, and the shape of the API is why. Measured on a
 * live org: GET /v2.0/endpoints returns NEITHER projectId (only flowId, and
 * that is a flow's `referenceId`, not its `_id`, so GET /v2.0/flows/:id 400s
 * on it) nor more than 100 rows a page — there were 196 endpoints and 397
 * flows. So an org-wide lookup cannot be done in one call, or two.
 *
 * What does work is asking each Project for its own endpoints, which DOES
 * accept ?projectId=, and stopping at the first match. On the same org that
 * resolved in 0.37s after two Projects; the worst case is one small request
 * per Project. Results are cached for the life of the process because an
 * Endpoint's token does not move between Projects.
 */
const tokenCache = new Map();

async function resolveProjectByToken(cfg, urlToken) {
  const token = String(urlToken || "");
  if (!token) return { ok: true, data: { projectId: "" } };
  if (tokenCache.has(token)) return { ok: true, data: { projectId: tokenCache.get(token), cached: true } };

  const ps = await projects(cfg);
  if (!ps.ok) return ps;

  // Small parallel batches: fast on a big org without opening 21 sockets at once.
  const list = ps.data;
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const results = await Promise.all(batch.map((p) =>
      get(cfg, "/v2.0/endpoints", { projectId: p.id, limit: 100 })
        .then((r) => ({ p, r }))
        .catch(() => ({ p, r: { ok: false } }))
    ));
    for (let j = 0; j < results.length; j++) {
      const { p, r } = results[j];
      if (!r.ok) continue;
      const hit = ((r.data && r.data.items) || [])
        .some((e) => String(e.URLToken || e.urlToken || "") === token);
      if (hit) {
        tokenCache.set(token, p.id);
        return { ok: true, data: { projectId: p.id, projectName: p.name } };
      }
    }
  }
  return { ok: true, data: { projectId: "" } };
}

/* ---------------- seeding from a Claude MCP config ---------------- */

/*
 * A Cognigy API key is 128 characters. Nobody should retype one, and most SEs
 * running this already have the pair in a Claude Code `.mcp.json` for the
 * Cognigy MCP server. This finds it so the Logs page can offer a one-click
 * import — the VALUE is copied inside the service and never sent to the page.
 *
 * Claude Code keeps project-scoped servers in the project's own .mcp.json, not
 * in ~/.claude.json, so the file has to be hunted rather than read from one
 * known path: CDS_MCP_CONFIG if set, then ~/.claude.json's own mcpServers,
 * then a .mcp.json in each project folder ~/.claude.json remembers.
 */
function mcpCandidates() {
  const files = [];
  if (process.env.CDS_MCP_CONFIG) files.push(process.env.CDS_MCP_CONFIG);
  const home = os.homedir();
  const claudeJson = path.join(home, ".claude.json");
  files.push(claudeJson);
  try {
    const root = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
    Object.keys(root.projects || {}).forEach((p) => files.push(path.join(p, ".mcp.json")));
  } catch (e) { /* no config, or unreadable — the explicit paths still apply */ }
  files.push(path.join(process.cwd(), ".mcp.json"));
  return files;
}

/** @returns {{found: boolean, baseUrl: string, source: string, apiKey: string}} */
function findMcpCognigy() {
  const seen = {};
  const files = mcpCandidates();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || seen[file]) continue;
    seen[file] = true;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { continue; }
    // A .mcp.json has mcpServers at the root; ~/.claude.json has it at the root too.
    const servers = doc.mcpServers || {};
    const names = Object.keys(servers);
    for (let j = 0; j < names.length; j++) {
      const env = (servers[names[j]] || {}).env || {};
      const baseUrl = String(env.COGNIGY_API_BASE_URL || "").trim();
      const apiKey = String(env.COGNIGY_API_KEY || "").trim();
      if (baseUrl && apiKey) {
        return { found: true, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, source: file };
      }
    }
  }
  return { found: false, baseUrl: "", apiKey: "", source: "" };
}

/**
 * What the dashboard is allowed to see about a discovered config. The key is
 * deliberately absent — the page only ever learns that one exists.
 */
function discover() {
  const f = findMcpCognigy();
  return { found: f.found, baseUrl: f.baseUrl, source: f.source };
}

/*
 * Guess the management API host from an Endpoint URL, so a demo's own endpoint
 * fills the base URL in. Done as a PATTERN (endpoint-X -> api-X) rather than a
 * host allowlist, for the reason normalize.js gives: NiCE keeps adding branded
 * domains, and a hard-coded list quietly does nothing on a new one.
 */
function apiBaseFromEndpoint(endpointUrl) {
  try {
    const host = new URL(String(endpointUrl)).hostname;
    if (!/endpoint/i.test(host)) return "";
    return "https://" + host.replace(/endpoint/i, "api");
  } catch (e) { return ""; }
}

module.exports = {
  creds, get, projects, flows, tail, count, resolveProjectByToken,
  discover, findMcpCognigy, apiBaseFromEndpoint,
  WINDOWS, LEVELS
};
