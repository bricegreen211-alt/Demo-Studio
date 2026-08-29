/*
 * Cognigy Demo Studio — shared endpoint/URL normalization.
 * Ported from CognigyInjector v3.10 (cognigy-normalize.js).
 *
 * SEs paste whatever URL Cognigy hands them; these turn it into the exact
 * form the SDKs expect:
 *   - chat  : https://endpoint-<cluster>.cognigy.ai/<urlToken>
 *   - voice : https://endpoint-<cluster>.cognigy.ai/<hex token>
 *
 * Written as a UMD-ish module so the same file works in Node (studio service),
 * the extension (classic script -> window.CognigyNormalize), and Vite bundles.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CognigyNormalize = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function trimUrl(url) {
    return String(url == null ? "" : url).trim().replace(/\/+$/, "");
  }

  var DEFAULT_CLUSTER = "trial-us";

  // Chat: hosted "webchat-<cluster>.../v3/<id>" -> endpoint URL; else as-is / bare id.
  function chatEndpoint(url) {
    url = trimUrl(url);
    if (!url) return "";
    var hosted = url.match(/^https?:\/\/webchat-([a-z0-9-]+)\.cognigy\.ai\/v3\/([^/?#]+)/i);
    if (hosted) return "https://endpoint-" + hosted[1] + ".cognigy.ai/" + hosted[2];
    if (/^https?:\/\//i.test(url)) return url;
    return "https://endpoint-" + DEFAULT_CLUSTER + ".cognigy.ai/" + url.replace(/^\/+/, "");
  }

  // Voice: accept the standalone widget link, the endpoint URL, or a bare token.
  //   https://static-<cluster>.cognigy.ai/webrtc/?token=<hex> -> https://endpoint-<cluster>.cognigy.ai/<hex>
  function voiceEndpoint(url) {
    url = trimUrl(url);
    if (!url) return "";
    var staticLink = url.match(/^https?:\/\/static-([a-z0-9-]+)\.cognigy\.ai\/webrtc\/?/i);
    if (staticLink) {
      var token = "";
      var q = url.indexOf("?");
      if (q >= 0) {
        var params = url.slice(q + 1).split("&");
        for (var i = 0; i < params.length; i++) {
          var kv = params[i].split("=");
          if (decodeURIComponent(kv[0]) === "token") { token = decodeURIComponent(kv[1] || ""); break; }
        }
      }
      if (token) return "https://endpoint-" + staticLink[1] + ".cognigy.ai/" + token;
    }
    if (/^https?:\/\//i.test(url)) return url;
    return "https://endpoint-" + DEFAULT_CLUSTER + ".cognigy.ai/" + url.replace(/^\/+/, "");
  }

  // Split an endpoint URL into what @cognigy/socket-client wants:
  //   new SocketClient(baseUrl, urlToken)
  function splitEndpoint(endpointUrl) {
    endpointUrl = trimUrl(endpointUrl);
    if (!endpointUrl) return null;
    try {
      var u = new URL(endpointUrl);
      var token = u.pathname.replace(/^\/+|\/+$/g, "");
      if (!token) return null;
      return { baseUrl: u.origin, urlToken: token };
    } catch (e) {
      return null;
    }
  }

  // Extract the hostname from whatever the SE typed (full URL, bare domain, with path).
  function hostOf(url) {
    url = String(url == null ? "" : url).trim();
    if (!url) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = "https://" + url;
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // Does the page host belong to the configured website's domain?
  // True when equal or a subdomain (foo.site.com matches site.com). Blank config = no match
  // (unlike the old injector, Demo Studio requires an explicit mapping or manual override).
  function matchesDomain(configuredUrl, pageHostname) {
    var want = hostOf(configuredUrl);
    if (!want) return false;
    var have = String(pageHostname || "").toLowerCase().replace(/^www\./, "");
    return have === want || have.endsWith("." + want);
  }

  return {
    chatEndpoint: chatEndpoint,
    voiceEndpoint: voiceEndpoint,
    splitEndpoint: splitEndpoint,
    hostOf: hostOf,
    matchesDomain: matchesDomain
  };
});
