/*
 * Cognigy Demo Studio — Outbound Trigger.
 * Contacts mini-CRM (contacts.json in the data dir) + the trigger that starts
 * an outbound call. Two paths, chosen by settings.outbound.mode:
 *
 *   "vg"    POST straight to the Voice Gateway Calls API
 *           (docs.cognigy.com/voice-gateway/creating-outbound-calls). VG dials,
 *           and application_sid decides which flow runs once the call connects.
 *           Nothing has to be wired inside the flow for the phone to ring.
 *
 *   "flow"  POST the contact to the Agent flow's REST endpoint
 *           ({userId, sessionId, text, data}, optional x-cognigy-endpoint-key)
 *           and let the flow do the dialling itself.
 *
 * The distinction is the thing people lose a day to: posting to a flow endpoint
 * runs the flow as a TEXT conversation. A flow that answers "may I speak with
 * Alex Morgan?" there has matched its branch and produced its script perfectly
 * — and no phone has rung, because nothing asked Voice Gateway to dial.
 */
const fs = require("fs");
const path = require("path");
const { DATA_ROOT, ensureDirs } = require("./paths");
const normalize = require("../../../packages/shared/normalize");

const CONTACTS_FILE = path.join(DATA_ROOT, "contacts.json");

function readContacts() {
  try { return JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf8")).contacts || []; }
  catch (e) { return []; }
}

function writeContacts(contacts) {
  ensureDirs();
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify({ contacts }, null, 2));
}

function sanitizeContact(input) {
  input = input || {};
  return {
    name: String(input.name || "").slice(0, 120),
    phone: String(input.phone || "").slice(0, 40),
    sms: String(input.sms || "").slice(0, 40),
    email: String(input.email || "").slice(0, 160)
  };
}

function genId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function list() { return readContacts(); }

function create(input) {
  const contacts = readContacts();
  const contact = Object.assign({ id: genId() }, sanitizeContact(input));
  contacts.push(contact);
  writeContacts(contacts);
  return contact;
}

function update(id, input) {
  const contacts = readContacts();
  const i = contacts.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Contact not found");
  contacts[i] = Object.assign({ id }, sanitizeContact(Object.assign({}, contacts[i], input)));
  writeContacts(contacts);
  return contacts[i];
}

function remove(id) {
  writeContacts(readContacts().filter((c) => c.id !== id));
}

function rand(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const CHANNELS = ["voice", "sms", "email"];

async function trigger(settings, id, channel) {
  if (CHANNELS.indexOf(channel) < 0) throw new Error("Unknown channel: " + channel);
  const contact = readContacts().find((c) => c.id === id);
  if (!contact) throw new Error("Contact not found");

  const cfg = settings.outbound || {};
  if (cfg.mode === "vg") return callViaVoiceGateway(cfg, contact, channel);

  const endpoint = normalize.chatEndpoint(cfg.endpointUrl || "");
  if (!endpoint) throw new Error("No Flow REST Endpoint configured — paste your Agent flow's REST endpoint URL and Save.");

  const sessionId = rand("cds-outbound");
  const body = {
    userId: rand("cds-remote"),
    sessionId,
    text: "",
    data: {
      trigger: "outboundDemo",
      channel,
      contact: { name: contact.name, phone: contact.phone, sms: contact.sms, email: contact.email }
    }
  };
  const headers = { "Content-Type": "application/json" };
  if (cfg.endpointKey) headers["x-cognigy-endpoint-key"] = cfg.endpointKey;

  /*
   * Everything the SE needs to see when the flow answers but no call happens —
   * which is the usual way this goes wrong, because Demo Studio only TRIGGERS
   * the flow and the flow is what places the call. Without this the only
   * evidence is the flow's first line of text, which cannot distinguish "my
   * branch never matched" from "my branch matched and the dial step failed".
   *
   * Never the key itself, only whether one was sent. It is a credential, and
   * this is rendered into the page.
   */
  const debug = {
    endpoint,
    keySent: !!cfg.endpointKey,
    request: body,
    status: null,
    ms: 0,
    response: ""
  };

  const started = Date.now();
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    debug.ms = Date.now() - started;
    return {
      ok: false,
      error: "Could not reach " + endpoint + " — " +
             String((err.cause && err.cause.message) || err.message || err),
      debug
    };
  }
  debug.ms = Date.now() - started;
  debug.status = res.status;

  const text = await res.text();
  debug.response = text.slice(0, 4000);

  if (!res.ok) {
    return {
      ok: false,
      error: "Flow endpoint returned HTTP " + res.status +
             (res.status === 401 || res.status === 403
               ? " — the Endpoint Key is wrong, or this endpoint requires one and none was sent."
               : ""),
      debug
    };
  }

  /*
   * The flow's first text output, shown as confirmation. Also the first
   * diagnosis: a conversational greeting here means the flow took its normal
   * path, so data.trigger never matched and nothing was ever asked to dial.
   */
  let flowReply = "";
  let outputs = 0;
  try {
    const parsed = JSON.parse(text);
    const stack = parsed.outputStack || [];
    outputs = stack.length;
    for (const out of stack) {
      if (out && out.text) { flowReply = String(out.text).slice(0, 300); break; }
    }
    if (!flowReply && parsed.text) flowReply = String(parsed.text).slice(0, 300);
  } catch (e) { /* non-JSON response is fine */ }
  debug.outputs = outputs;

  return { ok: true, sessionId, channel, contact: contact.name, flowReply, debug };
}

