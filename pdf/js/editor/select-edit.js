/* Slop PDF — the select tool edits what it selects, as a design tool or Acrobat's "Edit text & images" does, with no mode to
   switch: a click on the page's own text selects its paragraph block (para-blocks.js) as a frame with its transform handles
   (para-xform.js: move, width, scale, turn); typing, Enter or a double click edits the text in that frame (para-edit.js) in
   the document's own font, size and colour; Escape stops typing and keeps the frame; a click elsewhere lets it go. A click on
   a picture or placed artwork of the page selects it with its handles (obj-mode.js); a paragraph frame annotation opens its
   frame; other annotations select as before (pointer.js). Plain text selection stays: a mouse drag across the text selects
   its characters (copy, highlight: the selection bar), and so does a long press on a touch screen (with drag handles,
   sel-handles.js); a second click (or tap) that stays put on a selected block's text selects the word there instead of the
   block (block-mark.js), and a finger's drag on the text scrolls. Edit text (Ctrl+E: Lines / Paragraphs) and Objects mode (O) still work as before; while one of them is on
   this is off (Ed.uniOn). Classic script, loaded after obj-mode.js. */
(function () {
  'use strict';
  var SP = window.SP, Ed = SP.editor, S = Ed._, P = S.para, O = S.obj;
  /** The select tool is the edit tool now: no Edit text mode, no Objects mode. */
  Ed.uniOn = function () { return Ed.tool === 'select' && !Ed.editText && !Ed.objMode && !!Ed.pid; };
  var HOLD = 500, SLOP = 4;
  S.uniPending = null; // the selection a press started (its blocks are read asynchronously), for a double click to wait for

  /** Selects the paragraph block under a page point: a Promise of the frame's selection (null when there is no text). */
  S.selectTextAt = function (p, pt) {
    var run = S.uniPending = P.blocksOf(p).then(function (bs) {
      if (S.uniPending !== run || !Ed.uniOn() || Ed.pid !== p.id) return null;
      var hit = P.blocksIn(bs, pt, pt);
      if (!hit.length) return null;
      if (P.sel && P.sel.kind === 'block' && P.sel.pid === p.id && P.sel.blocks.length === 1 && P.sel.blocks[0].top === hit[0].top && P.sel.blocks[0].x0 === hit[0].x0) return P.sel;
      Ed.select(null); if (O.sel) O.select(null);
      return P.selectBlocks(p, hit, true);
    }, function () { return null; });
    return run;
  };
  /** The text position under a client point: { node, offset } (Chromium and WebKit: caretRangeFromPoint, Firefox:
   * caretPositionFromPoint), or null. */
  S.caretAt = function (x, y) {
    if (document.caretRangeFromPoint) { var r = document.caretRangeFromPoint(x, y); return r ? { node: r.startContainer, offset: r.startOffset } : null; }
    var c = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
    return c ? { node: c.offsetNode, offset: c.offset } : null;
  };
  /** Selects the word of the page's text under a client point as a text selection (the selection bar's markup row shows);
   * touch: the selection gets drag handles (sel-handles.js). False when no text is there. */
  S.selectWordAt = function (x, y, touch) {
    var c = S.caretAt(x, y), n = c && c.node;
    if (!n || n.nodeType !== 3 || !n.parentNode.closest || !n.parentNode.closest('.pv-textlayer')) return false;
    var t = n.textContent, a = c.offset, b = a;
    while (a > 0 && /\S/.test(t[a - 1])) a--;
    while (b < t.length && /\S/.test(t[b])) b++;
    if (b <= a) return false;
    S.touchSel = !!touch;
    window.getSelection().setBaseAndExtent(n, a, n, b);
    return true;
  };
  /** A press on the page's text: a press that stays put selects the block (on release); a mouse drag selects characters (the
   * browser's own selection, left alone); a finger's drag scrolls; a long press selects the word under it. */
  function textPress(e, p) {
    var x0 = e.clientX, y0 = e.clientY, pt = S.pagePt(e), moved = false, held = false, touch = e.pointerType !== 'mouse';
    if (touch) { e.preventDefault(); S.startPan(e); }
    var hold = touch ? setTimeout(function () {
      if (moved) return;
      held = true; if (S.cancelPan) S.cancelPan();
      S.selectWordAt(x0, y0, true);
    }, HOLD) : 0;
    function mv(ev) { if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) { moved = true; clearTimeout(hold); } }
    function end(ev) {
      clearTimeout(hold);
      window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true);
      if (ev.type === 'pointercancel' || moved || held) return;
      var ws = window.getSelection();
      if (ws && !ws.isCollapsed && !touch) { S.touchSel = false; return; } // a drag that selected text keeps it (a plain click collapses it)
      if (ws) ws.removeAllRanges();
      S.selectTextAt(p, pt);
    }
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
  }

  /** A tap that stays put (a finger on the page where no span is: between words, or before the text layer is built). */
  function tapText(e, p) {
    var x0 = e.clientX, y0 = e.clientY, pt = S.pagePt(e), t0 = Date.now();
    function end(ev) {
      window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true);
      if (ev.type === 'pointerup' && Math.hypot(ev.clientX - x0, ev.clientY - y0) <= SLOP && Date.now() - t0 < HOLD) S.selectTextAt(p, pt);
    }
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
  }
  var down = S.onDown;
  S.onDown = function (e) {
    var p = Ed.page(), t = e.target;
    if (!Ed.uniOn() || e.button > 0 || !p || !t.closest || S.callDraft || S.editing || S.runEdit || t.closest('.note-pop')) return down.apply(this, arguments);
    var handle = t.closest('.handle, .sel-rot'), tbox = !Ed.selId && S.textBoxHit ? S.textBoxHit(e) : null;
    var hitG = t.closest('.annots [data-aid]') || (!handle && !tbox ? S.annotElAt(e) : null);
    if (P.sel) { if (P.editor) P.editor.commit(); P.clear(); } // a press anywhere but the frame lets it go (what was typed stays)
    if (hitG && !handle) {
      var a = S.findAnnot(hitG.getAttribute('data-aid'));
      if (a && a.type === 'para' && !e.shiftKey) { // a paragraph frame annotation: its frame, and a drag moves it at once
        e.preventDefault(); Ed.select(null); if (O.sel) O.select(null);
        P.selectAnnot(p, a, true);
        if (!a.locked) P.drag(e, 'move');
        return;
      }
      if (O.sel) O.select(null);
      return down.apply(this, arguments);
    }
    if (!handle && !tbox && t.closest('.pv-textlayer span')) { Ed.select(null); if (O.sel) O.select(null); textPress(e, p); return; }
    if (!handle && !tbox && S.objDown && S.objDown(e, p)) { if (Ed.selId) select.call(Ed, null); return; } // a picture or placed artwork of the page
    if (!handle && !tbox && S.marquee && S.marquee(e, p)) return; // a mouse drag on empty page: a selection rectangle (multi-sel.js)
    if (!handle && !tbox && !hitG) tapText(e, p); // a finger: a drag scrolls (below); a tap on the page's text selects its block
    return down.apply(this, arguments);
  };
  var dbl = S.onDbl;
  S.onDbl = function (e) {
    var p = Ed.page();
    if (!Ed.uniOn() || !p || !e.target.closest || e.target.closest('.annots [data-aid]') || (S.annotElAt && S.annotElAt(e)) || !e.target.closest('.pv-textlayer span, .sel-box.is-text')) return dbl.apply(this, arguments);
    // a double click on the page's text: its block opens for typing, the caret where the click was
    if (S.cancelClick) S.cancelClick();
    if (window.getSelection) window.getSelection().removeAllRanges();
    var at = [e.clientX, e.clientY], pt = S.pagePt(e);
    (S.uniPending || Promise.resolve(null)).then(function (sel) { return sel && P.sel === sel ? sel : S.selectTextAt(p, pt); })
      .then(function (sel) { if (sel && P.sel === sel) P.edit({ at: at }); });
  };
  // the old one-click line selection (sel-lift.js) is the block's frame now
  var click = S.onClick;
  S.onClick = function (e) { if (Ed.uniOn()) return; return click.apply(this, arguments); };
  // one thing selected at a time: an annotation lets the frame and the page object go
  var select = Ed.select;
  Ed.select = function (id) { if (id && P.sel && !P.editor) P.clear(); if (id && O.sel) O.select(null); return select.apply(this, arguments); };
  // the page's pictures are read once the page shows, so the first click on one already finds it
  var paint = Ed.paint;
  Ed.paint = function () { var r = paint.apply(this, arguments), p = Ed.page(); if (p && Ed.uniOn() && O.load && !O.list(p) && window.PDFLib) O.load(p); return r; };
})();
