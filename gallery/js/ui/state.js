/* Slop Gallery: the UI state shared by the timeline, the sidebar, the viewer and Sort mode. Plain data plus a change hook.
 * query: the filters (see core/query.js). selected: ids chosen with ctrl/shift click or select mode.
 * Exposes window.SlopGallery.state with get/set/subscribe. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const state = {
    query: { text: '', year: '', month: '', camera: '', fav: false, tag: '', album: '' },
    selected: new Set(),
    selectMode: false,
    view: 'photos', // photos | favourites | album | dupes
  };
  const subs = new Set();
  const emit = (what) => { for (const fn of [...subs]) try { fn(what, state); } catch (e) { console.error(e); } };

  /** Patch the query and re-render. Setting view 'album' also sets the album filter. */
  function setQuery(patch) { Object.assign(state.query, patch); emit('query'); }
  function setView(view, album = '') {
    state.view = view;
    state.query.album = view === 'album' ? album : '';
    state.query.fav = view === 'favourites';
    emit('view');
  }
  function select(ids, on = true) {
    for (const id of [].concat(ids)) { if (on) state.selected.add(id); else state.selected.delete(id); }
    emit('selection');
  }
  function clearSelection() { state.selected.clear(); emit('selection'); }
  function pruneSelection(validIds) { for (const id of state.selected) if (!validIds.has(id)) state.selected.delete(id); }

  G.state = {
    state,
    get: () => state,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit, setQuery, setView, select, clearSelection, pruneSelection,
    get selected() { return [...state.selected]; },
  };
})();
