/* SlopVector — tools: Pencil, Paintbrush, shape tools and Type */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function n1() { return $.n1.apply(this, arguments); }
  function readout() { return $.readout.apply(this, arguments); }
  function setCursor() { return $.setCursor.apply(this, arguments); }
  var TOOLS = $.TOOLS;

  /* ================= pencil / brush ================= */
  function freehandTool(kind) {
    return {
      // A pen's pressure (Apple Pencil, S Pen) is kept per point; the stroke's width follows its mean.
      down: function (ev) { if (!SV.canDraw()) return; S.op = { kind: 'pencil', tool: kind, pts: [ev.p], pres: ev.pressure != null ? [ev.pressure] : null }; },
      move: function (ev) {
        var pts = S.op.pts, l = pts[pts.length - 1];
        if (hypot(ev.p.x - l.x, ev.p.y - l.y) * S.view.zoom >= 1.5) { pts.push(ev.p); if (S.op.pres && ev.pressure != null) S.op.pres.push(ev.pressure); }
      },
      up: function () {
        var pts = S.op.pts; if (pts.length < 3) return;
        var z = S.view.zoom, closed = pts.length > 12 && hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) * z < 12;
        var sp = G.fitFreehand(pts, 2.4 / z, closed);
        if (!sp || sp.pts.length < 2) return;
        var o = SV.mk.path([sp], SV.newStyle(kind === 'brush' ? 'brush' : 'pencil')), pres = S.op.pres;
        SV.lastPressure = null;
        if (pres && pres.length && o.style.stroke) {
          var mean = pres.reduce(function (s, v) { return s + v; }, 0) / pres.length;
          SV.lastPressure = mean;
          o.style.sw = Math.round(o.style.sw * (0.4 + 1.2 * mean) * 100) / 100; // 0.5, a pen's resting pressure, keeps the width
        }
        if (SV.insertObj(o)) { SV.select([o.id]); SV.commit(kind); }
      }
    };
  }
  TOOLS.pencil = freehandTool('pencil');
  TOOLS.brush = freehandTool('brush');

  /* ================= shape tools ================= */
  function shapeTool(kind) {
    return {
      down: function (ev) {
        if (!SV.canDraw()) return;
        var snap = SV.buildSnap([]);
        S.op = { kind: 'shape', tool: kind, p0: SV.snapPoint(snap, ev.p), snap: snap, obj: null, sx: ev.sx, sy: ev.sy };
        S.snapLines = [];
      },
      move: function (ev) {
        var op = S.op;
        if (!op.obj && hypot(ev.sx - op.sx, ev.sy - op.sy) < 3) return;
        op.last = ev;
        updateShape(op, ev);
      },
      up: function () {
        var op = S.op;
        if (!op.obj) { SV.ui.shapeDialog(kind, op.p0); return; }
        SV.select([op.obj.id]); SV.commit(kind);
      }
    };
  }
  function updateShape(op, ev) {
    var kind = op.tool, p0 = op.p0, p = SV.snapPoint(op.snap, ev.p), st;
    if (!op.obj) {
      st = SV.newStyle(kind === 'line' ? 'line' : 'shape');
      if (kind === 'rect' || kind === 'rrect') op.obj = SV.mk.rect(0, 0, 0, 0, kind === 'rrect' ? S.shape.radius : 0, st);
      else if (kind === 'ellipse') op.obj = SV.mk.ellipse(0, 0, 0, 0, st);
      else if (kind === 'polygon') op.obj = SV.mk.polygon(0, 0, 0, S.shape.sides, st);
      else if (kind === 'star') op.obj = SV.mk.star(0, 0, 0, 0, S.shape.points, st);
      else if (kind === 'line') op.obj = SV.mk.path([{ closed: false, pts: [G.A(0, 0), G.A(0, 0)] }], st);
      SV.insertObj(op.obj); S.sel = [op.obj.id];
    }
    var o = getObj(op.obj.id); if (!o) return;
    var dx = p.x - p0.x, dy = p.y - p0.y;
    if (kind === 'rect' || kind === 'rrect' || kind === 'ellipse') {
      if (ev.shift) { var s = max(abs(dx), abs(dy)); dx = (dx < 0 ? -1 : 1) * s; dy = (dy < 0 ? -1 : 1) * s; }
      var x, y, w, h;
      if (ev.alt) { w = abs(dx) * 2; h = abs(dy) * 2; x = p0.x - abs(dx); y = p0.y - abs(dy); }
      else { w = abs(dx); h = abs(dy); x = min(p0.x, p0.x + dx); y = min(p0.y, p0.y + dy); }
      if (kind === 'ellipse') { o.cx = x + w / 2; o.cy = y + h / 2; o.rx = w / 2; o.ry = h / 2; }
      else { o.x = x; o.y = y; o.w = w; o.h = h; }
      readout(ev, SV.t('vector.readout.size', { w: n1(w), h: n1(h) }));
    } else if (kind === 'polygon' || kind === 'star') {
      var r = hypot(dx, dy), ang = ev.shift ? 0 : Math.atan2(dy, dx) + PI / 2;
      o.cx = p0.x; o.cy = p0.y;
      if (kind === 'polygon') { o.r = r; o.sides = S.shape.sides; } else { o.r1 = r; o.r2 = r * S.shape.inner; o.points = S.shape.points; }
      o.m = G.rotate(ang, p0.x, p0.y);
      readout(ev, kind === 'polygon' ? SV.t('vector.readout.polygon', { n: S.shape.sides, r: n1(r) }) : SV.t('vector.readout.star', { n: S.shape.points, r: n1(r) }));
    } else if (kind === 'line') {
      var e = ev.shift ? SV.constrain45(p0, ev.p) : p, a = ev.alt ? { x: 2 * p0.x - e.x, y: 2 * p0.y - e.y } : p0;
      var sp = o.subpaths[0]; sp.pts = [G.A(a.x, a.y), G.A(e.x, e.y)];
      var deg = -Math.atan2(e.y - a.y, e.x - a.x) * 180 / PI;
      readout(ev, SV.t('vector.readout.line', { l: n1(hypot(e.x - a.x, e.y - a.y)), deg: n1(deg) }));
    }
  }
  SV.updateShapeOp = function () { if (S.op && S.op.kind === 'shape' && S.op.obj && S.op.last) { updateShape(S.op, S.op.last); SV.requestRender(); } };
  ['rect', 'rrect', 'ellipse', 'polygon', 'star', 'line'].forEach(function (k) { TOOLS[k] = shapeTool(k); });

  /* ================= type ================= */
  TOOLS.type = {
    down: function (ev) {
      var h = SV.hitTest(ev.p);
      if (h && h.obj.type === 'text' && SV.isEditable(h.obj)) { SV.startTextEdit(h.obj, ev.p); return; }
      if (!SV.canDraw()) return;
      var o = SV.mk.text(ev.p.x, ev.p.y, '', clone(S.font), SV.newStyle('text'));
      SV.insertObj(o); S.sel = [o.id];
      SV.startTextEdit(o, null, { isNew: true });
    },
    hover: function (ev) { var h = SV.hitTest(ev.p); S.hover = h && h.obj.type === 'text' ? h.obj.id : null; setCursor('text'); }
  };
  SV.startTextEdit = function (o, clickP, opts) {
    opts = opts || {};
    if (S.pen) SV.finishPen();
    S.editing = { id: o.id, isNew: !!opts.isNew, orig: o.text };
    S.sel = [o.id]; S.psel = {};
    var ta = D.textEditor;
    // a phone's on-screen keyboard (shared/input/keyboard.js): the view pans so the edited text shows above it
    ta.slopKeyboard = ta.slopKeyboard || { reveal: function (need) { SV.panView(0, -need.dy); SV.positionEditor(); SV.requestRender(true); } };
    ta.value = o.text;
    ta.style.display = 'block';
    SV.positionEditor();
    ta.focus({ preventScroll: true });
    var idx = o.text.length;
    if (clickP) idx = caretIndexAt(o, clickP);
    ta.setSelectionRange(idx, idx);
    SV.requestRender(true);
  };
  function caretIndexAt(o, p) {
    var lay = SV.textLayout(o), q = G.ap(G.inv(o.m), p.x, p.y);
    var li = SV.clamp(Math.floor((q.y - (o.y - lay.asc) + (lay.L - lay.asc - lay.desc) / 2) / lay.L), 0, lay.lines.length - 1);
    var line = lay.lines[li], w = lay.widths[li], f = o.font;
    var x0 = f.align === 'center' ? o.x - w / 2 : f.align === 'right' ? o.x - w : o.x;
    var c = document.createElement('canvas').getContext('2d'); c.font = SV.fontCSS(f);
    var best = 0, bestD = Infinity;
    for (var k = 0; k <= line.length; k++) {
      var xx = x0 + c.measureText(line.slice(0, k)).width + lay.tr * k, d = abs(xx - q.x);
      if (d < bestD) { bestD = d; best = k; }
    }
    var idx = 0; for (var j = 0; j < li; j++) idx += lay.lines[j].length + 1;
    return idx + best;
  }
  SV.positionEditor = function () {
    if (!S.editing) return;
    var o = getObj(S.editing.id); if (!o) return;
    var ta = D.textEditor, f = o.font, lay = SV.textLayout(Object.assign({}, o, { text: ta.value, id: '__edit' }));
    var M = G.mul(SV.viewM(), o.m);
    var w = max(lay.W, f.size * 0.5) + f.size * 0.6;
    var left = f.align === 'center' ? o.x - w / 2 : f.align === 'right' ? o.x - w + f.size * 0.3 : o.x;
    var top = o.y - ((lay.L - (lay.asc + lay.desc)) / 2 + lay.asc);
    var fill = typeof o.style.fill === 'string' ? o.style.fill : (o.style.fill && o.style.fill.stops ? o.style.fill.stops[0].c : '#000');
    ta.style.font = SV.fontCSS(f);
    ta.style.lineHeight = lay.L + 'px';
    ta.style.letterSpacing = lay.tr + 'px';
    ta.style.textAlign = f.align || 'left';
    ta.style.width = w + 'px';
    ta.style.height = (lay.lines.length * lay.L + 2) + 'px';
    ta.style.color = fill;
    ta.style.transform = 'matrix(' + M.join(',') + ') translate(' + left + 'px,' + top + 'px)';
  };
  SV.commitTextEdit = function (opts) {
    if (!S.editing) return;
    var ed = S.editing, o = getObj(ed.id), ta = D.textEditor;
    S.editing = null;
    ta.style.display = 'none'; ta.blur();
    if (o) {
      o.text = ta.value;
      if (!o.text.trim()) { SV.removeObj(o.id); S.sel = S.sel.filter(function (id) { return id !== o.id; }); }
    }
    SV.commit('type');
    if (opts && opts.toSelect) SV.setTool('select');
    SV.requestRender(true);
  };
  SV.onEditorInput = function () {
    if (!S.editing) return;
    var o = getObj(S.editing.id); if (!o) return;
    o.text = D.textEditor.value;
    SV.positionEditor();
    SV.requestRender(true);
  };
})();
