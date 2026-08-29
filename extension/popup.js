/*
 * Cognigy Demo Studio Extension — popup.
 * Status + manual demo override (SOW §17) + Presentation Mode toggle.
 * All state lives in the Studio service; the popup is a thin remote control.
 */
(function () {
  "use strict";

  var API = "http://localhost:41700";
  var dot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var connected = document.getElementById("connected");
  var mapped = document.getElementById("mapped");
  var override = document.getElementById("override");
  var presentation = document.getElementById("presentation");

  document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;

  function currentTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      cb(tabs && tabs[0] ? tabs[0] : null);
    });
  }

  function reloadTab() {
    currentTab(function (tab) { if (tab && tab.id != null) chrome.tabs.reload(tab.id); });
  }

  document.getElementById("openStudio").addEventListener("click", function () {
    chrome.tabs.create({ url: API + "/" });
  });

  Promise.all([
    fetch(API + "/api/health").then(function (r) { return r.json(); }),
    fetch(API + "/api/demos").then(function (r) { return r.json(); }),
    fetch(API + "/api/settings").then(function (r) { return r.json(); })
  ]).then(function (results) {
    var demos = results[1].demos || [];
    var settings = results[2];

    dot.className = "dot on";
    statusText.style.display = "none";
    connected.style.display = "block";

    demos.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      if (settings.overrideDemoId === d.id) opt.selected = true;
      override.appendChild(opt);
    });
    presentation.checked = !!settings.presentationMode;

    currentTab(function (tab) {
      var host = "";
      try { host = new URL(tab.url).hostname; } catch (e) {}
      if (!host) { mapped.textContent = "No website in this tab."; return; }
      fetch(API + "/api/resolve?host=" + encodeURIComponent(host))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.demo) {
            mapped.innerHTML = "This site shows <b></b>" + (data.via === "override" ? " (manual override)" : "");
            mapped.querySelector("b").textContent = data.demo.name;
          } else {
            mapped.textContent = "No demo mapped to " + host + ". Pick one below or set the demo's Website in Demo Studio.";
          }
        })
        .catch(function () { mapped.textContent = ""; });
    });

    override.addEventListener("change", function () {
      fetch(API + "/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideDemoId: override.value || null })
      }).then(reloadTab);
    });

    presentation.addEventListener("change", function () {
      fetch(API + "/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentationMode: presentation.checked })
      }).then(reloadTab);
    });
  }).catch(function () {
    dot.className = "dot off";
    statusText.textContent = "Cognigy Demo Studio isn't running. Start the Demo Studio app and reopen this popup.";
  });
})();
