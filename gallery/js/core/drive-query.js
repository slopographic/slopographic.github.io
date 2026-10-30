/* Slop Gallery — core/drive-query: the Drive source's search, kind filter, sort and counts. Pure functions, no DOM.
 *  shape(items, { text, chips, sort }) → { visible, counts }
 *    text   name search, case-insensitive substring
 *    chips  selected kind chip ids (shared/kinds/kinds.js). None selected means every kind. Several selected means any of them.
 *    sort   'added' (newest added first, then by name) or 'name' (A to Z, numbers in order)
 *    counts { chipId: n } for the files that match the search. The kind selection does not narrow them.
 * Exposes window.SlopGallery.driveQuery. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const byAdded = (a, b) => (b.time - a.time) || byName(a, b);

  function shape(items, opts = {}) {
    const text = String(opts.text || '').trim().toLowerCase();
    const chips = opts.chips || [];
    const bySearch = (items || []).filter((it) => !text || String(it.name).toLowerCase().includes(text));
    const counts = window.SlopKinds.countChips(bySearch);
    const visible = bySearch
      .filter((it) => !chips.length || chips.some((c) => window.SlopKinds.chipMatch(it.kind, c)))
      .sort(opts.sort === 'name' ? byName : byAdded);
    return { visible, counts };
  }

  G.driveQuery = { shape };
})();
