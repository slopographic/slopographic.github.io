/* Slop Press — tool registry and pointer dispatch on the canvas: hit testing, wheel zoom/pan, pinch, hand. */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, I = PR.items, LY = PR.layers;
  var T = PR.tools = { defs: {}, drag: null, space: false, hover: null, preview: null };
  T.ORDER = ['select', 'text', 'frame', 'rect', 'ellipse', 'line', 'polygon', 'hand', 'zoom'];

  T.define = function (name, def) { T.defs[name] = def; };
  T.set = function (name) {
    if (!T.defs[name]) return;
    if (S.text && name !== 'text') PR.textEdit && PR.textEdit.exit();
    S.tool = name; T.drag = null; T.preview = null; PR.snap.clear();
    if (V.canvas) V.canvas.dataset.tool = name;
    PR.emit('tool', name); V.request();
  };

  /** Topmost selectable item at a world point: { s, it } or null. opts.any: include locked/master items. */
  T.hit = function (wx, wy, opts) {
    opts = opts || {};
    var s = V.surfaceAt(wx, wy), tol = 4 / V.zoom;
    if (!s) return null;
    var lx = wx - s.x, ly = wy - s.y, list = LY.sorted(S.doc, s.items).slice().reverse();
    for (var k = 0; k < list.length; k++) {
      var it = list[k];
      if (!LY.visible(S.doc, it) || (!opts.any && LY.locked(S.doc, it))) continue;
      if (T.hitItem(it, lx, ly, tol)) return { s: s, it: it };
    }
    return null;
  };
  T.hitItem = function (it, lx, ly, tol) {
    var p = I.toLocal(it, lx, ly);
    if (it.type === 'line') {
      var x0 = 0, y0 = it.dir ? it.h : 0, x1 = it.w, y1 = it.dir ? 0 : it.h, dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
      var t = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / L)), qx = x0 + t * dx - p.x, qy = y0 + t * dy - p.y;
      return Math.sqrt(qx * qx + qy * qy) <= tol + (it.sw || 1) / 2;
    }
    return p.x >= -tol && p.y >= -tol && p.x <= it.w + tol && p.y <= it.h + tol;
  };
  /** Pointer position helpers. */
  T.world = function (e) { var r = V.canvas.getBoundingClientRect(); return V.toWorld(e.clientX - r.left, e.clientY - r.top); };
  T.screen = function (e) { var r = V.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  T.overlay = function (ctx) {
    PR.snap.draw(ctx);
    var d = T.defs[S.tool];
    if (d && d.overlay) d.overlay(ctx);
    if (T.preview) T.preview(ctx);
  };

  /* ---------- pointer plumbing ---------- */
  var pointers = new Map(), pinch = null;
  function panDrag(e) {
    var last = T.screen(e);
    return { move: function (w, ev) { var p = T.screen(ev); V.panBy(p.x - last.x, p.y - last.y); last = p; }, up: function () {} };
  }
  T.attach = function (canvas) {
    // A touch surface (shared/input): no scroll, callout or selection takes a drag; the pinch below is the canvas's own.
    canvas.setAttribute('data-touch-surface', 'nav');
    canvas.addEventListener('pointerdown', function (e) {
      if (window.SlopUI) window.SlopUI.closeMenu();
      pointers.set(e.pointerId, T.screen(e));
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ }
      if (pointers.size === 2) { // pinch-zoom
        var ps = Array.from(pointers.values());
        pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), z: V.zoom, c: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } };
        T.drag = null; return;
      }
      var w = T.world(e);
      if (e.button === 1 || T.space || S.tool === 'hand') { T.drag = panDrag(e); e.preventDefault(); return; }
      if (e.button === 2) return;
      var d = T.defs[S.tool];
      T.drag = d && d.down ? d.down(w, e) : null;
      if (!T.drag && e.pointerType === 'touch' && !T.hit(w.x, w.y)) T.drag = panDrag(e);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, T.screen(e));
      if (pinch && pointers.size === 2) {
        var ps = Array.from(pointers.values()), d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        var c = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
        V.panBy(c.x - pinch.c.x, c.y - pinch.c.y); pinch.c = c;
        V.setZoom(pinch.z * d / Math.max(1, pinch.d), c.x, c.y); return;
      }
      var w = T.world(e);
      PR.emit('pointer', w);
      if (T.drag) { T.drag.move(w, e); V.request(); return; }
      var def = T.defs[S.tool];
      if (def && def.hover) def.hover(w, e);
    });
    function end(e) {
      pointers.delete(e.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; return; }
      if (T.drag) { var d = T.drag; T.drag = null; d.up(T.world(e), e); PR.snap.clear(); V.request(); }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('dblclick', function (e) { var d = T.defs[S.tool]; if (d && d.dbl) d.dbl(T.world(e), e); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = T.screen(e);
      if (e.ctrlKey || e.metaKey) V.zoomBy(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), p.x, p.y);
      else V.panBy(-(e.shiftKey ? e.deltaY : e.deltaX), e.shiftKey ? 0 : -e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); if (PR.ui && PR.ui.contextMenu) PR.ui.contextMenu(T.world(e), e); });
    addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !S.text && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { if (!T.space) { T.space = true; canvas.dataset.tool = 'hand'; } e.preventDefault(); }
    });
    addEventListener('keyup', function (e) { if (e.code === 'Space' && T.space) { T.space = false; canvas.dataset.tool = S.tool; } });
  };
  void I;
})();
