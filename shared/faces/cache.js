/* SlopFaces cache: the face results of each picture, in IndexedDB 'slop-faces'. Version 2 has two stores: 'results' (the
 * faces of each picture, with their landmarks and embeddings) and 'people' (the groups of faces, one record per scope).
 * Version 1 to 2 migration: results without the v2 shape (no embeddings) are deleted, so those pictures are checked
 * again once; the people store is created empty. A row is keyed by
 * scope + ':' + id (scope 'drive' for Slop Drive files, 'gallery' for Gallery photos) and holds the stamp it was
 * detected for: a Drive file's modified time, or a photo's SHA-256. A row whose stamp or model differs from the
 * picture's is treated as missing, so an edited picture is detected again. It is derived data: it can be deleted at any
 * time. Every access is in try/catch; when storage is blocked the rows live in memory for this page only.
 * Classic script; adds to window.SlopFaces.cache. */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const NAME = g.SLOP_FACES_DB || 'slop-faces', STORE = 'results', PEOPLE = 'people', VERSION = 2, ROW_V = 2;
  const mem = new Map(), memPeople = new Map();
  let dbp = null;

  const keyOf = (scope, id) => scope + ':' + id;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!g.indexedDB) { rej(new Error('IndexedDB is not available')); return; }
      const r = g.indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = (e) => {
        const db = r.result, t = r.transaction;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(PEOPLE)) db.createObjectStore(PEOPLE, { keyPath: 'key' });
        if (e.oldVersion >= 1 && e.oldVersion < 2) { // migration: rows made before the embeddings are checked again
          t.objectStore(STORE).openCursor().onsuccess = (ev) => {
            const cur = ev.target.result;
            if (!cur) return;
            if (!cur.value || cur.value.v !== ROW_V) cur.delete();
            cur.continue();
          };
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch((e) => { dbp = null; throw e; });
    return dbp;
  }
  /** Runs one request on a store; resolves with its result, or rejects. */
  async function req(mode, fn, store = STORE) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    });
  }

  /** The stored row for a picture, when it was detected for this stamp and this model; otherwise null. */
  async function get(scope, id, stamp) {
    const key = keyOf(scope, id);
    let row = null;
    try { row = (await req('readonly', (s) => s.get(key))) || null; } catch (e) { row = mem.get(key) || null; }
    return row && row.v === ROW_V && row.stamp === String(stamp) && row.model === F.MODEL_ID ? row : null;
  }
  /** Stores the result for a picture: faces in source pixels (with embeddings when rec is 1), and the picture's size. */
  async function put(scope, id, stamp, { w, h, faces, rec = 0 }) {
    const row = { key: keyOf(scope, id), v: ROW_V, scope, id: String(id), stamp: String(stamp), model: F.MODEL_ID, w, h, faces, rec: rec ? 1 : 0, time: Date.now() };
    mem.set(row.key, row);
    try { await req('readwrite', (s) => s.put(row)); } catch (e) { /* kept in memory for this page */ }
    return row;
  }
  /** Every stored row of one scope, as a Map from the picture id to its row (any stamp). */
  async function all(scope) {
    const out = new Map();
    const range = { lower: scope + ':', upper: scope + ';' };
    let rows = [];
    try {
      const db = await open();
      rows = await new Promise((res, rej) => {
        const t = db.transaction(STORE, 'readonly');
        const list = [];
        const c = t.objectStore(STORE).openCursor(g.IDBKeyRange ? g.IDBKeyRange.bound(range.lower, range.upper, false, true) : null);
        c.onsuccess = () => { const cur = c.result; if (cur) { list.push(cur.value); cur.continue(); } else res(list); };
        t.onerror = t.onabort = () => rej(t.error);
      });
    } catch (e) { rows = [...mem.values()].filter((r) => r.scope === scope); }
    for (const r of rows) if (r && r.scope === scope && r.v === ROW_V) out.set(r.id, r);
    return out;
  }
  /** Removes the result of one picture. */
  async function remove(scope, id) {
    const key = keyOf(scope, id);
    mem.delete(key);
    try { await req('readwrite', (s) => s.delete(key)); } catch (e) { /* nothing stored */ }
  }
  /** Removes every result (all scopes). */
  async function clear() {
    mem.clear();
    try { await req('readwrite', (s) => s.clear()); } catch (e) { /* nothing stored */ }
    try { await req('readwrite', (s) => s.clear(), PEOPLE); } catch (e) { /* nothing stored */ }
    memPeople.clear();
  }

  /** The people of one scope ('gallery' or 'drive'): groups and face assignments. The record is replaced whole. */
  const people = {
    async get(scope) {
      let rec = null;
      try { rec = (await req('readonly', (s) => s.get(scope), PEOPLE)) || null; } catch (e) { rec = memPeople.get(scope) || null; }
      return rec;
    },
    async put(scope, rec) {
      const row = Object.assign({}, rec, { key: scope, scope, v: 1, time: Date.now() });
      memPeople.set(scope, row);
      try { await req('readwrite', (s) => s.put(row), PEOPLE); } catch (e) { /* kept in memory for this page */ }
      return row;
    },
  };

  F.cache = { get, put, all, remove, clear, keyOf, people, VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
