/* SlopVector — core: hit testing, smart-guide snapping, insert/remove */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function activeLayer() { return $.activeLayer.apply(this, arguments); }
  function clone() { return $.clone.apply(this, arguments); }
  function docSubs() { return $.docSubs.apply(this, arguments); }
  function find() { return $.find.apply(this, arguments); }
  function flatPolys() { return $.flatPolys.apply(this, arguments); }
  function getObj() { return $.getObj.apply(this, arguments); }
  function isEditable() { return $.isEditable.apply(this, arguments); }
  function leaves() { return $.leaves.apply(this, arguments); }
  function localBox() { return $.localBox.apply(this, arguments); }
  function objBBox() { return $.objBBox.apply(this, arguments); }
  var S = $.S;

  /* ================= hit testing ================= */
  function hitObj(o, p, tol) {
    if (o.hidden || o.locked) return null;
    if (o.type === 'group') {
      var n = o.children.length;
      if (o.clip && n) { // a clipping mask: its content is hit only inside the clip shape
        var sh = o.children[n - 1];
        if (!G.pointInPolys(flatPolys(sh), p, sh.style && sh.style.rule)) return null;
        n--;
      }
      for (var i = n - 1; i >= 0; i--) { var r = hitObj(o.children[i], p, tol); if (r) return r; }
      return null;
    }
    if (o.type === 'text' || o.type === 'image') {
      var q = G.ap(G.inv(o.m), p.x, p.y), b = localBox(o), t2 = tol / Math.sqrt(abs(G.det(o.m)) || 1);
      return (q.x >= b.x - t2 && q.x <= b.x + b.w + t2 && q.y >= b.y - t2 && q.y <= b.y + b.h + t2) ? o : null;
    }
    var bb = objBBox(o), sw = (o.style.stroke && !S.prefs.outline) ? o.style.sw / 2 : 0, pad = max(sw, tol);
    if (!bb || p.x < bb.x - pad || p.x > bb.x + bb.w + pad || p.y < bb.y - pad || p.y > bb.y + bb.h + pad) return null;
    var polys = flatPolys(o);
    if (o.style.fill && !S.prefs.outline && G.pointInPolys(polys, p, o.style.rule)) return o;
    if (G.distToPolys(polys, p) <= pad) return o;
    return null;
  }
  SV.hitTest = function (p, opts) {
    opts = opts || {};
    var tol = (opts.tol || (SV.hitPx ? min(SV.hitPx(4), 12) : 4)) / S.view.zoom, layers = S.doc.layers;
    for (var li = layers.length - 1; li >= 0; li--) {
      var L = layers[li]; if (L.hidden || L.locked) continue;
      for (var i = L.children.length - 1; i >= 0; i--) {
        var o = L.children[i];
        if (opts.skip && opts.skip.indexOf(o.id) >= 0) continue;
        var leaf = hitObj(o, p, tol);
        if (leaf) return { obj: leaf, top: o, layer: L };
      }
    }
    return null;
  };
  // anchor / handle hit on given objects (doc coords) → {o, si, i, part:'a'|'in'|'out'}
  SV.hitAnchor = function (objs, p, handlesToo) {
    var tol = (SV.hitPx ? SV.hitPx(6) : 6) / S.view.zoom, best = null;
    objs.forEach(function (o) {
      leaves(o).forEach(function (l) {
        if (l.type === 'text' || l.type === 'image' || !isEditable(l)) return;
        var subs = docSubs(l), selp = S.psel[l.id] || [];
        subs.forEach(function (sp, si) {
          var n = sp.pts.length;
          sp.pts.forEach(function (a, i) {
            var cands = [['a', a.x, a.y]];
            if (handlesToo && l.type === 'path') {
              var isSel = selp.indexOf(si + ':' + i) >= 0, prevSel = selp.indexOf(si + ':' + ((i - 1 + n) % n)) >= 0, nextSel = selp.indexOf(si + ':' + ((i + 1) % n)) >= 0;
              var penMode = S.pen && S.pen.id === l.id;
              if (G.hasIn(a) && (isSel || prevSel || penMode)) cands.push(['in', a.ix, a.iy]);
              if (G.hasOut(a) && (isSel || nextSel || penMode)) cands.push(['out', a.ox, a.oy]);
            }
            cands.forEach(function (c) {
              var d = Math.hypot(c[1] - p.x, c[2] - p.y);
              if (d <= tol && (!best || d < best.d - 1e-9 || (c[0] !== 'a' && best.part === 'a' && d <= best.d + 1e-9))) best = { o: l, si: si, i: i, part: c[0], d: d };
            });
          });
        });
      });
    });
    return best;
  };
  SV.hitSegment = function (objs, p) {
    var tol = (SV.hitPx ? min(SV.hitPx(5), 14) : 5) / S.view.zoom, best = null;
    objs.forEach(function (o) {
      leaves(o).forEach(function (l) {
        if (l.type === 'text' || l.type === 'image' || !isEditable(l)) return;
        docSubs(l).forEach(function (sp, si) {
          var r = G.nearestOnSub(sp, p);
          if (r && r.d <= tol && (!best || r.d < best.d)) best = { o: l, si: si, i: r.i, t: r.t, d: r.d, p: r.p };
        });
      });
    });
    return best;
  };

  /* ================= snapping ================= */
  SV.buildSnap = function (excludeIds) {
    var xs = [], ys = [], ex = new Set();
    (excludeIds || []).forEach(function (id) { var o = getObj(id); if (o) { ex.add(id); leaves(o).forEach(function (l) { ex.add(l.id); }); } });
    var W = S.doc.width, H = S.doc.height;
    if (S.prefs.smart) {
      [0, W / 2, W].forEach(function (x) { xs.push({ v: x, a: 0, b: H }); });
      [0, H / 2, H].forEach(function (y) { ys.push({ v: y, a: 0, b: W }); });
      S.doc.layers.forEach(function (L) {
        if (L.hidden) return;
        L.children.forEach(function (o) {
          if (o.hidden || ex.has(o.id)) return;
          var b = objBBox(o); if (!b) return;
          [b.x, b.x + b.w / 2, b.x + b.w].forEach(function (x) { xs.push({ v: x, a: b.y, b: b.y + b.h }); });
          [b.y, b.y + b.h / 2, b.y + b.h].forEach(function (y) { ys.push({ v: y, a: b.x, b: b.x + b.w }); });
        });
      });
    }
    if (S.prefs.guides && S.prefs.snapGuides !== false) {
      S.doc.guides.v.forEach(function (x) { xs.push({ v: x, a: -1e5, b: 1e5, guide: true }); });
      S.doc.guides.h.forEach(function (y) { ys.push({ v: y, a: -1e5, b: 1e5, guide: true }); });
    }
    return { xs: xs, ys: ys };
  };
  function nearest(list, vals, th) {
    var best = null;
    vals.forEach(function (v, k) { list.forEach(function (c) { var d = c.v - v; if (abs(d) <= th && (!best || abs(d) < abs(best.d))) best = { d: d, c: c, k: k }; }); });
    return best;
  }
  // snap a box moving by (dx,dy) → adjusted {dx,dy}; records smart lines
  SV.snapBox = function (snap, b, dx, dy) {
    S.snapLines = [];
    var th = 6 / S.view.zoom;
    if (S.prefs.snapGrid) {
      var gs = S.prefs.gridSize;
      dx = round((b.x + dx) / gs) * gs - b.x; dy = round((b.y + dy) / gs) * gs - b.y;
      return { dx: dx, dy: dy };
    }
    if (!snap) return { dx: dx, dy: dy };
    var nx = nearest(snap.xs, [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], th);
    var ny = nearest(snap.ys, [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], th);
    if (nx) dx += nx.d; if (ny) dy += ny.d;
    if (nx) { var x = nx.c.v; S.snapLines.push([x, min(nx.c.a, b.y + dy) - 8 / S.view.zoom, x, max(nx.c.b, b.y + b.h + dy) + 8 / S.view.zoom]); }
    if (ny) { var y = ny.c.v; S.snapLines.push([min(ny.c.a, b.x + dx) - 8 / S.view.zoom, y, max(ny.c.b, b.x + b.w + dx) + 8 / S.view.zoom, y]); }
    return { dx: dx, dy: dy };
  };
  SV.snapPoint = function (snap, p) {
    S.snapLines = [];
    if (S.prefs.snapGrid) { var gs = S.prefs.gridSize; return { x: round(p.x / gs) * gs, y: round(p.y / gs) * gs }; }
    if (!snap) return p;
    var th = 6 / S.view.zoom, q = { x: p.x, y: p.y };
    var nx = nearest(snap.xs, [p.x], th), ny = nearest(snap.ys, [p.y], th);
    if (nx) { q.x += nx.d; S.snapLines.push([q.x, min(nx.c.a, p.y), q.x, max(nx.c.b, p.y)]); }
    if (ny) { q.y += ny.d; S.snapLines.push([min(ny.c.a, p.x), q.y, max(ny.c.b, p.x), q.y]); }
    return q;
  };
  function constrain45(p0, p) {
    var dx = p.x - p0.x, dy = p.y - p0.y, a = Math.atan2(dy, dx), step = PI / 4, sa = round(a / step) * step, l = Math.hypot(dx, dy);
    var c = Math.cos(sa), s = Math.sin(sa), proj = dx * c + dy * s;
    return { x: p0.x + c * proj, y: p0.y + s * proj, ang: sa, len: l };
  }
  SV.constrain45 = constrain45;

  /* ================= misc doc ops used by tools ================= */
  SV.insertObj = function (o, layer, opts) {
    layer = layer || activeLayer();
    if (layer.locked || layer.hidden) { SV.toast(layer.locked ? SV.t('vector.msg.layer_locked', { name: layer.name }) : SV.t('vector.msg.layer_hidden', { name: layer.name }), 'warn'); return false; }
    if (opts && opts.index != null) layer.children.splice(opts.index, 0, o); else layer.children.push(o);
    return true;
  };
  SV.removeObj = function (id) {
    var f = find(id); if (!f) return;
    f.arr.splice(f.idx, 1);
    // drop empty groups
    var p = f.parent;
    while (p && p.children.length === 0) { var pf = find(p.id); if (!pf) break; pf.arr.splice(pf.idx, 1); p = pf.parent; }
  };
  SV.replaceObj = function (id, o) { var f = find(id); if (f) f.arr[f.idx] = o; };
  SV.canDraw = function () {
    var L = activeLayer();
    if (L.locked || L.hidden) { SV.toast(L.locked ? SV.t('vector.msg.layer_locked', { name: L.name }) : SV.t('vector.msg.layer_hidden', { name: L.name }), 'warn'); return false; }
    return true;
  };
  SV.newStyle = function (kind) {
    var st = clone(S.style);
    if (kind === 'line' || kind === 'pencil') { st.fill = null; if (!st.stroke) st.stroke = '#0a0a0a'; }
    if (kind === 'brush') { st.fill = null; if (!st.stroke) st.stroke = '#0a0a0a'; st.sw = S.brush.size; st.cap = 'round'; st.join = 'round'; }
    if (kind === 'text') { var f = st.fill; st.fill = (typeof f === 'string' && f.toLowerCase() !== '#ffffff') ? f : '#0a0a0a'; st.stroke = null; st.dash = null; }
    return st;
  };
  SV.toast = function (msg, kind) { if (SV.ui && SV.ui.toast) SV.ui.toast(msg, kind); };
})();
