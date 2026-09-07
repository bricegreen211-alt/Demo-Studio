/*
 * Cognigy Demo Studio Extension — panel page.
 * Extension-origin wrapper around the Demo Experience iframe. Being an
 * extension page keeps it exempt from the customer site's CSP, and the
 * microphone permission chain (page -> extension frame -> localhost frame)
 * flows through the allow attributes on both iframes.
 */
(function () {
  "use strict";

  var API = "http://localhost:41700";
  var params = new URLSearchParams(location.search);
  var slug = params.get("slug") || "";
  var name = params.get("name") || "Demo Experience";
  var agent = params.get("agent") || "";
  var panelStyle = params.get("style") || "solid";
  var chatUi = params.get("chatui") || "studio";

  document.getElementById("title").textContent = agent ? name + " — " + agent : name;

  // Which panel styles get the opaque title bar. Inverted into an allow-list on
  // purpose: a style added later then defaults to chromeless, so its failure
  // mode is a floating controls pill rather than a solid dark bar stranded over
  // a transparent panel.
  // Cognigy Webchat v3 draws its own header with its own close button, so the
  // panel adds no chrome at all in that mode — a second title bar above it is
  // exactly the "boxed inside Demo Studio" look this mode exists to avoid.
  var CHROMED = { solid: 1 };
  document.body.classList.add("style-" + panelStyle);
  if (chatUi === "webchat3" || !CHROMED[panelStyle]) document.body.classList.add("chromeless");
  if (chatUi === "webchat3") document.body.classList.add("chat-webchat3");

  var frame = document.getElementById("demo");
  var err = document.getElementById("err");

  // Confirm the studio is up before pointing the iframe at it, so the SE gets
  // a clear message instead of a browser error page.
  fetch(API + "/api/health").then(function (r) {
    if (!r.ok) throw new Error();
    frame.src = API + "/" + encodeURIComponent(slug) + "/";
  }).catch(function () {
    frame.style.display = "none";
    err.style.display = "block";
  });

  function tell(type) { parent.postMessage({ type: type }, "*"); }
  document.getElementById("close").addEventListener("click", function () { tell("CDS_PANEL_CLOSE"); });
  document.getElementById("min").addEventListener("click", function () { tell("CDS_PANEL_MIN"); });
  document.getElementById("full").addEventListener("click", function () { tell("CDS_PANEL_FULL"); });

  // Relay voice state from the Demo Experience up to the launcher (Voice Wave).
  window.addEventListener("message", function (ev) {
    if (ev.origin !== API || !frame.contentWindow || ev.source !== frame.contentWindow) return;
    var d = ev.data || {};
    if (d.type === "CDS_VOICE_STATE") parent.postMessage({ type: "CDS_VOICE_STATE", state: d.state }, "*");
    // Overlay mode: the demo owns its own size and open/closed state, so relay
    // those up to the content script that sizes the outer iframe.
    else if (d.type === "CDS_SIZE") parent.postMessage({ type: "CDS_SIZE", width: d.width, height: d.height }, "*");
    // Forward the size too: content.js reads d.width/d.height here, and
    // dropping them silently pinned every overlay demo to the fallback size
    // instead of the openSize its own Shell.tsx asked for.
    // `live` has to survive this hop or the drag-resize transition fix never
    // reaches content.js — the demo posts it, this is the only relay.
    else if (d.type === "CDS_OPEN") parent.postMessage({ type: "CDS_OPEN", open: !!d.open, width: d.width, height: d.height, live: !!d.live }, "*");
    // Webchat v3 mode: the host page reports where Cognigy's widget actually
    // is, as clip-path insets, so the content script can clip its full-size
    // transparent frame down to that and leave the rest of the page clickable.
    else if (d.type === "CDS_WC3_CLIP") parent.postMessage({
      type: "CDS_WC3_CLIP", open: !!d.open,
      top: d.top, right: d.right, bottom: d.bottom, left: d.left
    }, "*");
  });
})();
