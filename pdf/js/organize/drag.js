/* Slop PDF — organizer pointer input: click/shift/ctrl selection, marquee, drag & drop reordering
   (mouse drag, touch long-press or grip handle) with auto-scroll, and the page context menu. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, S = O._;
  /* ------------------------------------------------------------ pointer */
  var press = null, drag = null, marquee = null;
  function onDown(e) {
    if (e.button > 0) return;
    if (e.target.closest('.thumb-tools button, .thumb-check')) return;
    var t = e.target.closest('.thumb');
    if (!t) { startMarquee(e); return; }
    var id = t.dataset.id, touch = e.pointerType !== 'mouse', grip = !!e.target.closest('.thumb-grip');
    var mod = e.ctrlKey || e.metaKey, shift = e.shiftKey;
    O.focusId = id;
    if (!touch) {
      if (shift && O.anchor && S.els.has(O.anchor)) { rangeSelect(O.anchor, id, mod); }
      else if (mod) S.toggle(id);
      else if (!O.sel.has(id)) { O.setSelection([id], id); }
      t.focus({ preventScroll: true });
    }
    press = { id: id, x: e.clientX, y: e.clientY, pid: e.pointerId, touch: touch, mod: mod || shift, timer: null, el: t, started: false };
    if (touch) {
      if (grip) { if (!O.sel.has(id)) O.setSelection([id], id); beginDrag(e); }
      else press.timer = setTimeout(function () {
        if (!press) return;
        // carry a multi-selection (made with the check buttons) along; a single tapped page is replaced
        if (!O.sel.has(id)) { if (O.sel.size > 1) { O.sel.add(id); O.anchor = id; S.syncSel(); } else O.setSelection([id], id); }
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { /* ignore */ }
        beginDrag({ clientX: press.x, clientY: press.y });
      }, 380);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (!touch || grip) e.preventDefault();
  }
  function rangeSelect(a, b, add) {
    var ia = E.indexOf(a), ib = E.indexOf(b); if (ia < 0 || ib < 0) return;
    var lo = Math.min(ia, ib), hi = Math.max(ia, ib), ids = add ? Array.from(O.sel) : [];
    for (var i = lo; i <= hi; i++) ids.push(E.state.pages[i].id);
    O.sel = new Set(ids); S.syncSel();
  }
  function onMove(e) {
    if (!press) return;
    if (drag) { e.preventDefault(); moveDrag(e); return; }
    var d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) { if (d > 10 && press.timer) { clearTimeout(press.timer); press.timer = null; cleanupPress(); } return; }
    if (d > 6) { beginDrag(e); moveDrag(e); }
  }
  function onUp(e) {
    if (!press) return;
    if (drag) { endDrag(e, true); }
    else {
      if (press.timer) clearTimeout(press.timer);
      if (press.touch) {
        // tap selects one page; the round check button adds/removes pages for multi-select
        O.setSelection([press.id], press.id);
        press.el.focus({ preventScroll: true });
      } else if (!press.mod && O.sel.size > 1) O.setSelection([press.id], press.id);
      else if (!press.mod) O.anchor = press.id;
    }
    cleanupPress();
  }
  function onCancel() { if (drag) endDrag(null, false); cleanupPress(); }
  function cleanupPress() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }
  function beginDrag(e) {
    if (drag || !press) return;
    if (!O.sel.has(press.id)) O.setSelection([press.id], press.id);
    var ids = O.selected();
    var ghost = U.h('div', { class: 'drag-ghost' });
    var src = S.els.get(press.id) && S.els.get(press.id).querySelector('.sheet');
    if (src) { var c = src.cloneNode(true); c.style.transform = 'scale(' + (90 / Math.max(src.offsetWidth, src.offsetHeight, 1)) + ')'; c.style.transformOrigin = '0 0'; ghost.appendChild(U.h('div', { class: 'drag-ghost-sheet' }, c)); }
    if (ids.length > 1) ghost.appendChild(U.h('span', { class: 'drag-count' }, String(ids.length)));
    document.body.appendChild(ghost);
    var marker = U.h('div', { class: 'drop-marker' });
    S.grid.appendChild(marker);
    ids.forEach(function (id) { var el = S.els.get(id); if (el) el.classList.add('dragging'); });
    drag = { ids: ids, ghost: ghost, marker: marker, before: null, raf: 0, lastE: e };
    document.body.classList.add('is-dragging');
    autoScroll();
  }
  function moveDrag(e) {
    drag.lastE = e;
    drag.ghost.style.transform = 'translate(' + (e.clientX + 12) + 'px,' + (e.clientY + 12) + 'px)';
    var r = computeBefore(e.clientX, e.clientY);
    drag.before = r.before;
    if (r.rect) {
      var gr = S.grid.getBoundingClientRect();
      drag.marker.style.display = 'block';
      drag.marker.style.left = (r.x - gr.left - 3) + 'px';
      drag.marker.style.top = (r.rect.top - gr.top) + 'px';
      drag.marker.style.height = r.rect.height + 'px';
    }
  }
  function computeBefore(x, y) {
    var kids = Array.prototype.filter.call(S.grid.children, function (c) { return c.classList.contains('thumb'); });
    if (!kids.length) return { before: 0 };
    var best = null, bd = Infinity;
    kids.forEach(function (k, i) {
      var r = k.getBoundingClientRect();
      var dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      var dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      var d = dy * 4 + dx;
      if (d < bd) { bd = d; best = { i: i, r: r }; }
    });
    var after = x > best.r.left + best.r.width / 2;
    var gap = 8;
    return { before: best.i + (after ? 1 : 0), rect: best.r, x: after ? best.r.right + gap / 2 : best.r.left - gap / 2 };
  }
  function autoScroll() {
    if (!drag) return;
    var e = drag.lastE;
    if (e && e.clientY != null) {
      var r = S.scroller.getBoundingClientRect(), edge = 60, v = 0;
      if (e.clientY < r.top + edge) v = -Math.ceil((r.top + edge - e.clientY) / 4);
      else if (e.clientY > r.bottom - edge) v = Math.ceil((e.clientY - (r.bottom - edge)) / 4);
      if (v) { S.scroller.scrollTop += v; moveDrag(e); }
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }
  function endDrag(e, commit) {
    var d = drag; drag = null;
    cancelAnimationFrame(d.raf);
    d.ghost.remove(); d.marker.remove();
    document.body.classList.remove('is-dragging');
    S.els.forEach(function (el) { el.classList.remove('dragging'); });
    if (!commit || d.before == null) return;
    var before = d.before, idx = O.selectedIndices();
    // no-op if dropping in place
    var contiguous = idx.every(function (v, k) { return k === 0 || v === idx[k - 1] + 1; });
    if (contiguous && before >= idx[0] && before <= idx[idx.length - 1] + 1) return;
    E.commit(d.ids.length > 1 ? U.t('pdf.org.undo_move_pages', { n: d.ids.length }) : U.t('pdf.org.undo_move_page'), function (st) { E.ops.move(st, d.ids, before); });
    var ni = E.indexOf(d.ids[0]);
    SP.app.announce(d.ids.length > 1 ? U.t('pdf.org.moved_pages', { n: d.ids.length, pos: String(ni + 1) }) : U.t('pdf.org.moved_page', { pos: String(ni + 1) }));
  }

  function startMarquee(e) {
    if (e.pointerType !== 'mouse') return;
    var gr = S.grid.getBoundingClientRect();
    var base = (e.ctrlKey || e.metaKey || e.shiftKey) ? new Set(O.sel) : new Set();
    if (!base.size) O.setSelection([]);
    var box = U.h('div', { class: 'marquee' }); S.grid.appendChild(box);
    marquee = { x: e.clientX, y: e.clientY, box: box, base: base };
    var rects = null;
    function mv(ev) {
      var x1 = Math.min(marquee.x, ev.clientX), y1 = Math.min(marquee.y, ev.clientY), x2 = Math.max(marquee.x, ev.clientX), y2 = Math.max(marquee.y, ev.clientY);
      var g2 = S.grid.getBoundingClientRect();
      box.style.left = (x1 - g2.left) + 'px'; box.style.top = (y1 - g2.top) + 'px'; box.style.width = (x2 - x1) + 'px'; box.style.height = (y2 - y1) + 'px';
      if (x2 - x1 < 3 && y2 - y1 < 3) return;
      rects = rects || Array.from(S.els.entries());
      var s = new Set(marquee.base);
      rects.forEach(function (kv) { var r = kv[1].getBoundingClientRect(); if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) s.add(kv[0]); });
      O.sel = s; S.syncSel();
    }
    function up() { box.remove(); marquee = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    e.preventDefault();
    void gr;
  }

  function onContext(e) {
    var t = e.target.closest('.thumb'); if (!t) return;
    e.preventDefault();
    if (drag || (press && press.touch)) return; // long-press on touch starts a drag, not a menu
    var id = t.dataset.id;
    if (!O.sel.has(id)) O.setSelection([id], id);
    SlopUI.menu(SP.app.pageMenuItems(), e.clientX, e.clientY);
  }

  S.onDown = onDown; S.onContext = onContext; S.rangeSelect = rangeSelect;
  S.dragging = function () { return !!drag; };
  S.cancelPress = function () { if (press || drag) onCancel(); };
})();
