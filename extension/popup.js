/*
 * Demo Studio Extension — popup.
 * Master on/off switch (nothing is injected anywhere while it's off), plus the
 * manual demo override for this browser. Demo state lives in the Studio
 * service; the switch is extension-local so it works even if the app is shut.
 */
(function () {
  "use strict";

  var API = "http://localhost:41700";
  var dot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var connected = document.getElementById("connected");
  var mapped = document.getElementById("mapped");
  var override = document.getElementById("override");
  var enabled = document.getElementById("enabled");
  var masterToggle = document.getElementById("masterToggle");
  var masterSub = document.getElementById("masterSub");

  document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;

  /*
   * One shape for every outcome: the verdict on its own line, then the
   * detail. Text nodes rather than innerHTML for anything that comes from a
   * demo name or the tab's hostname — neither is ours to trust as markup.
   */
  function verdict(line, detail, name) {
    mapped.textContent = "";
    var v = document.createElement("span");
    v.className = "verdict";
    v.textContent = line;
    var d = document.createElement("span");
    d.className = "detail";
    if (name) {
      var b = document.createElement("b");
      b.textContent = name;
      d.appendChild(b);
      d.appendChild(document.createTextNode(" " + detail));
    } else {
      d.textContent = detail;
    }
    mapped.appendChild(v);
    mapped.appendChild(d);
  }

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

  /* ---- master switch ---- */

  function paintMaster(on) {
    enabled.checked = on;
    masterToggle.classList.toggle("on", on);
    masterSub.textContent = on
      ? "On — demos appear on their mapped sites"
      : "Off — nothing is injected on any site";
    connected.classList.toggle("disabled", !on);
  }

  chrome.storage.local.get({ cdsEnabled: false }, function (s) { paintMaster(!!s.cdsEnabled); });

  masterToggle.addEventListener("click", function (ev) {
    ev.preventDefault();
    var next = !enabled.checked;
    paintMaster(next);
    chrome.storage.local.set({ cdsEnabled: next }, reloadTab);
  });

  /* ---- studio state ---- */

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

    currentTab(function (tab) {
      /*
       * Gate on the PROTOCOL, not just on there being a hostname. chrome:// URLs
       * have one — new URL("chrome://newtab").hostname is "newtab" — so testing
       * the hostname alone sends that off to /api/resolve and reports back "no
       * demo has newtab as its Website", which is nonsense to read on a new tab.
       * Only http(s) is a website a demo could be mapped to.
       */
      var host = "";
      try {
        var u = new URL(tab.url);
        if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname;
      } catch (e) { /* no URL at all on some internal tabs */ }
      if (!host) { verdict("Website Not Matched", "This tab isn't a website."); return; }
      fetch(API + "/api/resolve?host=" + encodeURIComponent(host))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          mapped.className = "row mapped";
          if (data.demo && data.via === "override") {
            /*
             * An override is not "this site" — it pins one demo to EVERY site
             * in this browser. It is the natural thing to reach for when a
             * demo has no Website set, and then it is easy to forget and find
             * the launcher on unrelated pages mid-meeting. So say what it
             * really does, and make clearing it one click.
             */
            mapped.className = "row mapped warn";
            verdict("Forced on every site",
                    "\u2014 shows on every site, not just its own.", data.demo.name);
            mapped.insertAdjacentHTML("beforeend",
              '<button type="button" id="clearOverride">Match by website instead</button>');
            mapped.querySelector("#clearOverride").addEventListener("click", function () {
              override.value = "";
              override.dispatchEvent(new Event("change"));
            });
          } else if (data.demo) {
            mapped.className = "row mapped ok";
            verdict("Website Match", "\u2014 this tab shows it.", data.demo.name);
          } else {
            verdict("Website Not Matched",
                    "No demo has " + host + " as its Website. Add it in Demo Studio, " +
                    "or force a demo below.");
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
  }).catch(function () {
    dot.className = "dot off";
    statusText.textContent = "Cognigy Demo Studio isn't running. Start the Demo Studio app and reopen this popup.";
  });
})();
