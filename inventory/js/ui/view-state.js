// Slop Inventory: the last view (Products, Stock, Count, Reports...), the product list's search, filter and sort, and
// the page scroll are kept in SlopSession, so leaving Inventory and coming back returns to them. The stock and count
// data is in the shared store and is not repeated here. An explicit #view in the address still wins.
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const $ = (id) => document.getElementById(id);
  const APP = 'inventory';
  let ready = false; // nothing is saved until the saved place has been applied
  const auto = g.SlopSession.autosave(APP, 'place', function () {
    return {
      view: NS.state.view,
      products: { q: $('pSearch') ? $('pSearch').value : '', filter: $('pFilter') ? $('pFilter').value : 'all', sort: $('pSort') ? $('pSort').value : '' },
      scroll: g.scrollY || 0,
    };
  }, { delay: 400 });
  const touch = function () { if (ready && NS.state && NS.state.view) auto.touch(); };
  ['pointerup', 'keyup', 'click', 'input', 'change'].forEach(function (t) { document.addEventListener(t, touch, true); });
  g.addEventListener('scroll', touch, { passive: true });

  /** Boot, before the first view is shown: sets the list controls and returns the saved place (or null). */
  NS.viewState = {
    restore: async function () {
      const p = await g.SlopSession.load(APP, 'place', null).catch(function () { return null; });
      const place = p && typeof p === 'object' ? p : null;
      if (place && place.products && typeof place.products === 'object') {
        const pr = place.products;
        if ($('pSearch') && typeof pr.q === 'string') $('pSearch').value = pr.q;
        if ($('pFilter') && typeof pr.filter === 'string' && [...$('pFilter').options].some((o) => o.value === pr.filter)) $('pFilter').value = pr.filter;
        if ($('pSort') && typeof pr.sort === 'string' && [...$('pSort').options].some((o) => o.value === pr.sort)) $('pSort').value = pr.sort;
      }
      ready = true;
      return place;
    },
    /** After the first view is shown: put the page back where it was. */
    restoreScroll: function (place) {
      if (place && place.scroll > 0) requestAnimationFrame(function () { g.scrollTo(0, place.scroll); });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
