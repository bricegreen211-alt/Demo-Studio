/*
 * Cognigy Demo Studio — in-page dialogs.
 *
 * WHY THIS EXISTS: Electron does not implement window.prompt(). It throws
 * "prompt() is and will not be supported" and the calling handler dies on the
 * spot — which is exactly what made "+ New Folder", "Rename folder" and
 * "Duplicate" do nothing at all inside the desktop app while working fine at
 * http://localhost:41700 in a real browser. Delete kept working because
 * confirm() IS implemented, which is what made the bug look random.
 *
 * So: never call prompt() in this dashboard. Call CDSDialog.prompt(), which
 * resolves to the string the SE typed, or null if they cancelled.
 *
 * confirm() is deliberately left alone throughout the app — Electron supports
 * it, and replacing every one of them would be churn with no fix in it.
 */
(function (root) {
  "use strict";

  /**
   * @param {{title?:string, label?:string, value?:string, placeholder?:string,
   *          okLabel?:string, maxLength?:number}} opts
   * @returns {Promise<string|null>} the trimmed value, or null on cancel.
   */
  function promptDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var previouslyFocused = document.activeElement;

      var wrap = document.createElement("div");
      wrap.className = "modal";
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-modal", "true");

      var card = document.createElement("div");
      card.className = "modal-card";

      var head = document.createElement("h3");
      head.textContent = opts.title || "";
      card.appendChild(head);

      var field = document.createElement("label");
      field.className = "setting-field";
      field.appendChild(document.createTextNode(opts.label || ""));

      var input = document.createElement("input");
      input.type = "text";
      input.value = opts.value == null ? "" : String(opts.value);
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (opts.maxLength) input.maxLength = opts.maxLength;
      field.appendChild(input);
      card.appendChild(field);

      var actions = document.createElement("div");
      actions.className = "modal-actions";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "ghost";
      cancelBtn.textContent = "Cancel";
      var okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "primary";
      okBtn.textContent = opts.okLabel || "OK";
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      card.appendChild(actions);

      wrap.appendChild(card);
      document.body.appendChild(wrap);

      var settled = false;
      function close(value) {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        // Put focus back where it was, or the row the SE clicked loses it.
        try { if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus(); } catch (e) {}
        resolve(value);
      }
      function submit() {
        var v = input.value.trim();
        close(v ? v : null);
      }
      function onKey(ev) {
        if (ev.key === "Escape") { ev.preventDefault(); close(null); }
        else if (ev.key === "Enter" && ev.target === input) { ev.preventDefault(); submit(); }
      }

      okBtn.addEventListener("click", submit);
      cancelBtn.addEventListener("click", function () { close(null); });
      wrap.addEventListener("click", function (ev) { if (ev.target === wrap) close(null); });
      document.addEventListener("keydown", onKey, true);

      input.focus();
      input.select();
    });
  }

  root.CDSDialog = { prompt: promptDialog };
})(window);
