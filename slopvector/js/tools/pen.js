/* SlopVector — tools: Pen and Add/Delete/Convert anchor tools */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function allLeafCandidates() { return $.allLeafCandidates.apply(this, arguments); }
  function setCursor() { return $.setCursor.apply(this, arguments); }
  var CURSORS = $.CURSORS;
  var TOOLS = $.TOOLS;

  /* ================= pen & anchor tools ================= */
  function nearScreen(a, ev, px) { var s = SV.toScreen(a); return hypot(s.x - ev.sx, s.y - ev.sy) <= SV.hitPx(px || 7); }
  SV.finishPen = function () {
    if (!S.pen) return;
    var o = getObj(S.pen.id);
    S.pen = null;
    if (o) {
      o.subpaths = o.subpaths.filter(function (sp) { return sp.pts.length > 1; });
      if (!o.subpaths.length) { SV.removeObj(o.id); S.sel = S.sel.filter(function (id) { return id !== o.id; }); }
    }
    SV.commit('pen');
  };
  function deleteAnchor(o, si, i) {
    SV.toPath(o);
    var sp = o.subpaths[si]; sp.pts.splice(i, 1);
    if (sp.pts.length < 2) o.subpaths.splice(si, 1);
    if (!o.subpaths.length) { SV.removeObj(o.id); S.sel = S.sel.filter(function (id) { return id !== o.id; }); }
    S.psel = {};
  }
  function addAnchor(seg) {
    var o = seg.o; SV.toPath(o);
    var idx = G.splitSegAt(o.subpaths[seg.si], seg.i, seg.t);
    S.psel = {}; S.psel[o.id] = [seg.si + ':' + idx];
    if (S.sel.indexOf(o.id) < 0) S.sel = [o.id];
  }
  TOOLS.pen = {
    down: function (ev) {
      var o = S.pen && getObj(S.pen.id);
      if (S.pen && !o) S.pen = null;
      var snap = SV.buildSnap(S.pen ? [S.pen.id] : []);
      if (S.pen) {
        var sp = o.subpaths[S.pen.sub], first = sp.pts[0], last = sp.pts[sp.pts.length - 1];
        if (sp.pts.length >= 2 && nearScreen(first, ev)) {
          sp.closed = true;
          S.op = { kind: 'penclose', tool: 'pen', idx: 0, start: ev.p };
          return;
        }
        if (nearScreen(last, ev)) {
          last.ox = last.x; last.oy = last.y; last.s = false;
          S.op = { kind: 'pendrag', tool: 'pen', idx: sp.pts.length - 1, start: ev.p, outOnly: true };
          return;
        }
        var p = ev.shift ? SV.constrain45(last, ev.p) : SV.snapPoint(snap, ev.p);
        sp.pts.push(G.A(p.x, p.y));
        S.psel = {}; S.psel[o.id] = [S.pen.sub + ':' + (sp.pts.length - 1)];
        S.op = { kind: 'pendrag', tool: 'pen', idx: sp.pts.length - 1, start: p };
        return;
      }
      // not drawing: continue / auto add-delete on selected paths
      var sel = SV.selObjs();
      var ah = SV.hitAnchor(sel, ev.p, false);
      if (ah && ah.o.type === 'path') {
        var sp2 = ah.o.subpaths[ah.si];
        if (!sp2.closed && (ah.i === 0 || ah.i === sp2.pts.length - 1)) {
          if (ah.i === 0) ah.o.subpaths[ah.si] = G.reverseSub(sp2);
          S.pen = { id: ah.o.id, sub: ah.si };
          var L = ah.o.subpaths[ah.si].pts;
          S.op = { kind: 'pendrag', tool: 'pen', idx: L.length - 1, start: ev.p, outOnly: true };
          return;
        }
        deleteAnchor(ah.o, ah.si, ah.i); SV.commit('delete anchor'); return;
      }
      if (ah) { deleteAnchor(ah.o, ah.si, ah.i); SV.commit('delete anchor'); return; }
      var seg = SV.hitSegment(sel, ev.p);
      if (seg) { addAnchor(seg); SV.commit('add anchor'); return; }
      if (!SV.canDraw()) return;
      var p0 = SV.snapPoint(snap, ev.p);
      var np = SV.mk.path([{ closed: false, pts: [G.A(p0.x, p0.y)] }], SV.newStyle('pen'));
      SV.insertObj(np);
      S.sel = [np.id]; S.psel = {}; S.psel[np.id] = ['0:0'];
      S.pen = { id: np.id, sub: 0 };
      S.op = { kind: 'pendrag', tool: 'pen', idx: 0, start: p0 };
    },
    move: function (ev) {
      var op = S.op, o = S.pen && getObj(S.pen.id); if (!o) return;
      var sp = o.subpaths[S.pen.sub], a = sp.pts[op.idx];
      var p = ev.shift ? SV.constrain45(a, ev.p) : ev.p;
      if (hypot(p.x - a.x, p.y - a.y) * S.view.zoom < 2) return;
      op.dragged = true;
      if (op.kind === 'penclose') {
        a.ix = 2 * a.x - p.x; a.iy = 2 * a.y - p.y; a.ox = p.x; a.oy = p.y; a.s = true;
        if (ev.alt) { a.ox = op.oox != null ? op.oox : a.ox; }
      } else {
        a.ox = p.x; a.oy = p.y;
        if (!op.outOnly && !ev.alt) { a.ix = 2 * a.x - p.x; a.iy = 2 * a.y - p.y; a.s = true; } else a.s = false;
      }
    },
    up: function () {
      var op = S.op;
      var o = S.pen && getObj(S.pen.id);
      if (op.kind === 'penclose') { SV.finishPen(); return; }
      if (o) SV.commit('pen');
    },
    hover: function (ev) {
      var c = CURSORS.pen;
      if (S.pen) {
        var o = getObj(S.pen.id);
        if (o) {
          var sp = o.subpaths[S.pen.sub];
          S.pen.cursor = ev.shift ? SV.constrain45(sp.pts[sp.pts.length - 1], ev.p) : ev.p;
          if (sp.pts.length >= 2 && nearScreen(sp.pts[0], ev)) c = CURSORS.penClose;
        }
      } else {
        var sel = SV.selObjs(), ah = SV.hitAnchor(sel, ev.p, false);
        if (ah && ah.o.type === 'path' && !ah.o.subpaths[ah.si].closed && (ah.i === 0 || ah.i === ah.o.subpaths[ah.si].pts.length - 1)) c = CURSORS.penCont;
        else if (ah) c = CURSORS.penDel;
        else if (SV.hitSegment(sel, ev.p)) c = CURSORS.penAdd;
      }
      setCursor(c);
    }
  };
  TOOLS.addAnchor = {
    down: function (ev) {
      var seg = SV.hitSegment(allLeafCandidates(ev.p), ev.p);
      if (!seg) return SV.toast(SV.t('vector.msg.click_segment'));
      addAnchor(seg); SV.commit('add anchor');
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; setCursor(CURSORS.penAdd); }
  };
  TOOLS.deleteAnchor = {
    down: function (ev) {
      var ah = SV.hitAnchor(allLeafCandidates(ev.p), ev.p, false);
      if (!ah) return SV.toast(SV.t('vector.msg.click_anchor'));
      deleteAnchor(ah.o, ah.si, ah.i); SV.commit('delete anchor');
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; setCursor(CURSORS.penDel); }
  };
  TOOLS.convertAnchor = {
    down: function (ev) {
      var ah = SV.hitAnchor(allLeafCandidates(ev.p), ev.p, true);
      if (!ah) return;
      var o = ah.o; SV.toPath(o);
      if (S.sel.indexOf(o.id) < 0) { S.sel = [o.id]; }
      S.psel = {}; S.psel[o.id] = [ah.si + ':' + ah.i];
      if (ah.part !== 'a') { S.op = { kind: 'handle', tool: 'convertAnchor', id: o.id, si: ah.si, i: ah.i, part: ah.part, orig: clone(o) }; return; }
      S.op = { kind: 'convert', tool: 'convertAnchor', id: o.id, si: ah.si, i: ah.i, orig: clone(o), start: ev.p };
    },
    move: function (ev) {
      var op = S.op;
      if (op.kind === 'handle') { return TOOLS.direct.move(ev); }
      SV.replaceObj(op.id, clone(op.orig));
      var a = getObj(op.id).subpaths[op.si].pts[op.i];
      if (hypot(ev.p.x - a.x, ev.p.y - a.y) * S.view.zoom < 3) return;
      op.dragged = true;
      a.ox = ev.p.x; a.oy = ev.p.y; a.ix = 2 * a.x - ev.p.x; a.iy = 2 * a.y - ev.p.y; a.s = true;
    },
    up: function () {
      var op = S.op;
      if (op.kind === 'handle') { if (op.changed) SV.commit('convert'); return; }
      if (!op.dragged) { var a = getObj(op.id).subpaths[op.si].pts[op.i]; a.ix = a.ox = a.x; a.iy = a.oy = a.y; a.s = false; }
      SV.commit('convert');
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h ? h.obj.id : null; setCursor(CURSORS.convert); }
  };

  $.addAnchor = addAnchor; $.deleteAnchor = deleteAnchor; $.nearScreen = nearScreen;
})();
