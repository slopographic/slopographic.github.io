/* Slop PDF — page rows: which pages the view lays out and how (continuous scroll, single page, or two pages side by side),
   which page is active (the one the tools work on), and the scroll-follow that makes the page in view active. The
   choice of layout is remembered in localStorage (try/catch: a private window simply forgets it). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  var KEY = 'slop-pdf.pageLayout', GAP = 24, MODES = { continuous: 1, single: 1, two: 1 };
  var built = null, followRaf = 0;

  function readMode() {
    try { var m = localStorage.getItem(KEY); return MODES[m] ? m : 'continuous'; } catch (e) { return 'continuous'; }
  }
  Ed.layoutMode = readMode();
  /** Switches the layout: 'continuous', 'single' or 'two'. The active page stays the page on screen. */
  Ed.setLayout = function (mode) {
    if (!MODES[mode] || mode === Ed.layoutMode) return;
    Ed.layoutMode = mode;
    try { localStorage.setItem(KEY, mode); } catch (e) { /* private window or blocked storage: the choice lasts this visit */ }
    if (!Ed.page()) return;
    Ed.layout();
    S.reveal(Ed.pid);
    if (SP.app && SP.app.pageChanged) SP.app.pageChanged();
  };
  S.initRows = function () {
    S.initRasterObserver();
    S.viewer.addEventListener('scroll', S.onScroll, { passive: true });
    window.addEventListener('pointerup', function () { S.pressing = false; });
    window.addEventListener('pointercancel', function () { S.pressing = false; });
  };
  /** The pages the layout shows, grouped into rows. Single page shows only the active page. */
  function rowsOf(ids) {
    var rows = [];
    if (Ed.layoutMode === 'two') for (var i = 0; i < ids.length; i += 2) rows.push(ids.slice(i, i + 2));
    else ids.forEach(function (id) { rows.push([id]); });
    return rows;
  }
  /** Rebuilds the rows when the pages, their order or the layout change; otherwise the rows stay as they are. */
  S.buildRows = function () {
    var all = E.state.pages.map(function (p) { return p.id; });
    var ids = Ed.layoutMode === 'single' ? [Ed.pid] : all;
    var rows = rowsOf(ids);
    var sig = Ed.layoutMode + '|' + rows.map(function (r) { return r.join('+'); }).join(',');
    var live = new Set(all);
    S.slots.forEach(function (s, pid) { if (!live.has(pid)) { S.unobserve(s); s.el.remove(); S.slots.delete(pid); } });
    if (sig === built) { S.placeTools(); return; }
    if (S.editing) S.finishText(true);
    built = sig;
    var inView = new Set(ids);
    S.visible.forEach(function (s) { if (!inView.has(s.pid)) { S.unobserve(s); s.el.remove(); S.release(s); } });
    S.pad.replaceChildren();
    S.visible = [];
    rows.forEach(function (r) {
      var row = U.h('div', { class: 'pv-row' });
      r.forEach(function (pid) {
        var s = S.slotFor(pid);
        row.appendChild(s.el); S.observe(s); S.visible.push(s);
      });
      S.pad.appendChild(row);
    });
    S.placeTools();
  };
  /** The slot under a client point, or the nearest one when the point is in a gap. */
  S.slotAt = function (x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < S.visible.length; i++) {
      var r = S.visible[i].el.getBoundingClientRect();
      var dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0, dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = S.visible[i]; if (d === 0) break; }
    }
    return best;
  };
  /** The visible page with the most of its area in the viewer; a tie goes to the page nearest the viewer's middle, and at
      the very end of the stack the last visible page. The active page keeps its place on a near tie. */
  function mostVisible() {
    var vr = S.viewer.getBoundingClientRect(), mid = vr.top + vr.height / 2, best = null, ba = -1, bd = Infinity, active = 0, last = null;
    var atEnd = S.viewer.scrollTop + S.viewer.clientHeight >= S.viewer.scrollHeight - 2;
    S.visible.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      var h = Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top), w = Math.min(r.right, vr.right) - Math.max(r.left, vr.left);
      if (h <= 0 || w <= 0) return;
      var a = w * h, d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (s.pid === Ed.pid) active = a;
      last = s;
      if (a > ba + 0.5 || (Math.abs(a - ba) <= 0.5 && d < bd)) { ba = a; bd = d; best = s; }
    });
    if (atEnd && last) return last;
    return best && active >= ba * 0.99 ? S.slotFor(Ed.pid) : best;
  }
  /** Makes a page the active one: the annotation overlay and the text box move to it, and the tools use it. */
  S.activate = function (pid) {
    if (pid === Ed.pid || !S.slots.has(pid)) return;
    S.finishText(true);
    Ed.selId = null;
    Ed.pid = pid;
    S.placeTools();
    S.visible.forEach(function (s) { s.el.dataset.tool = Ed.tool; });
    S.paintLive();
    S.drawSelection();
    S.scheduleRaster(0);
    if (SP.app && SP.app.pageChanged) SP.app.pageChanged();
  };
  /** Scrolls so the page's row starts at the top of the view (the whole page stack in single page: back to the top). */
  S.reveal = function (pid) {
    var s = S.slots.get(pid); if (!s || !s.el.isConnected) return;
    if (Ed.layoutMode === 'single') { S.viewer.scrollTop = 0; return; }
    var vr = S.viewer.getBoundingClientRect(), r = (s.el.parentNode || s.el).getBoundingClientRect();
    S.viewer.scrollTop += r.top - vr.top - GAP;
  };
  /** The page in view changes the active page while the view scrolls (not during a press, not in single page). */
  S.onScroll = function () {
    if (followRaf || S.pressing || S.restoring || Ed.layoutMode === 'single' || !Ed.pid) return;
    followRaf = requestAnimationFrame(function () {
      followRaf = 0;
      var s = mostVisible();
      if (s && s.pid !== Ed.pid) S.activate(s.pid);
    });
  };
})();
