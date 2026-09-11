/*
 * Cognigy Demo Studio MCP bridge — the thin HTTP layer.
 *
 * Demo Studio's local service is a plain Express app on 127.0.0.1:41700 with
 * no auth, no token, no origin check — reachable freely from any local
 * process. That is the same trust boundary the dashboard and the browser
 * extension already rely on, so this bridge relies on it too rather than
 * inventing a credential nothing else in the app has.
 *
 * checkHealth() mirrors apps/studio/main.js's own probeHealth() exactly: same
 * endpoint, same three-way outcome (down / something-else-on-the-port / up),
 * because that is the one function in this whole project whose entire job is
 * "is this actually Demo Studio, right now" — reusing its judgement is safer
 * than re-deriving it.
 */
"use strict";

const BASE = "http://127.0.0.1:41700";
const APP_ID = "cognigy-demo-studio";

/**
 * @param {number} timeoutMs
 * @returns {Promise<{running:true, version:string} | {running:false, reason:"not_running"|"port_conflict"}>}
 */
async function checkHealth(timeoutMs) {
  try {
    const res = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(timeoutMs || 1500) });
    if (!res.ok) return { running: false, reason: "port_conflict" };
    const body = await res.json().catch(() => null);
    if (!body || body.app !== APP_ID) return { running: false, reason: "port_conflict" };
    return { running: true, version: body.version };
  } catch (err) {
    // Connection refused, DNS failure, or the AbortSignal timeout firing all
    // land here — every one of them means "nothing answered," which on a
    // fixed localhost port means the app isn't running.
    return { running: false, reason: "not_running" };
  }
}

/**
 * One JSON round-trip against the service. Throws on any non-2xx response,
 * with the server's own error message (server.js's fail() helper always
 * sends {error:"<message>"} — that text is already meant for a human, so it
 * is surfaced as-is rather than wrapped).
 */
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || ("Demo Studio returned HTTP " + res.status));
  }
  return data;
}

module.exports = { BASE, checkHealth, api };
