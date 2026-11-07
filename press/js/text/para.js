/* Slop Press — paragraph preparation: styled glyphs, drop caps, elements, and positioning a broken line. */
(function () {
  'use strict';
  var PR = window.PR, F = PR.fonts, ST = PR.styles, B = PR.breaker, M = PR.model;
  var PP = PR.para = {};

  function glyph(o, c, st, extra) {
    var fk = F.key(st.font, st.fontStyle), size = st.size, ch = st.caps === 'allcaps' ? c.toUpperCase() : c;
    var adv = ch === '\t' ? 2 : ch === '\u2028' || ch === '\n' ? 0 : F.adv(fk, ch === '\u00A0' ? ' ' : ch);
    var g = { o: o, c: ch, w: adv * size + (ch === '\u2028' || ch === '\n' ? 0 : (st.tracking || 0) * size / 1000), s: st, fk: fk, size: size };
    if (extra) for (var k in extra) g[k] = extra[k];
    return g;
  }
  PP.glyph = glyph;

  /** Prepares paragraph k of story s: { st (paragraph attributes), glyphs, E (elements), drop, p0, p1, metrics }.
      env.pageNumber replaces the page-number marker (shown as '#' when unknown). */
  PP.prepare = function (doc, s, k, p0, p1, env) {
    var para = s.paras[k] || { ps: '[Basic Paragraph]', ov: {} };
    var st = ST.paraEffective(doc, para), glyphs = [];
    // walk runs to find each character's style
    var pos = 0, ri = 0;
    while (ri < s.runs.length - 1 && pos + s.runs[ri].n <= p0) { pos += s.runs[ri].n; ri++; }
    var run = s.runs[ri], runEnd = pos + (run ? run.n : 0);
    var firstStyle = null;
    for (var o = p0; o < p1; o++) {
      while (o >= runEnd && ri < s.runs.length - 1) { ri++; run = s.runs[ri]; runEnd += run.n; }
      var gs = ST.glyph(doc, para, run || { cs: null, ov: {} }), c = s.text[o];
      if (!firstStyle) firstStyle = gs;
      if (c === M.PAGE_NUM) {
        var num = env && env.pageNumber != null ? String(env.pageNumber) : '#';
        for (var d = 0; d < num.length; d++) glyphs.push(glyph(o, num[d], gs, { pn: true, syn: d > 0 }));
      } else glyphs.push(glyph(o, c, gs));
    }
    var base = firstStyle || ST.glyph(doc, para, PR.story.attrsAt(s, p0));
    var mt = F.metrics(F.key(base.font, base.fontStyle));
    var info = { st: st, base: base, glyphs: glyphs, p0: p0, p1: p1, k: k, drop: null,
      asc: mt.asc * base.size, desc: mt.desc * base.size, lead: base.leadingPt };
    // drop cap
    var N = st.dropLines | 0, nc = Math.max(1, st.dropChars | 0);
    if (N >= 2 && glyphs.length > nc && !/\s/.test(glyphs[0].c)) {
      var dg = glyphs.splice(0, nc), lead = info.lead, capR = F.metrics(dg[0].fk).cap || 0.7;
      var big = ((N - 1) * lead + capR * base.size) / capR, dw = 0;
      dg = dg.map(function (g) { var n = glyph(g.o, g.c, g.s, { drop: true, by: (N - 1) * lead }); n.size = big; n.w = F.adv(n.fk, n.c) * big; dw += n.w; return n; });
      info.drop = { glyphs: dg, lines: N, w: dw + base.size * 0.35 };
    }
    var hyph = st.hyphenate !== false;
    info.E = B.elements(glyphs, {
      hyphenate: hyph,
      hyphen: function (g) { return glyph(g.o, '-', g.s, { syn: true, hy: true }); }
    });
    // the paragraph's newline (if any) rides on the final forced break so the caret can sit before it
    if (p1 < s.text.length && s.text[p1] === '\n') info.E[info.E.length - 1].g.push(glyph(p1, '\n', base, { nl: true }));
    return info;
  };

  /** Indents for line index li of a paragraph: { left, right } relative to the column. */
  PP.indents = function (info, li) {
    var st = info.st, left = (st.indentLeft || 0) + (li === 0 ? st.indentFirst || 0 : 0);
    if (info.drop && li < info.drop.lines) left = (st.indentLeft || 0) + info.drop.w;
    return { left: Math.max(0, left), right: Math.max(0, st.indentRight || 0) };
  };

  /** Positions a line's glyphs. ln = B.line() result; x0/W = segment; last = last line of paragraph. */
  PP.position = function (info, ln, x0, W, last) {
    var align = info.st.align || 'left', extra = W - ln.nat, perSpace = 0, off = 0;
    var justify = (align === 'justify' && !last && !ln.forced) || align === 'justify-all';
    if (justify && ln.spaces > 0) perSpace = extra / ln.spaces;
    else if (align === 'right' || align === 'justify-right') off = Math.max(0, extra);
    else if (align === 'center' || align === 'justify-center') off = Math.max(0, extra / 2);
    if (justify && ln.spaces === 0 && align === 'justify' && extra < 0) off = 0;
    var x = x0 + off;
    ln.g.forEach(function (g) {
      g.x = x;
      if (g.hidden || g.nl) return;
      if (g.trail) return;
      x += g.w + (g.space && perSpace ? perSpace : 0);
    });
    ln.right = x;
    return ln;
  };

  /** Vertical metrics of a composed line (falls back to the paragraph's base style when empty). */
  PP.lineMetrics = function (info, ln) {
    var asc = 0, desc = 0, lead = 0, any = false;
    ln.g.forEach(function (g) {
      if (g.drop || g.hidden || g.nl) return;
      any = true;
      var m = F.metrics(g.fk), shift = g.s.baselineShift || 0;
      asc = Math.max(asc, m.asc * g.size + shift); desc = Math.max(desc, m.desc * g.size - shift); lead = Math.max(lead, g.s.leadingPt);
    });
    if (!any) { asc = info.asc; desc = info.desc; lead = info.lead; }
    return { asc: asc, desc: desc, lead: lead };
  };
})();
