/* SlopVector — tools: Selection tool (move, scale, rotate, marquee, guides) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function n1() { return $.n1.apply(this, arguments); }
  function readout() { return $.readout.apply(this, arguments); }
  function restoreObjs() { return $.restoreObjs.apply(this, arguments); }
  function selectableTopIds() { return $.selectableTopIds.apply(this, arguments); }
  function setCursor() { return $.setCursor.apply(this, arguments); }
  function snapshotObjs() { return $.snapshotObjs.apply(this, arguments); }
  var CURSORS = $.CURSORS;
  var TOOLS = $.TOOLS;

  /* ================= selection tool ================= */
  function handleAt(b, sx, sy) {
    var sb = SV.screenBox(b), hp = SV.handlePositions(sb), best = null;
    if (sb.w < 6 && sb.h < 6) return null;
    // A finger gets a bigger handle (SV.hitPx), but never so big that a small shape's inside is all handle.
    var r = max(6, min(SV.hitPx(6), max(sb.w, sb.h) / 3));
    SV.HANDLE_NAMES.forEach(function (n) { var d = max(abs(hp[n][0] - sx), abs(hp[n][1] - sy)); if (d <= r && (!best || d < best.d)) best = { n: n, d: d }; });
    return best && best.n;
  }
  function rotateZone(b, sx, sy) {
    var sb = SV.screenBox(b);
    if (sx >= sb.x && sx <= sb.x + sb.w && sy >= sb.y && sy <= sb.y + sb.h) return false;
    var hp = SV.handlePositions(sb);
    var r = SV.hitPx(5);
    return ['nw', 'ne', 'se', 'sw'].some(function (n) { var d = hypot(hp[n][0] - sx, hp[n][1] - sy); return d > r && d < r + 17; });
  }
  var RESIZE_CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
  function guideAt(ev) {
    if (!S.prefs.guides || S.prefs.lockGuides) return null;
    var z = S.view.zoom, best = null;
    S.doc.guides.v.forEach(function (x, i) { var d = abs(x * z + S.view.x - ev.sx); if (d <= 3 && (!best || d < best.d)) best = { axis: 'v', i: i, d: d }; });
    S.doc.guides.h.forEach(function (y, i) { var d = abs(y * z + S.view.y - ev.sy); if (d <= 3 && (!best || d < best.d)) best = { axis: 'h', i: i, d: d }; });
    return best;
  }
  function beginMove(ev, ids, tool) {
    ids = ids || S.sel.slice();
    ids = ids.filter(function (id) { var o = getObj(id); return o && SV.isEditable(o); });
    if (!ids.length) return;
    S.op = { kind: 'move', tool: tool || 'select', start: ev.p, ids: ids, origs: snapshotObjs(ids), bbox: SV.selBBox(ids), snap: SV.buildSnap(ids), moved: false, dup: false };
  }
  function moveMove(ev) {
    var op = S.op, dx = ev.p.x - op.start.x, dy = ev.p.y - op.start.y;
    if (!op.moved && hypot(dx, dy) * S.view.zoom < 3) return;
    if (!op.moved) {
      op.moved = true;
      if (ev.alt) { // duplicate originals in place, move the copies
        var newIds = [];
        op.origs.forEach(function (o) {
          var f = find(o.id), c = SV.reId(clone(o));
          f.arr.splice(f.idx + 1, 0, c); newIds.push(c.id);
        });
        op.dup = true; op.origs = snapshotObjs(newIds); op.ids = newIds; S.sel = newIds.slice();
      }
    }
    if (ev.shift) { var c = SV.constrain45({ x: 0, y: 0 }, { x: dx, y: dy }); dx = c.x; dy = c.y; }
    else if (op.bbox) { var sn = SV.snapBox(op.snap, op.bbox, dx, dy); dx = sn.dx; dy = sn.dy; }
    restoreObjs(op.origs);
    var M = G.translate(dx, dy);
    op.ids.forEach(function (id) { var o = getObj(id); if (o) SV.transformObj(o, M); });
    op.dx = dx; op.dy = dy;
    readout(ev, SV.t('vector.readout.move', { x: n1(dx), y: n1(dy) }));
  }
  function moveUp() {
    var op = S.op;
    if (op.moved) {
      if (op.dup) S.lastDup = { dx: op.dx, dy: op.dy };
      SV.commit(op.dup ? 'duplicate' : 'move');
    }
  }
  function beginScale(ev, b, h) {
    var ids = selectableTopIds(); if (!ids.length) return;
    S.op = { kind: 'scale', tool: 'select', b: b, h: h, ids: ids, origs: snapshotObjs(ids), snap: SV.buildSnap(ids), start: ev.p };
  }
  function scaleMove(ev) {
    var op = S.op, b = op.b, h = op.h, hp = SV.handlePositions(b)[h];
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, ax, ay;
    if (ev.alt) { ax = cx; ay = cy; } else { var opp = SV.handlePositions(b)[{ nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' }[h]]; ax = opp[0]; ay = opp[1]; }
    var p = ev.shift ? ev.p : SV.snapPoint(op.snap, ev.p);
    var hasX = h.indexOf('e') >= 0 || h.indexOf('w') >= 0, hasY = h.indexOf('n') >= 0 || h.indexOf('s') >= 0;
    var sx = hasX && abs(hp[0] - ax) > 1e-9 ? (p.x - ax) / (hp[0] - ax) : 1;
    var sy = hasY && abs(hp[1] - ay) > 1e-9 ? (p.y - ay) / (hp[1] - ay) : 1;
    if (ev.shift) {
      if (hasX && hasY) { var s = max(abs(sx), abs(sy)); sx = (sx < 0 ? -1 : 1) * s; sy = (sy < 0 ? -1 : 1) * s; }
      else if (hasX) sy = abs(sx); else sy = sy, sx = abs(sy);
    }
    if (abs(sx) < 0.002) sx = sx < 0 ? -0.002 : 0.002;
    if (abs(sy) < 0.002) sy = sy < 0 ? -0.002 : 0.002;
    restoreObjs(op.origs);
    var M = G.scale(sx, sy, ax, ay);
    op.ids.forEach(function (id) { var o = getObj(id); if (o) SV.transformObj(o, M); });
    op.changed = true;
    readout(ev, SV.t('vector.readout.size', { w: n1(abs(b.w * sx)), h: n1(abs(b.h * sy)) }));
  }
  function beginRotate(ev, b, origin, tool) {
    var ids = selectableTopIds(); if (!ids.length) return;
    var c = origin || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    S.op = { kind: 'rotate', tool: tool || 'select', c: c, a0: Math.atan2(ev.p.y - c.y, ev.p.x - c.x), ids: ids, origs: snapshotObjs(ids), start: ev.p, sx: ev.sx, sy: ev.sy };
  }
  function rotateMove(ev) {
    var op = S.op;
    if (!op.changed && hypot(ev.sx - op.sx, ev.sy - op.sy) < 3) return;
    var a = Math.atan2(ev.p.y - op.c.y, ev.p.x - op.c.x) - op.a0;
    if (ev.shift) a = round(a / (PI / 4)) * (PI / 4);
    restoreObjs(op.origs);
    var M = G.rotate(a, op.c.x, op.c.y);
    op.ids.forEach(function (id) { var o = getObj(id); if (o) { SV.transformObj(o, M); if (o.type === 'path' || o.type === 'group') o.rot = normAng((o.rot || 0) + a * 180 / PI); } });
    op.changed = true; op.angle = a;
    var deg = -a * 180 / PI; deg = ((deg % 360) + 540) % 360 - 180;
    readout(ev, SV.t('vector.readout.angle', { deg: n1(deg) }));
  }
  function normAng(d) { d = ((d % 360) + 540) % 360 - 180; return Math.round(d * 100) / 100; }
  SV.normAng = normAng;
  function beginMarquee(ev, add, kind) {
    S.op = { kind: 'marquee', tool: S.tool, start: ev.p, add: add, mk: kind || 'objects', base: S.sel.slice(), basePts: clone(S.psel) };
    S.marquee = { x: ev.p.x, y: ev.p.y, w: 0, h: 0 };
  }
  function marqueeMove(ev) {
    var s = S.op.start;
    S.marquee = { x: min(s.x, ev.p.x), y: min(s.y, ev.p.y), w: abs(ev.p.x - s.x), h: abs(ev.p.y - s.y), zoom: S.op.mk === 'zoom' };
  }
  function marqueeUp() {
    var r = S.marquee; if (!r) return;
    if (r.w * S.view.zoom < 2 && r.h * S.view.zoom < 2) { S.marquee = null; return; }
    if (S.op.mk === 'points') {
      var psel = S.op.add ? S.op.basePts : {}, ids = S.op.add ? S.op.base.slice() : [];
      S.doc.layers.forEach(function (L) {
        if (L.hidden || L.locked) return;
        L.children.forEach(function (top) {
          SV.leaves(top).forEach(function (o) {
            if (!SV.isEditable(o)) return;
            var bb = SV.objBBox(o); if (!bb || !G.boxesTouch(bb, r)) return;
            if (o.type === 'text' || o.type === 'image') { if (G.boxesTouch(bb, r)) ids.push(o.id); return; }
            var keys = [];
            SV.docSubs(o).forEach(function (sp, si) { sp.pts.forEach(function (a, i) { if (a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h) keys.push(si + ':' + i); }); });
            if (keys.length) { psel[o.id] = Array.from(new Set((psel[o.id] || []).concat(keys))); ids.push(o.id); }
            else if (G.polysTouchRect(SV.flatPolys(o), r, false)) ids.push(o.id);
          });
        });
      });
      SV.select(ids, { keepPoints: true }); S.psel = psel;
    } else {
      var sel = S.op.add ? S.op.base.slice() : [];
      S.doc.layers.forEach(function (L) {
        if (L.hidden || L.locked) return;
        L.children.forEach(function (o) {
          if (o.hidden || o.locked) return;
          var bb = SV.objBBox(o); if (!bb || !G.boxesTouch(bb, r)) return;
          var hit = SV.leaves(o).some(function (l) {
            if (l.type === 'text' || l.type === 'image') return G.boxesTouch(SV.objBBox(l), r);
            return G.polysTouchRect(SV.flatPolys(l), r, !!l.style.fill);
          });
          if (hit && sel.indexOf(o.id) < 0) sel.push(o.id);
        });
      });
      SV.select(sel);
    }
    S.marquee = null;
  }
  function guideDragMove(ev) {
    var g = S.guideDrag;
    g.pos = g.axis === 'v' ? ev.p.x : ev.p.y;
    if (S.prefs.snapGrid) { var gs = S.prefs.gridSize; g.pos = round(g.pos / gs) * gs; }
    g.out = g.axis === 'v' ? ev.sx < 0 : ev.sy < 0;
  }
  SV.beginGuideDrag = function (axis, idx, fromRuler) {
    S.guideDrag = { axis: axis, idx: idx, pos: idx != null ? S.doc.guides[axis][idx] : 0, fromRuler: fromRuler };
    if (idx != null) S.doc.guides[axis].splice(idx, 1);
    S.op = { kind: 'guide', tool: 'select' };
  };
  SV.endGuideDrag = function () {
    var g = S.guideDrag; S.guideDrag = null;
    if (!g) return;
    if (!g.out) S.doc.guides[g.axis].push(Math.round(g.pos * 100) / 100);
    SV.commit('guide');
  };

  TOOLS.select = {
    down: function (ev) {
      var p = ev.p;
      if (ev.dbl) {
        var hd = SV.hitTest(p);
        if (hd && hd.obj.type === 'text' && SV.isEditable(hd.obj)) { SV.startTextEdit(hd.obj, p); return; }
        if (hd && hd.top.type === 'group' && hd.obj.id !== hd.top.id) { SV.select([hd.obj.id]); beginMove(ev); return; }
      }
      if (S.sel.length) {
        var b = SV.selBBox();
        if (b) {
          var hn = handleAt(b, ev.sx, ev.sy);
          if (hn) { beginScale(ev, b, hn); return; }
          if (rotateZone(b, ev.sx, ev.sy)) { beginRotate(ev, b); return; }
        }
      }
      var h = SV.hitTest(p);
      if (h) {
        var target = h.top.id;
        if (S.sel.indexOf(h.obj.id) >= 0) target = h.obj.id;
        else {
          var inner = S.sel.filter(function (sid) { var so = getObj(sid); return so && sid !== h.top.id && (function c(o) { if (o.id === h.obj.id) return true; return o.type === 'group' && o.children.some(c); })(so); })[0];
          if (inner) target = inner;
        }
        if (ev.shift) {
          var i = S.sel.indexOf(target);
          var ns = S.sel.slice(); if (i >= 0) ns.splice(i, 1); else ns.push(target);
          SV.select(ns); return;
        }
        if (S.sel.indexOf(target) < 0) SV.select([target]);
        beginMove(ev);
        return;
      }
      var g = guideAt(ev);
      if (g) { SV.beginGuideDrag(g.axis, g.i); return; }
      if (!ev.shift) SV.select([]);
      beginMarquee(ev, ev.shift);
    },
    move: function (ev) {
      var k = S.op.kind;
      if (k === 'move') moveMove(ev); else if (k === 'scale') scaleMove(ev); else if (k === 'rotate') rotateMove(ev);
      else if (k === 'marquee') marqueeMove(ev); else if (k === 'guide') guideDragMove(ev);
    },
    up: function (ev) {
      var k = S.op.kind;
      if (k === 'move') moveUp(); else if (k === 'scale' || k === 'rotate') { if (S.op.changed) SV.commit(k); }
      else if (k === 'marquee') marqueeUp(); else if (k === 'guide') SV.endGuideDrag();
    },
    hover: function (ev) {
      var c = 'default';
      if (S.sel.length) {
        var b = SV.selBBox();
        if (b) { var hn = handleAt(b, ev.sx, ev.sy); if (hn) c = RESIZE_CURSORS[hn]; else if (rotateZone(b, ev.sx, ev.sy)) c = CURSORS.rotate; }
      }
      var h = SV.hitTest(ev.p);
      S.hover = h ? h.top.id : null;
      if (c === 'default' && !h && guideAt(ev)) { var g = guideAt(ev); c = g.axis === 'v' ? 'ew-resize' : 'ns-resize'; }
      setCursor(c);
    }
  };

  $.beginMarquee = beginMarquee; $.beginMove = beginMove; $.beginRotate = beginRotate; $.marqueeMove = marqueeMove; $.marqueeUp = marqueeUp; $.moveMove = moveMove; $.moveUp = moveUp; $.rotateMove = rotateMove;
})();
