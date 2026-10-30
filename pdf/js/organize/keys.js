/* Slop PDF — organizer keyboard: arrows move focus (Shift extends), Alt+arrows reorder,
   Space toggles, Enter opens the page view. R / Del are SlopCmd commands (ui/commands.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, S = O._;
  /* ------------------------------------------------------------ keyboard */
  function columns() {
    var kids = Array.prototype.filter.call(S.grid.children, function (c) { return c.classList.contains('thumb'); });
    if (kids.length < 2) return 1;
    var top = kids[0].offsetTop, n = 0;
    for (var i = 0; i < kids.length; i++) { if (kids[i].offsetTop !== top) break; n++; }
    return Math.max(1, n);
  }
  function onKey(e) {
    var t = e.target.closest('.thumb'); if (!t) return;
    var pages = E.state.pages, i = E.indexOf(t.dataset.id), cols = columns(), step = 0;
    var mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case 'ArrowLeft': step = -1; break;
      case 'ArrowRight': step = 1; break;
      case 'ArrowUp': step = -cols; break;
      case 'ArrowDown': step = cols; break;
      case 'Home': step = -i; break;
      case 'End': step = pages.length - 1 - i; break;
    }
    if (step) {
      e.preventDefault();
      if (e.altKey || (mod && e.shiftKey)) { // move selection
        if (!O.sel.size) O.setSelection([t.dataset.id], t.dataset.id);
        var idx = O.selectedIndices(), ids = O.selected(), before;
        if (step < 0) before = Math.max(0, idx[0] + step); else before = Math.min(pages.length, idx[idx.length - 1] + 1 + step);
        E.commit(ids.length > 1 ? U.t('pdf.org.undo_move_pages', { n: ids.length }) : U.t('pdf.org.undo_move_page'), function (st) { E.ops.move(st, ids, before); });
        O.focus(t.dataset.id);
        var at = { n: ids.length, pos: String(E.indexOf(ids[0]) + 1), total: String(E.state.pages.length) };
        SP.app.announce(U.t(ids.length > 1 ? 'pdf.org.key_moved_pages' : 'pdf.org.key_moved_page', at));
        return;
      }
      var j = U.clamp(i + step, 0, pages.length - 1), nid = pages[j].id;
      if (e.shiftKey) { S.rangeSelect(O.anchor || t.dataset.id, nid, false); }
      else if (!mod) O.setSelection([nid], nid);
      O.focus(nid);
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (mod) S.toggle(t.dataset.id); else if (O.sel.has(t.dataset.id) && O.sel.size === 1) S.toggle(t.dataset.id); else S.toggle(t.dataset.id); return; }
    if (e.key === 'Enter') { e.preventDefault(); SP.app.openPage(t.dataset.id); return; }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); var r = t.getBoundingClientRect(); if (!O.sel.has(t.dataset.id)) O.setSelection([t.dataset.id], t.dataset.id); SlopUI.menu(SP.app.pageMenuItems(), r.left + 20, r.top + 20); }
  }
  S.onKey = onKey;
})();
