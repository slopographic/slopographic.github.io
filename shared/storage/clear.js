/* SlopStorage.clear(kind): removes only what the site makes again on demand. Never touches user files, documents,
 * saved projects, Slop Drive's Drive database (slop-hub), the backups or localStorage settings.
 *   'thumbs'      Drive thumbnails and previews (IndexedDB slop-drive-thumbs)
 *   'faces'       face-detection results (IndexedDB slop-faces)
 *   'models'      downloaded AI model files (Cache webllm/*), kept: models imported from a folder
 *   'cutout'      the cut-out model cache
 *   'packs'       downloaded library packs (IndexedDB slop-library), downloaded again when you use them
 *   'aitools'     AI Tools models installed from Get more (IndexedDB slop-aitools), downloaded again with the licence
 *   'oldCaches'   offline caches of earlier releases (slopographic-*); the newest one is kept
 *   'extras'      all of the above
 * Resolves with { kind, removed } (removed: count of entries, or of caches for oldCaches). Never throws.
 *
 * SlopStorage.measure(kinds) removes nothing. It resolves with { kind: { count, bytes } } for each kind: the entries
 * that clear would remove, and their size in bytes (null when a cache entry has no Content-Length). Bytes of
 * IndexedDB records are estimated from their Blob, ArrayBuffer and string sizes (read through SlopDb, read-only).
 * Never throws. Classic script. */
(function (g) {
  'use strict';
  const SS = (g.SlopStorage = g.SlopStorage || {});
  const KINDS = ['thumbs', 'faces', 'models', 'cutout', 'packs', 'aitools'];
  const WEBLLM = ['webllm/model', 'webllm/config', 'webllm/wasm'];
  const LOCAL_HOST = 'https://local-model.slopographic.invalid/';

  function versionOf(name) { const m = /^slopographic-v(\d+)$/.exec(name); return m ? Number(m[1]) : -1; }
  /** The slopographic-* caches except the newest version (the one the running worker uses). */
  async function oldCacheNames() {
    if (!g.caches) return [];
    const names = (await caches.keys().catch(() => [])).filter((n) => n.startsWith('slopographic-'));
    if (names.length < 2) return [];
    const newest = names.reduce((a, b) => (versionOf(b) > versionOf(a) ? b : a));
    return names.filter((n) => n !== newest);
  }
  /** Deletes the old caches. */
  async function clearOldCaches() {
    let n = 0;
    for (const name of await oldCacheNames()) if (await caches.delete(name).catch(() => false)) n++;
    return n;
  }

  SS.clear = async function (kind) {
    try {
      if (kind === 'oldCaches') return { kind, removed: await clearOldCaches() };
      if (kind === 'extras') {
        let removed = 0;
        for (const k of KINDS) removed += await g.SlopRegen.only(k).catch(() => 0);
        return { kind, removed: removed + (await clearOldCaches()) };
      }
      if (KINDS.includes(kind)) return { kind, removed: await g.SlopRegen.only(kind).catch(() => 0) };
    } catch (e) { /* a blocked store counts as nothing removed */ }
    return { kind, removed: 0 };
  };

  /* ---------- measuring (reads only) ---------- */
  const sum = (a, b) => ({ count: a.count + b.count, bytes: a.bytes == null || b.bytes == null ? null : a.bytes + b.bytes });
  /** Rough size of a stored value: Blob, ArrayBuffer and view sizes, two bytes a character, a few per number. */
  function sizeOf(v, depth = 3) {
    if (v == null) return 0;
    if (typeof v === 'string') return v.length * 2;
    if (typeof v === 'number' || typeof v === 'boolean') return 8;
    if (g.Blob && v instanceof g.Blob) return v.size;
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v.byteLength;
    if (depth <= 0 || typeof v !== 'object') return 0;
    let n = 0;
    for (const k of Object.keys(v)) n += sizeOf(v[k], depth - 1);
    return n;
  }
  /** Counts and sizes the records of some stores of one database. Read-only through SlopDb: a missing database is
   * not created, and a missing store counts as empty. Needs shared/db/query.js and db.js (the settings page loads them). */
  async function idbMeasure(name, stores) {
    const db = g.SlopDb ? await g.SlopDb.openExisting(name) : null;
    if (!db) return { count: 0, bytes: 0 };
    try {
      const rows = await db.readAll(stores);
      let count = 0, bytes = 0;
      for (const s of stores) for (const v of rows[s] || []) { count++; bytes += sizeOf(v); }
      return { count, bytes };
    } finally { db.close(); }
  }
  /** Counts and sizes the entries of some caches (those that exist). filter(request) picks entries. */
  async function cacheMeasure(names, filter = () => true) {
    if (!g.caches) return { count: 0, bytes: 0 };
    let total = { count: 0, bytes: 0 };
    for (const name of names) {
      if (!(await caches.has(name).catch(() => false))) continue;
      const c = await caches.open(name);
      for (const req of await c.keys().catch(() => [])) {
        if (!filter(req)) continue;
        const res = await c.match(req).catch(() => null);
        const len = res ? res.headers.get('content-length') : null;
        total = sum(total, { count: 1, bytes: len != null && len !== '' ? Number(len) : null });
      }
    }
    return total;
  }
  const measureOne = {
    thumbs: () => idbMeasure(g.SLOP_THUMB_DB || 'slop-drive-thumbs', ['thumbs']),
    faces: () => idbMeasure(g.SLOP_FACES_DB || 'slop-faces', ['results']),
    models: () => cacheMeasure(WEBLLM, (req) => !req.url.startsWith(LOCAL_HOST)),
    cutout: () => Promise.all([cacheMeasure(['slop-cutout-v1']), idbMeasure('slop-cutout', ['files'])]).then((r) => sum(r[0], r[1])),
    packs: () => idbMeasure('slop-library', ['packs', 'files']),
    aitools: () => idbMeasure('slop-aitools', ['models', 'files']),
    oldCaches: async () => cacheMeasure(await oldCacheNames()),
  };
  SS.measure = async function (kinds) {
    const out = {};
    for (const kind of kinds || []) {
      const f = measureOne[kind];
      out[kind] = f ? await f().catch(() => ({ count: 0, bytes: null })) : { count: 0, bytes: 0 };
    }
    return out;
  };
})(window);
