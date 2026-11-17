/* Slop Drive — core/thumb-cache: the thumbnail cache in IndexedDB. It is its own database (slop-drive-thumbs), so the
 * Drive's schema, its migrations and its backups are left alone. One record per file id:
 * { id, modified, ver, blob, info }. A record is used only while modified and ver match (see core/thumbs.js).
 * Every call resolves to null or a value on failure, never throws: without storage the thumbnails are simply made again. */
'use strict';
(function (DR) {
  const NAME = window.SLOP_THUMB_DB || 'slop-drive-thumbs', STORE = 'thumbs', LIMIT = 6000;
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB is unavailable')); return; }
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  /** Runs fn(store) in one transaction and resolves with the request's result. */
  async function run(mode, fn) {
    const d = await db();
    // A transaction the browser never finishes must not hold the list: after LIMIT ms the call fails (and safe() gives null).
    let timer = 0;
    const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('thumbnail cache is not answering')), LIMIT); });
    const work = new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out ? out.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error('thumbnail cache aborted'));
    });
    return Promise.race([work, limit]).finally(() => clearTimeout(timer));
  }
  const safe = (p, fallback = null) => p.catch(() => fallback);
  const cache = {
    get: (id) => safe(run('readonly', (s) => s.get(id))),
    put: (rec) => safe(run('readwrite', (s) => s.put(rec)).then(() => true), false),
    /** Removes the records of the ids that are no longer in the Drive (files removed, purged or cleared). */
    async prune(liveIds) {
      const keys = (await safe(run('readonly', (s) => s.getAllKeys()), [])) || [];
      const dead = keys.filter((k) => !liveIds.has(k));
      if (dead.length) await safe(run('readwrite', (s) => { dead.forEach((k) => s.delete(k)); return null; }));
      return dead;
    },
    clear: () => safe(run('readwrite', (s) => s.clear()), false),
  };
  DR.thumbCache = cache;
})(window.DR);
