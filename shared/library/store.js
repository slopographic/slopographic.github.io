/* Slopographic font packs: the IndexedDB store (database "slop-library"). Nothing is kept in localStorage.
 * Two object stores: "packs" (one record per installed pack, keyed by id, with its file metadata) and
 * "files" (one Blob per font file, keyed "<packId>/<fileName>"). A pack is written in one transaction, so a
 * pack is either fully there or not there at all. Classic script; exposes window.SlopLibraryStore. */
(function (root) {
  'use strict';
  const DB = 'slop-library', VERSION = 1;
  let dbp = null;

  /** Opens (once) the database. Rejects when IndexedDB is missing or blocked, so callers can say so. */
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('IndexedDB is not available in this browser')); return; }
      let r;
      try { r = root.indexedDB.open(DB, VERSION); } catch (e) { reject(e); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(r.error || new Error('IndexedDB could not open')); };
      r.onblocked = () => { dbp = null; reject(new Error('Another tab is holding the library database')); };
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  /** Runs one request inside a fresh transaction and resolves with its result. */
  async function request(store, mode, make) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const r = make(t.objectStore(store));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /** Resolves true when the store can be opened. Never rejects. */
  async function available() {
    try { await open(); return true; } catch (e) { return false; }
  }
  /** All installed pack records (metadata only, no blobs). */
  function listPacks() { return request('packs', 'readonly', (s) => s.getAll()).then((rows) => rows || []); }
  /** The Blob of one installed font file, or undefined. */
  function getBlob(key) { return request('files', 'readonly', (s) => s.get(key)).then((row) => (row ? row.blob : undefined)); }

  /** Stores a verified pack: record plus one Blob per file, in a single transaction. */
  async function savePack(pack, blobs) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(['packs', 'files'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storing the pack was cancelled'));
      for (const f of pack.files) {
        t.objectStore('files').put({ key: `${pack.id}/${f.name}`, packId: pack.id, family: f.family, weight: f.weight, style: f.style, blob: blobs[f.name] });
      }
      t.objectStore('packs').put({ id: pack.id, kind: pack.kind || 'font', name: pack.name, licence: pack.licence, licenceUrl: pack.licenceUrl || '', size: pack.size, installedAt: new Date().toISOString(), files: pack.files.map((f) => ({ name: f.name, family: f.family, weight: f.weight, style: f.style, size: f.size, sha256: f.sha256, ...(f.metricFor ? { metricFor: f.metricFor } : {}) })) });
    });
  }

  /** Removes an installed pack and all of its files. */
  async function removePack(id) {
    const packs = await listPacks();
    const rec = packs.find((p) => p.id === id);
    if (!rec) return;
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(['packs', 'files'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Removing the pack was cancelled'));
      for (const f of rec.files) t.objectStore('files').delete(`${id}/${f.name}`);
      t.objectStore('packs').delete(id);
    });
  }

  root.SlopLibraryStore = { available, listPacks, getBlob, savePack, removePack };
})(typeof window !== 'undefined' ? window : globalThis);
