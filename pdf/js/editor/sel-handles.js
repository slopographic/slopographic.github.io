/* Slop PDF — drag handles for a text selection made by touch (a long press on the page's text, or a second tap on a selected
   block: select-edit.js S.selectWordAt sets S.touchSel). The page view takes a finger's drag for scrolling, so the browser's
   own selection handles do not come; these two round handles sit at the selection's start and end, and dragging one moves
   that end to the text under the finger (S.caretAt), the other end staying where it is. The selection bar (sel-bar.js)
   follows, as for any text selection. They go when the selection goes, or when a mouse selects. Styles: css/selbar.css.
   touch-ok: each handle is its own small surface (touch-action: none on .sel-knob, css/selbar.css); the page view under the
   text is the nav surface (view-zoom.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, Ed = SP.editor, S = Ed._, T = S.sel;
  var knobs = null, raf = 0;

  function inText(n) { var el = n && (n.nodeType === 1 ? n : n.parentNode); return !!(el && el.closest && el.closest('.pv-textlayer')); }
  /** The selection's range when it is a touch selection of the page's text, else null. */
  function range() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!S.touchSel || !sel || sel.isCollapsed || !sel.rangeCount || !inText(sel.anchorNode) || !inText(sel.focusNode)) return null;
    return sel.getRangeAt(0);
  }
  function build() {
    knobs = ['start', 'end'].map(function (end) {
      var k = U.h('div', { class: 'sel-knob', 'data-end': end, role: 'presentation' });
      k.addEventListener('pointerdown', function (e) { grab(e, end); });
      document.body.appendChild(k);
      return k;
    });
  }
  /** Puts the handles under the first and last line of the selection, or hides them. */
  function place() {
    var r = range(), rects = r ? Array.prototype.filter.call(r.getClientRects(), function (c) { return c.width > 0 && c.height > 0; }) : [];
    if (!rects.length) { // the selection went (or a mouse made it): the next one is a finger's only when a long press makes it
      var sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) S.touchSel = false;
      if (knobs) knobs.forEach(function (k) { k.hidden = true; });
      return;
    }
    if (!knobs) build();
    var a = rects[0], b = rects[rects.length - 1];
    [[a.left, a.bottom], [b.right, b.bottom]].forEach(function (p, i) {
      var k = knobs[i];
      k.hidden = false; k.style.left = Math.round(p[0]) + 'px'; k.style.top = Math.round(p[1]) + 'px';
      k.dataset.line = String(Math.round((i ? b : a).height));
    });
  }
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; place(); }); }
  /** Drags one end: the text under the finger (half a line above the handle's point, where the line is) becomes that end. */
  function grab(e, end) {
    var r = range(); if (!r) return;
    e.preventDefault(); e.stopPropagation();
    var k = e.currentTarget, line = +k.dataset.line || 12, dx = parseFloat(k.style.left) - e.clientX, dy = parseFloat(k.style.top) - line / 2 - e.clientY;
    var fixed = end === 'start' ? [r.endContainer, r.endOffset] : [r.startContainer, r.startOffset];
    if (k.setPointerCapture) try { k.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    function mv(ev) {
      ev.preventDefault();
      var c = S.caretAt(ev.clientX + dx, ev.clientY + dy);
      if (!c || !inText(c.node)) return;
      window.getSelection().setBaseAndExtent(fixed[0], fixed[1], c.node, c.offset);
      later();
    }
    function up() {
      window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
      later();
    }
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  }

  T.onChange(later);
  document.addEventListener('scroll', later, true);
  window.addEventListener('resize', later);
  S.knobs = { place: place, el: function () { return knobs; } };
})();
