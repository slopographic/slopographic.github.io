/* SlopSession: each app's working state in this browser, so leaving an app (back link, Slop Drive link, another app)
 * and coming back restores the same view. Classic script; exposes window.SlopSession.
 *
 * This holds UI state and unsaved drafts only. Files that came from Slop Drive still save back to their Drive record
 * through each app's own code. Keys are per app: save('photoslop', 'ui', {...}) never reaches another app.
 *   SlopSession.save(appId, key, value)          -> Promise<boolean>  store a value (undefined removes it)
 *   SlopSession.load(appId, key, fallback)       -> Promise<any>      the newest stored value, else fallback
 *   SlopSession.remove(appId, key)               -> Promise<boolean>
 *   SlopSession.restore(appId, { key: fallback }, apply)
 *                                                -> Promise<values>   boot hook: loads every key, then apply(values) once
 *   SlopSession.autosave(appId, key, getValue, { delay })
 *                                                -> { touch(), flush(), cancel() }: debounced save of getValue()
 *                                                   Only a touched autosave is written on pagehide or when hidden,
 *                                                   so an app that has not restored yet never overwrites its state.
 * Storage: IndexedDB 'slop-session' (store 'kv'). Small values are also mirrored to localStorage at write time, so they
 * survive a page that is left before the IndexedDB write commits; when IndexedDB is missing, blocked or slow, the
 * mirror is the store. Every read and write is wrapped in try/catch: a blocked store just means the state lasts this visit. */
(function () {
  'use strict';
  if (window.SlopSession) return;

  const DB = 'slop-session', STORE = 'kv', LS = 'slop-session.';
  const MIRROR_MAX = 200000; // characters of JSON mirrored to localStorage; larger values live only in IndexedDB
  const READ_MS = 1500;      // a slow IndexedDB read falls back to the mirror instead of stalling boot
  const uid = (app, key) => String(app) + '\u0001' + String(key);

  /* ---------- IndexedDB ---------- */
  let dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) { /* exists */ } };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('open failed'));
      r.onblocked = () => rej(new Error('blocked'));
    });
    dbP.catch(() => {});
    return dbP;
  }
  function idbReq(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error('transaction failed'));
    }));
  }

  /* ---------- localStorage mirror ---------- */
  function lsGet(k) { try { const raw = localStorage.getItem(LS + k); return raw ? JSON.parse(raw) : undefined; } catch (e) { return undefined; } }
  /* JSON only: a Blob, ArrayBuffer or typed array would come back as {} from the mirror, so those stay in IndexedDB. */
  const plainOnly = (k, v) => { if (v && typeof v === 'object' && (v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v))) throw new TypeError('binary'); return v; };
  function lsSet(k, rec) {
    try {
      const raw = JSON.stringify(rec, plainOnly);
      if (raw.length > MIRROR_MAX) { localStorage.removeItem(LS + k); return false; }
      localStorage.setItem(LS + k, raw); return true;
    } catch (e) { try { localStorage.removeItem(LS + k); } catch (err) { /* blocked */ } return false; }
  }
  function lsDel(k) { try { localStorage.removeItem(LS + k); } catch (e) { /* blocked */ } }
  const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

  /* ---------- API ---------- */
  function save(app, key, value) {
    const k = uid(app, key);
    if (value === undefined) return remove(app, key);
    const rec = { v: value, t: Date.now() };
    const mirrored = lsSet(k, rec);
    return idbReq('readwrite', (s) => s.put(rec, k)).then(() => true, () => mirrored);
  }
  function load(app, key, fallback) {
    const k = uid(app, key), mirror = lsGet(k);
    return timeout(idbReq('readonly', (s) => s.get(k)), READ_MS).catch(() => undefined).then((fromIdb) => {
      const cands = [fromIdb, mirror].filter((r) => r && typeof r === 'object' && 'v' in r);
      if (!cands.length) return fallback;
      cands.sort((a, b) => (b.t || 0) - (a.t || 0));
      return cands[0].v;
    });
  }
  function remove(app, key) {
    const k = uid(app, key);
    lsDel(k);
    return idbReq('readwrite', (s) => s.delete(k)).then(() => true, () => false);
  }
  function restore(app, spec, apply) {
    const keys = Object.keys(spec || {});
    return Promise.all(keys.map((k) => load(app, k, spec[k]).catch(() => spec[k]))).then((vals) => {
      const values = {};
      keys.forEach((k, i) => { values[k] = vals[i]; });
      try { if (typeof apply === 'function') apply(values); } catch (e) { console.error('SlopSession restore failed', app, e); }
      return values;
    });
  }

  /* Debounced autosave. getValue() runs at save time, so the stored value is always the latest one. */
  const pending = new Set();
  function autosave(app, key, getValue, { delay = 350 } = {}) {
    let timer = 0, dirty = false;
    const run = () => {
      clearTimeout(timer); timer = 0;
      if (!dirty) return;
      dirty = false;
      let v; try { v = getValue(); } catch (e) { return; }
      save(app, key, v);
    };
    const w = { run, flushNow: () => { if (dirty) run(); } };
    return {
      touch() { dirty = true; pending.add(w); clearTimeout(timer); timer = setTimeout(() => { pending.delete(w); run(); }, delay); },
      flush() { pending.delete(w); w.flushNow(); },
      cancel() { pending.delete(w); clearTimeout(timer); timer = 0; dirty = false; },
    };
  }
  /* Writes every touched autosave now. Runs when the page is hidden or left. */
  function flushAll() { for (const w of [...pending]) { pending.delete(w); try { w.run(); } catch (e) { /* ignore */ } } }
  addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

  window.SlopSession = { save, load, remove, restore, autosave, flushAll };
})();
