/* Slop Gallery — ui/view-state: coming back to Slop Gallery returns to the view you left (All photos, Favourites,
 * an album or duplicates), the filters, Select mode and the timeline's scroll position. The photos come from the
 * library in IndexedDB (core/db.js); the place is kept in SlopSession. Classic script; exposes G.viewState. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const APP = 'gallery', VIEWS = ['photos', 'favourites', 'album', 'dupes', 'people'];
  let ready = false; // nothing is saved until the saved place has been applied
  const grid = () => document.getElementById('grid');
  const auto = window.SlopSession.autosave(APP, 'place', function () {
    const st = G.state.state;
    return { view: st.view, query: Object.assign({}, st.query), selectMode: !!st.selectMode, scroll: grid() ? grid().scrollTop : 0 };
  }, { delay: 400 });
  const touch = function () { if (ready && G.state) auto.touch(); };
  G.state.subscribe(touch);
  ['pointerup', 'keyup', 'click', 'input', 'change'].forEach(function (t) { document.addEventListener(t, touch, true); });
  if (grid()) grid().addEventListener('scroll', touch, { passive: true });

  G.viewState = {
    /** Boot, after the library and the timeline are in place. */
    restore: async function () {
      const p = await window.SlopSession.load(APP, 'place', null).catch(function () { return null; });
      if (p && typeof p === 'object') {
        const st = G.state.state;
        const album = p.query && typeof p.query.album === 'string' ? p.query.album : '';
        if (VIEWS.includes(p.view) && (p.view !== 'album' || (G.library.album && G.library.album(album)))) {
          G.state.setView(p.view, p.view === 'album' ? album : '');
        }
        if (p.query && typeof p.query === 'object') {
          const q = {};
          for (const k of ['text', 'year', 'month', 'camera', 'tag']) if (typeof p.query[k] === 'string') q[k] = p.query[k];
          if (typeof p.query.fav === 'boolean') q.fav = p.query.fav;
          G.state.setQuery(q);
        }
        st.selectMode = !!p.selectMode;
        if (grid() && p.scroll > 0) requestAnimationFrame(function () { grid().scrollTop = p.scroll; });
      }
      ready = true;
    },
  };
})();
