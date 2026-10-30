// IndexedDB storage for the business records: one object store per collection (see schema.js).
// Writes are validated, stamped and committed in one transaction. Any failed step aborts the whole
// transaction. Public calls resolve to a Result ({ ok: true, value } or { ok: false, code, message,
// errors? }) and never reject, so the UI never has to catch IndexedDB errors.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail, isResult } = ns.result;
  const DB_NAME = 'slop-data';
  const DB_VERSION = 12; // 2 adds exchangeRates; 3 adds customerGroups and customerTags; 4 adds events, tasks and reminders; 5 adds expenses; 6 quotes; 7 timeEntries; 8 schedules; 9 purchases; 10 creditNotes; 11 bankLines; 12 projects and projectTasks. Every version needs an entry in UPGRADES below.
  const subs = new Set();
  let dbH = null, dbP = null, readyP = null, bc = null;
  const all = () => ns.schema.COLLECTIONS;

  const ERR_CODES = { QuotaExceededError: 'quota', NS_ERROR_DOM_QUOTA_REACHED: 'quota', ConstraintError: 'conflict', InvalidStateError: 'unavailable', NotFoundError: 'unavailable' };
  // A DOMException's numeric code (22 for a full quota) is not a SlopData code: only a string code counts.
  const codeOf = (e) => (e && typeof e.code === 'string' && e.code) || ERR_CODES[e && e.name] || 'idb';
  /** A full quota also shows the storage dialog (shared/storage/ui.js); the Result still goes to the caller. */
  const errOf = (e) => { const r = fail(codeOf(e), (e && e.message) || String(e)); if (r.code === 'quota') try { g.SlopStorage && g.SlopStorage.handle(e, { what: say('ui.data.this_change') }); } catch (x) { /* no dialog here */ } return r; };
  const req = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); rej(r.error || new Error('request failed')); };
  });

  function newId() {
    const c = g.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function rangeOf(o) {
    const { value, lower, upper } = o;
    if (value !== undefined) return value;
    if (lower !== undefined && upper !== undefined) return IDBKeyRange.bound(lower, upper);
    if (lower !== undefined) return IDBKeyRange.lowerBound(lower);
    if (upper !== undefined) return IDBKeyRange.upperBound(upper);
    return undefined;
  }

  /** Adds every collection that is missing. Never deletes or rewrites records, so a v1 database keeps all of its data. */
  function createStores(db) {
    for (const name of all()) {
      if (db.objectStoreNames.contains(name)) continue;
      const d = ns.schema.def(name);
      const st = db.createObjectStore(name, { keyPath: d.key });
      for (const ix of d.indexes || []) st.createIndex(ix.name, ix.key, { unique: !!ix.unique, multiEntry: !!ix.multi });
    }
  }
  /** Upgrade steps keyed by the version they reach. v1 -> v2 adds exchangeRates, v2 -> v3 the CRM label stores, v3 -> v4 the calendar,
   *  to-do and reminder stores, v4 -> v5 the expenses store, v5 -> v6 the quotes store, v6 -> v7 timeEntries, v7 -> v8 schedules, v8 -> v9 purchases, v9 -> v10 creditNotes, v10 -> v11 bankLines, v11 -> v12 projects and projectTasks. Records are migrated in seedDefaults. */
  const UPGRADES = { 1: createStores, 2: createStores, 3: createStores, 4: createStores, 5: createStores, 6: createStores, 7: createStores, 8: createStores, 9: createStores, 10: createStores, 11: createStores, 12: createStores };

  function openDb() {
    if (dbH) return Promise.resolve(dbH);
    if (!dbP) {
      dbP = new Promise((resolve, reject) => {
        if (!g.indexedDB) { const e = new Error('IndexedDB is not available in this browser'); e.code = 'unavailable'; return reject(e); }
        let rq;
        try { rq = g.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
        rq.onupgradeneeded = (e) => { for (let v = (e.oldVersion || 0) + 1; v <= DB_VERSION; v++) UPGRADES[v](rq.result); };
        rq.onsuccess = () => {
          dbH = rq.result;
          dbH.onversionchange = () => { dbH.close(); dbH = null; dbP = null; readyP = null; };
          resolve(dbH);
        };
        rq.onerror = () => reject(rq.error);
        rq.onblocked = () => { const e = new Error(say('ui.data.err.blocked')); e.code = 'blocked'; reject(e); };
      }).catch((e) => { dbP = null; throw e; });
    }
    return dbP;
  }

  /** Operations available inside a transaction. Each returns a Result; a failed one aborts the transaction. */
  function makeApi(tx, st) {
    const store = (n) => tx.objectStore(n);
    const bad = (r) => { if (!st.poison) st.poison = r; return r; };
    const step = async (fn) => {
      if (st.poison) return st.poison;
      try { const r = await fn(); return isResult(r) && !r.ok ? bad(r) : r; } catch (e) { return bad(errOf(e)); }
    };
    const api = {
      fail: bad,
      note: (collection, id, kind) => st.changes.push({ collection, id, kind }),
      get: (name, key) => step(async () => ok((await req(store(name).get(key))) ?? null)),
      list: (name, o = {}) => step(async () => {
        const s = store(name);
        let rows;
        if (o.index) { const q = rangeOf(o); rows = await req(q === undefined ? s.index(o.index).getAll() : s.index(o.index).getAll(q)); } else rows = await req(s.getAll());
        if (ns.schema.def(name).softDelete && !o.includeDeleted) rows = rows.filter((r) => !r.deletedAt);
        if (o.filter) rows = rows.filter(o.filter);
        return ok(o.limit ? rows.slice(0, o.limit) : rows);
      }),
      put: (name, rec, opts) => step(() => putIn(api, name, rec, opts)),
      remove: (name, key, opts) => step(() => removeIn(api, name, key, opts)),
      allocate: (seq) => step(() => ns.numbering.allocate(api, seq)),
      rawPut: (name, rec) => step(async () => { await req(store(name).put(rec)); return ok(rec); }),
      rawDelete: (name, key) => step(async () => { await req(store(name).delete(key)); return ok(true); }),
      clear: (name) => step(async () => { await req(store(name).clear()); return ok(true); }),
    };
    return api;
  }

  /** Validates, numbers, stamps and writes one record. Used inside a transaction only. */
  async function putIn(api, name, input, opts = {}) {
    const d = ns.schema.def(name);
    if (!d) return fail('unknown_collection', say('ui.data.err.collection', { name }));
    if (!input || typeof input !== 'object') return fail('invalid', say('ui.data.err.record_object'));
    let key = input[d.key];
    if (key === undefined || key === null || key === '') key = d.singleton || (d.key === 'id' ? newId() : undefined);
    if (key === undefined) return fail('invalid', say('ui.data.err.needs_key', { name, key: d.key }));
    const cur = await api.get(name, key);
    if (!cur.ok) return cur;
    const prev = cur.value;
    if (prev && d.immutable) return fail('immutable', say('ui.data.err.immutable', { name }));
    if (prev && prev.deletedAt) return fail('deleted', say('ui.data.err.deleted', { name, id: String(key) }));
    if (d.postingOnly && !opts.posting) return fail('posting_required', say('ui.data.err.posting_only', { name }));
    const defaults = await ns.fx.docDefaults(api, d, prev, input);
    const first = ns.schema.prepare(name, { ...input, ...defaults, [d.key]: key }, { deferNumber: !!d.autoNumber });
    if (!first.ok) return fail('invalid', ns.schema.errorText(first.errors), { errors: first.errors });
    const value = first.value;
    if (d.autoNumber && !value.number && d.autoNumber.when(value)) {
      const n = await api.allocate(d.autoNumber.seq);
      if (!n.ok) return n;
      value.number = n.value;
      const errs = ns.schema.validate(name, value);
      if (errs.length) return fail('invalid', ns.schema.errorText(errs), { errors: errs });
    }
    const lock = await ns.fx.lockCheck(api, name, prev, value);
    if (!lock.ok) return lock;
    if (prev) {
      const t = ns.schema.checkTransition(name, prev, value);
      if (t) return fail('invalid_transition', t);
    }
    if (name === 'invoices' && !opts.posting && value.status !== (prev ? prev.status : 'draft')) {
      return fail('posting_required', say('ui.data.err.invoice_status'));
    }
    for (const f of d.unique || []) {
      if (value[f] === undefined) continue;
      const rows = await api.list(name, { index: f, value: value[f], includeDeleted: true });
      if (!rows.ok) return rows;
      if (rows.value.some((r) => r[d.key] !== key)) return fail('conflict', say('ui.data.err.used', { field: f, value: String(value[f]) }));
    }
    const now = Date.now();
    const rec = { ...value, [d.key]: key, createdAt: prev ? prev.createdAt : now, updatedAt: now, version: prev ? prev.version + 1 : 1 };
    const w = await api.rawPut(name, rec);
    if (!w.ok) return w;
    api.note(name, key, 'put');
    return ok(rec);
  }

  /** Soft-deletes (customers, invoices) or hard-deletes one record, if the rules allow it. */
  async function removeIn(api, name, key) {
    const d = ns.schema.def(name);
    if (!d) return fail('unknown_collection', say('ui.data.err.collection', { name }));
    const cur = await api.get(name, key);
    if (!cur.ok) return cur;
    const prev = cur.value;
    if (!prev || prev.deletedAt) return fail('not_found', say('ui.data.err.no_record', { name, id: String(key) }));
    const why = ns.schema.removable(name, prev);
    if (why) return fail(d.immutable ? 'immutable' : 'forbidden', why);
    for (const ref of d.refs || []) {
      const rows = await api.list(ref.collection, { index: ref.index, value: key, includeDeleted: true });
      if (!rows.ok) return rows;
      if (rows.value.length) return fail('in_use', say('ui.data.err.in_use', { name, id: String(key), by: ref.collection }));
    }
    if (d.softDelete) {
      const now = Date.now();
      const w = await api.rawPut(name, { ...prev, deletedAt: now, updatedAt: now, version: prev.version + 1 });
      if (!w.ok) return w;
    } else {
      const w = await api.rawDelete(name, key);
      if (!w.ok) return w;
    }
    api.note(name, key, 'remove');
    return ok({ id: key, soft: !!d.softDelete });
  }

  /** Runs body(api) in one transaction over every store. Commits only if body and every step succeeded. */
  async function runTx(names, mode, body) {
    let db;
    try { db = await openDb(); } catch (e) { return errOf(e); }
    return new Promise((resolve) => {
      let tx;
      try { tx = db.transaction(names, mode); } catch (e) { resolve(errOf(e)); return; }
      const st = { poison: null, changes: [] };
      const api = makeApi(tx, st);
      let out;
      tx.oncomplete = () => {
        if (st.changes.length) {
          emit(st.changes, 'local');
          try { if (bc) bc.postMessage({ changes: st.changes }); } catch (e) { /* other tabs are optional */ }
        }
        resolve(isResult(out) ? out : ok(out));
      };
      tx.onabort = () => resolve(st.poison || (isResult(out) && !out.ok ? out : errOf(tx.error || { name: 'AbortError', message: say('ui.data.err.aborted') })));
      (async () => {
        try { out = await body(api); } catch (e) { st.poison = st.poison || errOf(e); }
        if (!st.poison && isResult(out) && !out.ok) st.poison = out;
        if (st.poison) { try { tx.abort(); } catch (e) { /* already finished */ } }
      })();
    });
  }

  function emit(changes, source) {
    for (const fn of [...subs]) {
      try { fn({ changes, source }); } catch (e) { /* a listener must not break storage */ }
    }
  }

  function subscribeChannel() {
    if (bc || !g.BroadcastChannel) return;
    try {
      bc = new BroadcastChannel(DB_NAME);
      bc.onmessage = (e) => emit((e.data && e.data.changes) || [], 'remote');
    } catch (e) { bc = null; }
  }

  /** Seeds the default chart, settings and numbering sequences where they are missing. */
  async function seedDefaults() {
    return runTx(all(), 'readwrite', async (api) => {
      const old = await api.get('settings', 'main'); // version 1 called the field 'currency'; move it once
      if (!old.ok) return old;
      if (old.value && 'currency' in old.value) {
        const { currency, ...rest } = old.value;
        const w = await api.rawPut('settings', { ...rest, defaultCurrency: rest.defaultCurrency || currency });
        if (!w.ok) return w;
      }
      const plan = [
        ...ns.schema.DEFAULT_CHART.map((a) => ['accounts', a.code, a]),
        ['settings', 'main', { ...ns.schema.DEFAULT_SETTINGS, ...(ns.locale ? ns.locale.browserDefaults() : {}) }],
        ...ns.schema.DEFAULT_SEQUENCES.map((s) => ['numbering', s.id, s]),
      ];
      for (const [name, key, rec] of plan) {
        const cur = await api.get(name, key);
        if (!cur.ok) return cur;
        if (!cur.value) { const w = await api.put(name, rec); if (!w.ok) return w; }
      }
      return ok(true);
    });
  }

  function ready() {
    if (!readyP) {
      readyP = openDb()
        .then(() => { subscribeChannel(); return seedDefaults(); })
        .then((r) => { if (!r.ok) throw r; return true; })
        .catch((e) => { readyP = null; throw e; });
    }
    return readyP.then(() => ok(true), (e) => (isResult(e) ? e : errOf(e)));
  }

  const read = (names, body) => ready().then((r) => (r.ok ? runTx(names, 'readonly', body) : r));
  const write = (body) => ready().then((r) => (r.ok ? runTx(all(), 'readwrite', body) : r));

  async function get(name, key, opts = {}) {
    const r = await read([name], (api) => api.get(name, key));
    if (!r.ok || !r.value) return r;
    return ok(r.value.deletedAt && !opts.includeDeleted ? null : r.value);
  }

  const list = (name, opts = {}) => read([name], (api) => api.list(name, opts));
  const put = (name, rec, opts) => write((api) => api.put(name, rec, opts));
  const remove = (name, key, opts) => write((api) => api.remove(name, key, opts));
  /** Runs fn(api) in one atomic read-write transaction. Return an ok Result or a plain value; a failed step aborts all. */
  const transact = (fn) => write((api) => fn(api));
  /** Runs fn(api) in one read-only transaction over every store. */
  const readAll = (fn) => read(all(), (api) => fn(api));
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  /** Deletes the whole database. Destructive: for tests and an explicit "erase everything" action. */
  async function erase() {
    if (dbH) dbH.close();
    dbH = null; dbP = null; readyP = null;
    if (!g.indexedDB) return fail('unavailable', say('ui.data.err.no_idb'));
    return new Promise((resolve) => {
      const rq = g.indexedDB.deleteDatabase(DB_NAME);
      rq.onsuccess = () => resolve(ok(true));
      rq.onerror = () => resolve(errOf(rq.error));
    });
  }

  /** Replaces every collection with the given records, in one transaction. Only export.js calls this, after validation. */
  function restore(collections) {
    return write(async (api) => {
      for (const name of all()) {
        const c = await api.clear(name);
        if (!c.ok) return c;
        for (const rec of collections[name] || []) {
          const w = await api.rawPut(name, rec);
          if (!w.ok) return w;
        }
        api.note(name, null, 'restore');
      }
      return ok(true);
    });
  }

  ns.store = { DB_NAME, DB_VERSION, ready, seed: () => seedDefaults(), get, list, put, remove, transact, subscribe, newId, erase, restore, readAll };
})(typeof window !== 'undefined' ? window : globalThis);
