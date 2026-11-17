/* Slop PDF — the selection bar: one floating row of actions beside what is selected in page view, in every mode (Select and
   Edit text, Lines or Paragraphs). For selected text: Highlight, Underline, Strikethrough, Colour (a popover), Copy,
   Comment, Edit text, Remove, Redact, Replace and Find (sel-actions.js, on the snapshot of sel-track.js). For a selected
   annotation: Edit (text boxes, callouts, steps, paragraphs), Colour, Opacity (popovers), Comment, Duplicate and Delete
   (sel-annot.js; Del still deletes). It is placed from the selection's box on screen: above it, below when there is no
   room above (near the top edge), kept inside the viewport and above the on-screen keyboard (SlopKeyboard), and hidden
   when the selection scrolls out of the viewer or is cleared. Keyboard: Tab from the selection moves into the bar, Escape
   dismisses it and returns focus to the page. Styles: css/selbar.css.
   Other selections use the same bar: SlopSelBar.provide({ id, label(), active(), box() → client rect, build(h) → row,
   refresh?(row), dismiss() }) adds a row shown (mode 'p:' + id) while active(), before the annotation and text rows (the
   selected page object in Objects mode, obj-bar.js; a text block, para-bar.js, with its Mark up group, block-mark.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, Ed = SP.editor, S = Ed._, T = S.sel, A = S.selAct, N = S.annotAct;
  var h = U.h, bar = null, row = null, pop = null, colBtn = null, dot = null, popOpen = false, raf = 0;
  var arow = null, abtns = {}, adot = null, apop = null, opop = null, mode = null; // the annotation row and its popovers
  var OPACITY = [[1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%']];
  var MARKS = ['highlight', 'underline', 'strike'], markBtns = {}, markSeq = 0; // markSeq: the token of the newest markState
  var COLOURS = [['#ffe14d', 'yellow'], ['#34c759', 'green'], ['#0a84ff', 'blue'], ['#ff2d92', 'pink'], ['#ff9500', 'orange'], ['#e0102f', 'red'], ['#111111', 'black']]; // names: pdf.ed.col_<name>
  // [id, label key, action or null for the colour button, group] in the order shown
  var BUTTONS = [
    ['highlight', 'pdf.ed.sb_highlight', function () { return A.markup('highlight'); }, 1],
    ['underline', 'pdf.ed.sb_underline', function () { return A.markup('underline'); }, 1],
    ['strike', 'pdf.ed.sb_strike', function () { return A.markup('strike'); }, 1],
    ['colour', 'pdf.ed.sb_colour', null, 1],
    ['copy', 'ui.copy', function () { return A.copy(); }, 2],
    ['comment', 'pdf.ed.sb_comment', function () { return A.comment(); }, 2],
    ['edit', 'pdf.ed.edit_text', function () { return A.editText(); }, 2],
    ['remove', 'ui.remove', function () { return A.remove(); }, 3],
    ['redact', 'pdf.ed.sb_redact', function () { return A.redact(); }, 3],
    ['replace', 'pdf.ed.sb_replace', function () { return A.replace(); }, 4],
    ['find', 'pdf.ed.sb_find', function () { return A.find(); }, 4]
  ];

  var providers = [], prow = {}, shown = null; // the rows other selections add (SlopSelBar.provide), and the one shown
  function provided() { for (var i = 0; i < providers.length; i++) if (providers[i].active()) return providers[i]; return null; }
  function editable(el) { return (!!window.SlopTyping && window.SlopTyping.isTyping(el, { controls: true })); }   // shared/input/typing.js
  function run(fn) { Promise.resolve().then(fn).catch(function (err) { console.error(err); SlopUI.toast(U.t('pdf.ed.op_failed', { err: String((err && err.message) || '') })); }); }

  var t = U.t;
  /** Marks an element for SlopI18n.apply(): text (when it is all the element holds) and attributes, as 'attr:key' pairs. */
  function i18n(attrs, text, pairs) { if (text) attrs['data-i18n'] = text; if (pairs) attrs['data-i18n-attr'] = pairs; return attrs; }
  function build() {
    bar = h('div', { class: 'selbar', role: 'toolbar', 'aria-label': t('pdf.ed.sb_selected_text'), hidden: true });
    row = h('div', { class: 'selbar-row' });
    var last = 1;
    BUTTONS.forEach(function (b) {
      if (b[3] !== last) { row.appendChild(h('span', { class: 'selbar-sep', 'aria-hidden': 'true' })); last = b[3]; }
      if (b[0] === 'colour') {
        dot = h('span', { class: 'selbar-dot', 'aria-hidden': 'true' });
        colBtn = h('button', { type: 'button', class: 'selbar-btn', 'data-act': 'colour', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': t('pdf.ed.sb_colour_tip'), title: t('pdf.ed.sb_colour_tip'),
          'data-i18n-attr': 'aria-label:pdf.ed.sb_colour_tip;title:pdf.ed.sb_colour_tip' }, dot, h('span', { 'data-i18n': b[1] }, t(b[1])));
        colBtn.addEventListener('click', function () { if (popOpen) closePop(true); else openPop(); });
        row.appendChild(colBtn);
        return;
      }
      var isMark = MARKS.indexOf(b[0]) >= 0;
      var btn = h('button', i18n({ type: 'button', class: 'selbar-btn', 'data-act': b[0], 'aria-label': t(b[1]), title: t(b[1]), 'aria-pressed': isMark ? 'false' : null }, b[1], 'aria-label:' + b[1] + ';title:' + b[1]), t(b[1]));
      if (isMark) markBtns[b[0]] = btn;
      btn.addEventListener('click', function () { run(b[2]); });
      row.appendChild(btn);
    });
    pop = h('div', i18n({ class: 'selbar-pop', role: 'dialog', 'aria-label': t('pdf.ed.sb_colour'), hidden: true }, null, 'aria-label:pdf.ed.sb_colour'),
      COLOURS.map(function (c) {
        var sw = swatch(c);
        sw.style.background = c[0];
        sw.addEventListener('click', function () { pick(c[0]); });
        return sw;
      }));
    buildAnnot();
    bar.append(row, arow, pop, apop, opop);
    // a press on the bar keeps the text selection (the actions need it); inputs in the bar still take focus
    bar.addEventListener('mousedown', function (e) { if (!e.target.closest('input, textarea')) e.preventDefault(); }); // touch-ok: only keeps the focus (browsers send it after a tap too)
    bar.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (popOpen) closePop(true); else leave(); }
    });
    document.body.appendChild(bar);
    document.addEventListener('keydown', onDocKey, true);
    document.addEventListener('pointerdown', function (e) { if (popOpen && !bar.contains(e.target)) closePop(false); }, true); // a finger too (the page's pointerdown stops the compatibility mousedown)
    var again = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; place(); }); };
    window.addEventListener('resize', again);
    document.addEventListener('scroll', function () { T.rebox(); again(); }, true);
  }

  /** The annotation row: Edit, Colour, Opacity | Comment, Duplicate | Delete, and its two popovers. */
  function buildAnnot() {
    var b = function (id, key, fn, extra) { // extra.tip: a key for the title
      extra = Object.assign({}, extra || {}); var tip = extra.tip || key; delete extra.tip;
      var el = h('button', Object.assign(i18n({ type: 'button', class: 'selbar-btn', 'data-act': id, 'aria-label': t(key), title: t(tip) }, null, 'aria-label:' + key + ';title:' + tip), extra),
        h('span', { 'data-i18n': key }, t(key)));
      if (fn) el.addEventListener('click', function () { run(fn); });
      return (abtns[id] = el);
    };
    adot = h('span', { class: 'selbar-dot', 'aria-hidden': 'true' });
    var ac = b('a-colour', 'pdf.ed.sb_colour', null, { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }); ac.prepend(adot);
    var ao = b('a-opacity', 'pdf.ed.sb_opacity', null, { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    ac.addEventListener('click', function () { toggle(apop, ac); });
    ao.addEventListener('click', function () { toggle(opop, ao); });
    var sep = function () { return h('span', { class: 'selbar-sep', 'aria-hidden': 'true' }); };
    arow = h('div', { class: 'selbar-row is-annot', hidden: true },
      b('a-edit', 'pdf.ed.sb_edit', function () { return N.edit(); }), ac, ao, sep(),
      b('a-comment', 'pdf.ed.sb_comment', function () { return N.comment(); }), b('a-duplicate', 'ui.duplicate', function () { return N.duplicate(); }), sep(),
      b('a-delete', 'ui.delete', function () { return N.remove(); }, { tip: 'pdf.ed.delete_tip', 'aria-keyshortcuts': 'Delete' }));
    abtns['a-delete'].classList.add('is-danger');
    apop = h('div', i18n({ class: 'selbar-pop', role: 'dialog', 'aria-label': t('pdf.ed.sb_colour'), hidden: true }, null, 'aria-label:pdf.ed.sb_colour'), COLOURS.map(function (c) {
      var sw = swatch(c);
      sw.style.background = c[0];
      sw.addEventListener('click', function () { closePop(false); run(function () { return N.setColour(c[0]); }); });
      return sw;
    }));
    opop = h('div', i18n({ class: 'selbar-pop', role: 'dialog', 'aria-label': t('pdf.ed.sb_opacity'), hidden: true }, null, 'aria-label:pdf.ed.sb_opacity'), OPACITY.map(function (o) {
      var ob = h('button', { type: 'button', class: 'selbar-btn selbar-op', 'data-opacity': String(o[0]), 'aria-pressed': 'false' }, o[1]); // i18n-ignore: a percentage
      ob.addEventListener('click', function () { closePop(false); run(function () { return N.setOpacity(o[0]); }); });
      return ob;
    }));
  }
  /** A colour swatch: c = [colour, name]; its name follows a language switch. */
  function swatch(c) { var k = 'pdf.ed.col_' + c[1]; return h('button', i18n({ type: 'button', class: 'selbar-sw', 'aria-label': t(k), title: t(k), 'data-colour': c[0], 'aria-pressed': 'false' }, null, 'aria-label:' + k + ';title:' + k)); }
  /** Opens one of the annotation popovers (closing the other), or closes it. */
  function toggle(p, btn) {
    var open = p.hidden;
    closePop(false);
    if (!open) return;
    popOpen = true; p.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var a = N.target();
    if (a) p.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.colour ? x.dataset.colour === N.colour(a) : +x.dataset.opacity === N.opacity(a))); });
    var cur = p.querySelector('[aria-pressed="true"]') || p.querySelector('button'); if (cur) cur.focus();
  }
  /** Shows the annotation row for the selected annotation: its buttons fit its type. */
  function annotRow(a) {
    abtns['a-edit'].hidden = !N.canEdit(a);
    abtns['a-colour'].hidden = !N.colourKey(a);
    abtns['a-opacity'].hidden = !N.canOpacity(a);
    adot.style.background = N.colour(a);
    bar.setAttribute('aria-label', t('pdf.ed.sb_selected', { what: N.name(a) }));
  }

  /** Tab from a selection moves into the bar; Escape anywhere with the bar up dismisses it. */
  function onDocKey(e) {
    if (!bar || bar.hidden || bar.contains(e.target) || editable(e.target)) return;
    if (e.key === 'Tab' && !e.shiftKey) {
      var first = (shown ? prow[shown.id] : mode === 'annot' ? arow : row).querySelector('button:not([hidden])');
      if (first) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') { if (shown) { shown.dismiss(); render(); } else T.dismiss(); }
  }
  /** Leaves the bar: the selection stays, the bar hides until the selection changes, and focus goes back to the page. */
  function leave() {
    if (bar.contains(document.activeElement)) document.activeElement.blur();
    if (shown) { shown.dismiss(); render(); return; }
    if (mode === 'annot') { dismissed = Ed.selId; render(); return; }
    T.dismiss();
  }
  var dismissed = null; // the annotation whose bar Escape put away (it comes back when another one is selected)

  /** Shows the bar for what is selected, or hides it: a selected annotation first, else the text selection. Runs on every
      selection change (sel-track.js) and every repaint of the selection (view.js drawSelection). */
  function render() {
    var a = N && Ed.selId && Ed.selId !== dismissed ? N.target() : null;
    if (Ed.selId !== dismissed) dismissed = null;
    var pv = provided(), next = pv ? 'p:' + pv.id : a ? 'annot' : T.shown() ? 'text' : null;
    if (!bar) { if (!next) return; build(); }
    if (next !== mode) closePop(false);
    mode = next; shown = pv;
    if (pv && !prow[pv.id]) bar.insertBefore(prow[pv.id] = pv.build(h), pop);
    Object.keys(prow).forEach(function (k) { prow[k].hidden = !pv || pv.id !== k; });
    if (!next) { bar.hidden = true; markSeq++; setPressed(null); return; }
    row.hidden = next !== 'text'; arow.hidden = next !== 'annot';
    if (pv) { bar.setAttribute('aria-label', pv.label()); if (pv.refresh) pv.refresh(prow[pv.id]); place(); return; }
    if (next === 'annot') { annotRow(a); place(); return; }
    bar.setAttribute('aria-label', t('pdf.ed.sb_selected_text'));
    colour();
    place();
    markState();
  }
  /** Shows which markup the selection already has: the markup buttons are pressed (aria-pressed, is-on) for those styles.
      The answer is async, so a token drops any answer that a newer selection has overtaken. */
  function markState() {
    var token = ++markSeq, snap = T.snap;
    A.markedStyles(snap).then(function (set) { if (token === markSeq) setPressed(set); },
      function () { if (token === markSeq) setPressed(null); });
  }
  /** Sets the pressed state of each markup button from a Set of styles (null clears them all). */
  function setPressed(set) {
    MARKS.forEach(function (s) {
      var btn = markBtns[s], on = !!(set && set.has(s));
      if (!btn) return;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  /** Puts the bar above the selection, below it when there is no room above, inside the viewport. */
  function place() {
    if (!bar || !mode) return;
    var b = shown ? shown.box() : mode === 'annot' ? N.box() : T.snap && T.snap.box, vr = S.viewer ? S.viewer.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    if (!b) { bar.hidden = true; return; }
    if (b.bottom < vr.top || b.top > vr.bottom) { bar.hidden = true; return; } // the selection is scrolled out of view
    bar.hidden = false;
    bar.style.left = '0px'; bar.style.top = '0px';
    // above the on-screen keyboard: its top is the bottom of the space the bar may use
    var kb = window.SlopKeyboard && SlopKeyboard.height() ? SlopKeyboard.visible() : null;
    var w = bar.offsetWidth, ht = bar.offsetHeight, vw = innerWidth, vh = kb ? Math.min(innerHeight, kb.bottom) : innerHeight, M = 8, GAP = 10;
    var x = U.clamp(b.left + (b.right - b.left) / 2 - w / 2, M, Math.max(M, vw - w - M));
    var above = b.top - ht - GAP, below = b.bottom + GAP, y;
    if (above >= M) y = above;
    else if (below + ht <= vh - M) y = below;
    else y = (b.top >= vh - b.bottom) ? Math.max(M, above) : Math.min(below, vh - ht - M);
    y = U.clamp(y, M, Math.max(M, vh - ht - M));
    bar.style.left = Math.round(x) + 'px'; bar.style.top = Math.round(y) + 'px';
    bar.classList.toggle('pop-below', y < 230); // the colour popover opens on the side with room
  }
  /** The colour button's dot shows the colour the next highlight, underline or strikethrough uses. */
  function colour() { if (dot) dot.style.background = A.colour(); }
  function openPop() {
    popOpen = true; pop.hidden = false; colBtn.setAttribute('aria-expanded', 'true');
    pop.querySelectorAll('.selbar-sw').forEach(function (sw) { sw.setAttribute('aria-pressed', String(sw.dataset.colour === A.colour())); });
    var cur = pop.querySelector('[aria-pressed="true"]') || pop.querySelector('button'); if (cur) cur.focus();
  }
  function closePop(focusBtn) {
    if (!pop) return;
    popOpen = false; pop.hidden = true; if (colBtn) colBtn.setAttribute('aria-expanded', 'false');
    [apop, opop].forEach(function (p) { if (p) p.hidden = true; });
    ['a-colour', 'a-opacity'].forEach(function (k) { if (abtns[k]) abtns[k].setAttribute('aria-expanded', 'false'); });
    if (focusBtn && colBtn) colBtn.focus();
  }
  /** A swatch: the colour is used by the next markup, and existing markup under the selection takes it. */
  function pick(col) {
    closePop(true);
    run(function () { return A.setColour(col); }); // sel-actions.js (recolours and refreshes the dot through render)
  }

  T.onChange(render);
  U.onLang(function () { if (bar && mode) render(); }); // the bar's label (the buttons follow through data-i18n)
  // every repaint of the selection (a selected annotation, its move, the page or zoom changing) places the bar again
  var draw = S.drawSelection;
  S.drawSelection = function () { var r = draw.apply(this, arguments); render(); return r; };
  window.addEventListener('slopkeyboard', function () { if (bar && mode) place(); });
  window.SlopSelBar = { place: place, leave: leave, update: render, mode: function () { return mode; }, isOpen: function () { return !!bar && !bar.hidden; },
    provide: function (p) { providers.push(p); render(); },
    colours: COLOURS, swatch: swatch }; // the markup colours and their swatch, for a provided row's own picker (block-mark.js)
})();
