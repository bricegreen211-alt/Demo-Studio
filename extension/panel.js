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

  document.getElementById("title").textContent = agent ? name + " — " + agent : name;

  // Clear/phone panels paint no chrome of their own — see panel.html.
  document.body.classList.add("style-" + panelStyle);
  if (panelStyle === "clear" || panelStyle === "phone") {
    document.body.classList.add("chromeless");
  }

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
  });
})();
