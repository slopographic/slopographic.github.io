/* Slop PDF — Edit text in place (Ctrl+E). Click a line of text on the page and type over it: the old run is taken off the
   page (removed from the page's content, text-strip.js; covered in the colour under it only when it cannot be removed) and
   the new text is drawn at the same baseline, size and colour (the colour the content painted the run in, edit-colours.js). The new text is
   never written into the document's own subset font (that holds only the old glyphs). It is set in
   the run's family when that family is installed (shared/fonts), else in the family the person chose in the asset check
   (font-check.js), else in the closest bundled family; standard families (Helvetica, Times, Courier) stay standard. The info
   line says which font the run uses and what the new text is set in. Words of a recognised page (the invisible OCR layer,
   ocr/layer.js) are not covered by a box: their characters are replaced in the page's content, the picture under them is
   painted over with the paper colour, and the new text is drawn in Helvetica there, so the page looks edited. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, M = window.SlopPdfMacro, F = window.SlopPdfFind;
  var cache = new Map(); // file page → Promise of { pg, runs }
  Ed.editText = false;

  /** The invisible OCR layer's words of a file (ocr/layer.js), read once per file. Only files the OCR wrote have any. */
  function fileWords(f) {
    if (!f.ocrWords) f.ocrWords = SP.ocrLayer.wordsAll(f.bytes);
    return f.ocrWords;
  }
  /** Marks the runs that are OCR layer words (run.ocr): an edit to them replaces the word in the content. */
  async function markOcr(f, p, runs) {
    if (!f.ocr || !SP.ocrLayer) return;
    var ws = (await fileWords(f))[p.i] || [];
    runs.forEach(function (r) {
      r.ocr = ws.some(function (w) { return w.str !== '' && Math.abs(w.x0 - r.x0) < 0.05 && Math.abs(w.y - r.y) < 0.05; });
    });
  }
  /** Text runs of a page: one per pdf.js text item, with its box in page space, its PDF baseline and its font. */
  function runsOf(p) {
    var key = p.f + ':' + p.i;
    if (!cache.has(key)) {
      var f = E.fileOfPage(p), view = f.info[p.i].view;
      var pr = f.doc.getPage(p.i + 1).then(function (pg) {
        return pg.getTextContent().then(function (tc) {
          var runs = [];
          tc.items.forEach(function (it) {
            if (typeof it.str !== 'string' || !it.str.trim()) return;
            var t = it.transform, st = tc.styles[it.fontName] || {}, ps = S.embeddedName(pg, it.fontName);
            var facts = ps && window.SlopFontCatalog ? S.fontFacts(ps) : null;
            var label = (pg.commonObjs.has(it.fontName) && pg.commonObjs.get(it.fontName).name) || st.fontFamily || it.fontName;
            var fs = Math.hypot(t[2], t[3]) || it.height || 10, fam = (facts && facts.std) || M.text.family(st) || 'Helvetica';
            runs.push({
              str: it.str, fs: fs, fam: fam, fontName: it.fontName, label: label, ps: ps, facts: facts, embedded: !!ps,
              bold: /bold|black|heavy|semibold/i.test(label), italic: /italic|oblique/i.test(label),
              x0: t[4], y: t[5], width: it.width || 0, upright: t[0] > 0 && Math.abs(t[1]) < 0.01 * fs, box: SP.redact.itemBox(it, 0, it.str.length, view, st.fontFamily), pg: pg
            });
          });
          if (S.strip) S.strip.prefetch(p); // the content's colours, for covers when the screen cannot be read
          return markOcr(f, p, runs).then(function () { return { pg: pg, runs: runs }; });
        });
      });
      pr.catch(function () { cache.delete(key); });
      cache.set(key, pr);
    }
    return cache.get(key);
  }
  S.textRuns = function (p) { return runsOf(p); }; // the Paragraphs mode reads the same runs (para-mode.js)
  /** The run under a page point (the smallest box, with a little slack), or null. */
  function pick(runs, pt) {
    var best = null, slack = 2;
    runs.forEach(function (r) {
      var b = r.box;
      if (pt[0] < b.x - slack || pt[0] > b.x + b.w + slack || pt[1] < b.y - slack || pt[1] > b.y + b.h + slack) return;
      if (!best || b.w * b.h < best.box.w * best.box.h) best = r;
    });
    return best;
  }

  Ed.toggleEditText = function () {
    if (Ed.editText) { S.closeRun(); Ed.editText = false; SlopUI.toast(U.t('pdf.ed.et_off')); }
    else { Ed.editText = true; SlopUI.toast(U.t(Ed.paraMode ? 'pdf.ed.et_on_para' : 'pdf.ed.et_on_lines'), 5000); }
    if (S.viewer) S.viewer.classList.toggle('edit-text', Ed.editText);
  };

  /** The runs a press or a selection can open. A run that a white cover (a whiteout) hides is not on the page as the person
   * sees it any more (an earlier edit, or Remove): it is not offered, so a double click on the new text never opens the old
   * run underneath. A run is hidden when most of its box (60% or more) is covered. */
  function visibleRuns(p, runs) {
    var g = E.geom(p), R = E.rotation(p), G = window.SlopPdfSel;
    var white = (p.annots || []).filter(function (a) { return a.type === 'whiteout' && !a.hidden; }).map(function (a) {
      var v = E.annotViewRect(a, R, g.W, g.H), c = [[v.x, v.y], [v.x + v.w, v.y + v.h]].map(function (q) { return E.toPage(R, g.W, g.H, q[0], q[1]); });
      return { x0: Math.min(c[0][0], c[1][0]), y0: Math.min(c[0][1], c[1][1]), x1: Math.max(c[0][0], c[1][0]), y1: Math.max(c[0][1], c[1][1]) };
    });
    if (!white.length) return runs;
    return runs.filter(function (run) {
      var area = run.box.w * run.box.h;
      return area <= 0 || G.rectsArea(G.rectsMinus([G.rectOfBox(run.box)], white)) >= 0.4 * area;
    });
  }
  S.visibleRuns = visibleRuns;
  /** A press in edit mode: the run under the pointer opens for editing. */
  S.runDown = function (e, p) {
    var pt = S.pagePt(e);
    if (S.runEdit) { S.commitRun(); }
    runsOf(p).then(function (r) {
      var run = pick(visibleRuns(p, r.runs), pt);
      if (!run) { SlopUI.toast(U.t('pdf.ed.et_no_text_there')); return; }
      S.beginRun(p, run);
    }, function () { SlopUI.toast(U.t('pdf.ed.et_no_text_page')); });
  };
  /** A double click on the page's own text with the select tool (pointer.js): that run opens for editing, as a press does in
   * Edit text mode, and the mode stays off. The word the double click selected is let go, so the selection bar goes. */
  Ed.editRunAt = function (e, p) {
    if (window.getSelection) window.getSelection().removeAllRanges();
    S.runDown(e, p);
  };
  /** Opens a run: the document's fonts are checked first (once per document), then the new text's font is set up. A press
   * that has been overtaken by a later one (a double click) opens nothing. */
  S.beginRun = async function (p, run) {
    var token = S.runToken = (S.runToken || 0) + 1, f = E.fileOfPage(p);
    try {
      if (!(await S.fontsReady(f)) || token !== S.runToken) return;
      var font = await S.runFont(f, run);
      await S.strip.ready(p); // the run's colour from the content
      if (token === S.runToken) S.openRun(p, run, font);
    } catch (err) {
      if (token === S.runToken) { SlopUI.toast(U.t('pdf.ed.et_font_failed', { err: String(err && err.message || err) })); S.openRun(p, run, { font: run.fam, bold: run.bold, italic: run.italic, std: true }); }
    }
  };
  /** The face pdf.js loaded to draw a run's embedded font ({ family, ascent, descent } in em), or null when the file does
   * not embed it (a standard font) or the face is not in the page's fonts. The editor shows the run in it, so the text looks
   * the same as on the page; characters the subset lacks fall back to the font the new text is set in. */
  function pageFace(run) {
    var fo = run.pg && run.pg.commonObjs.has(run.fontName) ? run.pg.commonObjs.get(run.fontName) : null, found = false;
    if (!fo || fo.missingFile || !fo.loadedName || !document.fonts) return null;
    document.fonts.forEach(function (ff) { if (ff.family.replace(/["']/g, '') === fo.loadedName && ff.status === 'loaded') found = true; });
    return found ? { family: fo.loadedName, ascent: fo.ascent || 0.9, descent: -(fo.descent || -0.25) } : null;
  }
  var mctx = null;
  /** How the browser lays out a CSS font: its ascent and descent (em, the line box it uses) and the width of a text at a size
   * (px), or null when the browser does not report font metrics (the pdf.js values are used then). */
  function cssMetrics(css, weight, text, px) {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = weight + ' ' + px + 'px ' + css;
    var m = mctx.measureText(text);
    if (m.fontBoundingBoxAscent == null) return null;
    return { ascent: m.fontBoundingBoxAscent / px, descent: m.fontBoundingBoxDescent / px, width: m.width };
  }
  /** Opens the editor on a run, in place: same font (the page's own face when the file embeds it), size and baseline, on
   * the paper colour so the old text does not show through. The box grows to the right as the text gets longer (up to
   * the page edge). The run box (redact/find.js itemBox) starts 0.12 em left of the text and has its baseline 0.98 em
   * below its top. */
  S.openRun = function (p, run, font) {
    var s = S.slots.get(p.id); if (!s) return;
    if (S.runEdit) S.closeRun(); // one editor at a time
    var z = Ed.zoom, b = run.box, fs = run.fs, face = pageFace(run);
    var css = face ? '"' + face.family + '", ' + E.cssFont(font) : E.cssFont(font), weight = E.cssWeight(font);
    // the line box the browser draws this font in, so the baseline lands on the run's; and a horizontal scale so the text
    // is as wide as the PDF draws it (a standard font shows in a system font with other widths; pdf.js scales it the same way)
    var cm = cssMetrics(css, weight, run.str, fs * z);
    var asc = cm ? cm.ascent : face ? face.ascent : 0.9, desc = cm ? cm.descent : face ? face.descent : 0.25, lineH = (asc + desc) * fs;
    var k = cm && cm.width > 0 && run.width > 0 ? run.width * z / cm.width : 1;
    if (!(k > 0.5 && k < 2) || Math.abs(k - 1) < 0.01) k = 1;
    // the run's own ink on the paper round it; the field never shows the ink at under 3:1 (S.fieldColour)
    var paper01 = S.paperColour(s, run.box), ink = S.textInk(p, s, [S.strip.targetOfRun(run)], run.box, paper01);
    var paper = S.fieldColour(ink, paper01).map(function (v) { return Math.round(v * 255); });
    var input = U.h('input', { type: 'text', class: 'edit-run', value: run.str, 'aria-label': U.t('pdf.ed.edit_text'), spellcheck: 'false', dir: 'auto' });
    // widths are in the input's own (unscaled) pixels; scaleX(k) from its left edge makes them page pixels
    var minW = b.w * z / k, maxW = Math.max(minW, ((s.layer.clientWidth || Infinity) - b.x * z) / k);
    input.style.left = (b.x * z) + 'px'; input.style.top = ((b.y + 0.98 * fs - asc * fs) * z) + 'px';
    if (k !== 1) { input.style.transformOrigin = '0 0'; input.style.transform = 'scaleX(' + k + ')'; }
    input.style.width = minW + 'px'; input.style.height = (lineH * z) + 'px'; input.style.lineHeight = (lineH * z) + 'px';
    input.style.padding = '0 0 0 ' + (0.12 * fs * z / k) + 'px';
    input.style.fontSize = (fs * z) + 'px'; input.style.fontWeight = weight; input.style.fontFamily = css;
    input.style.background = 'rgb(' + paper.join(',') + ')'; input.style.color = ink; input.style.caretColor = ink;
    /** Widens the box to its text (never narrower than the run, never past the page edge). */
    function fit() {
      input.style.width = minW + 'px';
      if (input.scrollWidth > input.clientWidth) input.style.width = Math.min(maxW, input.scrollWidth + 0.12 * fs * z / k + 2) + 'px';
    }
    var info = U.h('div', { class: 'edit-info' }, U.t('pdf.ed.et_checking_font'));
    info.style.left = (b.x * z) + 'px'; info.style.top = ((b.y + b.h) * z + 4) + 'px';
    s.layer.append(input, info);
    S.runEdit = { p: p, run: run, font: font, input: input, info: info, done: false };
    input.addEventListener('input', fit);
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); S.commitRun(); }
      else if (e.key === 'Escape') { e.preventDefault(); S.closeRun(); }
    });
    input.addEventListener('blur', function () { if (S.runEdit && S.runEdit.input === input) S.commitRun(); });
    fit();
    input.focus(); input.select();
    showFontInfo(run, info, font);
  };
  /** The info line: the run's font and whether the file embeds it, and what the new text is set in. */
  function showFontInfo(run, info, font) {
    var fx = run.facts;
    if (!font.std && fx) {
      info.textContent = U.t('pdf.ed.et_font_info', { font: fx.family + ' ' + fx.weight, how: U.t(fx.subset ? 'pdf.ed.et_font_subset' : 'pdf.ed.et_font_full'),
        set: font.font + ' ' + font.weight, note: U.t(font.font === fx.family ? 'pdf.ed.et_font_installed' : 'pdf.ed.et_font_closest') });
      return;
    }
    var embedded = !!run.ps, set = E.stdFontName({ font: font.font, bold: font.bold, italic: font.italic });
    info.textContent = U.t(embedded ? 'pdf.ed.et_font_info_emb' : 'pdf.ed.et_font_info_std', { font: run.label, set: set });
  }
  S.closeRun = function () {
    var r = S.runEdit; if (!r) return;
    S.runEdit = null; r.done = true;
    r.input.remove(); r.info.remove();
  };
  /** Edit text on the run under a selection (sel-bar.js): the run that overlaps the rect {x0, y0, x1, y1} most. */
  Ed.editSelectionRun = function (p, rect) {
    return runsOf(p).then(function (r) {
      var best = null, bestA = 0;
      visibleRuns(p, r.runs).forEach(function (run) {
        var b = run.box, ox = Math.min(b.x + b.w, rect.x1) - Math.max(b.x, rect.x0), oy = Math.min(b.y + b.h, rect.y1) - Math.max(b.y, rect.y0);
        if (ox > 0 && oy > 0 && ox * oy > bestA) { best = run; bestA = ox * oy; }
      });
      if (!best) { SlopUI.toast(U.t('pdf.ed.et_no_text_rect')); return false; }
      if (!Ed.editText) Ed.toggleEditText();
      S.beginRun(p, best);
      return true;
    }, function () { SlopUI.toast(U.t('pdf.ed.et_no_text_page')); return false; });
  };
  /** The text runs of a page that a selection's rectangles {x0, y0, x1, y1} overlap (Remove, sel-actions.js). */
  Ed.runsUnder = function (p, rects) {
    return runsOf(p).then(function (r) {
      return r.runs.filter(function (run) {
        var b = run.box;
        return rects.some(function (q) { return Math.min(b.x + b.w, q.x1) > Math.max(b.x, q.x0) && Math.min(b.y + b.h, q.y1) > Math.max(b.y, q.y0); });
      });
    }, function () { return []; });
  };
  /** Applies the edited run as one undo step: cover the old run, draw the new text on its baseline. */
  S.commitRun = function () {
    var r = S.runEdit; if (!r || r.done) return;
    var text = r.input.value, run = r.run, font = r.font, p = r.p, s = S.slots.get(p.id);
    S.closeRun();
    if (text === run.str) return;
    if (run.ocr) { S.replaceOcrRun(p, run, text, s, font); return; }
    var key = E.fontKey(font);
    if (E.needsScripts && E.needsScripts(text, key)) { E.ensureScripts(text, key, font.bold).then(function () { S.coverRun(p, run, font, text, s); }); return; }
    S.coverRun(p, run, font, text, s);
  };
  /** Ordinary text: the old run is taken off the page (text-strip.js: removed from the content, or covered when it cannot
   * be) and the new text drawn in its place, as one undo step. */
  S.coverRun = async function (p, run, font, text, s) {
    var took = run.ocr ? { to: null, paper: [] } : await S.strip.take(p, [S.strip.targetOfRun(run)]); // an OCR word's picture needs a cover
    // a cover takes the paper colour round the run (not white: text on a coloured band keeps its band), and the new text
    // the run's ink: the colour the content painted it in (edit-colours.js S.textInk; read before the content changes)
    var paper = S.paperColour(s, run.box, took.paper[0]), color = S.textInk(p, s, [S.strip.targetOfRun(run)], run.box, paper), key = E.fontKey(font);
    var m = { segs: [{ x0: run.x0, x1: run.x0 + run.width, y: run.y, fs: run.fs }] };
    var plan = M.coverPlan(m, E.sanitize(text, key), function (t, sz) { return E.measure(t, key, sz); });
    var annots = took.to ? [] : plan.covers.map(function (c) { return F.coverAnnot(p, c, S.hex(paper)); });
    if (plan.text) annots.push(F.textAnnot(p, run.x0, run.y, run.fs, plan.text.text, { font: font.font, bold: font.bold, italic: font.italic, weight: font.weight, color: color }));
    E.commit(U.t('pdf.ed.undo_edit_text'), function (st) {
      var q = st.pages.filter(function (x) { return x.id === p.id; })[0];
      if (!q) return;
      S.strip.use(q, took.to);
      annots.forEach(function (a) { q.annots.push(JSON.parse(JSON.stringify(a))); });
    });
    if (F.refresh) F.refresh();
    Ed.paint();
  };
  /** Invisible OCR text: the word is replaced in the page's content, so the old word is no longer in the file (one undo
   * step; the page gets a copy of its file, as recognise does). A word that cannot be found is covered as ordinary text. */
  S.replaceOcrRun = function (p, run, text, s, font) {
    (async function () {
      var f = E.fileOfPage(p), bytes = await SP.ocrLayer.replaceWord(f.bytes, p.i, run, text, S.paperColour(s, run.box));
      if (!bytes) { S.coverRun(p, run, font, text, s); return; }
      var made = await E.registerPdf(bytes, f.name, null);
      made.noLog = true; made.ocr = true; // generated: its bytes cannot be replayed from the edit log
      E.commit(U.t('pdf.ed.undo_edit_text'), function (st) {
        var q = st.pages.filter(function (x) { return x.id === p.id; })[0];
        if (q) q.f = made.id;
      });
      if (F.refresh) F.refresh();
      Ed.paint();
    })().catch(function (e) { SlopUI.toast(U.t('pdf.ed.et_change_failed', { err: String(e && e.message || e) })); });
  };
})();
