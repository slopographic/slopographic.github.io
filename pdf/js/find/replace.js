/* Slop PDF find — Replace all, in the open document. Each replacement is the cover-and-replace of the Replace text macro
   (M.coverPlan in macro/ops-edit.js), written as annotations: a white whiteout over the old characters and the new text
   in the standard font (Helvetica) on the same baseline, in the old text's colour (the whiteout takes the paper colour
   under it, not always white). Each replacement is one undo step and goes to the edit log.
   A match whose position could not be located exactly is never guessed: it is left alone. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, M = window.SlopPdfMacro, F = window.SlopPdfFind;
  var FONT = 'Helvetica';

  /** A PDF user-space rectangle (y up) as the page's annotation space: unrotated, from the top-left of the view box. */
  function toPageRect(p, x, y, w, h) {
    var g = E.geom(p), top = g.H + g.y0;
    return { x: x - g.x0, y: top - (y + h), w: w, h: h };
  }
  /** A whiteout over a PDF user-space rect {x, y, w, h}: the annotation that covers old text, in fill (default white). */
  F.coverAnnot = function (p, c, fill) {
    var r = toPageRect(p, c.x, c.y, c.w, c.h);
    return { id: U.uid('a'), type: 'whiteout', cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rot: 0, fill: fill || '#ffffff', opacity: 1 };
  };
  /** Text in the standard font with its baseline at PDF (x, y). opts: font, bold, italic, color. The layout puts the
   *  first baseline pad + 0.9 em below the top of the box, so the box is placed to land the baseline on (x, y). */
  F.textAnnot = function (p, x, y, size, text, opts) {
    opts = opts || {};
    var a = { id: U.uid('a'), type: 'text', text: text, font: opts.font || FONT, bold: !!opts.bold, italic: !!opts.italic, size: size, color: opts.color || '#000000', opacity: 1, rot: 0 };
    if (opts.weight) a.weight = opts.weight; // a face of an installed family (core/fonts-custom.js)
    var t = E.textLayout(a), g = E.geom(p), top = g.H + g.y0;
    var left = x - g.x0 - t.pad, boxTop = top - y - (t.pad + 0.9 * size);
    a.cx = left + t.w / 2; a.cy = boxTop + t.h / 2; a.w = t.w; a.h = t.h;
    return a;
  };
  /** Annotations for one match with replacement rep (already safe for the standard font). */
  F.annotsFor = function (p, m, rep) {
    var plan = M.coverPlan(m, rep, function (t, sz) { return E.measure(t, FONT, sz); }), out = [];
    // each cover in the paper colour under it (editor/edit-colours.js; white when the editor is not loaded)
    var S = SP.editor && SP.editor._, slot = S && S.slots ? S.slots.get(p.id) : null;
    var papers = plan.covers.map(function (c) { var r = toPageRect(p, c.x, c.y, c.w, c.h); return { r: r, rgb: S && S.paperColour ? S.paperColour(slot, r) : [1, 1, 1] }; });
    papers.forEach(function (q, i) { out.push(F.coverAnnot(p, plan.covers[i], S && S.hex ? S.hex(q.rgb) : null)); });
    // the new text in the old text's colour (S.textInk: the content's, else the glyph pixels', else readable on the paper)
    var ink = S && S.textInk && papers.length ? S.textInk(p, slot, m.segs.map(function (g) { return { x0: g.x0, x1: g.x1, y: g.y, fs: g.fs }; }), papers[0].r, papers[0].rgb) : null;
    if (plan.text) out.push(F.textAnnot(p, plan.text.x, plan.text.y, plan.text.size, plan.text.text, ink ? { color: ink } : null));
    return { annots: out, wide: plan.wide };
  };
  /** Applies replacements: items [{pid, m, rep}] (m is a located match from F.search). One undo step each. Resolves the
   *  counts once the pages' colours are read (the editor's text-strip.js; at once without it). */
  F.replaceMatches = async function (items) {
    var res = { done: 0, wide: 0, unsupported: 0, skipped: 0 }, S = SP.editor && SP.editor._;
    if (S && S.strip) for (const it of items) { var pg = E.pageById(it.pid); if (pg) await S.strip.ready(pg); }
    items.forEach(function (it) {
      var p = E.pageById(it.pid);
      if (!p || !it.m.precise) { res.skipped++; return; }
      var raw = String(it.rep == null ? '' : it.rep), rep = E.sanitize(raw, FONT);
      if (rep !== raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) res.unsupported++;
      var plan = F.annotsFor(p, it.m, rep);
      if (plan.wide) res.wide++;
      E.commit(U.t('pdf.find.undo_replace', { text: it.m.text }), function (st) {
        var q = st.pages.filter(function (x) { return x.id === it.pid; })[0];
        if (q) plan.annots.forEach(function (a) { q.annots.push(JSON.parse(JSON.stringify(a))); });
      });
      res.done++;
    });
    return res;
  };
})();
