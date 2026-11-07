/* Slop PDF — text markup for a selected text block (the select tool's frame, select-edit.js) and the way from a block to a
   range of its words.
   - The block bar's Mark up group (para-bar.js): Highlight, Underline, Strikethrough, Colour, Comment and Redact over the
     whole block, through the text selection's own actions (sel-actions.js) with the block's snapshot: one undo step each, a
     second press takes the markup off. A block of the page's text is marked from the page's text lines under its lines; a
     frame already edited or moved (a paragraph annotation) from the lines it lays out, turned with it. On a narrow screen
     the group folds into a "Mark up" button that opens it below the bar (css/selbar.css).
   - Words instead of the block: a second click (or tap) that stays put on a selected block's text selects the word there
     as a text selection (P.still, after the double-click time, so a double click still edits); a drag from there, or
     Shift+click, extends it, and the full markup row shows (sel-bar.js). Edit ▸ Select text in block
     (Ed.selectBlockText) selects all of the block's text that way. Classic script, loaded before para-bar.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para, A = S.selAct, G = window.SlopPdfSel;
  var M = S.blockMark = {}, DBL = 460, PAD = 1;
  var MARKS = [['highlight', 'pdf.ed.sb_highlight'], ['underline', 'pdf.ed.sb_underline'], ['strike', 'pdf.ed.sb_strike']];
  function r2(v) { return Math.round(v * 100) / 100; }

  /** A frame annotation's lines as markup parts: a quad per line around its glyphs, turned with the frame. */
  function modelPart(p, a) {
    var left = a.cx - a.w / 2, top = a.cy - a.h / 2, th = -(a.rot || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    var turn = function (x, y) { var dx = x - a.cx, dy = y - a.cy; return [r2(a.cx + dx * c - dy * s), r2(a.cy + dx * s + dy * c)]; };
    var part = { pid: p.id, p: p, quads: [], rects: [], boxes: [] };
    (a.lines || []).forEach(function (l) {
      var segs = (l.segs || []).filter(function (g) { return String(g.t).trim(); });
      if (!segs.length) return;
      var x0 = left + Math.min.apply(null, segs.map(function (g) { return g.x; })), x1 = left + Math.max.apply(null, segs.map(function (g) { return g.x + g.w; }));
      var y0 = top + l.b - 0.8 * a.fs, y1 = top + l.b + 0.22 * a.fs, q = [turn(x0, y0), turn(x1, y0), turn(x1, y1), turn(x0, y1)];
      var r = G.rectsOf(q)[0];
      part.quads.push.apply(part.quads, q); part.rects.push(r); part.boxes.push({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 });
    });
    return part.quads.length ? part : null;
  }
  /** The selected block as a text selection snapshot (sel-track.js's shape): { text, key, parts, box, start }, or null. */
  M.snap = function () {
    var sel = P.sel, p = sel && sel.uni && E.pageById(sel.pid);
    if (!p || P.editor) return null;
    var part, text;
    if (sel.kind === 'block') {
      var lines = [].concat.apply([], sel.blocks.map(function (b) { return b.lines; }));
      part = { pid: p.id, p: p, rects: lines.map(function (l) { return { x0: l.x0 - PAD, y0: l.top - PAD, x1: l.x1 + PAD, y1: l.bottom + PAD }; }) };
      text = lines.map(function (l) { return l.text; }).join(' ');
    } else {
      var a = S.findAnnot(sel.id);
      part = a && modelPart(p, a);
      text = a ? (a.paras || []).map(function (pr) { return pr.map(function (r) { return r.t; }).join(''); }).join('\n') : '';
    }
    if (!part || !part.rects.length) return null;
    var el = document.querySelector('.para-frame'), b = el ? el.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
    return { text: text, key: 'block:' + p.id + ':' + Math.round(part.rects[0].y0), parts: [part], box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      start: [part.rects[0].x0, part.rects[0].y0], block: true };
  };
  /** Runs an action with the block's snapshot (nothing while the block is still being set up). */
  function withSnap(fn) { return function () { var snap = M.snap(); return snap ? fn(snap) : SlopUI.toast(U.t('pdf.ed.sel_no_text')); }; }

  /* ------------------------------------------------------------ the bar's group */
  var group = null, toggle = null, pop = null, dot = null, btns = {}, seq = 0, later = 0; // later: a second click's timer
  /** The Mark up group for para-bar.js's row: [the narrow screens' toggle, the group, its colour popover]. btn(h, id, key, fn)
      makes a bar button (data-act para-<id>). */
  M.build = function (h, btn) {
    var sep = function () { return h('span', { class: 'selbar-sep', 'aria-hidden': 'true' }); };
    toggle = h('button', { type: 'button', class: 'selbar-btn para-mk-toggle', 'data-act': 'para-markup', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      'aria-label': U.t('pdf.se.mark_up'), title: U.t('pdf.se.mark_up_tip'), 'data-i18n-attr': 'aria-label:pdf.se.mark_up;title:pdf.se.mark_up_tip' },
    h('span', { 'data-i18n': 'pdf.se.mark_up' }, U.t('pdf.se.mark_up')));
    toggle.addEventListener('click', function () { open(!group.classList.contains('is-open')); });
    var items = MARKS.map(function (m) {
      var b = btns[m[0]] = btn(h, m[0], m[1], withSnap(function (snap) { return A.markup(m[0], snap); }));
      b.setAttribute('aria-pressed', 'false');
      return b;
    });
    dot = h('span', { class: 'selbar-dot', 'aria-hidden': 'true' });
    var col = btns.colour = btn(h, 'colour', 'pdf.ed.sb_colour', function () { colourPop(pop.hidden); });
    col.setAttribute('aria-haspopup', 'dialog'); col.setAttribute('aria-expanded', 'false'); col.title = U.t('pdf.ed.sb_colour_tip');
    col.setAttribute('data-i18n-attr', 'aria-label:pdf.ed.sb_colour;title:pdf.ed.sb_colour_tip'); col.removeAttribute('data-i18n');
    col.textContent = ''; col.append(dot, h('span', { 'data-i18n': 'pdf.ed.sb_colour' }, U.t('pdf.ed.sb_colour')));
    group = h('span', { class: 'para-mk', role: 'group', 'aria-label': U.t('pdf.se.mark_up'), 'data-i18n-attr': 'aria-label:pdf.se.mark_up' }, items, col, sep(),
      btn(h, 'comment', 'pdf.ed.sb_comment', withSnap(function (snap) { return A.comment(snap); })),
      btn(h, 'redact', 'pdf.ed.sb_redact', withSnap(function (snap) { return A.redact(snap); })), sep());
    pop = h('div', { class: 'selbar-pop para-mk-pop', role: 'dialog', 'aria-label': U.t('pdf.ed.sb_colour'), 'data-i18n-attr': 'aria-label:pdf.ed.sb_colour', hidden: true },
      SlopSelBar.colours.map(function (c) {
        var sw = SlopSelBar.swatch(c);
        sw.style.background = c[0];
        sw.addEventListener('click', function () { colourPop(false); var snap = M.snap(); A.setColour(c[0], snap).then(M.refresh); });
        return sw;
      }));
    return [toggle, group, pop];
  };
  /** Opens or closes the folded group (narrow screens). */
  function open(on) {
    if (!group) return;
    var bar = group.closest('.selbar'), top = bar ? bar.getBoundingClientRect().top : 0;
    group.classList.toggle('is-up', !!on && top > innerHeight / 2); // opens on the side with room
    group.classList.toggle('is-open', !!on); toggle.setAttribute('aria-expanded', String(!!on));
    if (on) { colourPop(false); var first = group.querySelector('button'); if (first) first.focus(); }
  }
  function colourPop(on) {
    if (!pop) return;
    pop.hidden = !on; btns.colour.setAttribute('aria-expanded', String(!!on));
    if (on) {
      if (group.classList.contains('is-open')) open(false); // a narrow screen: the swatches take the folded group's place
      pop.querySelectorAll('.selbar-sw').forEach(function (sw) { sw.setAttribute('aria-pressed', String(sw.dataset.colour === A.colour())); });
      var cur = pop.querySelector('[aria-pressed="true"]') || pop.querySelector('button'); if (cur) cur.focus();
    }
  }
  /** The bar shows the block again: the colour dot, and which markup the whole block already has (pressed buttons). */
  M.refresh = function () {
    if (!group) return;
    dot.style.background = A.colour();
    var token = ++seq, snap = M.snap();
    (snap ? A.markedStyles(snap) : Promise.resolve(new Set())).then(function (set) {
      if (token !== seq) return;
      MARKS.forEach(function (m) { var on = set.has(m[0]); btns[m[0]].classList.toggle('is-on', on); btns[m[0]].setAttribute('aria-pressed', String(on)); });
    }, function () { /* no text lines: nothing pressed */ });
  };
  /** The block was let go: its popovers close, and a second click waiting to select a word is off. */
  var clear = P.clear;
  P.clear = function () { open(false); colourPop(false); clearTimeout(later); later = 0; return clear.apply(this, arguments); };
  document.addEventListener('pointerdown', function (e) {
    if (group && !e.target.closest('.para-row')) { if (group.classList.contains('is-open')) open(false); if (!pop.hidden) colourPop(false); }
  }, true);

  /* ------------------------------------------------------------ words instead of the block */
  /** A press on the frame let go without moving (para-xform.js): after the double-click time, the word under it is selected
      instead of the block. Called with null by a new press or a double click, which cancel it. */
  P.still = function (ev) {
    clearTimeout(later); later = 0;
    var sel = P.sel;
    if (!ev || !sel || !sel.uni || sel.kind !== 'block') return;
    var x = ev.clientX, y = ev.clientY, touch = !!ev.pointerType && ev.pointerType !== 'mouse';
    later = setTimeout(function () {
      later = 0;
      if (P.sel !== sel || P.editor) return;
      P.clear();
      S.selectWordAt(x, y, touch);
    }, DBL);
  };
  /** A block of the page's text is selected (not an edited frame): its words can be selected. */
  Ed.canSelectBlockText = function () { return !!(P.sel && P.sel.uni && P.sel.kind === 'block' && !P.editor); };
  /** Selects all of the selected block's text as a text selection (its markup row shows; a drag or Shift+click changes it). */
  Ed.selectBlockText = function () {
    if (!Ed.canSelectBlockText()) return false;
    var sel = P.sel, slot = S.slots.get(sel.pid), lines = [].concat.apply([], sel.blocks.map(function (b) { return b.lines; }));
    if (!slot) return false;
    var spans = Array.prototype.filter.call(slot.el.querySelectorAll('.pv-textlayer span'), function (sp) {
      var r = sp.getBoundingClientRect(); if (!r.width || !sp.firstChild) return false;
      var q = S.pagePt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      return lines.some(function (l) { return q[0] >= l.x0 - 2 && q[0] <= l.x1 + 2 && q[1] >= l.top - 2 && q[1] <= l.bottom + 2; });
    });
    if (!spans.length) return false;
    var last = spans[spans.length - 1].firstChild;
    P.clear();
    S.touchSel = false;
    window.getSelection().setBaseAndExtent(spans[0].firstChild, 0, last, last.textContent.length);
    return true;
  };
})();
