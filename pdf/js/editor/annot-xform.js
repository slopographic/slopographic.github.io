/* Slop PDF — turning the annotations you add (text boxes, pictures, signatures, rectangles, ellipses, covers and highlight
   boxes): a selected one has a round handle above it; dragging it turns the annotation about its centre (Shift: 15° steps).
   A turned annotation (not a quarter turn) shows its box turned with it, and its handles resize it along its own edges
   (the opposite side or corner stays; a text box scales its font, a picture keeps its shape). One undo step each. The
   annotation's `rot` is drawn (ui/sheet.js), saved (io/export.js) and edited (editor/text.js) at any angle. The math is
   SlopPdfXform (xform.js); the handles are drawn in view space on the overlay, over view.js's. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, X = window.SlopPdfXform;
  var TURNS = { text: 1, image: 1, rect: 1, ellipse: 1, whiteout: 1, hlbox: 1 }, KEEP = { text: 1, image: 1, callout: 1 };
  var GAP = 22; // px between the top edge and the round handle

  /** The view angle (clockwise degrees) and the view box of annotation a. */
  S.annotBox = function (a) {
    var c = S.ctx(), va = ((((c.R - (a.rot || 0)) % 360) + 360) % 360), cv = E.toView(c.R, c.W, c.H, a.cx, a.cy);
    return { cx: cv[0], cy: cv[1], w: a.w, h: a.h, ang: va, free: Math.abs(va % 90) > 1e-6 };
  };
  function at(el, v, z) { el.style.left = (v[0] * z) + 'px'; el.style.top = (v[1] * z) + 'px'; return el; }

  var draw = S.drawSelection;
  S.drawSelection = function () {
    var out = draw.apply(this, arguments), a = Ed.getSelected();
    if (!a || !E.isBox(a) || a.hidden || a.locked || (S.editing && S.editing.id === a.id) || !S.overlay) return out;
    var b = S.annotBox(a), z = Ed.zoom;
    if (b.free) { // turned freely: the box and its handles turn with it
      U.$$('.sel-box, .handle:not([data-tb])', S.overlay).forEach(function (el) { el.remove(); });
      var box = U.h('div', { class: 'sel-box is-turned' });
      box.style.left = ((b.cx - b.w / 2) * z) + 'px'; box.style.top = ((b.cy - b.h / 2) * z) + 'px';
      box.style.width = (b.w * z) + 'px'; box.style.height = (b.h * z) + 'px'; box.style.transform = 'rotate(' + b.ang + 'deg)';
      S.overlay.appendChild(box);
      var hs = a.type === 'para' || a.type === 'note' ? [] : KEEP[a.type] ? ['nw', 'ne', 'se', 'sw'] : X.HANDLES;
      hs.forEach(function (h) { S.overlay.appendChild(at(U.h('div', { class: 'handle h-' + h + ' is-turned', 'data-h': h }), X.handleAt(b, h), z)); });
    }
    if (TURNS[a.type]) S.overlay.appendChild(at(U.h('div', { class: 'sel-rot slop-hit', 'data-h': 'rot', title: U.t('pdf.se.drag_turn'), 'aria-hidden': 'true' }), X.handleAt(b, 'rot', GAP / z), z));
    return out;
  };

  var start = S.startEdit;
  S.startEdit = function (e, h) {
    var a = Ed.getSelected();
    if (!a || a.locked || !E.isBox(a)) return start.apply(this, arguments);
    var b0 = S.annotBox(a);
    if (h !== 'rot' && !(b0.free && h !== 'move' && X.HANDLES.indexOf(h) >= 0)) return start.apply(this, arguments);
    var c = S.ctx(), orig = JSON.parse(JSON.stringify(a)), s0 = S.viewPt(e), moved = false;
    S.act = { kind: 'edit', h: h, id: a.id, orig: orig };
    S.pageEl.setPointerCapture(e.pointerId); // touch-ok: the page view is a touch surface (view-zoom.js)
    function mv(ev) {
      var v = S.viewPt(ev), dx = v[0] - s0[0], dy = v[1] - s0[1];
      if (!moved && Math.hypot(dx, dy) * c.z < 2) return;
      moved = true;
      var x = S.findAnnot(orig.id); if (!x) return;
      Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, JSON.parse(JSON.stringify(orig)));
      var ctr;
      if (h === 'rot') { x.rot = X.norm(c.R - X.turn(b0, s0[0], s0[1], v[0], v[1], ev.shiftKey)); ctr = [b0.cx, b0.cy]; }
      else {
        var r = X.resize(b0, h, dx, dy, { keep: !!KEEP[x.type] || ev.shiftKey, min: 2 });
        if (x.type === 'text') {
          x.size = U.clamp(U.round(orig.size * r.k, 1), 4, 400);
          var t = E.textLayout(x);
          x.w = t.w; x.h = t.h;
          ctr = X.keepAnchor(b0, /w/.test(h) ? 1 : -1, /n/.test(h) ? 1 : -1, t.w, t.h);
        } else { x.w = r.w; x.h = r.h; ctr = [r.cx, r.cy]; }
      }
      var pc = E.toPage(c.R, c.W, c.H, ctr[0], ctr[1]); x.cx = pc[0]; x.cy = pc[1];
      Ed.paint();
    }
    function up() {
      S.pageEl.removeEventListener('pointermove', mv); S.pageEl.removeEventListener('pointerup', up); S.pageEl.removeEventListener('pointercancel', up);
      var x = S.findAnnot(orig.id); S.act = null;
      if (!x || !moved) { Ed.paint(); return; }
      var fin = JSON.parse(JSON.stringify(x));
      Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, orig);
      S.commitPage(U.t(h === 'rot' ? 'pdf.se.undo_turn_annot' : 'pdf.ed.undo_resize_annot'), function (p) { p.annots = p.annots.map(function (y) { return y.id === fin.id ? fin : y; }); });
    }
    S.pageEl.addEventListener('pointermove', mv); S.pageEl.addEventListener('pointerup', up); S.pageEl.addEventListener('pointercancel', up);
  };
  /** Turns the selected annotation to deg (clockwise as shown), one undo step (the panel and the assistant). */
  Ed.turnSelected = function (deg) {
    var a = Ed.getSelected(); if (!a || a.locked || !E.isBox(a)) return false;
    var c = S.ctx(), id = a.id;
    S.commitPage(U.t('pdf.se.undo_turn_annot'), function (p) { p.annots.forEach(function (y) { if (y.id === id) y.rot = X.norm(c.R - deg); }); }, 'turn:' + id);
    return true;
  };
})();
