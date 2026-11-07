/* Slop Slides: PPTX import, part 2 of 4: text. A text body (p:txBody / a:txBody) becomes the model's text: paragraphs of
   runs with bold, italic, underline, strike, size, colour, font and links, plus bullets, levels, alignment and space
   before. Properties are inherited the way PowerPoint does it: the master's text styles (title, body or other), the
   master and layout placeholder list styles, the shape's own list style, then the paragraph and run. The object's
   style takes the first run's values; runs keep only what differs, so the inspector's font and size fields still work.
   Theme fonts (+mj-lt, +mn-lt, or the theme's own family names) become 'heading' and 'body'. Exposes SS.pptxIn.text,
   SS.pptxIn.bodyPr and SS.pptxIn.plainText. */
(function () {
  'use strict';
  var SS = window.SS, I = SS.pptxIn, X = SS.textLayout;
  var ALIGN = { l: 'l', ctr: 'c', r: 'r', just: 'j', dist: 'j', justLow: 'j' };

  function bulletOfChar(ch) {
    if (/[–—-]/.test(ch)) return 'dash';
    if (/[→➢➤Ø]/.test(ch)) return 'arrow';
    if (/[✓✔ü]/.test(ch)) return 'check';
    return 'disc';
  }
  function spacing(el) {
    if (!el) return null;
    var pct = I.a(el, 'spcPct'), pts = I.a(el, 'spcPts');
    if (pct) return { pct: I.num(pct, 'val', 100000) / 100000 };
    if (pts) return { pts: I.num(pts, 'val', 0) / 100 };
    return null;
  }
  function font(name, ctx) {
    if (!name) return null;
    if (/^\+mj/.test(name)) return 'heading';
    if (/^\+mn/.test(name)) return 'body';
    if (name === ctx.fonts.minor) return 'body';
    if (name === ctx.fonts.major) return 'heading';
    return name;
  }
  /** Run properties (a:rPr, a:defRPr, a:endParaRPr) → { size, b, i, u, s, color, font, link } (only what is set). */
  I.rpr = function (el, ctx) {
    var o = {};
    if (!el) return o;
    if (el.hasAttribute('sz')) o.size = I.num(el, 'sz', 1800) / 100;
    if (el.hasAttribute('b')) o.b = /^(1|true)$/.test(I.att(el, 'b'));
    if (el.hasAttribute('i')) o.i = /^(1|true)$/.test(I.att(el, 'i'));
    if (el.hasAttribute('u')) o.u = I.att(el, 'u') !== 'none';
    if (el.hasAttribute('strike')) o.s = I.att(el, 'strike') !== 'noStrike';
    var f = I.fill(el, ctx);
    if (f && f.type === 'solid') o.color = f.color;
    else if (f && f.colors) o.color = f.colors[0];
    var latin = I.a(el, 'latin');
    if (latin && I.att(latin, 'typeface')) o.font = font(I.att(latin, 'typeface'), ctx);
    var link = I.a(el, 'hlinkClick'), rel = link && ctx.rels[I.rid(link, 'id')];
    if (rel && rel.external && /^(https?:|mailto:)/i.test(rel.target)) o.link = rel.target;
    return o;
  };
  /** Paragraph properties (a:pPr or a:lvlNpPr) → { align, bullet, line, before, rpr } (only what is set). */
  function ppr(el, ctx) {
    var o = { rpr: {} };
    if (!el) return o;
    if (el.hasAttribute('algn')) o.align = ALIGN[I.att(el, 'algn')] || 'l';
    if (I.a(el, 'buNone')) o.bullet = 'none';
    else if (I.a(el, 'buAutoNum')) o.bullet = /alpha/i.test(I.att(I.a(el, 'buAutoNum'), 'type') || '') ? 'alpha' : 'num';
    else if (I.a(el, 'buChar')) o.bullet = bulletOfChar(I.att(I.a(el, 'buChar'), 'char') || '•');
    else if (I.a(el, 'buBlip')) o.bullet = 'disc';
    var bc = I.a(el, 'buClr') && I.color(I.a(el, 'buClr'), ctx);
    if (bc) o.bulletColor = bc.ref;
    var ln = spacing(I.a(el, 'lnSpc')), sb = spacing(I.a(el, 'spcBef'));
    if (ln) o.line = ln;
    if (sb) o.before = sb;
    o.rpr = I.rpr(I.a(el, 'defRPr'), ctx);
    return o;
  }
  function merge(base, over) {
    var out = Object.assign({}, base, over);
    out.rpr = Object.assign({}, base.rpr, over.rpr);
    return out;
  }
  /** The resolved paragraph properties at a level, through the chain of list styles (lowest priority first). */
  function levelProps(chain, level, ctx) {
    var out = { rpr: {} };
    chain.forEach(function (lst) {
      if (!lst) return;
      out = merge(out, ppr(I.a(lst, 'defPPr'), ctx));
      out = merge(out, ppr(I.a(lst, 'lvl' + (level + 1) + 'pPr'), ctx));
    });
    return out;
  }
  /** The text body's bodyPr settings through a chain of bodyPr elements: { inset, valign, autofit }. */
  I.bodyPr = function (chain) {
    var ins = X.INSET.slice(), va = 'top', fit = 'none';
    chain.forEach(function (b) {
      if (!b) return;
      ['lIns', 'tIns', 'rIns', 'bIns'].forEach(function (k, i) { if (b.hasAttribute(k)) ins[i] = I.pt(I.num(b, k, 0)); });
      if (b.hasAttribute('anchor')) va = { t: 'top', ctr: 'middle', b: 'bottom' }[I.att(b, 'anchor')] || 'top';
      if (I.a(b, 'normAutofit')) fit = 'shrink'; else if (I.a(b, 'noAutofit') || I.a(b, 'spAutoFit')) fit = 'none';
    });
    return { inset: ins.map(function (v) { return Math.round(v * 100) / 100; }), valign: va, autofit: fit };
  };

  /** Resolved paragraphs: [{ props, runs: [{ t, size, b, i, u, s, color, font, link }] }]. A line break starts a paragraph. */
  function paragraphs(txBody, chain, ctx, over) {
    var out = [], lst = I.a(txBody, 'lstStyle');
    I.as(txBody, 'p').forEach(function (p) {
      var pPr = I.a(p, 'pPr'), level = Math.min(8, I.num(pPr, 'lvl', 0));
      // the inherited styles, then the shape style's font colour (fontRef), then the shape's own list style and paragraph
      var props = levelProps(chain, level, ctx);
      props.rpr = Object.assign(props.rpr, over);
      props = merge(merge(props, levelProps([lst], level, ctx)), ppr(pPr, ctx));
      props.level = level;
      var cur = { props: props, runs: [] };
      out.push(cur);
      I.lib.kids(p, I.lib.NS.a).forEach(function (el) {
        var n = el.localName;
        if (n === 'r' || n === 'fld') cur.runs.push(Object.assign({}, props.rpr, I.rpr(I.a(el, 'rPr'), ctx), { t: (I.a(el, 't') || {}).textContent || '' }));
        else if (n === 'br') { cur = { props: Object.assign({}, props, { before: { pts: 0 } }), runs: [], br: true }; out.push(cur); }
      });
      if (!cur.runs.length) cur.runs.push(Object.assign({}, props.rpr, I.rpr(I.a(p, 'endParaRPr'), ctx), { t: '' }));
    });
    return out;
  }
  function full(r, d) {
    return { size: r.size || d.size, b: r.b != null ? r.b : d.b, i: r.i != null ? r.i : d.i, color: r.color || d.color, font: r.font || d.font };
  }

  /**
   * A text body → { style, text } for an object. chain: the inherited list styles (lowest first); bodyChain: the
   * inherited bodyPr elements; def: the shape style's text defaults { color, font } (its fontRef), which win over the
   * inherited list styles but not over the shape's own.
   */
  I.text = function (txBody, chain, bodyChain, ctx, def) {
    var paras = paragraphs(txBody, chain, ctx, def || {});
    def = Object.assign({ size: 18, color: 'text', font: 'body', b: false, i: false }, def || {});
    var first = null;
    paras.forEach(function (p) { p.runs.forEach(function (r) { if (!first && r.t) first = r; }); });
    var f0 = full(first || (paras[0] && paras[0].runs[0]) || {}, def), p0 = paras[0] ? paras[0].props : { rpr: {} };
    var line = p0.line ? (p0.line.pct ? 1.2 * p0.line.pct : Math.max(0.6, p0.line.pts / f0.size)) : 1.2;
    var style = { font: f0.font, size: f0.size, color: f0.color, bold: !!f0.b, italic: !!f0.i, align: p0.align || 'l', lineHeight: Math.round(line * 100) / 100 };
    var out = paras.map(function (p, i) {
      var q = { runs: p.runs.map(function (r) {
        var x = { t: r.t }, rf = full(r, def);
        if (rf.size !== style.size) x.size = rf.size;
        if (!!rf.b !== style.bold) x.b = !!rf.b;
        if (!!rf.i !== style.italic) x.i = !!rf.i;
        if (rf.color !== style.color) x.color = rf.color;
        if (rf.font !== style.font) x.font = rf.font;
        if (r.u) x.u = true;
        if (r.s) x.s = true;
        if (r.link) x.link = r.link;
        return x;
      }) };
      var b = p.props.bullet && !p.br ? p.props.bullet : 'none';
      if (b !== 'none') q.bullet = b;
      if (p.props.bulletColor && b !== 'none') q.bulletColor = p.props.bulletColor;
      if (p.props.level) q.level = Math.min(4, p.props.level);
      if ((p.props.align || 'l') !== style.align) q.align = p.props.align || 'l';
      if (i > 0) { var sb = p.props.before; q.spaceBefore = sb ? Math.round((sb.pts != null ? sb.pts : sb.pct * full(p.runs[0], def).size * 1.2) * 10) / 10 : 0; }
      return q;
    });
    var bp = I.bodyPr(bodyChain.concat([I.a(txBody, 'bodyPr')]));
    return { style: style, text: { paras: out.length ? out : [{ runs: [{ t: '' }] }], valign: bp.valign, autofit: bp.autofit, inset: bp.inset } };
  };
  /** Plain text of a text body (paragraphs joined by new lines), for speaker notes. */
  I.plainText = function (txBody) {
    return I.as(txBody, 'p').map(function (p) {
      return I.lib.kids(p, I.lib.NS.a).map(function (el) { return el.localName === 'br' ? '\n' : (el.localName === 'r' || el.localName === 'fld') ? (I.a(el, 't') || {}).textContent || '' : ''; }).join('');
    }).join('\n');
  };
})();
