/* SlopVector — tools: Eyedropper, Hand, Zoom, Rotate, Scale, Scissors, Gradient */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function allLeafCandidates() { return $.allLeafCandidates.apply(this, arguments); }
  function beginRotate() { return $.beginRotate.apply(this, arguments); }
  function marqueeMove() { return $.marqueeMove.apply(this, arguments); }
  function n1() { return $.n1.apply(this, arguments); }
  function nearScreen() { return $.nearScreen.apply(this, arguments); }
  function readout() { return $.readout.apply(this, arguments); }
  function restoreObjs() { return $.restoreObjs.apply(this, arguments); }
  function rotateMove() { return $.rotateMove.apply(this, arguments); }
  function selectableTopIds() { return $.selectableTopIds.apply(this, arguments); }
  function setCursor() { return $.setCursor.apply(this, arguments); }
  function snapshotObjs() { return $.snapshotObjs.apply(this, arguments); }
  var CURSORS = $.CURSORS;
  var TOOLS = $.TOOLS;

  /* ================= hand / zoom (the eyedropper is in eyedrop.js) ================= */
  TOOLS.hand = { hover: function () { setCursor('grab'); } };
  TOOLS.zoom = {
    down: function (ev) { S.op = { kind: 'marquee', tool: 'zoom', start: ev.p, mk: 'zoom', alt: ev.alt, sx: ev.sx, sy: ev.sy }; S.marquee = { x: ev.p.x, y: ev.p.y, w: 0, h: 0, zoom: true }; },
    move: function (ev) { marqueeMove(ev); },
    up: function (ev) {
      var r = S.marquee;
      if (r && r.w * S.view.zoom > 6 && r.h * S.view.zoom > 6 && !S.op.alt) SV.zoomToRect(r);
      else SV.zoomStep(S.op.alt || ev.alt ? -1 : 1, S.op.sx, S.op.sy);
      S.marquee = null;
    },
    hover: function (ev) { setCursor(ev.alt ? 'zoom-out' : 'zoom-in'); }
  };

  /* ================= rotate / scale tools ================= */
  function originOf() { var b = SV.selBBox(); if (!b) return null; return S.origin || { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  TOOLS.rotate = {
    down: function (ev) {
      if (!S.sel.length) return SV.toast(SV.t('vector.msg.rotate_select'));
      if (ev.alt) { S.origin = ev.p; SV.ui.transformDialog('rotate'); return; }
      var org = originOf();
      if (nearScreen(org, ev, 9) || ev.dbl) { if (ev.dbl) SV.ui.transformDialog('rotate'); return; }
      var b = SV.selBBox();
      beginRotate(ev, b, org, 'rotate');
      S.op.setOrigin = ev.p;
    },
    move: function (ev) { rotateMove(ev); },
    up: function () { if (S.op.changed) SV.commit('rotate'); else S.origin = S.op.setOrigin; },
    hover: function () { setCursor('crosshair'); }
  };
  TOOLS.scale = {
    down: function (ev) {
      if (!S.sel.length) return SV.toast(SV.t('vector.msg.scale_select'));
      if (ev.alt) { S.origin = ev.p; SV.ui.transformDialog('scale'); return; }
      var org = originOf(), ids = selectableTopIds();
      S.op = { kind: 'scaletool', tool: 'scale', o: org, start: ev.p, ids: ids, origs: snapshotObjs(ids), sx: ev.sx, sy: ev.sy };
    },
    move: function (ev) {
      var op = S.op;
      if (!op.changed && hypot(ev.sx - op.sx, ev.sy - op.sy) < 3) return;
      var d0x = op.start.x - op.o.x, d0y = op.start.y - op.o.y;
      var sx = abs(d0x) > 1e-6 ? (ev.p.x - op.o.x) / d0x : 1, sy = abs(d0y) > 1e-6 ? (ev.p.y - op.o.y) / d0y : 1;
      if (ev.shift) { var s = hypot(ev.p.x - op.o.x, ev.p.y - op.o.y) / (hypot(d0x, d0y) || 1); sx = sy = s; }
      if (abs(sx) < 0.01) sx = 0.01; if (abs(sy) < 0.01) sy = 0.01;
      restoreObjs(op.origs);
      var M = G.scale(sx, sy, op.o.x, op.o.y);
      op.ids.forEach(function (id) { var o = getObj(id); if (o) SV.transformObj(o, M); });
      op.changed = true;
      readout(ev, SV.t('vector.readout.scale', { x: n1(sx * 100), y: n1(sy * 100) }));
    },
    up: function (ev) { if (S.op.changed) SV.commit('scale'); else S.origin = ev.p; },
    hover: function () { setCursor('crosshair'); }
  };

  /* ================= scissors ================= */
  TOOLS.scissors = {
    down: function (ev) {
      var cands = allLeafCandidates(ev.p);
      var seg = SV.hitSegment(cands, ev.p);
      if (!seg) return SV.toast(SV.t('vector.hint.scissors'));
      var o = seg.o; SV.toPath(o);
      var sp = o.subpaths[seg.si], idx;
      var A = sp.pts[seg.i], B = sp.pts[(seg.i + 1) % sp.pts.length];
      if (hypot(seg.p.x - A.x, seg.p.y - A.y) * S.view.zoom < 4) idx = seg.i;
      else if (hypot(seg.p.x - B.x, seg.p.y - B.y) * S.view.zoom < 4) idx = (seg.i + 1) % sp.pts.length;
      else idx = G.splitSegAt(sp, seg.i, seg.t);
      var pts = sp.pts, a = pts[idx];
      if (sp.closed) {
        var rot = pts.slice(idx).concat(pts.slice(0, idx));
        var endCopy = { x: a.x, y: a.y, ix: a.ix, iy: a.iy, ox: a.x, oy: a.y, s: false };
        rot[0] = { x: a.x, y: a.y, ix: a.x, iy: a.y, ox: a.ox, oy: a.oy, s: false };
        rot.push(endCopy);
        o.subpaths[seg.si] = { closed: false, pts: rot };
        SV.select([o.id]);
      } else {
        if (idx === 0 || idx === pts.length - 1) return SV.toast(SV.t('vector.msg.cut_endpoint'));
        var first = pts.slice(0, idx + 1), second = pts.slice(idx).map(function (q) { return clone(q); });
        first[first.length - 1] = Object.assign({}, a, { ox: a.x, oy: a.y, s: false });
        second[0] = Object.assign({}, a, { ix: a.x, iy: a.y, s: false });
        o.subpaths[seg.si] = { closed: false, pts: first };
        var o2 = SV.mk.path([{ closed: false, pts: second }], clone(o.style), o.name);
        var f = find(o.id); f.arr.splice(f.idx + 1, 0, o2);
        SV.select([o.id, o2.id]);
      }
      SV.commit('scissors');
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; setCursor(CURSORS.scissors); }
  };

  /* ================= gradient tool ================= */
  SV.defaultGradient = function (base, type) {
    var c = typeof base === 'string' ? base : '#d4ff3a';
    var stops = [{ o: 0, c: '#ffffff', a: 1 }, { o: 1, c: c.toLowerCase() === '#ffffff' ? '#0a0a0a' : c, a: 1 }];
    if (base && typeof base === 'object' && base.stops) stops = clone(base.stops);
    return type === 'radial' ? { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, fx: 0.5, fy: 0.5, stops: stops } : { type: 'linear', x1: 0, y1: 0.5, x2: 1, y2: 0.5, stops: stops };
  };
  TOOLS.gradient = {
    down: function (ev) {
      var targets = [];
      SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.type !== 'image' && SV.isEditable(l)) targets.push(l); }); });
      if (!targets.length) { var h = SV.hitTest(ev.p); if (h && h.obj.type !== 'image') { SV.select([h.obj.id]); targets = [h.obj]; } }
      if (!targets.length) return;
      targets.forEach(function (t) { if (!t.style.fill || typeof t.style.fill !== 'object') t.style.fill = SV.defaultGradient(t.style.fill); });
      S.op = { kind: 'grad', tool: 'gradient', start: ev.p, ids: targets.map(function (t) { return t.id; }) };
    },
    move: function (ev) {
      var op = S.op;
      op.ids.forEach(function (id) {
        var o = getObj(id), lb = o.type === 'path' ? G.subsBBox(o.subpaths) : SV.localBox(o); if (!lb) return;
        var inv = G.inv(o.m), a = G.ap(inv, op.start.x, op.start.y), b = G.ap(inv, ev.p.x, ev.p.y);
        var fx = function (x) { return lb.w ? (x - lb.x) / lb.w : 0.5; }, fy = function (y) { return lb.h ? (y - lb.y) / lb.h : 0.5; };
        var g = o.style.fill;
        if (g.type === 'radial') { g.cx = g.fx = fx(a.x); g.cy = g.fy = fy(a.y); g.r = max(0.01, hypot(fx(b.x) - fx(a.x), fy(b.y) - fy(a.y))); }
        else { g.x1 = fx(a.x); g.y1 = fy(a.y); g.x2 = fx(b.x); g.y2 = fy(b.y); }
      });
      op.changed = true;
    },
    up: function () { SV.commit('gradient'); },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; setCursor('crosshair'); }
  };
})();
