/* Token storage for cloud sync. Classic script, exposes window.SlopSyncTokens.
 *
 * Where: IndexedDB (database 'slop-sync', store 'kv'), not localStorage and not sessionStorage.
 *   - sessionStorage would forget the refresh token when the tab closes, so the person would have to
 *     reconnect every visit.
 *   - localStorage is a plain string store that sits in the profile's storage files with no structure.
 *   - IndexedDB persists per origin, is scoped to this page's origin, and can hold a CryptoKey.
 * How: the token record is encrypted with AES-GCM under a NON-EXTRACTABLE key that is stored in the same
 *   database. This stops a copied profile file from showing the tokens as readable text. It does NOT stop
 *   JavaScript running on this origin from using the key, so the apps must not load third-party scripts. */
(function () {
  'use strict';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup2.js
  const DB_NAME = 'slop-sync';
  const STORE = 'kv';
  const SKEW_MS = 60 * 1000;   // refresh one minute before the access token expires
  let backend = null;          // {get(key), put(key, value), del(key)} as promises
  let keyPromise = null;

  function idbBackend() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(new Error(tr('ui.sync.store_none'))); };
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error || new Error(tr('ui.sync.store_write')));
        t.onabort = () => reject(t.error || new Error(tr('ui.sync.store_abort')));
      });
    };
    return {
      get: (k) => tx('readonly', (s) => s.get(k)),
      put: (k, v) => tx('readwrite', (s) => s.put(v, k)),
      del: (k) => tx('readwrite', (s) => s.delete(k))
    };
  }

  const store = () => backend || (backend = idbBackend());

  // Test hook and alternative stores: any object with get/put/del returning promises.
  function setBackend(b) { backend = b; keyPromise = null; }

  function getKey() {
    if (!keyPromise) {
      keyPromise = (async () => {
        const s = store();
        let k = await s.get('aes-key');
        if (!k) {
          k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          await s.put('aes-key', k);
        }
        return k;
      })();
      keyPromise.catch(() => { keyPromise = null; });
    }
    return keyPromise;
  }

  // rec: { access, refresh, expiresAt } (expiresAt in ms since epoch)
  async function save(id, rec) {
    const k = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(rec));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, plain));
    await store().put('tok:' + id, { v: 1, iv, ct });
  }

  // Returns the decrypted record, or null if none (or if the key was lost and the record is unreadable).
  async function load(id) {
    const s = store();
    const enc = await s.get('tok:' + id);
    if (!enc) return null;
    try {
      const k = await getKey();
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: enc.iv }, k, enc.ct);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      await s.del('tok:' + id);
      return null;
    }
  }

  async function clear(id) { await store().del('tok:' + id); }

  // Refresh decision: no access token, no expiry, or expiry within SKEW_MS of now.
  function needsRefresh(rec, now = Date.now()) {
    if (!rec || !rec.access || !rec.expiresAt) return true;
    return rec.expiresAt - now <= SKEW_MS;
  }

  window.SlopSyncTokens = { save, load, clear, needsRefresh, setBackend, SKEW_MS };
})();
