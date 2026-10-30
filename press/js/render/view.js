/* Slop Press — the canvas view: pasteboard with spreads stacked vertically, zoom/pan, surfaces, redraw loop.
   World units are points. screen = world * zoom + (px, py). "100%" zoom shows real size (96 css px per inch). */
(function () {
  'use strict';
  var PR = window.PR, P = PR.pages, M = PR.model, S = PR.state;
  var V = PR.view = { zoom: 1, px: 0, py: 0, dpr: 1, canvas: null, ctx: null, w: 0, h: 0, GAP: 48, preview: false,
    show: { guides: true, baseline: false, frames: true, threads: true, rulers: true, snap: true } };
  V.ACTUAL = 96 / 72;

  /** Surfaces: the page rectangles currently shown. Each: { key, x, y, w, h, side, pageIdx | null, master, mside, items, guides }. */
  V.surfaces = function () {
    var doc = S.doc, out = [], y = 0;
    if (!doc) return out;
    var w = doc.size.w, h = doc.size.h;
    if (S.editMaster) {
      var m = M.findMaster(doc, S.editMaster.id);
      if (m) {
        var tw = m.pages.length * w;
        m.pages.forEach(function (mp, k) {
          out.push({ key: 'm' + k, x: -tw / 2 + k * w, y: 0, w: w, h: h, side: P.masterSideName(doc, k), pageIdx: null, master: m, mside: k, items: mp.items, guides: mp.guides = mp.guides || [], spread: 0 });
        });
        return out;
      }
    }
    P.spreads(doc).forEach(function (sp, si) {
      sp.pages.forEach(function (i, k) {
        var x = doc.facing ? -w + sp.x[k] : -w / 2;
        var page = doc.pages[i];
        out.push({ key: 'p' + i, x: x, y: y, w: w, h: h, side: P.side(doc, i), pageIdx: i, master: null, items: page.items, guides: page.guides = page.guides || [], spread: si });
      });
      y += h + V.GAP;
    });
    return out;
  };
  V.surfaceFor = function (pageIdx) { var ss = V.surfaces(); for (var k = 0; k < ss.length; k++) if (ss[k].pageIdx === pageIdx) return ss[k]; return ss[0]; };
  /** The active surface (current page, or the master side being edited). */
  V.active = function () {
    var ss = V.surfaces();
    if (S.editMaster) return ss[Math.min(S.editMaster.side || 0, ss.length - 1)];
    return V.surfaceFor(S.page);
  };
  /** Surface under a world point (nearest by vertical band). */
  V.surfaceAt = function (wx, wy, strict) {
    var ss = V.surfaces(), best = null, bd = Infinity;
    ss.forEach(function (s) {
      var dx = wx < s.x ? s.x - wx : wx > s.x + s.w ? wx - s.x - s.w : 0, dy = wy < s.y ? s.y - wy : wy > s.y + s.h ? wy - s.y - s.h : 0;
      var d = dx + dy * 2;
      if (d < bd) { bd = d; best = s; }
    });
    if (strict && bd > 0) return null;
    return best;
  };
  V.bounds = function () {
    var ss = V.surfaces(); if (!ss.length) return { x: 0, y: 0, w: 1, h: 1 };
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ss.forEach(function (s) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  /* ---------- transforms ---------- */
  V.toWorld = function (sx, sy) { return { x: (sx - V.px) / V.zoom, y: (sy - V.py) / V.zoom }; };
  V.toScreen = function (wx, wy) { return { x: wx * V.zoom + V.px, y: wy * V.zoom + V.py }; };
  V.setZoom = function (z, sx, sy) {
    z = Math.max(0.05, Math.min(64, z));
    if (sx == null) { sx = V.w / 2; sy = V.h / 2; }
    var w = V.toWorld(sx, sy);
    V.zoom = z; V.px = sx - w.x * z; V.py = sy - w.y * z;
    PR.emit('zoom', z); V.request();
  };
  V.zoomBy = function (f, sx, sy) { V.setZoom(V.zoom * f, sx, sy); };
  V.panBy = function (dx, dy) { V.px += dx; V.py += dy; V.request(); PR.emit('pan'); };
  /** Fits a world rectangle into the viewport with padding. */
  V.fitRect = function (r, pad) {
    pad = pad == null ? 32 : pad;
    if (!V.w || !V.h) return;
    var z = Math.min((V.w - pad * 2) / r.w, (V.h - pad * 2) / r.h);
    V.zoom = Math.max(0.05, Math.min(64, z));
    V.px = V.w / 2 - (r.x + r.w / 2) * V.zoom; V.py = V.h / 2 - (r.y + r.h / 2) * V.zoom;
    PR.emit('zoom', V.zoom); V.request();
  };
  V.fitPage = function () { var s = V.active(); if (s) V.fitRect(s); };
  V.fitSpread = function () {
    var a = V.active(); if (!a) return;
    var ss = V.surfaces().filter(function (s) { return s.spread === a.spread; });
    var x0 = Math.min.apply(null, ss.map(function (s) { return s.x; })), x1 = Math.max.apply(null, ss.map(function (s) { return s.x + s.w; }));
    V.fitRect({ x: x0, y: a.y, w: x1 - x0, h: a.h });
  };
  V.actualSize = function () { var a = V.active(); V.zoom = V.ACTUAL; if (a) { V.px = V.w / 2 - (a.x + a.w / 2) * V.zoom; V.py = 24 - a.y * V.zoom; } PR.emit('zoom', V.zoom); V.request(); };
  /** Scrolls so page i is visible (keeps the zoom). */
  V.showPage = function (i) {
    var s = V.surfaceFor(i); if (!s) return;
    var top = V.toScreen(s.x, s.y), bot = V.toScreen(s.x + s.w, s.y + s.h);
    if (top.y < 0 || bot.y > V.h || top.x < 0 || bot.x > V.w) { V.px = V.w / 2 - (s.x + s.w / 2) * V.zoom; V.py = Math.min(24, V.h / 2 - (s.y + s.h / 2) * V.zoom); if (s.h * V.zoom < V.h - 48) V.py = V.h / 2 - (s.y + s.h / 2) * V.zoom; V.request(); }
  };
  /** Page index whose surface is closest to the viewport centre (for "current page" while scrolling). */
  V.centerPage = function () {
    var c = V.toWorld(V.w / 2, V.h / 2), s = V.surfaceAt(c.x, c.y);
    return s ? s.pageIdx : null;
  };

  /* ---------- canvas + loop ---------- */
  var queued = false;
  V.request = function () { if (queued || !V.ctx) return; queued = true; requestAnimationFrame(function () { queued = false; V.draw(); }); };
  V.resize = function () {
    if (!V.canvas) return;
    var r = V.canvas.parentNode.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var first = !V.w;
    V.w = Math.max(1, Math.round(r.width)); V.h = Math.max(1, Math.round(r.height)); V.dpr = dpr;
    V.canvas.width = Math.round(V.w * dpr); V.canvas.height = Math.round(V.h * dpr);
    V.canvas.style.width = V.w + 'px'; V.canvas.style.height = V.h + 'px';
    if (first) V.fitPage();
    V.request(); PR.emit('resize');
  };
  V.init = function (canvas) {
    V.canvas = canvas; V.ctx = canvas.getContext('2d');
    new ResizeObserver(function () { V.resize(); }).observe(canvas.parentNode);
    V.resize();
    PR.on('change', V.request);
  };
  /** Main redraw: pasteboard, pages, items, guides, overlays. */
  V.draw = function () {
    var ctx = V.ctx, doc = S.doc; if (!ctx || !doc) return;
    var cs = getComputedStyle(document.documentElement);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cs.getPropertyValue('--pasteboard').trim() || '#3a3a3a';
    ctx.fillRect(0, 0, V.canvas.width, V.canvas.height);
    ctx.setTransform(V.dpr * V.zoom, 0, 0, V.dpr * V.zoom, V.dpr * V.px, V.dpr * V.py);
    var vw = V.toWorld(0, 0), ve = V.toWorld(V.w, V.h);
    V.surfaces().forEach(function (s) {
      if (s.x > ve.x + 200 || s.x + s.w < vw.x - 200 || s.y > ve.y + 200 || s.y + s.h < vw.y - 200) return;
      PR.paint.surface(ctx, s);
    });
    PR.paint.overlay(ctx);
    PR.emit('drawn');
  };
})();
