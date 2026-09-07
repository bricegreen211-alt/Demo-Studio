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
 * That inner value has been seen as a bare string, as { message } holding a
 * string or an array of strings, and as { text } / { transcript }, so all of
 * them are read rather than picking one and hoping.
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

  /**
   * @returns {{role: "user"|"ai", text: string}|null}
   *   null for anything with no speech in it — an empty line rendered as a
   *   blank bubble is worse than no line at all.
   */
  function readTranscription(payload) {
    if (payload == null) return null;
    if (typeof payload === "string") {
      return payload.trim() ? { role: "ai", text: payload.trim() } : null;
    }

    var raw = payload.message;
    if (raw == null) raw = payload.text;
    if (raw == null) raw = payload.transcript;
    if (raw == null) raw = payload.utterance;
    if (raw == null) raw = payload.content;
    if (raw == null) raw = payload.transcription;

    var text = "";
    if (Array.isArray(raw)) text = raw.filter(Boolean).map(String).join(" ");
    else if (typeof raw === "string") text = raw;
    if (!text.trim()) return null;

    var who = String(
      payload.originator != null ? payload.originator :
      payload.role != null ? payload.role :
      payload.speaker != null ? payload.speaker :
      payload.participant != null ? payload.participant :
      payload.source != null ? payload.source : ""
    );
    // Default to the agent: Cognigy is the side sending these, so an
    // unlabelled line is far more likely to be its own speech than the
    // caller's.
    var role = /user|caller|human|local|customer/i.test(who) ? "user" : "ai";
    return { role: role, text: text.trim() };
  }

  return { readTranscription: readTranscription };
});
