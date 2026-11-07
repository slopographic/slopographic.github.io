/* Slop Gallery: storage in IndexedDB (this device only).
 * Why IndexedDB and not OPFS: photos are stored as Blobs (IndexedDB keeps them without a copy), reads and writes are
 * transactional so a restore either lands whole or not at all, indexes on sha and date answer duplicate and timeline
 * queries, and it is the same store Slop Drive already uses. OPFS would need a worker for fast sync access and would
 * leave metadata in a second place.
 * Stores:  photos    { id, name, type, size, sha, w, h, takenAt, modified, make, model, orientation, fav, liked, tags,
 *                      addedAt, driveId }                                  (indexes: sha, takenAt)
 *          originals { id, blob }     the original bytes, untouched
 *          thumbs    { id, blob }     JPEG, long edge <= 320 px
 *          albums    { id, name, photoIds, time }    an album holds ids; it never copies bytes
 * The name can be overridden with window.SLOP_GALLERY_DB or ?db=<name> (used by the tests). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const VERSION = 1;
  const STORES = ['photos', 'originals', 'thumbs', 'albums'];
  let dbp = null;

  function name() {
    let q = null;
    try { q = new URLSearchParams(location.search).get('db'); } catch (e) { /* no location */ }
    return window.SLOP_GALLERY_DB || q || 'slop-gallery';
  }
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Storage is unavailable in this browser')); return; }
      const r = indexedDB.open(name(), VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('photos')) {
          const p = d.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('sha', 'sha'); p.createIndex('takenAt', 'takenAt');
        }
        for (const s of ['originals', 'thumbs', 'albums']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
      r.onblocked = () => console.warn('Slop Gallery: close other Slopographic tabs to finish upgrading storage');
    });
    return dbp;
  }
  /** Resolves with fn's results (if any) once the transaction completes. fn receives { store: IDBObjectStore }. */
  async function write(stores, fn) {
    const d = await open();
    const list = [].concat(stores);
    return new Promise((res, rej) => {
      const t = d.transaction(list, 'readwrite');
      const s = Object.fromEntries(list.map((n) => [n, t.objectStore(n)]));
      let out;
      try { out = fn(s); } catch (e) { try { t.abort(); } catch (x) { /* already done */ } rej(e); return; }
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Storage write was cancelled'));
    });
  }
  function req(store, method, ...args) {
    return open().then((d) => new Promise((res, rej) => {
      const r = d.transaction(store, method === 'getAll' || method === 'get' ? 'readonly' : 'readwrite').objectStore(store)[method](...args);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  const all = (store) => req(store, 'getAll');
  const get = (store, id) => req(store, 'get', id);
  /** Closes the database and deletes it (used by "empty library" and by the tests). */
  async function destroy() {
    if (dbp) { try { (await dbp).close(); } catch (e) { /* closed */ } }
    dbp = null;
    await new Promise((res) => { const r = indexedDB.deleteDatabase(name()); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  }

  G.db = { open, write, all, get, destroy, STORES, name };
})();
