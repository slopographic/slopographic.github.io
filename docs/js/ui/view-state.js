/* Slop Docs — ui/view-state: coming back to Slop Docs reopens the document you left, a Slop Drive document or the
 * untitled one, with its caret, zoom and scroll position. Unsaved text comes back from the IndexedDB draft (ui/files.js);
 * the place is kept in SlopSession. The open tabs and their text come back from the tab strip (ui/tabs.js).
 * Classic script, loaded before ui/main.js. Exposes SlopDocs.restorePlace. */
(function () {
  'use strict';
  const S = window.SlopDocs, APP = 'docs';
  let ready = false; // nothing is saved until the saved place has been applied (see the 'ready' event)
  const stage = () => document.getElementById('stage');
  const auto = window.SlopSession.autosave(APP, 'place', function () {
    return { id: (S.file && S.file.id) || null, sel: S.sel, zoom: S.zoom, scroll: stage() ? stage().scrollTop : 0 };
  }, { delay: 400 });
  const touch = function () { if (ready && S.doc) auto.touch(); };
  S.on('sel', touch);
  S.on('doc', touch);
  S.on('ready', function () { ready = true; touch(); });
  ['pointerup', 'keyup', 'change'].forEach(function (t) { document.addEventListener(t, touch, true); });
  document.addEventListener('wheel', touch, { capture: true, passive: true });
  if (stage()) stage().addEventListener('scroll', touch, { passive: true });

  /** Boot, when there is no Slop Drive launch: the caret, zoom and scroll of the tab that was on screen. The tabs
   * themselves come back from the strip's session (ui/tabs.js), before this runs. */
  S.restorePlace = async function () {
    const p = await window.SlopSession.load(APP, 'place', null);
    const place = p && typeof p === 'object' ? p : null;
    if (place) applyPlace(place);
    return !!place;
  };
  /** A caret point that exists in the open document (its paragraph is long enough). */
  function validPoint(pt) {
    if (!pt || !Number.isInteger(pt.b) || pt.b < 0 || pt.b >= S.doc.blocks.length || !Number.isInteger(pt.o) || pt.o < 0) return false;
    const b = S.doc.blocks[pt.b];
    return !b || b.type !== 'p' || pt.o <= window.SlopDocEngine.M.paraText(b).length;
  }
  function applyPlace(p) {
    // The caret belongs to the document it was saved with: a place from another document is not applied.
    const sameDoc = (p.id || null) === ((S.file && S.file.id) || null);
    if (S.doc && sameDoc && p.sel && validPoint(p.sel.a) && validPoint(p.sel.f)) S.select(p.sel.a, p.sel.f);
    // On a phone the page is fitted to the screen width at boot (ui/main.js fitZoom); a zoom saved on a desktop would overflow it.
    if (p.zoom > 0 && p.zoom <= 4 && window.innerWidth >= 700) {
      S.zoom = p.zoom;
      const sel = document.getElementById('zoomSel');
      if (sel) {
        if (![...sel.options].some((o) => Number(o.value) === p.zoom)) sel.append(new Option(Math.round(p.zoom * 100) + '%', String(p.zoom)));
        sel.value = String(p.zoom);
      }
    }
    if (S.R && S.R.render) S.R.render();
    if (stage() && p.scroll > 0) requestAnimationFrame(() => { stage().scrollTop = p.scroll; });
  }
})();
