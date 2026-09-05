/*
 * Cognigy Demo Studio — shared endpoint/URL normalization.
 * Ported from CognigyInjector v3.10 (cognigy-normalize.js).
 *
 * SEs paste whatever URL Cognigy hands them; these turn it into the exact
 * form the SDKs expect:
 *   - chat  : https://endpoint-<cluster>.cognigy.ai/<urlToken>
 *            (or https://cognigy-endpoint-<region>.nicecxone.com/<urlToken>
 *             on NiCE CXone-branded instances)
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

  /*
   * Chat. What an SE copies out of Cognigy is the *hosted webchat page*, which
   * is not what any SDK wants — they want the Endpoint URL that serves the
   * config JSON. The two differ only by hostname and the /v<n>/ segment:
   *
   *   Cognigy-hosted   https://webchat-trial-us.cognigy.ai/v3/<token>
   *                 -> https://endpoint-trial-us.cognigy.ai/<token>
   *
   *   NiCE CXone       https://cognigy-webchat-na1.nicecxone.com/v3/<token>
   *                 -> https://cognigy-endpoint-na1.nicecxone.com/<token>
   *
   * so one rule covers both: on any host containing "webchat", swap that word
   * for "endpoint" and drop the version segment. Handling this as a pattern
   * rather than a list of known hosts matters because NiCE keeps adding
   * branded domains — a hard-coded list quietly passes the webchat page URL
   * through instead, and the widget then fetches HTML where it expects JSON.
   */
  function chatEndpoint(url) {
    url = trimUrl(url);
    if (!url) return "";
    var hosted = url.match(/^(https?:\/\/[^/]*webchat[^/]*)\/v\d+\/([^/?#]+)/i);
    if (hosted) return hosted[1].replace(/webchat/i, "endpoint") + "/" + hosted[2];
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
          if (decodeURIComponent(kv[0]) !== "token") continue;
          /*
           * Everything after the first "=" is the token, cut at the next
           * delimiter. Splitting on "=" alone breaks on a doubled query
           * string — a real one from a copied hyperlink looked like
           *   ...?token=<hex>?user=test
           * which yielded "<hex>?user" and was handed to the SDK as if it
           * were the token. A bad token fails deep inside the widget with no
           * useful error, so it is worth being strict here.
           */
          token = decodeURIComponent(params[i].slice(params[i].indexOf("=") + 1).split(/[?&#]/)[0]);
          break;
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