/*
 * Voice Gateway places the call itself. Everything below comes from the VG
 * Self-Service Portal, and none of it is the flow's REST endpoint or its
 * endpoint key — mixing those two up is the whole reason this mode exists.
 */
async function callViaVoiceGateway(cfg, contact, channel) {
  if (channel !== "voice") {
    throw new Error("Voice Gateway places calls only. Switch to the Agent flow path for " + channel + ".");
  }
  const missing = [];
  if (!cfg.vgBaseUrl) missing.push("API Base URL");
  if (!cfg.vgAccountSid) missing.push("Account SID");
  if (!cfg.vgApiKey) missing.push("API Key");
  if (!cfg.vgApplicationSid) missing.push("Application SID");
  if (!cfg.vgFrom) missing.push("From number");
  if (missing.length) throw new Error("Voice Gateway is missing: " + missing.join(", ") + ".");
  if (!contact.phone) throw new Error(contact.name + " has no telephone number.");

  const url = String(cfg.vgBaseUrl).replace(/\/+$/, "") +
    "/v1/Accounts/" + encodeURIComponent(cfg.vgAccountSid) + "/Calls";
  const to = { type: "phone", number: contact.phone };
  // Optional: single-carrier accounts resolve their own trunk.
  if (cfg.vgTrunk) to.trunk = cfg.vgTrunk;
  const body = {
    application_sid: cfg.vgApplicationSid,
    from: cfg.vgFrom,
    callerName: contact.name || undefined,
    to
  };

  // Same debug shape the flow path returns, so the UI renders one thing. The
  // API key is a credential and never goes in it — only whether one was sent.
  const debug = { endpoint: url, keySent: true, request: body, status: null, ms: 0, response: "" };
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.vgApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    debug.ms = Date.now() - started;
    return { ok: false, error: "Could not reach " + url + " — " +
      String((err.cause && err.cause.message) || err.message || err), debug };
  }
  debug.ms = Date.now() - started;
  debug.status = res.status;
  const text = await res.text();
  debug.response = text.slice(0, 4000);

  if (!res.ok) {
    return {
      ok: false,
      error: "Voice Gateway returned HTTP " + res.status +
        (res.status === 401 || res.status === 403
          ? " — the API Key is wrong. It is an ACCOUNT-level key from the VG Self-Service Portal, not the flow's Endpoint Key."
          : res.status === 404
            ? " — check the Account SID and the API Base URL for your region."
            : ""),
      debug
    };
  }

  // VG answers with the call it created; its sid is what to quote in support.
  let callSid = "";
  try { callSid = String(JSON.parse(text).sid || ""); } catch (e) { /* non-JSON is fine */ }
  return { ok: true, via: "vg", callSid, channel, contact: contact.name, debug };
}

module.exports = { list, create, update, remove, trigger };
