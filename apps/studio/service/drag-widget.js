/*
 * Cognigy Demo Studio — drag a Cognigy widget out of the way.
 *
 * Shared by the two Studio-owned host pages that mount one of Cognigy's real
 * widgets: webchat3.js (Webchat v3) and webrtc.js (click-to-call). Both put a
 * full-viewport transparent frame on the customer's page and clip it to
 * whatever the widget paints, and both pin that widget to a corner Cognigy
 * chooses.
 *
 * That corner is not always free. forthepeople.com holds a "TEXT US" tab
 * against the right edge, on top of the panel, and it wins even against the
 * browser's top layer — so there is no stacking trick left to try. Being able
 * to nudge the widget is the fix that does not depend on out-ranking somebody
 * else's widget at all.
 *
 * Deliberately invisible: no grip, no handle, nothing drawn over the widget.
 * Anything this adds is something a customer sees during the demo, and these
 * modes exist to look exactly like the customer's own deployment. The SE drags
 * it; nobody else can tell it is draggable.
 *
 * The offset is published as --cds-drag-x/y on <html>, and each host page's
 * stylesheet decides which elements consume it. That indirection matters: the
 * widgets rebuild their own subtrees (Webchat v3 swaps the whole thing between
 * launcher and window), so an inline transform would be thrown away on the
 * first toggle. A transform rather than left/top keeps Cognigy's own anchoring
 * completely intact — clear the variables and the widget is exactly where it
 * always was — and getBoundingClientRect() still reports the moved box, which
 * is what lets each page's existing clip measurement follow it for free.
 */
(function (root) {
  "use strict";

  var SLOP = 4;              // movement under this is a click, not a drag
  var KEEP_ON_SCREEN = 60;   // never let the widget be dragged fully off

  function noop() {}

  /**
   * @param {object} opts
   *   enabled    {boolean}   false disables everything (solid/drawer mode)
   *   key        {string}    storage key suffix; one saved position per demo
   *   targets    {function}  () => [{ el, zoneHeight }] — the grabbable pieces,
   *                          in priority order. zoneHeight limits the grab to
   *                          that many pixels from the element's top edge (a
   *                          title-bar strip); omit it to grab the whole thing.
   *   remeasure  {function}  called on every move, so the clip tracks the drag
   *                          instead of trailing the host page's own interval
   *   log        {function}  optional
   */
  function enable(opts) {
    if (!opts || opts.enabled === false) return;

    var targets = opts.targets || function () { return []; };
    var remeasure = opts.remeasure || noop;
    var log = opts.log || noop;
    var storeKey = "cds-widget-pos:" + (opts.key || location.pathname);

    var offset = load();
    apply(offset);
    if (offset.x || offset.y) log("restored position", offset);

    function load() {
      try {
        var raw = JSON.parse(localStorage.getItem(storeKey) || "null");
        if (raw && isFinite(raw.x) && isFinite(raw.y)) return { x: raw.x, y: raw.y };
      } catch (e) { /* private mode, or someone else's key */ }
      return { x: 0, y: 0 };
    }

    function apply(off) {
      var s = document.documentElement.style;
      s.setProperty("--cds-drag-x", Math.round(off.x) + "px");
      s.setProperty("--cds-drag-y", Math.round(off.y) + "px");
    }

    function save(off) {
      try {
        if (!off.x && !off.y) localStorage.removeItem(storeKey);
        else localStorage.setItem(storeKey, JSON.stringify({ x: Math.round(off.x), y: Math.round(off.y) }));
      } catch (e) { /* the position just won't survive a reload */ }
    }

    /* Which piece, if any, is under this pointer. */
    function grabbed(ev) {
      var list = targets() || [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t || !t.el) continue;
        var r = t.el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        var bottom = t.zoneHeight ? Math.min(r.bottom, r.top + t.zoneHeight) : r.bottom;
        if (ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top && ev.clientY <= bottom) return t.el;
      }
      return null;
    }

    /* Keep a usable corner of the widget on screen whatever the drag asks for. */
    function clamp(off) {
      var list = targets() || [];
      var el = null;
      for (var i = 0; i < list.length && !el; i++) {
        if (list[i] && list[i].el && list[i].el.getBoundingClientRect().width > 0) el = list[i].el;
      }
      if (!el) return off;
      var r = el.getBoundingClientRect();
      // r already includes the live offset, so back it out to get the origin.
      var left = r.left - offset.x, top = r.top - offset.y;
      return {
        x: Math.max(KEEP_ON_SCREEN - (left + r.width),
                    Math.min(window.innerWidth - KEEP_ON_SCREEN - left, off.x)),
        y: Math.max(-top,
                    Math.min(window.innerHeight - KEEP_ON_SCREEN - top, off.y))
      };
    }

    document.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      if (!grabbed(ev)) return;

      // screenX/screenY, not clientX/clientY: the element being measured moves
      // under the cursor mid-drag, so client coordinates chase a moving origin.
      // Same reasoning as Halo's resize grip.
      var start = { x: ev.screenX, y: ev.screenY };
      var from = { x: offset.x, y: offset.y };
      var moved = false;

      function move(e) {
        var dx = e.screenX - start.x, dy = e.screenY - start.y;
        if (!moved && Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        moved = true;
        offset = clamp({ x: from.x + dx, y: from.y + dy });
        apply(offset);
        remeasure();
      }

      function up() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!moved) return;   // a plain click: leave it entirely alone
        save(offset);
        log("moved to", offset);

        /*
         * Swallow the click this drag ends with, or letting go over the
         * launcher would open the chat as well as move it.
         *
         * On a timer as well as on the click, because a drag does not always
         * produce a trailing click — it doesn't when the pointer comes up over
         * a different element than it went down on — and a listener left armed
         * would eat the SE's next real click instead. Dragging once and then
         * finding the launcher dead is far worse than the double-action this
         * prevents. The click follows pointerup in the same task, so one turn
         * of the event loop is enough to catch it.
         */
        var finish = function () {
          window.removeEventListener("click", swallow, true);
          clearTimeout(expire);
        };
        var swallow = function (e) { e.stopPropagation(); e.preventDefault(); finish(); };
        var expire = setTimeout(finish, 0);
        window.addEventListener("click", swallow, true);
        remeasure();
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }, true);

    // Double-click the same grab area to put it back where Cognigy would have it.
    document.addEventListener("dblclick", function (ev) {
      if (!grabbed(ev)) return;
      offset = { x: 0, y: 0 };
      apply(offset);
      save(offset);
      log("position reset");
      remeasure();
    }, true);

    log("drag enabled");
  }

  root.CDSDrag = { enable: enable };
})(window);
