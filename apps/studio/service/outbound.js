/*
 * Cognigy Demo Studio — Outbound Trigger.
 * Contacts mini-CRM (contacts.json in the data dir) + the trigger that POSTs a
 * contact to the configured Cognigy Agent flow REST endpoint
 * (docs.cognigy.com → Deploy → REST endpoint: {userId, sessionId, text, data},
 * optional x-cognigy-endpoint-key header). The flow reads data.contact +
 * data.channel and places the outbound call / SMS / email.
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

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    throw new Error("Could not reach " + endpoint + " — " + String((err.cause && err.cause.message) || err.message || err));
  }
  const text = await res.text();
  if (!res.ok) throw new Error("Flow endpoint returned HTTP " + res.status + (text ? ": " + text.slice(0, 300) : ""));

  // Surface the flow's first text output (if any) so the SE sees confirmation.
  let flowReply = "";
  try {
    const parsed = JSON.parse(text);
    const stack = parsed.outputStack || [];
    for (const out of stack) {
      if (out && out.text) { flowReply = String(out.text).slice(0, 300); break; }
    }
    if (!flowReply && parsed.text) flowReply = String(parsed.text).slice(0, 300);
  } catch (e) { /* non-JSON response is fine */ }

  return { ok: true, sessionId, channel, contact: contact.name, flowReply };
}

module.exports = { list, create, update, remove, trigger };
