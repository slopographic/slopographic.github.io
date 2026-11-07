/* Slop PDF — typing inside a paragraph frame (Edit text ▸ Paragraphs, para-mode.js). The frame opens as one flowing text
   box over the page (contenteditable, in the paragraph's own face, size, line pitch, alignment and indents, on the paper
   colour): the browser gives the caret, selection, typing and delete, and rewraps the text live in the frame's width.
   Enter starts a new paragraph, Shift+Enter a line break, Ctrl+B / Ctrl+I bold and italic; bold and italic runs of the old
   text are kept. Ctrl+Enter or a click elsewhere applies, Escape cancels. Applying lays the text out again with the
   document font's own widths (para-fonts.js) and commits it as one undo step. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para = S.para || {};
  var mctx = null;

  /** The browser's ascent and descent (em) of a CSS font, or the usual 0.9 and 0.25. */
  function metrics(css, weight) {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = weight + ' 100px ' + css;
    var m = mctx.measureText('Hg');
    return m.fontBoundingBoxAscent ? { a: m.fontBoundingBoxAscent / 100, d: m.fontBoundingBoxDescent / 100 } : { a: 0.9, d: 0.25 };
  }
  /** How much wider the document draws the text than the browser does in the same face (its widths, para-fonts.js), so
   * the box can be stretched to wrap where the saved frame will (the browser's own face may be a system font). */
  function stretch(a) {
    var st = a.styles[0], t = a.paras.map(function (pr) { return pr.filter(function (r) { return r.s === 0; }).map(function (r) { return r.t; }).join(''); }).join(' ').slice(0, 400);
    if (!t.trim()) return 1;
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = E.cssWeight(st.sub) + ' ' + (st.sub.italic ? 'italic ' : '') + '100px ' + P.cssOf(st, false);
    var css = mctx.measureText(t).width * a.fs / 100, pdf = a.rtl ? E.measure(t, st.key, a.fs) : P.measure(st, t, a.fs), k = css > 0 ? pdf / css : 1;
    return k > 0.5 && k < 2 && Math.abs(k - 1) > 0.01 ? k : 1;
  }
  function spanFor(a, s, text) {
    var st = a.styles[s] || a.styles[0], sub = st.sub || {};
    var sp = U.h('span', { 'data-s': String(s) });
    sp.style.fontFamily = P.cssOf(st, false); sp.style.fontWeight = E.cssWeight(sub); sp.style.fontStyle = sub.italic ? 'italic' : 'normal';
    sp.textContent = text;
    return sp;
  }
  /** The frame's paragraphs as blocks of styled spans ("\n" is a <br>). */
  function fill(box, a) {
    a.paras.forEach(function (runs) {
      var d = U.h('div');
      runs.forEach(function (r) {
        String(r.t).split('\n').forEach(function (part, k) { if (k) d.appendChild(U.h('br')); if (part) d.appendChild(spanFor(a, r.s, part)); });
      });
      if (!d.childNodes.length || d.lastChild.nodeName === 'BR') d.appendChild(U.h('br'));
      box.appendChild(d);
    });
  }
  /** The style of text in an element: its span's, or a style with the bold and italic the text now has (an existing one when
   * the frame has it, else the span's substitute font in that weight and slant). */
  function styleOf(a, el) {
    var base = el.closest('[data-s]'), s0 = base ? +base.dataset.s : 0, cs = getComputedStyle(el);
    var bold = parseInt(cs.fontWeight, 10) >= 600, italic = cs.fontStyle !== 'normal', st0 = a.styles[s0] || a.styles[0];
    if (!!st0.sub.bold === bold && !!st0.sub.italic === italic) return s0;
    for (var i = 0; i < a.styles.length; i++) {
      var st = a.styles[i];
      if (!!st.sub.bold === bold && !!st.sub.italic === italic && st.sub.font === st0.sub.font) return i;
    }
    var sub = { font: st0.sub.font, bold: bold, italic: italic, weight: bold ? Math.max(700, st0.sub.weight || 0) : 400 };
    a.styles.push({ ps: null, sub: sub, key: E.fontKey(sub), cm: {} });
    return a.styles.length - 1;
  }
  /** The typed text as paragraphs of runs. */
  function serialize(box, a) {
    var paras = [], cur = null;
    function add(t, s) { if (!cur) paras.push(cur = []); var l = cur[cur.length - 1]; if (l && l.s === s) l.t += t; else cur.push({ t: t, s: s }); }
    function walk(node) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { if (n.data) add(n.data.replace(/[ \n\r\t]/g, ' '), styleOf(a, n.parentElement)); return; }
        if (n.nodeType !== 1) return;
        if (n.nodeName === 'BR') { if (n.nextSibling) add('\n', styleOf(a, n.parentElement)); return; } // a last <br> only holds an empty line open
        if (/^(DIV|P)$/.test(n.nodeName)) { cur = null; walk(n); if (!cur) paras.push([]); cur = null; return; }
        walk(n);
      });
    }
    walk(box);
    return paras.length ? paras : [[]];
  }
  var same = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };

  /** Opens the selected frame for typing (after its fonts are set up). opts.at: a client point for the caret (a double
   * click), opts.type: a letter typed on the selected frame (it goes in at the end). */
  P.edit = async function (opts) {
    var o = Object.assign({}, opts || {}), sel = P.sel;
    if (P.opening && P.opening.sel === sel) { if (o.type) P.opening.o.type = (P.opening.o.type || '') + o.type; return; } // keys typed while it opens
    if (!sel || P.editor) return;
    P.opening = { sel: sel, o: o };
    try { await sel.ready; } finally { P.opening = null; }
    if (P.sel !== sel || P.editor) return;
    var p = E.pageById(sel.pid), s = S.slots.get(sel.pid), live = sel.kind === 'annot' ? S.findAnnot(sel.id) : sel.model;
    if (!p || !s || !live || live.locked) return;
    var a = JSON.parse(JSON.stringify(live));
    a.styles.forEach(function (st, i) { Object.defineProperty(st, 'info', { value: live.styles[i].info, enumerable: false, writable: true }); });
    var box = U.h('div', { class: 'para-edit', contenteditable: 'true', spellcheck: 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': U.t('pdf.ed.pe_text'), dir: a.rtl ? 'rtl' : 'ltr' });
    fill(box, a);
    var before = serialize(box, a), ed = P.editor = { sel: sel, a: a, box: box, done: false };
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) { /* the browser's own */ }
    var k = stretch(a);
    if (k !== 1) { box.style.transformOrigin = '0 0'; box.style.transform = 'scaleX(' + k + ')'; }
    ed.place = function () {
      var z = Ed.zoom, st = a.styles[0], m = metrics(P.cssOf(st, false), E.cssWeight(st.sub)), zx = z / k;
      // the first baseline on the frame's: the browser puts it half the leading plus the ascent below the line's top
      var off = a.asc - (a.lh - (m.a + m.d) * a.fs) / 2 - m.a * a.fs;
      box.style.left = ((a.cx - a.w / 2) * z) + 'px'; box.style.top = ((a.cy - a.h / 2 + off) * z) + 'px';
      box.style.width = (a.w * zx) + 'px'; box.style.minHeight = ((a.h - off) * z) + 'px';
      box.style.fontSize = (a.fs * z) + 'px'; box.style.lineHeight = (a.lh * z) + 'px';
      if (a.rot) { // turned with the frame, about its centre (the scale stays on the box's own left edge)
        var fx = a.w * z / 2, fy = (a.h / 2 - off) * z;
        box.style.transformOrigin = '0 0';
        box.style.transform = 'translate(' + fx + 'px,' + fy + 'px) rotate(' + (-a.rot) + 'deg) translate(' + (-fx) + 'px,' + (-fy) + 'px)' + (k !== 1 ? ' scaleX(' + k + ')' : '');
      }
      box.style.textAlign = a.align; box.style.color = a.color; box.style.background = S.hex(S.fieldColour(a.color, S.rgbOf(a.paper || '#ffffff'))); // never under 3:1
      U.$$(':scope > div', box).forEach(function (d, i, all) {
        d.style.marginBottom = i < all.length - 1 ? ((a.pgap || 0) * z) + 'px' : '0';
        d.style[a.rtl ? 'paddingRight' : 'paddingLeft'] = ((a.rest || 0) * zx) + 'px';
        d.style.textIndent = (((a.first || 0) - (a.rest || 0)) * zx) + 'px';
      });
    };
    ed.cancel = function () { if (ed.done) return; ed.done = true; P.editor = null; box.remove(); P.draw(); P.changed(); };
    ed.commit = function () {
      if (ed.done) return P.applying || Promise.resolve();
      var paras = serialize(box, a);
      ed.cancel();
      if (same(paras, before)) return Promise.resolve();
      a.paras = paras;
      sel.pending = true; // its derived file is about to be used: a click elsewhere does not let it go (para-mode.js P.clear)
      var run = P.applying = apply(p, sel, a).then(function () { sel.pending = false; if (P.applying === run) P.applying = null; });
      return run;
    };
    box.addEventListener('keydown', function (e) {
      e.stopPropagation();
      // Escape keeps what was typed and leaves typing; the frame stays selected (as in a design tool)
      if (e.key === 'Escape') { e.preventDefault(); ed.commit(); var f = U.$('.para-frame'); if (f) f.focus({ preventScroll: true }); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ed.commit(); }
    });
    box.addEventListener('input', function () { ed.place(); }); // a new paragraph takes the indents
    box.addEventListener('paste', function (e) { // intake-ok: text pasted into the paragraph editor (no files)
      e.preventDefault();
      var t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      document.execCommand('insertText', false, t);
    });
    box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    box.addEventListener('dblclick', function (e) { e.stopPropagation(); });
    box.addEventListener('blur', function () { setTimeout(function () { if (P.editor === ed && document.activeElement !== box) ed.commit(); }, 0); });
    s.layer.appendChild(box);
    ed.place(); P.draw();
    box.focus({ preventScroll: true });
    var r = o.at && document.caretRangeFromPoint ? document.caretRangeFromPoint(o.at[0], o.at[1]) : null;
    if (!r || !box.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(box); r.collapse(false); }
    var ws = window.getSelection(); ws.removeAllRanges(); ws.addRange(r);
    if (o.type) document.execCommand('insertText', false, o.type);
    P.changed();
  };
  /** Lays the typed text out with the document's widths and commits it. */
  async function apply(p, sel, a) {
    try {
      await P.reloadInfos(p, a);
      await P.readyText(a);
      P.relayout(a);
      P.commit(p, sel, a, U.t('pdf.ed.undo_edit_para'));
      P.draw();
    } catch (e) { SlopUI.toast(U.t('pdf.ed.pe_failed', { err: String(e && e.message || e) })); }
  }
  /** A double click on a frame annotation with the select tool (pointer.js): it opens for typing. */
  S.paraEditAnnot = function (a) {
    var p = Ed.page(); if (!p) return;
    P.selectAnnot(p, a);
    P.edit();
  };
})();
