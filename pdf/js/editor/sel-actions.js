/* Slop PDF — the text selection actions (the buttons of sel-bar.js). Highlight, Underline and Strikethrough add text-markup
   annotations (type texthl, style highlight | underline | strike) as one undo step each, in the edit log; a press on text
   already marked in that style removes the markup instead (a toggle). Colour sets the
   colour of the next markup and recolours the markup under the selection. Remove takes the selected text off the page the
   way Edit text does (text-strip.js: removed from the content, or covers in the colour under it; OCR words emptied; no
   rasterizing, one undo step) and lets the selection go. Redact marks the selected text for the Redact
   tool, which applies it. Copy, Comment, Edit text, Replace and Find use the same snapshot. The selection box that moves and
   resizes the selected text is in sel-lift.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, T = S.sel, R = SP.redact, G = window.SlopPdfSel;
  var A = S.selAct = {};
  A.coverOf = function (b, fill) { return coverOf(b, fill); }; // sel-lift.js covers the lines it lifts the same way
  /** The paper colour round a page-space box on a page as rendered, as '#rrggbb' (edit-colours.js; white when not rendered). */
  A.paperOf = function (pid, b) { return S.paperColour ? S.hex(S.paperColour(S.slots.get(pid), b)) : '#ffffff'; };
  // undo labels and toasts per markup style (keys: pdf/i18n/en/editor*.js)
  var LABELS = { highlight: 'pdf.ed.undo_highlight_text', underline: 'pdf.ed.undo_underline_text', strike: 'pdf.ed.undo_strike_text' };
  var REMOVE = { highlight: 'pdf.ed.undo_remove_highlight', underline: 'pdf.ed.undo_remove_underline', strike: 'pdf.ed.undo_remove_strike' };
  var REMOVED = { highlight: 'pdf.ed.removed_highlight', underline: 'pdf.ed.removed_underline', strike: 'pdf.ed.removed_strike' };
  var STYLES = ['highlight', 'underline', 'strike'];
  var MATCH = 0.6; // the share of the selection's area that existing markup of the style must cover for a press to remove it
  var colour = null;

  /** The selection's quads and boxes per page, from the page's lines: [{pid, p, quads, boxes}] for the parts with text. */
  async function geometry(snap) {
    var out = [];
    for (var k = 0; k < snap.parts.length; k++) {
      var part = snap.parts[k];
      if (part.quads) { out.push(part); continue; } // a text frame's lines (block-mark.js): its quads and boxes are given
      var lines = await E.pageTextLines(part.p), quads = G.selectionQuads(lines, part.rects);
      if (quads.length) out.push({ pid: part.pid, p: part.p, quads: quads, rects: part.rects, boxes: G.selectionBoxes(lines, part.rects, 1) });
    }
    return out;
  }
  /** Whether any quad of a markup annotation (four points per line) touches one of the selection's rectangles. */
  function touches(pts, rects) {
    return G.rectsOf(pts).some(function (b) {
      return rects.some(function (r) { return b.x0 < r.x1 && r.x0 < b.x1 && b.y0 < r.y1 && r.y0 < b.y1; });
    });
  }
  /** A markup's style; text highlights made by dragging carry none and are highlights. */
  function styleOf(a) { return a.style || 'highlight'; }
  /** The texthl annotations of this style on a page. */
  function markupOn(pid, style) {
    var pg = E.state.pages.filter(function (x) { return x.id === pid; })[0];
    return pg ? (pg.annots || []).filter(function (a) { return a.type === 'texthl' && a.pts && a.pts.length && styleOf(a) === style; }) : [];
  }
  /** Whether the selection is already marked in this style: the existing markup covers at least MATCH of its area. */
  function alreadyMarked(geo, style) {
    var total = 0, uncovered = 0;
    geo.forEach(function (g) {
      var sel = G.rectsOf(g.quads), old = [];
      markupOn(g.pid, style).forEach(function (a) { old = old.concat(G.rectsOf(a.pts)); });
      total += G.rectsArea(sel);
      uncovered += G.rectsArea(G.rectsMinus(sel, old));
    });
    return total > 0 && total - uncovered >= MATCH * total;
  }
  function defaultColour() { return (Ed.defaults && Ed.defaults.texthl && Ed.defaults.texthl.color) || '#ffe14d'; }

  /** The colour the next highlight, underline or strikethrough uses. */
  A.colour = function () { return colour || defaultColour(); };
  /** Sets the colour; the markup under the selection (or under snap: a text block's, block-mark.js) takes it too (one undo
      step). */
  A.setColour = async function (col, snap) {
    colour = col;
    snap = snap || T.snap;
    if (snap) {
      E.commit(U.t('pdf.ed.undo_markup_colour'), function (st) {
        snap.parts.forEach(function (part) {
          var q = st.pages.filter(function (x) { return x.id === part.pid; })[0];
          (q ? q.annots || [] : []).forEach(function (a) { if (a.type === 'texthl' && a.pts && touches(a.pts, part.rects)) a.color = col; });
        });
      });
      Ed.paint();
    }
    T.emit();
    SlopUI.toast(U.t('pdf.ed.markup_colour_set'));
  };

  /** Removes the markup of this style under the selection: each annotation loses the parts the selection covers and keeps
      the rest; one left empty goes. One undo step. */
  function removeMarkup(geo, style) {
    E.commit(U.t(REMOVE[style]), function (st) {
      geo.forEach(function (g) {
        var cut = G.rectsOf(g.quads), pg = st.pages.filter(function (x) { return x.id === g.pid; })[0];
        if (!pg) return;
        pg.annots = pg.annots.reduce(function (keep, a) {
          if (a.type !== 'texthl' || styleOf(a) !== style || !a.pts || !touches(a.pts, cut)) { keep.push(a); return keep; }
          var rest = G.rectsMinus(G.rectsOf(a.pts), cut);
          if (rest.length) { a.pts = [].concat.apply([], rest.map(G.rectQuad)); keep.push(a); }
          return keep;
        }, []);
      });
    });
    Ed.selId = null; Ed.paint();
    SlopUI.toast(U.t(REMOVED[style]));
    T.emit();
  }

  /** Adds highlight, underline or strikethrough over the selected text, one annotation per page, one undo step. Text
      already marked in that style is unmarked instead (removeMarkup), so a second press toggles it off. snap: another
      selection's snapshot (a text block's, block-mark.js) instead of the text selection's. */
  A.markup = async function (style, snap) {
    snap = snap || T.snap; if (!snap) return;
    var geo = await geometry(snap);
    if (!geo.length) { SlopUI.toast(U.t('pdf.ed.sel_no_text')); return; }
    if (alreadyMarked(geo, style)) { removeMarkup(geo, style); return; }
    var op = style === 'highlight' ? ((Ed.defaults && Ed.defaults.texthl && Ed.defaults.texthl.opacity) || 0.4) : 1;
    var made = geo.map(function (g) { return { pid: g.pid, a: { id: U.uid('a'), type: 'texthl', style: style, color: A.colour(), opacity: op, pts: g.quads } }; });
    E.commit(U.t(LABELS[style]), function (st) {
      made.forEach(function (m) {
        var q = st.pages.filter(function (x) { return x.id === m.pid; })[0];
        if (q) q.annots.push(JSON.parse(JSON.stringify(m.a)));
      });
    });
    Ed.selId = null; Ed.paint();
    T.emit();
  };

  /** The styles the selection is already marked in, by the toggle's own rule (alreadyMarked): a Set of 'highlight',
      'underline' and 'strike'. Empty when there is no text under the selection. sel-bar.js shows it as pressed buttons. */
  A.markedStyles = async function (snap) {
    var out = new Set(), geo = snap ? await geometry(snap) : [];
    if (geo.length) STYLES.forEach(function (s) { if (alreadyMarked(geo, s)) out.add(s); });
    return out;
  };

  /** Copies the selected text (line breaks kept, as the browser gives them). */
  A.copy = async function () {
    var snap = T.snap; if (!snap) return;
    var sel = window.getSelection ? window.getSelection() : null, text = (sel && sel.toString()) || snap.text;
    function fallback() {
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      SlopUI.toast(U.t(ok ? 'pdf.ed.sel_copied' : 'pdf.ed.sel_copy_failed'));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); SlopUI.toast(U.t('pdf.ed.sel_copied')); return; } catch (e) { /* the copy command below */ }
    }
    fallback();
  };

  /** Opens the comment composer on the selection's first line (the comment tool, at that spot). */
  A.comment = function (snap) {
    snap = snap || T.snap; if (!snap) return;
    var part = snap.parts[0];
    if (Ed.pid !== part.pid) Ed.show(part.pid);
    Ed.setTool('note');
    Ed.noteUI.compose(part.p, snap.start.slice());
  };

  /** Edit text on the selection's first line, from any mode: Edit text mode comes on and the line (edit-text.js), or in
      Paragraphs mode its paragraph, opens for typing at once. */
  A.editText = async function () {
    var snap = T.snap; if (!snap) return;
    var part = snap.parts[0], r = part.rects[0];
    if (Ed.pid !== part.pid) Ed.show(part.pid);
    if (window.getSelection) window.getSelection().removeAllRanges(); // the editor takes the place of the selection
    // in Paragraphs mode the paragraph under the selection opens for typing (para-mode.js), in one step
    if (Ed.paraMode && S.para) {
      if (!Ed.editText) Ed.toggleEditText();
      var hit = S.para.blocksIn(await S.para.blocksOf(part.p), [r.x0, r.y0], [r.x1, r.y1]);
      if (hit.length) { S.para.selectBlocks(part.p, hit.slice(0, 1)); await S.para.edit(); return; }
    }
    await Ed.editSelectionRun(part.p, r);
  };

  /** Find: the selected text goes into the find bar, which searches from its first match. */
  A.find = function () {
    var snap = T.snap; if (!snap) return;
    window.SlopPdfFind.open(snap.text.slice(0, 200));
  };
  /** Replace: the Replace dialog opens with the selected text as the find text. */
  A.replace = function () {
    var snap = T.snap; if (!snap) return;
    window.SlopPdfFind.openReplace(snap.text.slice(0, 200), { caseSensitive: false, wholeWord: false });
  };

  /** A white cover over one selected line (page space, top-left origin): the whiteout Edit text makes for cleared text. */
  function coverOf(b, fill) { return { id: U.uid('a'), type: 'whiteout', cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: 0, fill: fill || '#ffffff', opacity: 1 }; }
  /** OCR words under the selection are emptied in the page's content (OL.replaceWord), one new file per document file
      touched. Returns [{file, pids}] for the commit; a word that cannot be found keeps only its cover. */
  async function emptyOcrWords(geo) {
    var files = new Map();
    geo.forEach(function (g) {
      var f = E.fileOfPage(g.p); if (!f) return;
      if (!files.has(f.id)) files.set(f.id, { f: f, bytes: f.bytes, pids: [], changed: false });
      files.get(f.id).pids.push(g.pid);
    });
    var out = [];
    for (const [fid, job] of files) {
      for (const g of geo.filter(function (x) { return x.p.f === fid && job.f.ocr; })) {
        var runs = (await Ed.runsUnder(g.p, g.rects)).filter(function (r) { return r.ocr; });
        for (const run of runs) {
          var next = await SP.ocrLayer.replaceWord(job.bytes, g.p.i, run, '', null);
          if (next) { job.bytes = next; job.changed = true; }
        }
      }
      if (job.changed) {
        var made = await E.registerPdf(job.bytes, job.f.name, null);
        made.noLog = true; made.ocr = true; // generated: its bytes cannot be replayed from the edit log
        out.push({ to: made.id, pids: job.pids });
      }
    }
    return out;
  }

  /** The targets (user space) of a selection on a page: the part of each run under it that its rectangles cross. */
  function targetsOf(p, runs, rects) {
    var gx = E.geom(p).x0, out = [];
    runs.forEach(function (run) {
      var b = run.box;
      rects.forEach(function (q) {
        if (!(Math.min(b.y + b.h, q.y1) > Math.max(b.y, q.y0))) return;
        var x0 = Math.max(run.x0, q.x0 + gx), x1 = Math.min(run.x0 + run.width, q.x1 + gx);
        if (x1 > x0) out.push(S.strip.targetOfRun(run, x0, x1));
      });
    });
    return out;
  }
  /** Lets the selection go: the browser's, the snapshot, and with them the bar and the selection box. */
  function letGo() {
    if (window.getSelection) window.getSelection().removeAllRanges();
    T.snap = null; T.range = null; T.dismissedKey = null;
    T.emit();
  }
  /** Remove: the selected text leaves the page the way Edit text takes it off (text-strip.js): removed from the page's
      content where it can be, else a cover in the colour under each selected line; OCR words under it are emptied in the
      content. No page image is rebuilt and nothing asks first. One undo step; the selection goes. */
  A.remove = async function () {
    var snap = T.snap; if (!snap) return;
    var geo = await geometry(snap);
    if (!geo.length) { SlopUI.toast(U.t('pdf.ed.sel_no_text')); return; }
    var covers = [], moves = [], plain = [];
    for (const g of geo) {
      var runs = await Ed.runsUnder(g.p, g.rects), took = { to: null, paper: [] };
      if (!runs.some(function (r) { return r.ocr; })) { took = await S.strip.take(g.p, targetsOf(g.p, runs, g.rects)); plain.push(g); }
      if (took.to) { moves.push({ pid: g.pid, to: took.to }); continue; }
      var slot = S.slots.get(g.pid);
      g.boxes.forEach(function (b, i) { covers.push({ pid: g.pid, a: coverOf(b, S.hex(S.paperColour(slot, b, took.paper[i] || took.paper[0]))) }); });
    }
    var files = await emptyOcrWords(geo.filter(function (g) { return plain.indexOf(g) < 0; }));
    E.commit(U.t('pdf.ed.undo_remove_text'), function (st) {
      var page = function (pid) { return st.pages.filter(function (x) { return x.id === pid; })[0]; };
      moves.forEach(function (m) { var q = page(m.pid); if (q) S.strip.use(q, m.to); });
      covers.forEach(function (c) { var q = page(c.pid); if (q) q.annots.push(JSON.parse(JSON.stringify(c.a))); });
      files.forEach(function (fl) { fl.pids.forEach(function (pid) { var q = page(pid); if (q) q.f = fl.to; }); });
    });
    Ed.selId = null;
    letGo();
    Ed.paint();
    SlopUI.toast(U.t('pdf.ed.text_removed'));
  };

  /** Redact: the selected lines become redaction marks (R.mark, the Redact tool's marks). Nothing is applied: the marks are
      burned in by Apply redactions in the Redact tool. One undo step. */
  A.redact = async function (snap) {
    snap = snap || T.snap; if (!snap) return;
    var geo = await geometry(snap), made = [];
    geo.forEach(function (g) { g.boxes.forEach(function (b) { made.push({ pid: g.pid, a: R.mark(b, snap.text.slice(0, 40)) }); }); });
    if (!made.length) { SlopUI.toast(U.t('pdf.ed.sel_no_text')); return; }
    E.commit(U.t('pdf.ed.undo_mark_redaction'), function (st) {
      made.forEach(function (m) {
        var q = st.pages.filter(function (x) { return x.id === m.pid; })[0];
        if (q) q.annots.push(JSON.parse(JSON.stringify(m.a)));
      });
    });
    Ed.selId = null; Ed.paint();
    SlopUI.toast(U.t('pdf.ed.marked_redaction', { n: made.length }));
    T.emit();
  };
})();
