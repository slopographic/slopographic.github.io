/* Slop Press — drawing tools: text frames, image frames, rectangles, ellipses, lines, polygons; zoom and hand. */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, M = PR.model, I = PR.items, T = PR.tools, SN = PR.snap, PT = PR.paint, H = PR.history;
  var C = PR.createTool = {};
  /** Paint defaults for new shapes (the toolbar fill/stroke chips edit these). */
  S.defaults = { fill: '#cccccc', stroke: null, sw: 1, polygonSides: 6, polygonInset: 0 };

  function activeLayer() { return PR.layers.active || S.doc.layers[S.doc.layers.length - 1].id; }
  /** Creates an item of `type` on surface s with rect r (surface coords). */
  /** The undo step of each drawing tool (keys: press/i18n/<code>/core.js). */
  var UNDO = { frame: 'press.edit.undo_new_frame', text: 'press.edit.undo_new_text', rect: 'press.edit.undo_new_rect', ellipse: 'press.edit.undo_new_ellipse', line: 'press.edit.undo_new_line', polygon: 'press.edit.undo_new_polygon' };
  C.make = function (type, s, r) {
    var extra = { layer: activeLayer() };
    if (type === 'rect' || type === 'ellipse' || type === 'polygon') { extra.fill = S.defaults.fill; extra.stroke = S.defaults.stroke; extra.sw = S.defaults.sw; }
    if (type === 'polygon') { extra.sides = S.defaults.polygonSides; extra.inset = S.defaults.polygonInset; }
    if (type === 'line') { extra.stroke = S.defaults.stroke || '#1a1a1a'; extra.sw = S.defaults.sw || 1; extra.dir = r.dir || 0; }
    var it = M.item(type === 'frame' ? 'image' : type, r.x, r.y, r.w, r.h, extra);
    var cols = PR.pages.columns(S.doc, s.side);
    if (type === 'text') { it.cols = 1; it.gutter = S.doc.columns.gutter; void cols; }
    I.add(S.doc, s.items, it, { ps: type === 'text' ? (PR.ui && PR.ui.currentParaStyle ? PR.ui.currentParaStyle() : 'Body') : null });
    return it;
  };
  /** Drag-to-create. onDone(item) runs after the item exists (before the history commit). */
  C.drag = function (type, start, e, onDone) {
    var s = V.surfaceAt(start.x, start.y);
    var p0 = SN.point(s, start.x - s.x, start.y - s.y), cur = p0, moved = false;
    function rect(ev) {
      var x0 = p0.x, y0 = p0.y, x1 = cur.x, y1 = cur.y;
      if (ev && ev.shiftKey) {
        if (type === 'line') { var a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(a) * L; y1 = y0 + Math.sin(a) * L; }
        else { var d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * d; y1 = y0 + Math.sign(y1 - y0 || 1) * d; }
      }
      if (ev && ev.altKey && type !== 'line') { x0 = p0.x - (x1 - p0.x); y0 = p0.y - (y1 - p0.y); }
      var r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      if (type === 'line') r.dir = (x1 - x0) * (y1 - y0) < 0 ? 1 : 0;
      return r;
    }
    var lastEv = e;
    T.preview = function (ctx) {
      if (!moved) return;
      var r = rect(lastEv);
      ctx.save(); ctx.translate(s.x, s.y); ctx.strokeStyle = PT.ACCENT; ctx.lineWidth = 1 / V.zoom;
      var tmp = { type: type === 'frame' || type === 'text' ? 'rect' : type, x: r.x, y: r.y, w: r.w, h: r.h, sides: S.defaults.polygonSides, inset: S.defaults.polygonInset, dir: r.dir };
      ctx.translate(r.x, r.y); I.tracePath(ctx, I.path(tmp)); ctx.stroke();
      ctx.restore();
      PR.ui && PR.ui.status && PR.ui.status.hint(PR.util.fmt(r.w, S.doc.unit, true) + ' × ' + PR.util.fmt(r.h, S.doc.unit, true));
    };
    return {
      move: function (w, ev) { lastEv = ev; cur = SN.point(s, w.x - s.x, w.y - s.y); if (Math.hypot(cur.x - p0.x, cur.y - p0.y) * V.zoom > 3) moved = true; },
      up: function (w, ev) {
        T.preview = null;
        var r = rect(ev);
        if (!moved) {
          if (type === 'text') return;
          var dflt = type === 'line' ? { w: 72, h: 0 } : { w: 72, h: 72 };
          r = { x: p0.x, y: p0.y, w: dflt.w, h: dflt.h };
        }
        if (type !== 'line' && (r.w < 2 || r.h < 2)) return;
        var it = C.make(type, s, r);
        PR.selectTool.activate(s);
        if (onDone) onDone(it);
        H.commit(PR.util.t(UNDO[type] || UNDO.rect));
        PR.select([it.id]);
        if (type === 'text' && !onDone) PR.textEdit.enter(it, 0);
      }
    };
  };
  ['frame', 'rect', 'ellipse', 'line', 'polygon'].forEach(function (type) {
    T.define(type, { down: function (w, e) { return C.drag(type, w, e); } });
  });
  T.define('text', {
    down: function (w, e) {
      var h = T.hit(w.x, w.y);
      if (h && h.it.type === 'text') return PR.textEdit.pointerDown(h, w, e);
      if (S.text) PR.textEdit.exit();
      return C.drag('text', w, e);
    },
    dbl: function (w) { var h = T.hit(w.x, w.y); if (h && h.it.type === 'text') PR.textEdit.selectWord(h, w); },
    hover: function (w) { var h = T.hit(w.x, w.y); V.canvas.style.cursor = h && h.it.type === 'text' ? 'text' : ''; }
  });
  T.define('hand', { down: function () { return null; } });
  T.define('zoom', {
    down: function (w, e) {
      var start = T.screen(e), cur = start;
      T.preview = function (ctx) { var a = V.toWorld(start.x, start.y), b = V.toWorld(cur.x, cur.y); ctx.save(); ctx.strokeStyle = PT.ACCENT; ctx.lineWidth = 1 / V.zoom; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore(); };
      return {
        move: function (w2, ev) { cur = T.screen(ev); },
        up: function (w2, ev) {
          T.preview = null;
          if (Math.abs(cur.x - start.x) > 8 && Math.abs(cur.y - start.y) > 8) {
            var a = V.toWorld(start.x, start.y), b = V.toWorld(cur.x, cur.y);
            V.fitRect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, 8);
          } else V.zoomBy(ev.altKey ? 0.5 : 2, start.x, start.y);
        }
      };
    }
  });
})();
