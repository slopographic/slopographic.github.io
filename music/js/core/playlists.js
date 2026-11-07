/* Slop Music: playlists, kept in the 'playlists' store (IndexedDB). A playlist is { id, name, trackIds, created,
 * modified }; trackIds are Slop Drive ids. Exposes window.SlopMusic.playlists. Subscribers hear every change. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  let lists = [];
  const subs = new Set();
  const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  async function load() { lists = ((await M.store.listPlaylists()) || []).sort(byName); emit(); return lists; }
  const all = () => lists.slice();
  const get = (id) => lists.find((p) => p.id === id) || null;
  async function save(p) {
    p.modified = Date.now();
    await M.store.putPlaylist(p);
    lists = lists.filter((x) => x.id !== p.id).concat(p).sort(byName);
    emit();
    return p;
  }
  /** Creates a playlist, optionally with track ids. */
  function create(name, trackIds = []) {
    const now = Date.now();
    return save({ id: newId(), name: clean(name) || 'New playlist', trackIds: [...new Set(trackIds)], created: now, modified: now });
  }
  const clean = (s) => String(s || '').trim().slice(0, 80);
  function rename(id, name) { const p = get(id); return p && save(Object.assign(p, { name: clean(name) || p.name })); }
  async function remove(id) {
    await M.store.deletePlaylist(id);
    lists = lists.filter((p) => p.id !== id);
    emit();
  }
  /** Adds tracks not yet in the playlist. Resolves with how many were added. */
  async function addTracks(id, ids) {
    const p = get(id);
    if (!p) return 0;
    const fresh = [...new Set(ids)].filter((x) => !p.trackIds.includes(x));
    if (fresh.length) await save(Object.assign(p, { trackIds: p.trackIds.concat(fresh) }));
    return fresh.length;
  }
  /** Replaces the track order (drag to reorder, or removal). */
  function setTracks(id, trackIds) {
    const p = get(id);
    return p && save(Object.assign(p, { trackIds: [...new Set(trackIds)] }));
  }
  M.playlists = { load, all, get, create, rename, remove, addTracks, setTracks, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
})();
