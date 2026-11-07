/* SlopCentral IndexedDB: packs a database's stores into JSON and writes them back. Records are structured-clone values,
 * encoded by SlopBackupCodec; binary parts (Blobs, files, buffers) go into one base64 list per section, so the file is
 * plain JSON. The shape check runs before anything is written. A write is one transaction per database, and its undo
 * steps (the old value of each key, or "was absent") are handed to the caller's ctx.undo. Part of central.js.
 * Section data, format of every IndexedDB app: { stores: { <name>: { keyPath, indexes, records: [{ k?, v }] } }, blobs: [base64] } */
(function () {
  'use strict';
  const C = window.SlopCentral;
  const B64_RX = /^[A-Za-z0-9+/]*={0,2}$/;
  const REF_TAGS = ['file', 'blob', 'ab', 'ta', 'img'];
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('request failed')); });
  const enc = (v, blobs) => window.SlopBackupCodec.encode(v, blobs);

  async function toB64(blob) {
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(s) {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /** Live stores ({ name: { keyPath, indexes, records: [{ k?, v }] } }) → section data. */
  async function pack(stores) {
    const blobs = [], out = {};
    for (const [name, st] of Object.entries(stores)) {
      out[name] = {
        keyPath: st.keyPath == null ? null : st.keyPath,
        indexes: (st.indexes || []).map((ix) => ({ name: ix.name, keyPath: ix.keyPath, unique: !!ix.unique, multiEntry: !!ix.multiEntry })),
        records: st.records.map((r) => { const o = {}; if (r.k !== undefined) o.k = enc(r.k, blobs); o.v = enc(r.v, blobs); return o; }),
      };
    }
    return { stores: out, blobs: await Promise.all(blobs.map(toB64)) };
  }

  /** Section data → live stores, decoded. Assumes check() passed. */
  function unpack(data) {
    const bytes = data.blobs.map(fromB64);
    const dec = (j) => window.SlopBackupCodec.decode(j, (ref) => bytes[ref]);
    const out = {};
    for (const [name, st] of Object.entries(data.stores)) {
      out[name] = { keyPath: st.keyPath, indexes: st.indexes || [],
        records: st.records.map((r) => (r.k !== undefined ? { k: dec(r.k), v: dec(r.v) } : { v: dec(r.v) })) };
    }
    return out;
  }

  /** Every binary reference inside an encoded value must point at a blob in the section. */
  function refsOk(j, n) {
    if (j === null || typeof j !== 'object') return true;
    if (Array.isArray(j)) return j.every((x) => refsOk(x, n));
    if (REF_TAGS.includes(j.$) && (!Number.isInteger(j.ref) || j.ref < 0 || j.ref >= n)) return false;
    return Object.values(j).every((x) => refsOk(x, n));
  }

  /** The section's problems, first first. [] when it can be written. */
  function check(data) {
    const errs = [];
    const err = (m) => { if (errs.length < 50) errs.push(m); };
    if (!C.format.isObj(data) || !C.format.isObj(data.stores)) return ['the section must hold stores'];
    if (!Array.isArray(data.blobs) || !data.blobs.every((s) => typeof s === 'string' && s.length % 4 === 0 && B64_RX.test(s))) {
      return ['the binary parts are not valid base64'];
    }
    const n = data.blobs.length;
    for (const [name, st] of Object.entries(data.stores)) {
      const w = `store ${name}`;
      if (!name || name.length > 100) { err(`${w}: bad store name`); continue; }
      if (!C.format.isObj(st)) { err(`${w}: must be an object`); continue; }
      if (st.keyPath !== null && typeof st.keyPath !== 'string') err(`${w}: keyPath must be text or null`);
      if (!Array.isArray(st.indexes) || !st.indexes.every((ix) => C.format.isObj(ix) && typeof ix.name === 'string'
        && (typeof ix.keyPath === 'string' || Array.isArray(ix.keyPath)))) err(`${w}: indexes are not valid`);
      if (!Array.isArray(st.records)) { err(`${w}: records must be a list`); continue; }
      st.records.forEach((r, i) => {
        const where = `${w}, record ${i}`;
        if (!C.format.isObj(r) || !('v' in r)) return err(`${where}: has no value`);
        if (st.keyPath === null && !('k' in r)) return err(`${where}: has no key`);
        if (!refsOk(r.v, n) || ('k' in r && !refsOk(r.k, n))) err(`${where}: points at a binary part that is not in the file`);
      });
    }
    return errs;
  }

  async function dbExists(name) {
    try { if (indexedDB.databases) return (await indexedDB.databases()).some((d) => d.name === name); } catch (e) { /* unsupported */ }
    return true; // cannot tell: opening it is the test
  }
  function openDb(name, version, upgrade) {
    return new Promise((res, rej) => {
      const r = version ? indexedDB.open(name, version) : indexedDB.open(name);
      let timer = 0;
      r.onupgradeneeded = () => { if (upgrade) upgrade(r.result); };
      r.onsuccess = () => { clearTimeout(timer); const d = r.result; d.onversionchange = () => d.close(); res(d); };
      r.onerror = () => { clearTimeout(timer); rej(r.error || new Error(`could not open ${name}`)); };
      r.onblocked = () => { timer = setTimeout(() => rej(new Error(tr('ui.backup.db_blocked', { name }))), 6000); };
    });
  }

  /** Live stores of the named database (all stores, or only the listed ones). A missing database reads as empty. */
  async function readDb(name, want) {
    if (!(await dbExists(name))) return {};
    const d = await openDb(name);
    try {
      const names = [...d.objectStoreNames].filter((n) => !want || want.includes(n)), out = {};
      if (!names.length) return out;
      const t = d.transaction(names, 'readonly');
      for (const n of names) {
        const os = t.objectStore(n);
        const vals = await req(os.getAll());
        const keys = os.keyPath == null ? await req(os.getAllKeys()) : null;
        out[n] = {
          keyPath: os.keyPath == null ? null : os.keyPath,
          indexes: [...os.indexNames].map((ix) => { const i = os.index(ix); return { name: ix, keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry }; }),
          records: vals.map((v, i) => (keys ? { k: keys[i], v } : { v })),
        };
      }
      return out;
    } finally { d.close(); }
  }

  function createStores(db, specs) {
    for (const [n, st] of specs) {
      if (db.objectStoreNames.contains(n)) continue;
      const os = db.createObjectStore(n, st.keyPath == null ? undefined : { keyPath: st.keyPath });
      for (const ix of st.indexes || []) { try { os.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }); } catch (e) { /* a bad index is skipped */ } }
    }
  }
  /** Opens the database for writing, creating it or the missing stores (a version bump) when needed. */
  async function openForWrite(name, stores) {
    const specs = Object.entries(stores);
    if (!(await dbExists(name))) return openDb(name, 1, (db) => createStores(db, specs));
    const d = await openDb(name);
    const missing = specs.filter(([n]) => !d.objectStoreNames.contains(n));
    if (!missing.length) return d;
    const v = d.version + 1;
    d.close();
    return openDb(name, v, (db) => createStores(db, missing));
  }

  /** Puts every record of the section into the named database, in one transaction. Records that exist are overwritten
   * (the file wins); nothing is deleted. The undo step puts back what was there, and removes what was not. */
  async function importDb(name, data, ctx) {
    const stores = unpack(data), names = Object.keys(stores);
    if (!names.length) return 0;
    const d = await openForWrite(name, stores);
    const pre = [];
    try {
      await new Promise((res, rej) => {
        const t = d.transaction(names, 'readwrite');
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error || new Error(tr('ui.backup.write_failed')));
        t.onabort = () => rej(t.error || new Error(tr('ui.backup.write_aborted')));
        (async () => {
          try {
            for (const n of names) {
              const os = t.objectStore(n), st = stores[n];
              if (os.keyPath !== (st.keyPath == null ? null : st.keyPath)) throw new Error(tr('ui.backup.key_differs', { store: n }));
              for (const r of st.records) {
                const key = st.keyPath == null ? r.k : r.v[st.keyPath];
                const old = await req(os.get(key));
                pre.push({ store: n, key, had: old !== undefined, old });
                if (st.keyPath == null) os.put(r.v, key); else os.put(r.v);
              }
            }
          } catch (e) { try { t.abort(); } catch (e2) { /* already finished */ } rej(e); }
        })();
      });
    } finally { d.close(); }
    ctx.undo(() => restorePre(name, pre));
    return pre.length;
  }
  async function restorePre(name, pre) {
    if (!pre.length) return;
    const d = await openDb(name);
    try {
      const names = [...new Set(pre.map((p) => p.store))];
      await new Promise((res, rej) => {
        const t = d.transaction(names, 'readwrite');
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error || new Error(tr('ui.backup.undo_failed')));
        t.onabort = () => rej(t.error || new Error(tr('ui.backup.undo_aborted')));
        for (const p of pre.slice().reverse()) {
          const os = t.objectStore(p.store);
          if (!p.had) os.delete(p.key);
          else if (os.keyPath == null) os.put(p.old, p.key);
          else os.put(p.old);
        }
      });
    } finally { d.close(); }
  }

  C.idb = { pack, unpack, check, readDb, importDb, openDb, dbExists };
})();
