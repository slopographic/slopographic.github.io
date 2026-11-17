/* SlopVector — tools: Direct Selection (anchors, handles, segments) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function beginMarquee() { return $.beginMarquee.apply(this, arguments); }
  function beginMove() { return $.beginMove.apply(this, arguments); }
  function cur() { return $.cur.apply(this, arguments); }
  function marqueeMove() { return $.marqueeMove.apply(this, arguments); }
  function marqueeUp() { return $.marqueeUp.apply(this, arguments); }
  function moveMove() { return $.moveMove.apply(this, arguments); }
  function moveUp() { return $.moveUp.apply(this, arguments); }
  function n1() { return $.n1.apply(this, arguments); }
  function readout() { return $.readout.apply(this, arguments); }
  function restoreObjs() { return $.restoreObjs.apply(this, arguments); }
  function setCursor() { return $.setCursor.apply(this, arguments); }
  function snapshotObjs() { return $.snapshotObjs.apply(this, arguments); }
  var CURSORS = $.CURSORS;
  var TOOLS = $.TOOLS;

  /* ================= direct selection ================= */
  function allLeafCandidates(p) {
    var list = SV.selObjs().slice(), h = SV.hitTest(p);
    if (h && list.indexOf(h.obj) < 0) list.push(h.obj);
    return list;
  }
  function anyAnchorAt(p) {
    var a = SV.hitAnchor(SV.selObjs(), p, true);
    if (a) return a;
    var tops = [];
    S.doc.layers.forEach(function (L) { if (!L.hidden && !L.locked) L.children.forEach(function (o) { if (!o.hidden && !o.locked) tops.push(o); }); });
    return SV.hitAnchor(tops, p, false);
  }
  function setHandle(a, part, x, y, keepSmooth) {
    if (part === 'in') { a.ix = x; a.iy = y; } else { a.ox = x; a.oy = y; }
    if (keepSmooth && a.s) {
      var hx = part === 'in' ? a.ox : a.ix, hy = part === 'in' ? a.oy : a.iy;
      var L = hypot(hx - a.x, hy - a.y), dx = x - a.x, dy = y - a.y, l = hypot(dx, dy);
      if (l > 1e-9 && L > 1e-9) {
        var nx = a.x - dx / l * L, ny = a.y - dy / l * L;
        if (part === 'in') { a.ox = nx; a.oy = ny; } else { a.ix = nx; a.iy = ny; }
      }
    } else if (!keepSmooth) a.s = false;
  }
  SV.setHandle = setHandle;
  function beginPoints(ev, primary) {
    var ids = Object.keys(S.psel).filter(function (id) { var o = getObj(id); return o && S.psel[id].length && SV.isEditable(o); });
    if (!ids.length) return;
    S.op = { kind: 'points', tool: S.tool, start: ev.p, ids: ids, origs: snapshotObjs(ids), primary: primary, snap: SV.buildSnap(ids), moved: false };
  }
  function pointsMove(ev) {
    var op = S.op, dx = ev.p.x - op.start.x, dy = ev.p.y - op.start.y;
    if (!op.moved && hypot(dx, dy) * S.view.zoom < 2) return;
    op.moved = true;
    if (ev.shift) { var c = SV.constrain45({ x: 0, y: 0 }, { x: dx, y: dy }); dx = c.x; dy = c.y; }
    else if (op.primary) { var t = SV.snapPoint(op.snap, { x: op.primary.x + dx, y: op.primary.y + dy }); dx = t.x - op.primary.x; dy = t.y - op.primary.y; }
    restoreObjs(op.origs);
    movePoints(op.ids, dx, dy);
    readout(ev, SV.t('vector.readout.move', { x: n1(dx), y: n1(dy) }));
  }
  function movePoints(ids, dx, dy) {
    ids.forEach(function (id) {
      var o = getObj(id); if (!o) return;
      var keys = S.psel[id] || [];
      if (o.type === 'text' || o.type === 'image') { SV.transformObj(o, G.translate(dx, dy)); return; }
      var total = 0; SV.localSubs(o).forEach(function (sp) { total += sp.pts.length; });
      if (keys.length >= total) { SV.transformObj(o, G.translate(dx, dy)); return; }
      SV.toPath(o);
      keys.forEach(function (k) {
        var pr = k.split(':'), sp = o.subpaths[+pr[0]], a = sp && sp.pts[+pr[1]];
        if (!a) return;
        a.x += dx; a.y += dy; a.ix += dx; a.iy += dy; a.ox += dx; a.oy += dy;
      });
    });
  }
  SV.movePoints = movePoints;
  TOOLS.direct = {
    down: function (ev) {
      var p = ev.p, ah = anyAnchorAt(p);
      if (ah) {
        var o = ah.o, key = ah.si + ':' + ah.i;
        if (ah.part !== 'a') {
          S.op = { kind: 'handle', tool: 'direct', id: o.id, si: ah.si, i: ah.i, part: ah.part, orig: clone(o) };
          return;
        }
        if (ev.shift) {
          var cur = (S.psel[o.id] || []).slice(), j = cur.indexOf(key);
          if (j >= 0) cur.splice(j, 1); else cur.push(key);
          S.psel[o.id] = cur;
          if (S.sel.indexOf(o.id) < 0) S.sel.push(o.id);
          SV.requestRender(true); return;
        }
        if ((S.psel[o.id] || []).indexOf(key) < 0) { S.sel = [o.id]; S.psel = {}; S.psel[o.id] = [key]; SV.select(S.sel, { keepPoints: true }); }
        var A = SV.docSubs(o)[ah.si].pts[ah.i];
        beginPoints(ev, { x: A.x, y: A.y });
        return;
      }
      var h = SV.hitTest(p);
      var cands = SV.selObjs().slice(); if (h && cands.indexOf(h.obj) < 0) cands.push(h.obj);
      var seg = SV.hitSegment(cands, p);
      if (seg && (!h || h.obj.id === seg.o.id || S.sel.indexOf(seg.o.id) >= 0)) {
        var so = seg.o;
        if (ev.shift) { var ns = S.sel.slice(), k = ns.indexOf(so.id); if (k >= 0) ns.splice(k, 1); else ns.push(so.id); SV.select(ns, { keepPoints: true }); return; }
        if (S.sel.indexOf(so.id) < 0 || S.sel.length > 1) { S.psel = {}; SV.select([so.id]); }
        S.op = { kind: 'segment', tool: 'direct', id: so.id, si: seg.si, i: seg.i, t: seg.t, start: p, orig: clone(so) };
        return;
      }
      if (h) {
        var leaf = h.obj;
        if (ev.shift) { var ns2 = S.sel.slice(), k2 = ns2.indexOf(leaf.id); if (k2 >= 0) { ns2.splice(k2, 1); delete S.psel[leaf.id]; } else { ns2.push(leaf.id); SV.selectAllPoints(leaf); } SV.select(ns2, { keepPoints: true }); return; }
        if (S.sel.indexOf(leaf.id) < 0) { S.psel = {}; SV.select([leaf.id]); SV.selectAllPoints(leaf); }
        if (leaf.type === 'text' || leaf.type === 'image') { beginMove(ev, [leaf.id], 'direct'); return; }
        if (!(S.psel[leaf.id] || []).length) SV.selectAllPoints(leaf);
        beginPoints(ev, null);
        return;
      }
      if (!ev.shift) { S.psel = {}; SV.select([]); }
      beginMarquee(ev, ev.shift, 'points');
    },
    move: function (ev) {
      var op = S.op;
      if (op.kind === 'points') pointsMove(ev);
      else if (op.kind === 'move') moveMove(ev);
      else if (op.kind === 'marquee') marqueeMove(ev);
      else if (op.kind === 'handle') {
        SV.replaceObj(op.id, clone(op.orig));
        var o = getObj(op.id), a = o.subpaths[op.si].pts[op.i], p = ev.shift ? SV.constrain45(a, ev.p) : ev.p;
        setHandle(a, op.part, p.x, p.y, !ev.alt && op.tool !== 'convertAnchor');
        if (ev.alt || op.tool === 'convertAnchor') a.s = false;
        op.changed = true;
      } else if (op.kind === 'segment') {
        SV.replaceObj(op.id, clone(op.orig));
        var so = getObj(op.id); SV.toPath(so);
        var sp = so.subpaths[op.si], n = sp.pts.length, A = sp.pts[op.i], B = sp.pts[(op.i + 1) % n];
        var dx = ev.p.x - op.start.x, dy = ev.p.y - op.start.y;
        if (!op.changed && hypot(dx, dy) * S.view.zoom < 2) return;
        op.changed = true;
        if (G.isLineSeg(A, B)) {
          [A, B].forEach(function (a) { a.x += dx; a.y += dy; a.ix += dx; a.iy += dy; a.ox += dx; a.oy += dy; });
        } else {
          var t = SV.clamp(op.t, 0.12, 0.88), k = 1 / (3 * t * (1 - t));
          setHandle(A, 'out', A.ox + dx * k, A.oy + dy * k, true);
          setHandle(B, 'in', B.ix + dx * k, B.iy + dy * k, true);
        }
      }
    },
    up: function (ev) {
      var op = S.op;
      if (op.kind === 'points') { if (op.moved) SV.commit('reshape'); }
      else if (op.kind === 'move') moveUp();
      else if (op.kind === 'marquee') marqueeUp();
      else if (op.kind === 'handle' || op.kind === 'segment') { if (op.changed) SV.commit('reshape'); }
    },
    hover: function (ev) {
      var h = SV.hitTest(ev.p);
      S.hover = h ? h.obj.id : null;
      setCursor(CURSORS.direct);
    }
  };

  $.allLeafCandidates = allLeafCandidates;
})();
