/* Slop PDF — text highlight. Reads the page's text positions with pdf.js getTextContent (the data the text layer
   uses), groups the glyphs into lines, and turns a drag across the text into one quad per line: from the left edge
   of the first selected character to the right edge of the last one on that line. A line that is only partly
   covered highlights only the covered characters. Quads are page points (unrotated, from the top-left), stored as
   the annotation's pts, four per line in the order top-left, top-right, bottom-right, bottom-left. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  var mctx = null;
  function measure(str, fam) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = '100px ' + (/^(serif|sans-serif|monospace)$/.test(fam) ? fam : '"' + fam + '"');
    return mctx.measureText(str).width;
  }
  /** Fraction (0..1) of an item's width before character k, by measured glyph widths (as the text layer scales spans). */
  function frac(str, k, fam) {
    if (k <= 0) return 0;
    if (k >= str.length) return 1;
    var all = measure(str, fam);
    return all > 0 ? measure(str.slice(0, k), fam) / all : k / str.length;
  }
  /** Page-space box of the item's user-space x range [x0, x1] (glyph band from below the baseline to the ascender). */
  function box(t, x0, x1, fs, view) {
    var sx = Math.hypot(t[0], t[1]) || 1, dx = t[0] / sx, dy = t[1] / sx, ux = t[2] / fs, uy = t[3] / fs;
    var us = [], vs = [];
    [[x0, -0.22 * fs], [x0, 0.8 * fs], [x1, -0.22 * fs], [x1, 0.8 * fs]].forEach(function (c) {
      var X = t[4] + dx * c[0] + ux * c[1], Y = t[5] + dy * c[0] + uy * c[1];
      us.push(X - view[0]); vs.push(view[3] - Y);
    });
    return { x0: Math.min.apply(null, us), x1: Math.max.apply(null, us), top: Math.min.apply(null, vs), bottom: Math.max.apply(null, vs) };
  }
  /** pdf.js text content → lines [{top, bottom, mid, chars:[{x0, x1, top, bottom, ch}]}], top to bottom. */
  E.textLinesFrom = function (tc, view) {
    var glyphs = [];
    tc.items.forEach(function (it) {
      if (typeof it.str !== 'string' || !it.str.length) return;
      var t = it.transform, fs = Math.hypot(t[2], t[3]) || it.height || 10, fam = (tc.styles && tc.styles[it.fontName] && tc.styles[it.fontName].fontFamily) || 'sans-serif';
      var w = it.width || 0, n = it.str.length, chars = [];
      for (var k = 0; k < n; k++) {
        var f0 = frac(it.str, k, fam), f1 = frac(it.str, k + 1, fam);
        var b = box(t, w * f0, w * f1, fs, view);
        chars.push({ x0: b.x0, x1: b.x1, top: b.top, bottom: b.bottom, ch: it.str[k] });
      }
      var whole = box(t, 0, w, fs, view);
      glyphs.push({ top: whole.top, bottom: whole.bottom, mid: (whole.top + whole.bottom) / 2, chars: chars });
    });
    glyphs.sort(function (a, b) { return a.mid - b.mid; });
    var lines = [];
    glyphs.forEach(function (g) {
      var ln = lines[lines.length - 1];
      if (ln && Math.abs(g.mid - ln.mid) <= 0.5 * (ln.bottom - ln.top)) {
        ln.top = Math.min(ln.top, g.top); ln.bottom = Math.max(ln.bottom, g.bottom); ln.chars = ln.chars.concat(g.chars);
      } else lines.push({ top: g.top, bottom: g.bottom, mid: g.mid, chars: g.chars.slice() });
    });
    lines.forEach(function (ln) { ln.chars.sort(function (a, b) { return a.x0 - b.x0; }); });
    return lines;
  };

  /** Quads (page points, 4 per line) for a drag from a to b over the lines. */
  E.textHighlightPts = function (lines, a, b) {
    var p = [a, b].sort(function (x, y) { return (x[1] - y[1]) || (x[0] - y[0]); });
    var T = Math.min(a[1], b[1]), B = Math.max(a[1], b[1]);
    var sel = lines.filter(function (ln) {
      return (ln.mid >= T && ln.mid <= B) || (ln.top <= p[0][1] && p[0][1] <= ln.bottom) || (ln.top <= p[1][1] && p[1][1] <= ln.bottom);
    });
    var out = [];
    sel.forEach(function (ln, i) {
      var from = sel.length === 1 || i === 0 ? p[0][0] : -Infinity, to = sel.length === 1 || i === sel.length - 1 ? p[1][0] : Infinity;
      if (sel.length === 1) { from = Math.min(a[0], b[0]); to = Math.max(a[0], b[0]); }
      var x0 = Infinity, x1 = -Infinity;
      ln.chars.forEach(function (c) {
        var cx = (c.x0 + c.x1) / 2;
        if (cx < from || cx > to || !c.ch.trim()) return;
        x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1);
      });
      if (x0 >= x1) return;
      window.SlopPdfSel.lineQuad(ln, x0, x1).forEach(function (q) { out.push(q); }); // shared with the selection bar (sel-geom.js)
    });
    return out;
  };

  /** Lines of a page, cached per file page. Resolves [] for blank pages. */
  var cache = new Map();
  E.pageTextLines = function (p) {
    var key = p.f + ':' + p.i, hit = cache.get(key);
    if (hit) return hit.p;
    var f = p.blank ? null : E.files.get(p.f), entry = { v: null, p: null };
    entry.p = !f ? Promise.resolve([]) : f.doc.getPage(p.i + 1).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
      entry.v = E.textLinesFrom(tc, f.info[p.i].view); return entry.v;
    });
    entry.p.catch(function () { cache.delete(key); });
    cache.set(key, entry);
    return entry.p;
  };
  /** The lines if they are already loaded, else null. */
  E.peekTextLines = function (p) { var hit = cache.get(p.f + ':' + p.i); return hit ? hit.v : null; };

  /* ----------------------------------------------------------- pointer */
  S.texthlDown = function (e, p, pt) {
    S.act = { kind: 'texthl', a: pt, b: pt, p: p };
    S.draft = Object.assign({ id: 'draft', type: 'texthl', pts: [] }, Ed.defaults.texthl);
    E.pageTextLines(p).then(function () { Ed.paint(); }, function () { /* no text positions: nothing to highlight */ });
    S.pageEl.addEventListener('pointermove', S.onMove);
    S.pageEl.addEventListener('pointerup', S.onUp);
    S.pageEl.addEventListener('pointercancel', S.onUp);
    Ed.paint();
  };
  S.texthlMove = function (e) {
    S.act.b = S.pagePt(e);
    var lines = E.peekTextLines(S.act.p);
    S.draft.pts = lines ? E.textHighlightPts(lines, S.act.a, S.act.b) : [];
    Ed.paint();
  };
  S.texthlUp = async function () {
    var A = S.act, col = Ed.defaults.texthl || {};
    S.act = null; S.draft = null;
    if (Ed.pid !== A.p.id) { Ed.paint(); return; }
    var pts = [];
    try { pts = E.textHighlightPts(await E.pageTextLines(A.p), A.a, A.b); } catch (err) { pts = []; }
    if (!pts.length) { Ed.paint(); SlopUI.toast(U.t('pdf.ed.texthl_none')); return; }
    Ed.addAnnot({ id: U.uid('a'), type: 'texthl', color: col.color, opacity: col.opacity, pts: pts }, U.t('pdf.ed.undo_add_texthl'));
    Ed.selId = null; Ed.paint();
  };
})();
