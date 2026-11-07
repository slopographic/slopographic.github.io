/* Slop Press — snapping to page edges, margins, columns, ruler guides, baseline grid and other items. */
(function () {
  'use strict';
  var PR = window.PR, P = PR.pages, I = PR.items, V = PR.view, S = PR.state;
  var SN = PR.snap = { lines: [] };

  /** Candidate lines for a surface: { x: [..], y: [..] } in surface coordinates. exclude: item ids. */
  SN.targets = function (s, exclude) {
    var doc = S.doc, w = s.w, h = s.h, xs = [0, w, w / 2], ys = [0, h, h / 2];
    var m = P.marginsSide(doc, s.side);
    xs.push(m.left, w - m.right); ys.push(m.top, h - m.bottom);
    P.columns(doc, s.side).forEach(function (c) { xs.push(c.x, c.x + c.w); });
    var b = P.bleedSide(doc, s.side);
    xs.push(-b.left, w + b.right); ys.push(-b.top, h + b.bottom);
    (s.guides || []).forEach(function (g) { (g.axis === 'x' ? xs : ys).push(g.pos); });
    var ex = {}; (exclude || []).forEach(function (id) { ex[id] = 1; });
    s.items.forEach(function (it) {
      if (ex[it.id]) return;
      var r = I.bounds(it);
      xs.push(r.x, r.x + r.w / 2, r.x + r.w); ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    });
    return { x: xs, y: ys };
  };
  function best(vals, targets, tol) {
    var bd = tol, out = null;
    vals.forEach(function (v, k) { targets.forEach(function (t) { var d = Math.abs(t - v); if (d < bd) { bd = d; out = { d: t - v, at: t, k: k }; } }); });
    return out;
  }
  /** Snaps a rectangle being moved. Returns { dx, dy } corrections and records snap lines to draw. */
  SN.rect = function (s, r, exclude) {
    SN.lines = [];
    if (!V.show.snap) return { dx: 0, dy: 0 };
    var T = SN.targets(s, exclude), tol = 6 / V.zoom;
    var bx = best([r.x, r.x + r.w / 2, r.x + r.w], T.x, tol), by = best([r.y, r.y + r.h / 2, r.y + r.h], T.y, tol);
    if (bx) SN.lines.push({ s: s, axis: 'x', pos: bx.at });
    if (by) SN.lines.push({ s: s, axis: 'y', pos: by.at });
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0 };
  };
  /** Snaps a single point (resizing, drawing). */
  SN.point = function (s, x, y, exclude) {
    SN.lines = [];
    if (!V.show.snap) return { x: x, y: y };
    var T = SN.targets(s, exclude), tol = 6 / V.zoom;
    var bx = best([x], T.x, tol), by = best([y], T.y, tol);
    if (bx) SN.lines.push({ s: s, axis: 'x', pos: bx.at });
    if (by) SN.lines.push({ s: s, axis: 'y', pos: by.at });
    return { x: bx ? bx.at : x, y: by ? by.at : y };
  };
  SN.clear = function () { SN.lines = []; };
  SN.draw = function (ctx) {
    if (!SN.lines.length) return;
    ctx.save(); ctx.strokeStyle = '#ff3d8b'; ctx.lineWidth = 1 / V.zoom; ctx.setLineDash([3 / V.zoom, 2 / V.zoom]);
    SN.lines.forEach(function (l) {
      ctx.beginPath();
      if (l.axis === 'x') { ctx.moveTo(l.s.x + l.pos, l.s.y - 20); ctx.lineTo(l.s.x + l.pos, l.s.y + l.s.h + 20); }
      else { ctx.moveTo(l.s.x - 20, l.s.y + l.pos); ctx.lineTo(l.s.x + l.s.w + 20, l.s.y + l.pos); }
      ctx.stroke();
    });
    ctx.restore();
  };
})();
