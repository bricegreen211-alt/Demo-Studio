/*
 * Cognigy Demo Studio — turn Cognigy log entries into a clean transcript.
 *
 * Shared by the service (which serves the .txt download) and the dashboard's
 * Logs page, so the conversation an SE reads on screen and the one they send to
 * a customer can never disagree.
 *
 * ── THE DUPLICATE PROBLEM, WHICH IS THE WHOLE REASON THIS FILE EXISTS ──────
 *
 * Cognigy logs every utterance TWO OR THREE TIMES. Measured against a live
 * trial project, one user saying "Hi" produced:
 *
 *   info   [Webchat3] Received 'user' message        meta.text = "Hi"
 *   info   Received message from user                meta.text = "Hi"
 *   debug  Finished processing message from user     meta.text = "Hi"
 *
 * and one agent reply produced:
 *
 *   info   [Webchat3] Sending output to user         meta.text = "Hi! I'm ..."
 *   info   Sent output to Endpoint                   meta.text = "Hi! I'm ..."
 *
 * So "every entry with a meta.text" is not a transcript — it is the same
 * conversation stuttered three times. The rule below keeps only the CANONICAL
 * un-prefixed pair and throws away every channel-prefixed variant and the
 * `Finished processing` echo. On the session this was derived from, 57 raw
 * entries reduced to 4 correct turns.
 *
 * Both canonical messages are `info`, which is why callers can safely ask the
 * API for type=info only and still get a complete transcript.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CDSLogTranscript = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /*
   * Matched EXACTLY, not with indexOf. "[Webchat3] Received 'user' message"
   * must not match, or the stutter comes straight back. Anchored strings
   * rather than a regex so there is nothing to get subtly wrong later.
   */
  var HUMAN_MSG = "Received message from user";
  var AGENT_MSG = "Sent output to Endpoint";

  /** The channel/endpoint-prefixed twins, kept only to explain the exclusion. */
  var KNOWN_DUPLICATES = [
    "Finished processing message from user",
    "[Webchat3] Received 'user' message",
    "[Webchat3] Sending output to user",
    "[Socket] Received 'user' message",
    "[Socket] Sending output to user",
    "[Rest] Received message from user",
    "[Rest] Successfully sent message to user"
  ];

  function roleOf(msg) {
    if (msg === HUMAN_MSG) return "user";
    if (msg === AGENT_MSG) return "ai";
    return null;
  }

  function metaOf(entry) {
    return (entry && entry.meta) || {};
  }

  /** The log level, which moved into `metadata` on the v2 log model. */
  function levelOf(entry) {
    if (!entry) return "";
    if (entry.metadata && entry.metadata.type) return String(entry.metadata.type);
    return String(entry.type || "");
  }

  function msOf(entry) {
    var t = Date.parse((entry && entry.timestamp) || "");
    return isNaN(t) ? 0 : t;
  }

  /*
   * Oldest-first. The tail endpoint returns newest-first, and _id breaks ties
   * because several entries routinely share a timestamp to the second.
   */
  function chronological(entries) {
    return (entries || []).slice().sort(function (a, b) {
      var d = msOf(a) - msOf(b);
      if (d) return d;
      return String((a && a._id) || "").localeCompare(String((b && b._id) || ""));
    });
  }

  /**
   * Log entries -> conversation turns.
   *
   * @param {Array} entries raw log entries from /v2.1/projects/:id/logs/tail
   * @param {{sessionId?: string}} [opts] restrict to one session
   * @returns {Array<{role: "user"|"ai", text: string, at: string, ts: number, sessionId: string}>}
   */
  function readEntries(entries, opts) {
    var only = (opts && opts.sessionId) || "";
    var out = [];
    chronological(entries).forEach(function (e) {
      var meta = metaOf(e);
      if (only && meta.sessionId !== only) return;
      var role = roleOf(String((e && e.msg) || ""));
      if (!role) return;
      var text = meta.text;
      if (typeof text !== "string") return;
      text = text.trim();
      if (!text) return;
      /*
       * Backstop for anything the exact-match rule misses — a channel we have
       * not seen, or Cognigy genuinely re-sending. Same guard as appendLine()
       * in remote.js and pushLine() in the templates' useCognigyVoice.ts.
       */
      var last = out[out.length - 1];
      if (last && last.role === role && last.text === text) return;
      out.push({
        role: role,
        text: text,
        at: String(e.timestamp || ""),
        ts: msOf(e),
        sessionId: String(meta.sessionId || "")
      });
    });
    return out;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** "20:40:36" in the reader's own timezone, from an ISO timestamp. */
  function clock(at) {
    var d = new Date(at);
    if (isNaN(d.getTime())) return "--:--:--";
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  /**
   * "17 Sep 20:40:36". Date AND time, because a 12-hour window straddles
   * midnight and "20:40" alone then reads as today when it was yesterday —
   * and a transcript pasted into a ticket has to say which day it happened.
   */
  function stamp(at) {
    var d = new Date(at);
    if (isNaN(d.getTime())) return "--";
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + clock(at);
  }

  /** "17 Sep 2026" — for a transcript header, where the date is said once. */
  function day(at) {
    var d = new Date(at);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  /**
   * Turns -> the plain text an SE copies or downloads. Timestamp, speaker,
   * utterance. Deliberately nothing else: no ids, no levels, no metadata —
   * this is the artefact that goes into a ticket or to a customer.
   *
   * @param {Array} lines from readEntries()
   * @param {{agentName?: string, header?: string}} [opts]
   */
  function toText(lines, opts) {
    var agent = (opts && opts.agentName) || "Agent";
    var list = lines || [];
    var body = list.map(function (l) {
      return "[" + clock(l.at) + "] " + (l.role === "user" ? "User" : agent) + ": " + l.text;
    });
    /*
     * The date goes in the header, once, rather than on every line: a reader
     * needs to know WHICH DAY, and repeating it 40 times just pushes the
     * conversation off the right of the page.
     */
    var header = [];
    if (opts && opts.header) header.push(opts.header);
    if (list.length) header.push(day(list[0].at));
    if (header.length) header.push("");
    return header.concat(body).join("\n") + (body.length ? "\n" : "");
  }

  /**
   * Group raw entries into one row per conversation, newest conversation first.
   * The Logs page renders each of these as a .demo-row, so an SE who does not
   * know a session ID — which is nearly always — can still pick the right one.
   *
   * `turns` counts real transcript turns, not log entries, so the number on
   * screen matches what the transcript will contain.
   *
   * @returns {Array<{sessionId, userId, flowName, channel, firstAt, lastAt, turns, errors, entries}>}
   */
  function sessions(entries) {
    var byId = {};
    var order = [];
    chronological(entries).forEach(function (e) {
      var meta = metaOf(e);
      var id = String(meta.sessionId || "");
      if (!id) return;                       // service chatter with no conversation attached
      if (!byId[id]) {
        byId[id] = {
          sessionId: id, userId: "", flowName: "", channel: "",
          firstAt: e.timestamp, lastAt: e.timestamp, turns: 0, errors: 0, entries: []
        };
        order.push(id);
      }
      var s = byId[id];
      s.entries.push(e);
      s.lastAt = e.timestamp;
      // These appear on some entries and not others, so take the first non-empty.
      if (!s.userId && meta.userId) s.userId = String(meta.userId);
      if (!s.flowName && meta.flowName) s.flowName = String(meta.flowName);
      if (!s.channel && (meta.channel || meta.endpointType)) s.channel = String(meta.channel || meta.endpointType);
      var lvl = levelOf(e);
      if (lvl === "error" || lvl === "fatal") s.errors++;
    });
    return order.map(function (id) {
      var s = byId[id];
      s.turns = readEntries(s.entries).length;
      return s;
    }).sort(function (a, b) { return Date.parse(b.lastAt) - Date.parse(a.lastAt); });
  }

  return {
    readEntries: readEntries,
    toText: toText,
    sessions: sessions,
    clock: clock,
    stamp: stamp,
    day: day,
    levelOf: levelOf,
    HUMAN_MSG: HUMAN_MSG,
    AGENT_MSG: AGENT_MSG,
    KNOWN_DUPLICATES: KNOWN_DUPLICATES
  };
});
