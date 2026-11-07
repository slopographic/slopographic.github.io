/* SlopDb: IndexedDB with a declared schema, a query helper and a read-only open. Classic script, sets window.SlopDb.
 *   SlopDb.open(name, { version, stores })  creates or upgrades a database. Only what is missing is added, so existing
 *       stores and records stay. stores: { <store>: { keyPath, autoIncrement?, indexes: [{ name, keyPath, unique?, multiEntry? }] } }
 *       Resolves with a wrapper, or null when storage is blocked or the open fails. Never throws, never rejects.
 *   SlopDb.openExisting(name)  opens a database that already exists, read-only. It never creates one: a missing database
 *       resolves with null. The wrapper has no put or remove.
 *   wrapper: { name, version, has(store), stores(), get(store, key), getAll(store), readAll([stores]) -> { store: rows },
 *              query(store, opts), put(store, value), remove(store, key), close() }
 *   SlopDb.query(db, store, opts)  the wrapper's query. opts: { where, orderBy, desc, offset, limit } (see query.js).
 *       An index on the first where field narrows the read; the rest of the query runs on the rows read.
 *       A store that is missing reads as empty.
 *   SlopDb.join(left, right, opts) and SlopDb.aggregate(rows, opts): pure, see query.js.
 * Load query.js before this file. */
(function (g) {
  'use strict';
  const Q = g.SlopDbQuery;
  const hasStore = (d, s) => d.objectStoreNames.contains(s);

  /** Runs one read or write transaction. body(tx) makes the requests and returns collect(), which reads their results on completion. */
  function txRun(d, names, mode, body) {
    return new Promise((resolve, reject) => {
      let tx, collect;
      try { tx = d.transaction(names, mode); collect = body(tx); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(collect());
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('transaction failed'));
    });
  }

  /** The index list of a store, as query.js reads it. */
  function indexSpecs(os) {
    return Array.from(os.indexNames, (n) => { const ix = os.index(n); return { name: n, keyPath: ix.keyPath, multiEntry: ix.multiEntry }; });
  }

  function toRange(spec) {
    if ('only' in spec) return g.IDBKeyRange.only(spec.only);
    if ('upper' in spec) return g.IDBKeyRange.upperBound(spec.upper, spec.open);
    return g.IDBKeyRange.lowerBound(spec.lower, spec.open);
  }

  /** A multi-entry index can return one record more than once: keep the first of each primary key. */
  function dedupe(rows, keyPath) {
    const seen = new Set();
    return rows.filter((r) => { const k = r[keyPath]; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function query(d, store, o = {}) {
    try { Q.checkWhere(o.where || []); } catch (e) { return Promise.reject(e); }
    if (!hasStore(d, store)) return Promise.resolve([]);
    return txRun(d, store, 'readonly', (tx) => {
      const os = tx.objectStore(store);
      const plan = Q.planIndex(o.where || [], indexSpecs(os));
      let req = null, multi = false;
      if (plan) {
        try { const ix = os.index(plan.index); req = ix.getAll(toRange(plan.range)); multi = ix.multiEntry; } catch (e) { req = null; }
      }
      if (!req) req = os.getAll();
      return () => {
        const rows = multi && typeof os.keyPath === 'string' ? dedupe(req.result, os.keyPath) : req.result;
        return Q.run(rows, o);
      };
    });
  }

  function wrap(d, readOnly) {
    d.onversionchange = () => d.close();
    const w = {
      name: d.name,
      version: d.version,
      has: (s) => hasStore(d, s),
      stores: () => Array.from(d.objectStoreNames),
      get: (store, key) => (!hasStore(d, store) ? Promise.resolve(null) : txRun(d, store, 'readonly', (tx) => {
        const r = tx.objectStore(store).get(key);
        return () => (r.result === undefined ? null : r.result);
      })),
      getAll: (store) => (!hasStore(d, store) ? Promise.resolve([]) : txRun(d, store, 'readonly', (tx) => {
        const r = tx.objectStore(store).getAll();
        return () => r.result;
      })),
      readAll: (stores) => {
        const names = stores.filter((s) => hasStore(d, s));
        const empty = Object.fromEntries(stores.map((s) => [s, []]));
        if (!names.length) return Promise.resolve(empty);
        return txRun(d, names, 'readonly', (tx) => {
          const reqs = names.map((s) => [s, tx.objectStore(s).getAll()]);
          return () => Object.assign(empty, Object.fromEntries(reqs.map(([s, r]) => [s, r.result])));
        });
      },
      query: (store, opts) => query(d, store, opts),
      close: () => d.close(),
    };
    if (!readOnly) {
      w.put = (store, value) => txRun(d, store, 'readwrite', (tx) => { const r = tx.objectStore(store).put(value); return () => r.result; });
      w.remove = (store, key) => txRun(d, store, 'readwrite', (tx) => { tx.objectStore(store).delete(key); return () => true; });
    }
    return w;
  }

  const storeOptions = (def) => {
    const o = {};
    if (def.keyPath !== undefined && def.keyPath !== null) o.keyPath = def.keyPath;
    if (def.autoIncrement) o.autoIncrement = true;
    return o;
  };

  /** Adds every missing store and index. Existing ones are kept as they are. */
  function migrate(d, tx, stores) {
    for (const [name, def] of Object.entries(stores)) {
      const os = hasStore(d, name) ? tx.objectStore(name) : d.createObjectStore(name, storeOptions(def));
      for (const ix of def.indexes || []) {
        if (!os.indexNames.contains(ix.name)) os.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry });
      }
    }
  }

  function open(name, opts = {}) {
    const version = Number.isInteger(opts.version) && opts.version >= 1 ? opts.version : 1;
    const stores = opts.stores || {};
    return new Promise((resolve) => {
      let req, settled = false;
      try {
        if (!g.indexedDB) { resolve(null); return; }
        req = g.indexedDB.open(name, version);
      } catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => {
        try { migrate(req.result, req.transaction, stores); } catch (e) { try { req.transaction.abort(); } catch (x) { /* already stopped */ } }
      };
      req.onsuccess = () => {
        if (settled) { req.result.close(); return; } // blocked earlier: the caller has its null already
        settled = true;
        resolve(wrap(req.result, false));
      };
      req.onerror = () => { if (!settled) { settled = true; resolve(null); } };
      req.onblocked = () => { if (!settled) { settled = true; resolve(null); } };
    });
  }

  function openExisting(name) {
    return new Promise((resolve) => {
      let req;
      try {
        if (!g.indexedDB) { resolve(null); return; }
        req = g.indexedDB.open(name);
      } catch (e) { resolve(null); return; }
      // A missing database would be created by this open: stop the upgrade, and the request then fails.
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* already stopped */ } };
      req.onsuccess = () => resolve(wrap(req.result, true));
      req.onerror = () => resolve(null);
    });
  }

  g.SlopDb = {
    open,
    openExisting,
    query: (db, store, opts) => (db && typeof db.query === 'function'
      ? db.query(store, opts)
      : Promise.reject(new TypeError('SlopDb.query needs a database from SlopDb.open or SlopDb.openExisting'))),
    join: Q.join,
    aggregate: Q.aggregate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
