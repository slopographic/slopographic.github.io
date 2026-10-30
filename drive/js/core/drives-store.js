/* Slop Drive — core/drives-store: the named local drives, each a folder the person picked. The folder handle is kept
 * in IndexedDB ('slop-drive-folders' / 'drives'), one record per drive: { id, name, handle, added }. Browser storage is
 * per browser, so this list is per browser too. Nothing is sent anywhere. Tests inject a store with DR.setDrivesStore. */
'use strict';
(function (DR) {
  const DB = 'slop-drive-folders', STORE = 'drives';
  let store = null;
  function idb() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(new Error('Browser storage for local drives is unavailable.')); };
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error || new Error('Browser storage write failed.'));
        t.onabort = () => reject(t.error || new Error('Browser storage write was aborted.'));
      });
    };
    return {
      all: () => run('readonly', (s) => s.getAll()),
      put: (v) => run('readwrite', (s) => s.put(v)),
      del: (id) => run('readwrite', (s) => s.delete(id)),
    };
  }
  const st = () => store || (store = idb());
  /** Tests (and a browser without IndexedDB) pass an object with all(), put(v) and del(id). */
  DR.setDrivesStore = (s) => { store = s; };
  /** Every named local drive, oldest first. Never throws: unreadable storage reads as no drives. */
  DR.drivesAll = async function () {
    const rows = await st().all().catch(() => []);
    return (Array.isArray(rows) ? rows : []).sort((a, b) => (a.added || 0) - (b.added || 0));
  };
  DR.driveSave = (d) => st().put(d);
  DR.driveForget = (id) => st().del(id);
  DR.newDriveId = () => 'dr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
})(window.DR);
