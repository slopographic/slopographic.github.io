/* SlopCutout loader: downloads big files (models, the ONNX Runtime wasm) once with progress, checks
 * their sha256 and keeps them in the Cache API (IndexedDB when the Cache API is unavailable), so later
 * visits work offline and start instantly. Classic script for the worker (or a page). Sets self.SlopCutoutLoader. */
(function (root) {
  'use strict';
  const CACHE = 'slop-cutout-v1', IDB = 'slop-cutout', STORE = 'files';
  const hasCaches = () => { try { return typeof caches !== 'undefined' && !!caches.open; } catch (e) { return false; } };

  /* ---------- IndexedDB fallback ---------- */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') { rej(new Error('No storage')); return; }
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => { const t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  }

  /* ---------- store ---------- */
  async function readStored(key) {
    try {
      if (hasCaches()) { const c = await caches.open(CACHE), r = await c.match(key); return r ? await r.arrayBuffer() : null; }
      return (await idb('readonly', (s) => s.get(key))) || null;
    } catch (e) { return null; }
  }
  async function writeStored(key, buf) {
    try {
      if (hasCaches()) { const c = await caches.open(CACHE); await c.put(key, new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(buf.byteLength) } })); }
      else await idb('readwrite', (s) => s.put(buf, key));
      return true;
    } catch (e) { return false; } // quota or private mode: still usable for this session
  }
  async function hasStored(key) {
    try {
      if (hasCaches()) { const c = await caches.open(CACHE); return !!(await c.match(key)); }
      return (await idb('readonly', (s) => s.count(key))) > 0;
    } catch (e) { return false; }
  }
  async function removeStored(key) {
    try { if (hasCaches()) { const c = await caches.open(CACHE); return c.delete(key); } await idb('readwrite', (s) => s.delete(key)); return true; } catch (e) { return false; }
  }

  async function sha256(buf) {
    if (!(root.crypto && crypto.subtle)) return null; // insecure context (plain http on a LAN): skip the check
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  /** Cache key: the URL plus the expected hash, so a new file version never matches an old entry. */
  const keyOf = (url, hash) => url + (hash ? '#' + hash.slice(0, 16) : '');

  /** fetch with progress → ArrayBuffer. onProgress({ loaded, total }). */
  async function download(url, total, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed (' + res.status + ') for ' + url.split('/').pop());
    total = +res.headers.get('content-length') || total || 0;
    if (!res.body || !res.body.getReader) { const b = await res.arrayBuffer(); if (onProgress) onProgress({ loaded: b.byteLength, total: b.byteLength }); return b; }
    const reader = res.body.getReader(), parts = [];
    let loaded = 0, last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); loaded += value.byteLength;
      const now = Date.now();
      if (onProgress && now - last > 80) { last = now; onProgress({ loaded, total: Math.max(total, loaded) }); }
    }
    const out = new Uint8Array(loaded);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; }
    if (onProgress) onProgress({ loaded, total: loaded });
    return out.buffer;
  }

  /**
   * Get a file: from the cache when present (and its hash still matches), else download, verify, store.
   * opts: { sha256, bytes, onProgress({ loaded, total, cached }) }. Resolves with { buffer, cached }.
   */
  async function fetchCached(url, opts = {}) {
    const key = keyOf(url, opts.sha256);
    const hit = await readStored(key);
    if (hit) {
      const h = opts.sha256 ? await sha256(hit) : null;
      if (!opts.sha256 || h === null || h === opts.sha256) {
        if (opts.onProgress) opts.onProgress({ loaded: hit.byteLength, total: hit.byteLength, cached: true });
        return { buffer: hit, cached: true };
      }
      await removeStored(key); // damaged entry: download again
    }
    const buf = await download(url, opts.bytes, opts.onProgress);
    if (opts.sha256) {
      const h = await sha256(buf);
      if (h && h !== opts.sha256) throw new Error('Checksum mismatch for ' + url.split('/').pop() + ' (the download was damaged; try again)');
    }
    await writeStored(key, buf); // Response copies the bytes
    return { buffer: buf, cached: false };
  }

  root.SlopCutoutLoader = { fetchCached, download, sha256, isCached: (url, hash) => hasStored(keyOf(url, hash)), remove: (url, hash) => removeStored(keyOf(url, hash)), keyOf, CACHE, IDB };
})(typeof self !== 'undefined' ? self : globalThis);
