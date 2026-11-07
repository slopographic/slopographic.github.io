/* Slop PDF — from the page's text to a paragraph frame (Edit text ▸ Paragraphs). The page's text runs (edit-text.js, the
   runs no cover hides) become lines and blocks (para-blocks.js); the blocks a press or a drag picks become one frame
   annotation (para-fonts.js) with its fonts set up, its colours read from the rendered page, and the old lines taken off
   the page the way Edit text's Lines mode does it (text-strip.js): removed from the page's content (the derived file the
   page then points at, `to`), or, when that cannot be done, the covers that hide them (whiteouts in the paper colour). The
   covers are also the preview while the frame is dragged. Nothing is committed here: para-mode.js commits the frame and
   the removal or the covers as one undo step. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, M = window.SlopPdfMacro, F = window.SlopPdfFind;
  var P = S.para = S.para || {}, B = window.SPParaBlocks;

  /** The page's runs as block items (annotation space: y down from the top of the view box). */
  P.itemsOf = function (p, runs) {
    var g = E.geom(p);
    return runs.filter(function (r) { return r.upright !== false && r.width > 0; }).map(function (r) {
      var x0 = r.x0 - g.x0;
      return { str: r.str, x0: x0, x1: x0 + r.width, base: g.y0 + g.H - r.y, top: r.box.y, bottom: r.box.y + r.box.h, fs: r.fs,
        style: r.fontName, family: r.facts ? r.facts.family : r.fam, bold: !!r.bold, italic: !!r.italic, run: r };
    });
  };
  /** The page's paragraph blocks, from the text that is still visible. */
  P.blocksOf = function (p) {
    return S.textRuns(p).then(function (r) { return B.detect(P.itemsOf(p, S.visibleRuns(p, r.runs))); });
  };
  /** The blocks a drag from a to b touches (a click: the block under it). */
  P.blocksIn = function (bs, a, b) {
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (x1 - x0 < 2 && y1 - y0 < 2) { var one = B.at(bs, a[0], a[1]); return one ? [one] : []; }
    return bs.filter(function (k) { return k.lines.some(function (l) { return l.x0 < x1 && l.x1 > x0 && l.top < y1 && l.bottom > y0; }); });
  };

  /** The pdf.js face of a run's document font, for the screen (pageFace in edit-text.js does the same for a line). */
  function noteFace(run) {
    var fo = run.pg && run.pg.commonObjs.has(run.fontName) ? run.pg.commonObjs.get(run.fontName) : null;
    if (fo && fo.loadedName && !fo.missingFile && run.ps) P.faces.set(run.ps, fo.loadedName);
  }
  /** A style for each document font of the blocks: the font to reuse (ps, its codes) and the substitute font. */
  async function stylesOf(f, p, runs) {
    var order = [], seen = new Map();
    runs.forEach(function (r) { if (!seen.has(r.fontName)) { seen.set(r.fontName, order.length); order.push(r); } });
    var styles = [];
    for (var i = 0; i < order.length; i++) {
      var run = order[i], sub;
      try { sub = await S.runFont(f, run); } catch (e) { sub = { font: run.fam, bold: run.bold, italic: run.italic, std: true }; }
      var st = { ps: null, sub: { font: sub.font, bold: !!sub.bold, italic: !!sub.italic, weight: sub.weight }, key: '', cm: {} };
      st.key = E.fontKey(st.sub);
      var info = run.ps ? await P.info(f, p.i, run.ps) : null;
      if (info) { st.ps = run.ps; st.src = { f: f.id, i: p.i }; noteFace(run); } // where the font is read from, wherever the frame goes
      Object.defineProperty(st, 'info', { value: info, enumerable: false, writable: true }); // not saved with the annotation
      styles.push(st);
    }
    return { styles: styles, index: seen };
  }
  /** Readies the fonts a frame's text needs: the codes its document fonts have, the language fonts for the rest. */
  P.readyText = async function (a) {
    var need = E.paraFontNeeds(a);
    for (var i = 0; i < a.styles.length; i++) {
      var st = a.styles[i], t = need[i].text;
      P.fillCm(st, st.info, t);
      if (!st.sub.std && !E.isStdFamily(st.sub.font)) await E.prepareFont(st.sub.font, E.fontWeight(st.sub), st.sub.italic).catch(function () { /* the standard metrics */ });
      if (E.needsScripts && E.needsScripts(t, st.key)) await E.ensureScripts(t, st.key, st.sub.bold);
    }
  };
  /** The infos of an existing frame's styles again (after a reload they are not kept), for editing its text. */
  P.reloadInfos = async function (p, a) {
    var f = E.fileOfPage(p);
    for (var i = 0; i < a.styles.length; i++) {
      var st = a.styles[i];
      var sf = st.src && E.files.get(st.src.f), from = sf || f, at = sf ? st.src.i : p.i; // a pasted frame reads its font where it came from
      if (!st.info && st.ps && from) Object.defineProperty(st, 'info', { value: await P.info(from, at, st.ps), enumerable: false, writable: true });
    }
  };

  function lineBox(l) { return { x: l.x0, y: l.top, w: l.x1 - l.x0, h: l.bottom - l.top }; }
  /** A frame for blocks of one page: resolves { annot, covers }. */
  P.fromBlocks = async function (p, bs) {
    var f = E.fileOfPage(p);
    if (!(await S.fontsReady(f))) throw new Error('cancelled');
    bs = bs.slice().sort(function (a, b) { return a.top - b.top; });
    var b0 = bs[0], l0 = b0.lines[0], fs = b0.fs, rtl = b0.rtl, align = b0.align;
    var runs = [];
    bs.forEach(function (b) { b.lines.forEach(function (l) { l.items.forEach(function (it) { runs.push(it.run); }); }); });
    var sty = await stylesOf(f, p, runs);
    var paras = bs.map(function (b) { return B.runsOf(b).map(function (r) { return { t: r.t, s: sty.index.get(r.style) || 0 }; }); });
    var x0 = Math.min.apply(null, bs.map(function (b) { return b.x0; })), x1 = Math.max.apply(null, bs.map(function (b) { return b.x1; }));
    var top = Math.min.apply(null, bs.map(function (b) { return b.top; })), w = x1 - x0, x = x0;
    // a little room, so the old lines wrap where they did (the rebuilt spaces may be a hair wider than the page's)
    if (align !== 'justify') { var slack = Math.max(1, 0.4 * fs); w += slack; if (align === 'right') x -= slack; else if (align === 'center') x -= slack / 2; }
    var first = 0, rest = 0, l1 = b0.lines[1];
    if (align === 'left' || align === 'justify' || (rtl && align === 'right')) {
      var edge = function (l) { return rtl ? x + w - l.x1 : l.x0 - x; };
      first = Math.max(0, edge(l0)); rest = l1 ? Math.max(0, edge(l1)) : 0;
      if (Math.abs(first - rest) < 0.5) first = rest = 0;
    }
    var gaps = [];
    for (var k = 1; k < bs.length; k++) gaps.push(bs[k].base - bs[k - 1].lines[bs[k - 1].lines.length - 1].base - b0.lh);
    var targets = runs.map(function (r) { return S.strip.targetOfRun(r); });
    await S.strip.ready(p); // the content's colours, read before the old lines leave it
    var took = await S.strip.take(p, targets);
    var s = S.slots.get(p.id), box = lineBox(l0), paper = S.paperColour(s, box, took.paper[0]);
    var a = {
      id: U.uid('a'), type: 'para', rot: 0, opacity: 1, color: S.textInk(p, s, targets, box, paper), paper: S.hex(paper),
      fs: fs, lh: b0.lh, asc: l0.base - top, align: align, rtl: rtl, first: first, rest: rest,
      pgap: gaps.length ? Math.max(0, gaps.reduce(function (q, v) { return q + v; }, 0) / gaps.length) : 0,
      styles: sty.styles, paras: paras, cx: x + w / 2, cy: top + 1, w: w, h: 2
    };
    await P.readyText(a);
    P.relayout(a);
    var g = E.geom(p), covers = [];
    bs.forEach(function (b) {
      b.lines.forEach(function (l) {
        var seg = { x0: l.x0 + g.x0, x1: l.x1 + g.x0, y: g.y0 + g.H - l.base, fs: l.fs };
        // a little wider than the advances: a glyph may reach past its advance (the hook of an f, the end of an r)
        M.coverPlan({ segs: [seg] }, '', function () { return 0; }).covers.forEach(function (c) { var o = 0.12 * l.fs; covers.push(F.coverAnnot(p, { x: c.x - o, y: c.y, w: c.w + 2 * o, h: c.h }, a.paper)); });
      });
    });
    return { annot: a, covers: took.to ? [] : covers, preview: covers, to: took.to };
  };

  /** Commits a frame as one undo step: a new frame with its old lines taken off the page (the derived file, or covers),
   * or a changed frame in its place. */
  P.commit = function (p, sel, a, label, coalesce) {
    var covers = sel.kind === 'block' ? sel.covers : null, to = sel.kind === 'block' ? sel.to : null, fin = JSON.parse(JSON.stringify(a));
    E.commit(label, function (st) {
      var q = st.pages.filter(function (x) { return x.id === p.id; })[0];
      if (!q) return;
      S.strip.use(q, to);
      if (covers) { covers.forEach(function (c) { q.annots.push(JSON.parse(JSON.stringify(c))); }); q.annots.push(fin); }
      else q.annots = q.annots.map(function (y) { return y.id === fin.id ? fin : y; });
    }, coalesce);
    sel.kind = 'annot'; sel.id = a.id; sel.covers = sel.preview = sel.to = null; sel.model = null; sel.pending = false;
    if (F.refresh) F.refresh();
    Ed.paint();
  };
})();
