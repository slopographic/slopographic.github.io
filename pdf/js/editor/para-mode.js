/* Slop PDF — Edit text ▸ Paragraphs. Edit text (Ctrl+E) has two modes, chosen in its bar under the page toolbar and
   remembered (slop-pdf.editTextMode): Lines (edit-text.js: one line at a time, as before) and Paragraphs. In Paragraphs
   a click on the page's text (or a drag across lines) selects the whole paragraph block (para-model.js), shown as a frame
   with a handle on each side. Double-click, Enter or F2 types in it (para-edit.js); dragging a side handle changes the
   frame's width and the text reflows; dragging the frame moves it; Escape lets it go. The first change turns the block into
   a frame annotation over covers that hide its old lines: one undo step per change. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para = S.para || {};
  var KEY = 'slop-pdf.editTextMode', bar = null;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  Ed.paraMode = read() === 'paragraphs';
  P.sel = null; // { pid, kind: 'block' | 'annot', blocks, id, model, covers, ready }

  /* ------------------------------------------------------------- the bar */
  function buildBar() {
    var page = document.getElementById('ctxPage');
    if (!page || bar) return;
    // built once: data-i18n / data-i18n-attr let SlopI18n.apply() retranslate it, sync() (from U.onLang) the hint
    var seg = U.h('div', { class: 'seg seg-sm', role: 'radiogroup', 'aria-label': U.t('pdf.ed.pm_selects'), 'data-i18n-attr': 'aria-label:pdf.ed.pm_selects' });
    ['lines', 'paragraphs'].forEach(function (m) {
      var k = 'pdf.ed.pm_' + m;
      var b = U.h('button', { type: 'button', class: 'seg-b', role: 'radio', 'data-mode': m, title: U.t(k + '_tip'), 'data-i18n': k, 'data-i18n-attr': 'title:' + k + '_tip' }, U.t(k));
      b.addEventListener('click', function () { Ed.setEditTextMode(m); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); e.stopPropagation();
        Ed.setEditTextMode(Ed.paraMode ? 'lines' : 'paragraphs');
        U.$('.seg-b[aria-checked="true"]', seg).focus();
      });
      seg.appendChild(b);
    });
    var done = U.h('button', { type: 'button', class: 'tb tb-l et-done', title: U.t('pdf.ed.pm_done_tip'), 'data-i18n': 'ui.done', 'data-i18n-attr': 'title:pdf.ed.pm_done_tip' }, U.t('ui.done'));
    done.addEventListener('click', function () { if (Ed.editText) Ed.toggleEditText(); });
    bar = U.h('div', { class: 'ctxbar ctx-edittext', id: 'ctxEditText', role: 'toolbar', 'aria-label': U.t('pdf.ed.edit_text'), 'data-i18n-attr': 'aria-label:pdf.ed.edit_text', hidden: true },
      U.h('span', { class: 'et-label', 'data-i18n': 'pdf.ed.edit_text' }, U.t('pdf.ed.edit_text')), seg, U.h('span', { class: 'et-hint' }), U.h('span', { class: 'tb-flex' }), done);
    page.after(bar);
    sync();
    U.onLang(sync);
  }
  function sync() {
    if (!bar) return;
    bar.hidden = !Ed.editText;
    U.$$('.seg-b', bar).forEach(function (b) {
      var on = (b.dataset.mode === 'paragraphs') === !!Ed.paraMode;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
    });
    U.$('.et-hint', bar).textContent = U.t(Ed.paraMode ? 'pdf.ed.pm_hint_para' : 'pdf.ed.pm_hint_lines');
    if (S.viewer) S.viewer.classList.toggle('para-mode', !!(Ed.editText && Ed.paraMode));
  }
  Ed.setEditTextMode = function (mode) {
    var para = mode === 'paragraphs';
    if (para === !!Ed.paraMode) { sync(); return; }
    if (S.runEdit) S.commitRun();
    if (P.editor) P.editor.commit();
    P.clear();
    Ed.paraMode = para;
    try { localStorage.setItem(KEY, para ? 'paragraphs' : 'lines'); } catch (e) { /* not kept */ }
    sync();
  };
  var toggle = Ed.toggleEditText;
  Ed.toggleEditText = function () {
    if (Ed.editText && P.editor) P.editor.commit();
    toggle.apply(this, arguments);
    if (!Ed.editText) P.clear();
    buildBar(); sync();
  };

  /* ----------------------------------------------------------- the frame */
  P.clear = function () {
    if (P.editor) P.editor.cancel();
    if (P.sel && P.sel.to && !P.sel.pending) S.strip.release(P.sel.to); // set up but never changed: its derived file goes
    var had = !!P.sel;
    P.sel = null;
    U.$$('.para-frame').forEach(function (el) { el.remove(); });
    if (had) P.changed();
  };
  /** The panel and the selection bar follow the frame. */
  P.changed = function () { if (SP.app && SP.app.editorSelectionChanged) SP.app.editorSelectionChanged(); if (window.SlopSelBar && SlopSelBar.update) SlopSelBar.update(); };
  /** The frame may stay: Edit text ▸ Paragraphs, or a frame the select tool picked (select-edit.js) while it is on. */
  P.keeps = function (sel) { return sel.uni ? !!(Ed.uniOn && Ed.uniOn()) : !!(Ed.editText && Ed.paraMode); };
  /** The frame's rectangle in page space: the model's (or the annotation's) box, or the blocks' while it is set up. */
  P.rectOf = function (sel) {
    var a = sel.kind === 'annot' ? S.findAnnot(sel.id) : sel.model;
    if (a) return { x: a.cx - a.w / 2, y: a.cy - a.h / 2, w: a.w, h: a.h, a: a };
    var bs = sel.blocks, x0 = Math.min.apply(null, bs.map(function (b) { return b.x0; })), y0 = Math.min.apply(null, bs.map(function (b) { return b.top; }));
    return { x: x0, y: y0, w: Math.max.apply(null, bs.map(function (b) { return b.x1; })) - x0, h: Math.max.apply(null, bs.map(function (b) { return b.bottom; })) - y0 };
  };
  /** Selects blocks of a page: the frame shows at once and its fonts are set up behind it. */
  P.selectBlocks = function (p, bs, uni) {
    P.clear();
    var sel = P.sel = { pid: p.id, kind: 'block', blocks: bs, uni: !!uni };
    sel.ready = P.fromBlocks(p, bs).then(function (m) {
      if (P.sel !== sel) return null;
      sel.model = m.annot; sel.covers = m.covers; sel.preview = m.preview; sel.to = m.to; P.draw(); P.changed(); return sel;
    }, function (e) {
      if (P.sel === sel) P.clear();
      if (!(e && e.message === 'cancelled')) SlopUI.toast(U.t('pdf.ed.pm_setup_failed', { err: String(e && e.message || e) }));
      return null;
    });
    P.draw(); P.changed();
    var el = U.$('.para-frame'); if (el) el.focus({ preventScroll: true });
    return sel;
  };
  P.selectAnnot = function (p, a, uni) {
    P.clear();
    var sel = P.sel = { pid: p.id, kind: 'annot', id: a.id, uni: !!uni };
    sel.ready = P.reloadInfos(p, a).then(function () { return sel; });
    P.draw(); P.changed();
    var el = U.$('.para-frame'); if (el) el.focus({ preventScroll: true });
    return sel;
  };

  /** A press in Paragraphs mode (pointer.js): a frame annotation is selected; on the page's text, the block under the press
   * (or every block a drag crosses). Another annotation is left to the select tool (false). */
  S.paraDown = function (e, p, hitG) {
    if (P.editor) P.editor.commit();
    if (Ed.selId) Ed.select(null);
    if (hitG) {
      var a = S.findAnnot(hitG.getAttribute('data-aid'));
      if (!a || a.type !== 'para') return false;
      e.preventDefault(); P.selectAnnot(p, a); return true;
    }
    e.preventDefault();
    var start = S.pagePt(e), end = start, up = false, done = null;
    function mv(ev) { end = S.pagePt(ev); }
    function fin() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); up = true; if (done) done(); }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', fin);
    P.blocksOf(p).then(function (bs) {
      var go = function () {
        var hit = P.blocksIn(bs, start, end);
        if (!hit.length) { P.clear(); SlopUI.toast(U.t('pdf.ed.pm_no_text_there')); return; }
        P.selectBlocks(p, hit);
      };
      if (up) go(); else done = go;
    }, function () { SlopUI.toast(U.t('pdf.ed.et_no_text_page')); });
    return true;
  };

  // the frame follows every repaint and zoom; it goes when its page is left or its frame is undone
  var paint = Ed.paint, layout = Ed.layout;
  Ed.paint = function () {
    var r = paint.apply(this, arguments);
    if (P.sel && !P.editor && (P.sel.pid !== Ed.pid || !P.keeps(P.sel))) P.clear(); else if (P.sel) P.draw();
    return r;
  };
  Ed.layout = function () { var r = layout.apply(this, arguments); if (P.sel) P.draw(); if (P.editor) P.editor.place(); return r; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildBar); else buildBar();
})();
