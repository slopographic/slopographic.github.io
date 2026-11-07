/* SlopDocTabs.session: keeps an app's open tabs across reloads. Classic script, no network.
 *   const s = SlopDocTabs.session(appId, api, { notice(msg) })   // api from SlopDocTabs.mount
 *   await s.restore()   // opens the stored tabs, active one last; with nothing stored, opens one blank tab. -> count restored
 *   await s.flush()     // writes now (also runs on a short delay after each change, and on pagehide)
 *   await s.clear()     // forgets the stored tabs (localStorage and IndexedDB)
 * localStorage 'slop.doctabs.<appId>.v1' = { v: 1, data: { tabs: [{ id, title }], active } } and nothing else.
 * IndexedDB 'slop-doctabs', store 'docs': key = tab id, value = adapter.serialize(doc); key '<tab id>:drive' = { id } for
 * a tab linked to a Slop Drive file. Every storage access is wrapped: a blocked or broken storage only turns saving off. */
(function () {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const NS = window.SlopDocTabs || (window.SlopDocTabs = {});
  const DB = 'slop-doctabs', STORE = 'docs', SAVE_DELAY = 800;

  /* ----- localStorage (never throws) ----- */
  function lsGet(key) {
    try { const raw = window.localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
  }

  /* ----- IndexedDB (every call resolves; failures read as "nothing stored") ----- */
  let dbP = null;
  function db() {
    if (!dbP) {
      dbP = new Promise((res, rej) => {
        try {
          const r = window.indexedDB.open(DB, 1);
          r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) { /* already there */ } };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.onblocked = () => rej(new Error('blocked'));
        } catch (e) { rej(e); }
      });
      dbP.catch(() => { dbP = null; }); // try again on the next call
    }
    return dbP;
  }
  /** ops: [['put', key, value] | ['delete', key]], one transaction. Resolves true when it committed. */
  function idbBatch(ops) {
    return db().then((conn) => new Promise((res) => {
      try {
        const tx = conn.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
        for (const [op, key, value] of ops) { if (op === 'put') st.put(value, key); else st.delete(key); }
        tx.oncomplete = () => res(true);
        tx.onerror = tx.onabort = () => res(false);
      } catch (e) { res(false); }
    })).catch(() => false);
  }
  function idbGet(key) {
    return db().then((conn) => new Promise((res) => {
      try {
        const q = conn.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => res(undefined);
      } catch (e) { res(undefined); }
    })).catch(() => undefined);
  }
  function idbClear() {
    return db().then((conn) => new Promise((res) => {
      try {
        const tx = conn.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => res(true);
        tx.onerror = tx.onabort = () => res(false);
      } catch (e) { res(false); }
    })).catch(() => false);
  }

  /** session(appId, api, opts): wires the strip to storage. opts.notice(msg) reports a restore problem (default: toast). */
  function session(appId, api, opts = {}) {
    const KEY = 'slop.doctabs.' + appId + '.v1';
    const notice = opts.notice || ((msg) => api.toast(msg));
    const dirty = new Set(); // tab ids whose content must be written at the next flush
    const gone = new Set();  // tab ids closed since the last flush
    let timer = 0, restoring = false;

    function writeIndex() {
      const tabs = api.tabs();
      const act = tabs.find((t) => t.active);
      lsSet(KEY, { v: 1, data: { tabs: tabs.map((t) => ({ id: t.id, title: t.title, name: t.name, orig: t.original })), active: act ? act.id : null } });
    }

    async function flush() {
      clearTimeout(timer); timer = 0;
      if (restoring) return false;
      writeIndex();
      const ops = [];
      for (const id of gone) { ops.push(['delete', id], ['delete', id + ':drive']); }
      gone.clear();
      for (const t of api.tabs()) {
        if (!dirty.has(t.id)) continue;
        dirty.delete(t.id);
        let value;
        try { value = api.adapter.serialize(t.doc); } catch (e) { console.warn('SlopDocTabs: serialize failed', e); continue; }
        ops.push(['put', t.id, value]);
        ops.push(t.driveId ? ['put', t.id + ':drive', { id: t.driveId }] : ['delete', t.id + ':drive']);
      }
      return ops.length ? idbBatch(ops) : true;
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(flush, SAVE_DELAY); }

    api.on((why, t, a, other) => {
      if (restoring) return;
      if (why === 'close') { if (t) { dirty.delete(t.id); gone.add(t.id); } }
      else if (t) {
        dirty.add(t.id);
        if (other) dirty.add(other.id); // leaving a tab saves what it holds
      }
      schedule();
    });
    // Leaving the page: write what is pending now (IndexedDB may still finish after pagehide, so this is best effort).
    window.addEventListener('pagehide', () => { flush(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

    /** Open the stored tabs. A tab whose content is missing (or cannot be restored) opens blank, with a notice. */
    async function restore() {
      const env = lsGet(KEY);
      const list = env && env.v === 1 && env.data && Array.isArray(env.data.tabs) ? env.data.tabs.filter((x) => x && typeof x.id === 'string') : [];
      let count = 0, blanks = 0;
      if (!list.length) { api.newTab(); schedule(); return 0; }
      restoring = true; // the strip's events during the restore are not saved (the stored content is the source)
      try {
        let active = null;
        for (const item of list) {
          const value = await idbGet(item.id);
          const link = await idbGet(item.id + ':drive');
          let doc = null;
          if (value !== undefined) { try { doc = api.adapter.restore(value); } catch (e) { console.warn('SlopDocTabs: restore failed', e); } }
          if (doc) count++; else { blanks++; doc = api.adapter.newDoc(); }
          const t = api.openDoc(doc, { id: item.id, driveId: link && link.id || null, name: item.name || null, origName: item.orig || null, activate: false, append: true });
          if (env.data.active === item.id) active = t;
        }
        const first = api.tabs()[0];
        if (active) api.activate(active.doc); else if (first) api.activate(first.doc);
      } finally {
        restoring = false;
      }
      if (blanks) notice(tr('ui.tabs.blank', blanks === 1 ? 'A tab had no saved content on this device, so it opened blank.' : '{n} tabs had no saved content on this device, so they opened blank.', { n: blanks }));
      schedule();
      return count;
    }

    async function clear() {
      lsDel(KEY);
      await idbClear();
    }

    return { restore, flush, clear };
  }

  NS.session = session;
})();
