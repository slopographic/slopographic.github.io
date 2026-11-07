/* Slop Gallery: object URLs for thumbnails and originals. Thumbnails sit in a bounded LRU (the least recently shown
 * are revoked), so a 10,000-photo library never holds 10,000 blob URLs. Originals are handed out per viewer open and
 * revoked when the viewer moves on; a camera RAW original is handed out as its upright preview JPEG. Exposes window.SlopGallery.urls. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const LIMIT = 500;
  const cache = new Map();      // id -> url, in recency order (Map keeps insertion order)
  const pending = new Map();    // id -> Promise<url|null>

  function touch(id, url) { cache.delete(id); cache.set(id, url); while (cache.size > LIMIT) { const [oldId, oldUrl] = cache.entries().next().value; cache.delete(oldId); URL.revokeObjectURL(oldUrl); } }

  /** URL of a photo's thumbnail, or null if it is not stored. */
  function thumb(id) {
    if (cache.has(id)) { const u = cache.get(id); touch(id, u); return Promise.resolve(u); }
    if (!pending.has(id)) pending.set(id, G.db.get('thumbs', id).then((row) => {
      pending.delete(id);
      if (!row || !row.blob) return null;
      const u = URL.createObjectURL(row.blob);
      touch(id, u);
      return u;
    }, () => { pending.delete(id); return null; }));
    return pending.get(id);
  }
  /** A fresh URL for the original bytes. The caller revokes it with release(). */
  async function original(id) {
    const row = await G.db.get('originals', id);
    if (!row || !row.blob) return null;
    const meta = G.library && G.library.photo ? G.library.photo(id) || {} : {};
    if (window.SlopRaw && window.SlopRaw.isRawName(meta.name || '')) return rawPicture(row.blob);
    return URL.createObjectURL(row.blob);
  }
  /** A camera RAW photo as a JPEG the viewer can show: the embedded preview, upright (a half-size develop without one).
   *  The stored original is never changed. */
  async function rawPicture(blob) {
    try {
      const r = await window.SlopRaw.image(blob, { mode: 'preview' });
      const jpg = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92));
      return jpg ? URL.createObjectURL(jpg) : null;
    } catch (e) { console.warn('RAW preview failed', e); return URL.createObjectURL(blob); }
  }
  const release = (url) => { if (url) URL.revokeObjectURL(url); };
  /** Forget a photo's thumbnail (after it was removed). */
  function forget(id) { const u = cache.get(id); if (u) { cache.delete(id); URL.revokeObjectURL(u); } }
  function clear() { for (const u of cache.values()) URL.revokeObjectURL(u); cache.clear(); }

  G.urls = { thumb, original, release, forget, clear, LIMIT, get size() { return cache.size; } };
})();
