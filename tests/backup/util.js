/* Shared helpers for the Export everything tests. Each page loads ../harness.js, this file and ../../shared/backup/index.js. */
(function (g) {
  'use strict';
  const H = {};
  /** Loads the "Export everything" parts and the Slop Data scripts; resolves with window.SlopCentral. */
  H.central = async () => { const C = await window.SlopBackup.central(); await C.ready(); return C; };
  H.eraseData = async () => {
    const r = await SlopData.store.erase(); if (!r.ok) throw new Error(r.message);
    const q = await SlopData.store.ready(); if (!q.ok) throw new Error(q.message);
  };
  H.deleteDb = (name) => new Promise((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res();
  });
  /** Slop Drive as the Drive app makes it: files (with a time index) and folders, two files and one folder. */
  H.seedDrive = async () => {
    await H.deleteDb('slop-drive');
    const C = window.SlopCentral;
    const d = await C.idb.openDb('slop-drive', 2, (db) => {
      db.createObjectStore('files', { keyPath: 'id' }).createIndex('time', 'time');
      db.createObjectStore('folders', { keyPath: 'id' });
    });
    const tx = d.transaction(['files', 'folders'], 'readwrite');
    tx.objectStore('files').put({ id: 'f1', name: 'a.txt', type: 'text/plain', size: 5, time: 1, folderId: 'd1', blob: new Blob(['hello']) });
    tx.objectStore('files').put({ id: 'f2', name: 'b.txt', type: 'text/plain', size: 6, time: 2, folderId: null, blob: new Blob(['world!']) });
    tx.objectStore('folders').put({ id: 'd1', name: 'Docs', parentId: null, time: 3 });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    d.close();
  };
  H.driveStores = () => window.SlopCentral.idb.readDb('slop-drive');
  /** Live counts: customers (Slop Data), Drive files and folders. */
  H.counts = async () => {
    const r = await SlopData.store.list('customers');
    const d = await H.driveStores();
    const n = (s) => (d[s] ? d[s].records.length : 0);
    return { customers: r.value.length, files: n('files'), folders: n('folders') };
  };
  H.driveFile = async (id) => {
    const d = await H.driveStores();
    const rec = (d.files ? d.files.records : []).find((x) => x.v.id === id);
    return rec ? rec.v : null;
  };
  H.blob = (text, type = 'application/json') => new Blob([text], { type });
  H.envelopeOf = async (C) => JSON.parse(await (await C.exportEverything()).blob.text());
  g.BK = H;
})(window);
