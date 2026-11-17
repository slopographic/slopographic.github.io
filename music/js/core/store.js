/* Slop Music storage: one IndexedDB ('slop-music'). Stores: analysis (per Drive track: ID3 tags, duration,
 * cover, waveform peaks) and playlists. Every call resolves, never throws: a blocked store only loses saving.
 * Exposes window.SlopMusic.store. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const NAME = window.SLOP_MUSIC_DB || 'slop-music';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Storage is unavailable')); return; }
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('analysis', { keyPath: 'id' }); d.createObjectStore('playlists', { keyPath: 'id' }); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => res(r ? r.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Aborted'));
    }));
  }
  const safe = (p, fallback) => p.catch((e) => { console.warn('Slop Music storage:', e); return fallback; });
  const store = {
    getAnalysis: (id) => safe(run('analysis', 'readonly', (s) => s.get(id)), null),
    putAnalysis: (rec) => safe(run('analysis', 'readwrite', (s) => s.put(rec)), null),
    listPlaylists: () => safe(run('playlists', 'readonly', (s) => s.getAll()), []),
    putPlaylist: (rec) => safe(run('playlists', 'readwrite', (s) => s.put(rec)), null),
    deletePlaylist: (id) => safe(run('playlists', 'readwrite', (s) => s.delete(id)), null),
  };
  M.store = store;
})();
