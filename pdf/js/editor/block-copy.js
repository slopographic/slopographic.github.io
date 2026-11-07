/* Slop PDF — the block copy tool (K). Drag a box over a page: the text inside it is copied to the clipboard, one line
   per row, and the box stays until the next box or Escape. It takes the text of the page where the drag starts;
   the words are read from the page's text layer (editor/textlayer.js), so only text the page really has is copied.
   The text rules are in editor/block-text.js. The box is kept in layout units (the page's own size, which zoom scales),
   so it stays on the same words when the page is zoomed: S.blockRedraw draws it again after every layout. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, Ed = SP.editor, S = Ed._, E = SP.engine;

  var style = document.createElement('style');
  style.textContent = '.pv-blockbox{position:absolute;z-index:50;pointer-events:none;border:1.5px dashed var(--accent,#6b5cff);background:rgba(107,92,255,.12);border-radius:2px}';
  document.head.append(style);

  // The box goes when the tool changes. Every tool change sets data-tool on the page, so one observer covers them all.
  var watcher = null, box = null;
  function clear() {
    if (watcher) { watcher.disconnect(); watcher = null; }
    if (box) { box.remove(); box = null; }
    S.blockBox = null; S.blockState = null;
  }

  /** The pointer in the page's layout units: the page is laid out at its zoomed size, so its screen distance divided by the zoom. */
  function unitsAt(page, ev) {
    var pr = page.getBoundingClientRect();
    return { x: (ev.clientX - pr.left) / Ed.zoom, y: (ev.clientY - pr.top) / Ed.zoom };
  }

  /** Draws the box from its units at the zoom now. A box whose page has gone (or turned) is removed. */
  S.blockRedraw = function () {
    var st = S.blockState;
    if (!st || !box) return;
    var p = E.pageById(st.pid);
    if (!p || !st.page.isConnected || E.rotation(p) !== st.rot) { clear(); return; }
    var px = SPBlockText.toPx(st.u, Ed.zoom);
    Object.assign(box.style, { left: px.left + 'px', top: px.top + 'px', width: px.width + 'px', height: px.height + 'px' });
  };

  /** Starts a box from the press at e (on page p). The box follows the pointer, and on release its text is copied. */
  S.blockDown = function (e, p) {
    var page = S.pageEl;
    var layer = page && page.querySelector('.pv-textlayer');
    if (!layer) { SlopUI.toast(U.t('pdf.ed.bc_no_text_page'), 3000); return; }
    clear();
    var start = unitsAt(page, e);
    box = document.createElement('div'); box.className = 'pv-blockbox';
    // The box lives inside the page (position: relative), so it scrolls with the page.
    page.append(box); S.blockBox = box;
    S.blockState = { page: page, pid: Ed.pid, rot: p ? E.rotation(p) : 0, u: SPBlockText.units(start, start) };
    watcher = new MutationObserver(function () { if (page.dataset.tool !== 'block') clear(); });
    watcher.observe(page, { attributes: true, attributeFilter: ['data-tool'] });
    function place(ev) {
      S.blockState.u = SPBlockText.units(start, unitsAt(page, ev));
      S.blockRedraw();
      return S.blockState.u;
    }
    function move(ev) { place(ev); }
    function up(ev) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      var u = place(ev);
      if (!box) return;   // the tool changed, or the page went, during the drag
      var px = SPBlockText.toPx(u, Ed.zoom);
      if (px.width < 4 || px.height < 4) { clear(); return; }
      var pr = page.getBoundingClientRect(), r = { left: pr.left + px.left, top: pr.top + px.top, right: pr.left + px.left + px.width, bottom: pr.top + px.top + px.height };
      var spans = [].map.call(layer.querySelectorAll('span'), function (s) {
        var rc = s.getBoundingClientRect();
        return { text: s.textContent, rect: { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom } };
      });
      var text = SPBlockText.extract(spans, r);
      if (!text) { SlopUI.toast(U.t('pdf.ed.bc_no_text_box'), 3000); return; }
      var lines = text.split('\n').length;
      Promise.resolve().then(function () { return navigator.clipboard.writeText(text); }).then(function () {
        SlopUI.toast(U.t('pdf.ed.bc_copied', { n: lines }), 2600);
      }, function () {
        SlopUI.toast(U.t('pdf.ed.bc_no_clipboard'), 4200);
      });
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Escape removes the box. */
  // On window, in capture: other handlers stop Escape before it reaches the document, so this is the first place to see it.
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') clear(); }, true);
  S.blockClear = clear;
})();
