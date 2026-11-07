/* Slop Drive — core/thumbs: the thumbnail for every file, made once in the background and cached in IndexedDB
 * (core/thumb-cache.js) keyed by file id and modified time. Generation runs one job at a time, so the list never
 * waits. DR.thumb(r) → a Promise of an object URL (never rejects; null for folders). The kinds: core/thumb-make.js. */
'use strict';
(function (DR) {
  const VER = 3; // bump when a generator changes, so every stored thumbnail is made again
  const memo = new Map(), urls = new Map(), info = new Map(), logged = new Set();
  const stamp = (r) => r.modified || r.time || 0;
  const keyOf = (r) => r.id + ':' + stamp(r);
  /** Counts for the tests and the console: made = generated now, cached = read from IndexedDB. */
  const stats = DR.thumbStats = { made: 0, cached: 0 };

  // One job at a time: each job starts when the previous one has finished (and never rejects).
  let chain = Promise.resolve();
  const enqueue = (fn) => { const p = chain.then(fn).catch(() => null); chain = p; return p; };

  /** The stored or freshly made thumbnail blob for a record. */
  async function blobFor(r) {
    const hit = await DR.thumbCache.get(r.id);
    if (hit && hit.modified === stamp(r) && hit.ver === VER && hit.blob) {
      info.set(r.id, hit.info || {}); stats.cached++;
      return hit.blob;
    }
    const made = await DR.makeThumb(r);
    stats.made++;
    info.set(r.id, made.info || {});
    await DR.thumbCache.put({ id: r.id, modified: stamp(r), ver: VER, blob: made.blob, info: made.info || {} });
    return made.blob;
  }
  /** An object URL for a blob, reused while the same version of the file is shown. */
  function urlFor(r, key, blob) {
    const old = urls.get(r.id);
    if (old && old.key === key) return old.url;
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(blob);
    urls.set(r.id, { key, url });
    return url;
  }

  /** Promise of a thumbnail URL for a file (or null for folders and records without a blob). Never rejects. */
  DR.thumb = function (r) {
    if (!r || r.isFolder || !r.blob) return Promise.resolve(null);
    const key = keyOf(r);
    if (!memo.has(key)) {
      const p = enqueue(() => blobFor(r)).then((blob) => (blob ? urlFor(r, key, blob) : null), () => null);
      memo.set(key, p);
    }
    return memo.get(key);
  };
  /** Forgets the in-memory promises (the IndexedDB copies stay). Used by the tests. */
  DR.thumbReset = () => memo.clear();
  /** Facts kept with a thumbnail: { kind, w, h, pages, duration, lines, header, ... } once it has been made or read. */
  DR.mediaInfo = (r) => info.get(r.id) || null;
  /** Fills a box with the thumbnail when it is ready (the box then gets the has-img class). */
  DR.fillThumb = function (box, r) {
    DR.thumb(r).then((url) => {
      if (!url || !box.isConnected) return;
      box.replaceChildren(DR.el('img', { src: url, alt: '', draggable: 'false', decoding: 'async' }));
      box.classList.add('has-img');
    });
  };
  /** Logs a thumbnail failure once per file and kind of error. */
  DR.logThumbError = function (r, err) {
    const k = r.id + ':' + (err && err.message);
    if (logged.has(k)) return;
    logged.add(k);
    console.warn(`Slop Drive: no thumbnail for "${r.name}", showing its card instead:`, err);
  };
  /** Drops the thumbnails of files that are gone (called after each refresh) and their cached copies. */
  DR.pruneThumbs = async function (liveIds) {
    const live = new Set(liveIds);
    for (const [id, u] of urls) if (!live.has(id)) { URL.revokeObjectURL(u.url); urls.delete(id); info.delete(id); }
    for (const k of [...memo.keys()]) if (!live.has(k.slice(0, k.indexOf(':')))) memo.delete(k);
    await DR.thumbCache.prune(live);
  };
})(window.DR);
