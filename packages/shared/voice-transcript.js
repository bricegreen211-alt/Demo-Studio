/*
 * Reading a Cognigy transcription payload.
 *
 * Shared because there are now two places that consume it — the demo templates
 * and Remote Control — and they must not drift: this is the one piece of the
 * voice path that guesses at a shape Cognigy does not document.
 *
 * What the SDK actually does (@cognigy/click-to-call-sdk 0.0.7, handleNewInfo):
 * a SIP INFO whose JSON body carries "_transcription" is emitted as a
 * "transcription" event with the INNER value only — so the outer envelope,
 * including any originator field on it, never arrives. Everything else in a
 * SIP INFO body is emitted as "infoReceived", which is also where mid-call
 * cards and xApp payloads come through.
 *
 * The shape of that inner value was guessed at before and guessed wrong, so
 * nothing ever rendered. It is read off Cognigy's own widget now, whose
 * handler is unambiguous:
 *
 *   client.on("transcription", p => p.messages.map(m => ({ text: m.text,
 *                                                          originator: p.originator })))
 *
 * so it is  { originator: "bot" | "user", messages: [ { text }, ... ] }  —
 * "messages" plural, holding OBJECTS, with the speaker on the envelope rather
 * than on each line. The old reader looked for "message" singular and would
 * have stringified those objects to "[object Object]" had it found them.
 *
 * One event can carry several messages, and the widget de-duplicates by text +
 * originator within a second — so Cognigy does re-send lines, and this returns
 * a LIST for the caller to append with that in mind.
 */
/*
 * Same UMD shape as normalize.js — assign BOTH, don't choose. Under Vite the
 * `module` check is false, so an either/or wrapper would leave the ESM import
 * with nothing; in the dashboard there is no bundler and only the global
 * exists. normalize.js is already imported by the templates this way, so this
 * is the pattern that is known to work in both.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CDSVoiceTranscript = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function textOf(v, depth) {
    if (depth > 4 || v == null) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) {
        var t = textOf(v[i], depth + 1);
        if (t) parts.push(t);
      }
      return parts.join(" ");
    }
    if (typeof v === "object") {
      var inner = v.text != null ? v.text
        : v.message != null ? v.message
        : v.transcript != null ? v.transcript
        : v.utterance != null ? v.utterance
        : v.content;
      return textOf(inner, depth + 1);
    }
    return "";
  }

  function roleOf(payload) {
    var who = String(
      payload.originator != null ? payload.originator :
      payload.role != null ? payload.role :
      payload.speaker != null ? payload.speaker :
      payload.participant != null ? payload.participant :
      payload.source != null ? payload.source : ""
    );
    /*
     * Cognigy sends "bot" for the agent and "user" for the caller — the
     * widget switches on exactly `"bot" === originator`. The wider pattern is
     * kept for the other names the same field has appeared under, and an
     * unlabelled line defaults to the agent, since Cognigy is the side
     * sending these.
     */
    return /^(user|caller|human|local|customer)$/i.test(who) ? "user" : "ai";
  }

  /**
   * @returns {Array<{role: "user"|"ai", text: string}>}
   *   One entry per message. Empty array for anything with no speech in it —
   *   a blank line rendered as an empty bubble is worse than no line.
   */
  function readTranscription(payload) {
    if (payload == null) return [];
    if (typeof payload === "string") {
      var only = payload.trim();
      return only ? [{ role: "ai", text: only }] : [];
    }
    if (typeof payload !== "object") return [];

    var role = roleOf(payload);
    var out = [];

    // The real shape first: one entry per message, so a line is not merged
    // with the next one just because they arrived together.
    if (Array.isArray(payload.messages)) {
      for (var i = 0; i < payload.messages.length; i++) {
        var t = textOf(payload.messages[i], 0);
        if (t) out.push({ role: role, text: t });
      }
      return out;
    }

    // Everything else collapses to a single line.
    var single = textOf(
      payload.message != null ? payload.message :
      payload.text != null ? payload.text :
      payload.transcript != null ? payload.transcript :
      payload.utterance != null ? payload.utterance :
      payload.content != null ? payload.content :
      payload.transcription, 0);
    return single ? [{ role: role, text: single }] : [];
  }

  return { readTranscription: readTranscription };
});
