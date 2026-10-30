/* Slop PDF — the text selection as page geometry. When the browser selection starts and ends in the text layers of the
   rasterised pages, this keeps a snapshot: the text, the selection's rectangles per page (page points, unrotated, from the
   top-left: the same space as the annotations) and the box on screen (the bar is placed from it). sel-bar.js shows the
   bar and sel-actions.js reads the snapshot, so the actions still work after the DOM selection has moved on. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, Ed = SP.editor, S = Ed._;
  var T = S.sel = { snap: null, dismissedKey: null, listeners: [] };
  var pending = false;

  /** Page point of a client point on a page's element; the same mapping as S.pagePt, for any page. */
  function pagePtAt(p, el, x, y) {
    var r = el.getBoundingClientRect(), z = Ed.zoom, g = E.geom(p), R = E.rotation(p);
    return E.toPage(R, g.W, g.H, (x - r.left) / z, (y - r.top) / z);
  }
  /** A client rectangle as a page-space {x0, y0, x1, y1} (the corners mapped, so a rotated page stays axis-aligned). */
  function toPageRect(p, el, cr) {
    var pts = [[cr.left, cr.top], [cr.right, cr.top], [cr.left, cr.bottom], [cr.right, cr.bottom]].map(function (c) { return pagePtAt(p, el, c[0], c[1]); });
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
  }
  /** The page slot whose element holds the point, or null. */
  function slotAt(x, y) {
    var list = S.visible || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i].el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return list[i];
    }
    return null;
  }
  function inText(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    return !!(el && el.closest && el.closest('.pv-textlayer'));
  }
  /** The snapshot of the current selection, or null when it is not text on the pages. */
  function read() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    if (!inText(sel.anchorNode) || !inText(sel.focusNode)) return null;
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    var range = sel.getRangeAt(0), byPage = new Map();
    Array.from(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; }).forEach(function (cr) {
      var s = slotAt((cr.left + cr.right) / 2, (cr.top + cr.bottom) / 2), p = s && E.pageById(s.pid);
      if (!p || p.blank) return; // blank pages have no text
      if (!byPage.has(s.pid)) byPage.set(s.pid, { pid: s.pid, p: p, el: s.el, rects: [] });
      byPage.get(s.pid).rects.push(toPageRect(p, s.el, cr));
    });
    var parts = Array.from(byPage.values());
    if (!parts.length) return null;
    var b = range.getBoundingClientRect(), first = parts[0].rects[0];
    var key = text + '@' + parts.map(function (x) { return x.pid + ':' + x.rects.length + ':' + Math.round(x.rects[0].y0); }).join(',');
    return { text: text, key: key, parts: parts, box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, start: [first.x0, first.y0] };
  }
  function update() {
    pending = false;
    var snap = read(), sel = window.getSelection ? window.getSelection() : null;
    var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    // a cleared selection, or a new Range object (the same text selected again, even within one frame), starts afresh
    if (!snap || range !== T.range) T.dismissedKey = null;
    T.range = range;
    T.snap = snap;
    T.emit();
  }
  /** Coalesces selection changes into one read per frame. */
  T.schedule = function () { if (!pending) { pending = true; requestAnimationFrame(update); } };
  /** Whether the bar should show for the current snapshot (Escape dismisses a selection until it changes). */
  T.shown = function () { return !!T.snap && T.snap.key !== T.dismissedKey; };
  T.dismiss = function () { if (T.snap) T.dismissedKey = T.snap.key; T.emit(); };
  /** After a scroll: the rectangles are page space and stay put, so only the box on screen is read again. */
  T.rebox = function () {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!T.snap || !sel || sel.isCollapsed || !sel.rangeCount) return;
    var b = sel.getRangeAt(0).getBoundingClientRect();
    T.snap.box = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  };
  T.onChange = function (fn) { T.listeners.push(fn); };
  T.emit = function () { T.listeners.forEach(function (fn) { fn(); }); };

  document.addEventListener('selectionchange', T.schedule);
})();
