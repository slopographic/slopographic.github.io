/* Slop Slides: smart guides for moving. The moving selection's left, centre and right (and top, middle, bottom) snap
   to the slide's edges and centre lines and to the other objects' edges and centres, within 5 screen pixels.
   SS.snap.guides holds the lines to draw while a move is in progress. Exposes window.SS.snap. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, St = SS.stage;
  var SN = SS.snap = { TOL: 5, guides: [] };

  function best(cands, targets, tol) {
    var out = null;
    cands.forEach(function (c) {
      targets.forEach(function (t) {
        var d = t - c;
        if (Math.abs(d) <= tol && (!out || Math.abs(d) < Math.abs(out.d))) out = { d: d, t: t };
      });
    });
    return out;
  }
  /** box: union bounds of the moving objects (before this move); others: bounds of the objects not moving. */
  SN.move = function (box, others, dx, dy) {
    var d = A.deck, tol = SN.TOL / St.k, tx = [0, d.size.w / 2, d.size.w], ty = [0, d.size.h / 2, d.size.h];
    others.forEach(function (b) { tx.push(b.x, b.x + b.w / 2, b.x + b.w); ty.push(b.y, b.y + b.h / 2, b.y + b.h); });
    var mx = [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w], my = [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h];
    var bx = best(mx, tx, tol), by = best(my, ty, tol), guides = [];
    if (bx) { dx += bx.d; guides.push({ x1: bx.t, y1: 0, x2: bx.t, y2: d.size.h }); }
    if (by) { dy += by.d; guides.push({ x1: 0, y1: by.t, x2: d.size.w, y2: by.t }); }
    SN.guides = guides;
    return { dx: dx, dy: dy };
  };
  SN.clear = function () { SN.guides = []; };
})();
