/* Slop PDF — the selection bar's row for a block of the page's text the select tool picked (select-edit.js): Edit text,
   the Mark up group (Highlight, Underline, Strikethrough, Colour, Comment, Redact over the whole block: block-mark.js; one
   "Mark up" button on a narrow screen), Copy, Cut, Duplicate and Delete (para-xform.js, clip.js), one undo step each. On a touch screen it is the long-press menu
   too (the bar shows as soon as the block is selected). Shown above the frame while it is selected and not being typed
   in. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, Ed = SP.editor, S = Ed._, P = S.para, M = S.blockMark;
  function run(fn) { Promise.resolve().then(fn).catch(function (e) { console.error(e); SlopUI.toast(U.t('pdf.ed.op_failed', { err: String((e && e.message) || '') })); }); }
  function btn(h, id, key, fn, cls) {
    var b = h('button', { type: 'button', class: 'selbar-btn' + (cls ? ' ' + cls : ''), 'data-act': 'para-' + id, 'aria-label': U.t(key), title: U.t(key),
      'data-i18n': key, 'data-i18n-attr': 'aria-label:' + key + ';title:' + key }, U.t(key));
    b.addEventListener('click', function () { run(fn); });
    return b;
  }
  function build(h) {
    var sep = function () { return h('span', { class: 'selbar-sep', 'aria-hidden': 'true' }); };
    return h('div', { class: 'selbar-row para-row' },
      btn(h, 'edit', 'pdf.ed.edit_text', function () { return P.edit(); }), sep(), M.build(h, btn),
      btn(h, 'copy', 'ui.copy', function () { return Ed.copy(); }), btn(h, 'cut', 'pdf.se.cut', function () { return Ed.cut(); }),
      btn(h, 'duplicate', 'ui.duplicate', function () { return Ed.duplicateSelected(); }), sep(),
      btn(h, 'delete', 'ui.delete', function () { return P.remove(); }, 'is-danger'));
  }
  /** The frame on screen with its turn handle (client px). */
  function box() {
    var el = document.querySelector('.para-frame'); if (!el) return null;
    var r = el.getBoundingClientRect(), rot = el.querySelector('.para-r'), t = rot ? Math.min(r.top, rot.getBoundingClientRect().top - 4) : r.top;
    return { left: r.left, top: t, right: r.right, bottom: r.bottom };
  }
  if (window.SlopSelBar && SlopSelBar.provide) SlopSelBar.provide({
    id: 'para', label: function () { return U.t('pdf.se.text_block'); },
    active: function () { return !!(P.sel && P.sel.uni && !P.editor && SP.app && SP.app.mode === 'page'); },
    box: box, build: build, refresh: function () { M.refresh(); }, dismiss: function () { P.clear(); }
  });
  P.onDraw = function () { if (window.SlopSelBar && SlopSelBar.place) SlopSelBar.place(); };
})();
