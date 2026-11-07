/* Slop Drive's cached thumbnails, read only, for the pages that show Drive files outside the Drive app (the shared
 * Drive picker, the Gallery's Drive source). The Drive app makes them (drive/js/core/thumbs.js) and keeps them in
 * IndexedDB 'slop-drive-thumbs' (window.SLOP_THUMB_DB in tests); a missing database is never created here (the upgrade
 * is aborted). A record is used only while its modified time and version match.
 * Exposes window.SlopDriveThumbs = { VER, stamp(record), get(record) → Promise<Blob|null> (never rejects) }. */
(function () {
  'use strict';
  if (window.SlopDriveThumbs) return;
  const VER = 3; // must match VER in drive/js/core/thumbs.js
  const stamp = (r) => r.stamp || r.modified || r.time || 0;
  let db = null;
  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((res) => {
      if (!window.indexedDB) { res(null); return; }
      let r;
      try { r = indexedDB.open(window.SLOP_THUMB_DB || 'slop-drive-thumbs', 1); } catch (e) { res(null); return; }
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { /* already gone */ } };
      r.onsuccess = () => { const d = r.result; db = d; d.onversionchange = () => { d.close(); if (db === d) db = null; }; res(d); };
      r.onerror = () => res(null);
    });
  }
  async function get(r) {
    try {
      const d = await open();
      if (!d || !d.objectStoreNames.contains('thumbs')) return null;
      const rec = await new Promise((res) => {
        const q = d.transaction('thumbs', 'readonly').objectStore('thumbs').get(r.id);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
      return rec && rec.ver === VER && rec.modified === stamp(r) && rec.blob ? rec.blob : null;
    } catch (e) { return null; }
  }
  window.SlopDriveThumbs = { VER, stamp, get };
})();
