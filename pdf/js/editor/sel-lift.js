/* Slop PDF — the text selection box: move and resize the selected text.
   With the select tool, a text selection on one page (not rotated) shows a box with the annotation handles. Pressing the box
   or a handle lifts the selected text into editable layers: a white cover over each selected line and one text annotation with
   the same words at the same place (set in a standard face: the run's family when it is one of the three). The lift is one
   undo step and is made at the first movement, so a press alone changes nothing; the lifted text is then moved or resized as
   an annotation. The pieces are worked out when the selection is made (A.prepare), so the press itself is synchronous.
   Loaded after sel-actions.js (S.selAct). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, T = S.sel, G = window.SlopPdfSel, A = S.selAct;

  /** The lift for a selection: {pid, box: {x0, y0, x1, y1}, text: the annotation, annots: covers then the text}, or null. */
  function liftData(part, lines, runs) {
    var spans = G.selectedSpans(lines, part.rects);
    var rows = spans.map(function (s) { return { x: s.x0, top: s.ln.top, bottom: s.ln.bottom, text: spanText(s.ln, part.rects) }; }).filter(function (r) { return r.text; });
    if (!rows.length) return null;
    var run = runs[0], fam = run && /^(Helvetica|Times|Courier)$/.test(run.fam) ? run.fam : 'Helvetica';
    var size = U.round((rows[0].bottom - rows[0].top) / 1.02, 1); // the glyph band is 1.02 em: 0.8 em above the baseline, 0.22 em below
    // the covers take the paper round each line and the text keeps its ink (light text on a dark band stays light on it)
    var boxes = G.selectionBoxes(lines, part.rects, 1), slot = S.slots.get(part.pid);
    var ink = S.inkColour && boxes.length ? S.inkColour(slot, boxes[0], S.paperColour(slot, boxes[0])) : '#000000';
    var text = { id: U.uid('a'), type: 'text', text: rows.map(function (r) { return r.text; }).join('\n'), font: fam, bold: !!(run && run.bold), italic: !!(run && run.italic), size: size, color: ink, opacity: 1, rot: 0 };
    var t = E.textLayout(text), left = Math.min.apply(null, rows.map(function (r) { return r.x; })) - t.pad;
    var baseline = rows[0].bottom - 0.22 * size, top = baseline - t.base(0); // the layout puts the first baseline at base(0) below the top
    text.w = t.w; text.h = t.h; text.cx = left + t.w / 2; text.cy = top + t.h / 2;
    var covers = boxes.map(function (b) { return A.coverOf(b, A.paperOf(part.pid, b)); });
    var x0 = Math.min.apply(null, boxes.map(function (b) { return b.x; })), y0 = Math.min.apply(null, boxes.map(function (b) { return b.y; }));
    var x1 = Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; })), y1 = Math.max.apply(null, boxes.map(function (b) { return b.y + b.h; }));
    return { pid: part.pid, box: { x0: x0, y0: y0, x1: x1, y1: y1 }, text: text, annots: covers.concat([text]) };
  }
  /** The words of one line that lie inside the selection's rectangles (spaces kept between them, ends trimmed). */
  function spanText(ln, rects) {
    return ln.chars.filter(function (c) {
      var cx = (c.x0 + c.x1) / 2, cy = (c.top + c.bottom) / 2;
      return rects.some(function (r) { return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; });
    }).map(function (c) { return c.ch; }).join('').replace(/\s+/g, ' ').trim();
  }
  /** Works out the lift of a new selection (sel-bar.js calls it on each selection): on one unrotated page, the lift's data
      comes in later and the box shows then. snap.plan = {data} once known (data null when there is nothing to lift). */
  A.prepare = function (snap) {
    if (snap.plan || snap.parts.length !== 1) return;
    var part = snap.parts[0];
    snap.plan = { data: null };
    if (part.p.blank || E.rotation(part.p) !== 0) return;
    Promise.all([E.pageTextLines(part.p), Ed.runsUnder(part.p, part.rects)]).then(function (res) {
      snap.plan.data = liftData(part, res[0], res[1]);
      if (T.snap === snap && snap.plan.data && S.drawSelection) S.drawSelection();
    }, function () { /* no text positions: no box, the bar still works */ });
  };
  /** The selection box and its handles on the overlay (view.js drawSelection calls it when no annotation is selected). */
  S.drawTextBox = function () {
    var snap = T.snap, d = snap && snap.plan && snap.plan.data;
    if (!d || !T.shown() || Ed.editText || d.pid !== Ed.pid) return;
    var z = Ed.zoom, b = d.box, w = b.x1 - b.x0, h = b.y1 - b.y0;
    var box = U.h('div', { class: 'sel-box is-text' });
    box.style.left = (b.x0 * z) + 'px'; box.style.top = (b.y0 * z) + 'px'; box.style.width = (w * z) + 'px'; box.style.height = (h * z) + 'px';
    S.overlay.appendChild(box);
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (k) {
      var el = U.h('div', { class: 'handle h-' + k, 'data-h': k, 'data-tb': '1' });
      el.style.left = ((b.x0 + (/w/.test(k) ? 0 : /e/.test(k) ? w : w / 2)) * z) + 'px';
      el.style.top = ((b.y0 + (/n/.test(k) ? 0 : /s/.test(k) ? h : h / 2)) * z) + 'px';
      S.overlay.appendChild(el);
    });
  };
  /** What a press on the text selection box hits: a handle's name, 'move' for the box, or null. */
  S.textBoxHit = function (e) {
    var t = e.target; if (!t.closest) return null;
    var h = t.closest('.handle[data-tb]'); if (h) return h.getAttribute('data-h');
    return t.closest('.sel-box.is-text') ? 'move' : null;
  };
  /** A press on the box or a handle: the lift happens at the first real movement (2 px), then the lifted text is dragged by
      startEdit (pointer.js) as an annotation. A press without movement lifts nothing and keeps the selection. */
  S.liftEdit = function (e, h) {
    var snap = T.snap, d = snap && snap.plan && snap.plan.data; if (!d) return;
    e.preventDefault();
    S.pageEl.setPointerCapture(e.pointerId); // touch-ok: the page view is a touch surface (view-zoom.js)
    function cleanup() {
      S.pageEl.removeEventListener('pointermove', mv); S.pageEl.removeEventListener('pointerup', cleanup); S.pageEl.removeEventListener('pointercancel', cleanup);
    }
    function mv(ev) {
      var v = S.viewPt(ev), s0 = S.viewPt(e);
      if (Math.hypot(v[0] - s0[0], v[1] - s0[1]) * Ed.zoom < 2) return;
      cleanup();
      snap.plan = null; // one lift per selection
      var pid = d.pid;
      E.commit(U.t('pdf.ed.undo_lift_text'), function (st) {
        var q = st.pages.filter(function (x) { return x.id === pid; })[0];
        if (q) d.annots.forEach(function (a) { q.annots.push(JSON.parse(JSON.stringify(a))); });
      });
      if (window.getSelection) window.getSelection().removeAllRanges(); // the text is now the annotation
      Ed.select(d.text.id);
      S.startEdit(e, h);
      // the movement that lifted the text moves it too: a quick drag may send only this one move before the release
      S.pageEl.dispatchEvent(new PointerEvent('pointermove', { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: true, buttons: 1, bubbles: true }));
    }
    S.pageEl.addEventListener('pointermove', mv); S.pageEl.addEventListener('pointerup', cleanup); S.pageEl.addEventListener('pointercancel', cleanup);
  };
  /** A single click on the page's own text (select tool, Edit text off): that text item is selected, so its box and handles
   *  show and a drag on the box moves it. The selection waits a moment, so a double click (edit in place, pointer.js) cancels
   *  it; a drag that selected text keeps its own selection. */
  var clickTimer = null;
  S.onClick = function (e) {
    clearTimeout(clickTimer);
    var span = e.target.closest && e.target.closest('.pv-textlayer span'), sel = window.getSelection && window.getSelection();
    if (!span || !sel || e.detail !== 1 || Ed.tool !== 'select' || Ed.editText || !sel.isCollapsed) return;
    clickTimer = setTimeout(function () {
      if (!span.isConnected || !sel.isCollapsed) return;
      var r = document.createRange();
      r.selectNodeContents(span);
      sel.removeAllRanges(); sel.addRange(r);
    }, 280);
  };
  S.cancelClick = function () { clearTimeout(clickTimer); };
  // each selection: its lift is worked out, and the box is drawn (or cleared) on the page in view
  T.onChange(function () { if (T.snap) A.prepare(T.snap); if (S.overlay && Ed.pid) S.drawSelection(); });
})();
