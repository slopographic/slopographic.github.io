/* SlopAIKit cloud keys: the person's own API keys, kept only in this browser. Classic script; adds SlopAIKit.cloud.keys.
 *   get(provider) → Promise<string|''>       set(provider, key, { remember }) → Promise
 *   forget(provider) → Promise              remembered(provider) → Promise<bool>
 *   settings() → { active, providers: { <id>: { model, base, remember } }, cap, steps }   save(settings)
 * Where a key lives:
 *   "Remember on this device" on  → IndexedDB 'slop-ai-keys' (store 'keys'), this browser only. Left out of the site's
 *                                    backup and export (shared/backup/core.js, central.js), never synced.
 *   off (the default)             → this tab only (memory and sessionStorage): gone when the tab closes.
 * A key is sent only to its provider's API (shared/ai/cloud/<format>.js puts it in that request's header). The
 * settings (which provider, model, address, cap) are in localStorage 'slop-ai.cloud' and hold no key: save() refuses
 * anything that looks like one. Forget key removes it from all three places. A saved choice the site no longer offers
 * (shared/ai/makers.js, the brand profile's "ai") reads as not chosen: settings() leaves out a hidden provider (active,
 * its entry, lastByApp) and a hidden model (the provider's suggested one is used instead). */
(function () {
  'use strict';
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const DB = 'slop-ai-keys', STORE = 'keys', SETTINGS = 'slop-ai.cloud', SESSION = 'slop-ai.cloud.key:';
  const mem = new Map();
  let dbP = null;

  function db() {
    if (!dbP) dbP = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error(T('ui.ai.cloud.no_store')));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'provider' }); };
      const t = setTimeout(() => rej(new Error(T('ui.ai.cloud.store_busy'))), 5000);   // never hang the panel
      r.onsuccess = () => { clearTimeout(t); const d = r.result; d.onversionchange = () => { d.close(); dbP = null; }; res(d); };
      r.onerror = () => { clearTimeout(t); rej(r.error); };
    }).catch((e) => { dbP = null; throw e; });
    return dbP;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const ss = {
    get: (p) => { try { return sessionStorage.getItem(SESSION + p) || ''; } catch (e) { return ''; } },
    set: (p, k) => { try { sessionStorage.setItem(SESSION + p, k); } catch (e) { /* storage blocked: memory only */ } },
    del: (p) => { try { sessionStorage.removeItem(SESSION + p); } catch (e) { /* storage blocked */ } },
  };

  async function get(p) {
    if (mem.has(p)) return mem.get(p);
    const s = ss.get(p);
    if (s) { mem.set(p, s); return s; }
    try { const row = await tx('readonly', (st) => st.get(p)); if (row && row.key) { mem.set(p, row.key); return row.key; } } catch (e) { /* no IndexedDB */ }
    return '';
  }
  async function remembered(p) {
    try { return !!(await tx('readonly', (st) => st.get(p))); } catch (e) { return false; }
  }
  async function set(p, key, { remember = false } = {}) {
    key = String(key || '').trim();
    if (!key) return forget(p);
    mem.set(p, key);
    if (remember) { await tx('readwrite', (st) => st.put({ provider: p, key, saved: Date.now() })); ss.del(p); } else {
      ss.set(p, key);
      try { await tx('readwrite', (st) => st.delete(p)); } catch (e) { /* nothing stored */ }
    }
  }
  async function forget(p) {
    mem.delete(p); ss.del(p);
    try { await tx('readwrite', (st) => st.delete(p)); } catch (e) { /* nothing stored */ }
  }

  const BLANK = () => ({ active: '', providers: {}, cap: 0, steps: 12 });
  function settings() {
    let s; try { s = Object.assign(BLANK(), JSON.parse(localStorage.getItem(SETTINGS)) || {}); } catch (e) { s = BLANK(); }
    return offered(s);
  }
  function offered(s) {
    const M = K.makers;
    if (!M || !M.active() || !C.byId) return s;
    const ok = (pid, mid, name) => !!C.byId(pid) && (!mid || M.allowed({ id: mid, name }, pid));
    if (s.active && !C.byId(s.active)) s.active = '';
    for (const [pid, ps] of Object.entries(s.providers || {})) {
      if (!C.byId(pid)) { delete s.providers[pid]; continue; }
      if (ps && ps.model && !ok(pid, ps.model, ps.modelName)) { delete ps.model; delete ps.modelName; delete ps.price; }
      if (ps && ps.imageModel && !ok(pid, ps.imageModel)) delete ps.imageModel;
    }
    for (const [app, l] of Object.entries(s.lastByApp || {})) if (!l || !ok(l.provider, l.model)) delete s.lastByApp[app];
    return s;
  }
  /** Settings never carry a key: a value that looks like one is dropped before it is written. */
  function save(s) {
    const clean = JSON.parse(JSON.stringify(s || {}, (k, v) => (typeof v === 'string' && C.redact && C.redact(v) !== v ? undefined : /key|secret|token/i.test(k) ? undefined : v)));
    try { localStorage.setItem(SETTINGS, JSON.stringify(Object.assign(BLANK(), clean))); } catch (e) { /* storage blocked: this visit only */ }
    return clean;
  }

  C.keys = { get, set, forget, remembered, settings, save, DB, SETTINGS };
})();
