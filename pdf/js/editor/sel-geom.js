/* Slop PDF — text selection geometry (pure, no DOM; node-tested in tests/node/pdf-sel-geom.test.mjs). A selection is a
   set of page-space rectangles (the client rectangles of the pdf.js text layer, converted by sel-track.js). A line of
   text (editor/texthl.js, E.textLinesFrom) is selected by the characters whose centres lie inside a rectangle. Each
   selected line gives the same quad the text highlight uses (lineQuad), so highlight, underline, strike and the
   redaction box for Remove all come from one rule. Points are unrotated page points from the top-left. */
(function () {
  'use strict';
  var G = window.SlopPdfSel = window.SlopPdfSel || {};

  function r2(v) { return Math.round(v * 100) / 100; }
  /** The four corners of a line piece from x0 to x1: top-left, top-right, bottom-right, bottom-left. */
  G.lineQuad = function (ln, x0, x1) {
    return [[x0, ln.top], [x1, ln.top], [x1, ln.bottom], [x0, ln.bottom]].map(function (q) { return [r2(q[0]), r2(q[1])]; });
  };
  /** Per line with selected characters: {ln, x0, x1}. rects are {x0, y0, x1, y1}. Blank characters do not count. */
  G.selectedSpans = function (lines, rects) {
    var out = [];
    lines.forEach(function (ln) {
      var x0 = Infinity, x1 = -Infinity;
      ln.chars.forEach(function (c) {
        if (!c.ch || !c.ch.trim()) return;
        var cx = (c.x0 + c.x1) / 2, cy = (c.top + c.bottom) / 2;
        var inside = rects.some(function (r) { return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; });
        if (!inside) return;
        x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1);
      });
      if (x0 < x1) out.push({ ln: ln, x0: x0, x1: x1 });
    });
    return out;
  };
  /** Quads for a selection: four points per selected line, in line order (the highlight's pts format). */
  G.selectionQuads = function (lines, rects) {
    var out = [];
    G.selectedSpans(lines, rects).forEach(function (s) { G.lineQuad(s.ln, s.x0, s.x1).forEach(function (q) { out.push(q); }); });
    return out;
  };
  /** Boxes {x, y, w, h} for a selection, one per selected line, for the redaction marks (Remove). pad is in points. */
  G.selectionBoxes = function (lines, rects, pad) {
    var k = pad || 0;
    return G.selectedSpans(lines, rects).map(function (s) {
      return { x: s.x0 - k, y: s.ln.top - k, w: s.x1 - s.x0 + 2 * k, h: s.ln.bottom - s.ln.top + 2 * k };
    });
  };
  /** The line of an underline or strike across one line quad: {x0, x1, y, w} in page points. The underline sits on the
      bottom edge of the line, the strike through its middle; the width scales with the line's height. */
  G.markLine = function (q, style) {
    var top = q[0][1], bottom = q[3][1], w = Math.max(0.8, r2((bottom - top) * 0.07));
    var y = style === 'underline' ? bottom - w / 2 : (top + bottom) / 2;
    return { x0: q[0][0], x1: q[1][0], y: r2(y), w: w };
  };
  /** The page-space rectangle of a box {x, y, w, h}, as the rects above. */
  G.rectOfBox = function (b) { return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }; };
  /** Rectangles {x0, y0, x1, y1} for a flat list of points, four per quad (the bounding box of each quad). */
  G.rectsOf = function (pts) {
    var out = [];
    for (var k = 0; k + 3 < pts.length; k += 4) {
      var xs = [pts[k][0], pts[k + 1][0], pts[k + 2][0], pts[k + 3][0]], ys = [pts[k][1], pts[k + 1][1], pts[k + 2][1], pts[k + 3][1]];
      out.push({ x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) });
    }
    return out;
  };
  /** The four points of a rectangle, in the quad order the markup uses (top-left, top-right, bottom-right, bottom-left). */
  G.rectQuad = function (r) { return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(function (q) { return [r2(q[0]), r2(q[1])]; }); };
  /** Total area of rectangles (overlaps counted once per rectangle). */
  G.rectsArea = function (rects) { return rects.reduce(function (s, r) { return s + (r.x1 - r.x0) * (r.y1 - r.y0); }, 0); };
  /** The parts of the rectangles not covered by any of the cut rectangles: the rectangles left after cutting. */
  G.rectsMinus = function (rects, cuts) {
    var out = [];
    rects.forEach(function (a) {
      var pieces = [a];
      cuts.forEach(function (c) { pieces = pieces.reduce(function (acc, p) { return acc.concat(cut(p, c)); }, []); });
      out = out.concat(pieces);
    });
    return out;
  };
  /** Rectangle a with rectangle c removed: up to four pieces (the bands above and below c, and the sides beside it). */
  function cut(a, c) {
    if (c.x1 <= a.x0 || c.x0 >= a.x1 || c.y1 <= a.y0 || c.y0 >= a.y1) return [a];
    var out = [], my0 = Math.max(a.y0, c.y0), my1 = Math.min(a.y1, c.y1);
    if (c.y0 > a.y0) out.push({ x0: a.x0, x1: a.x1, y0: a.y0, y1: c.y0 });
    if (c.y1 < a.y1) out.push({ x0: a.x0, x1: a.x1, y0: c.y1, y1: a.y1 });
    if (c.x0 > a.x0) out.push({ x0: a.x0, x1: c.x0, y0: my0, y1: my1 });
    if (c.x1 < a.x1) out.push({ x0: c.x1, x1: a.x1, y0: my0, y1: my1 });
    return out;
  }
})();
