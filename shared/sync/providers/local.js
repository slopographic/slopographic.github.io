/* Local or network folder provider: reads and writes the backup in a folder the person picks with the File System
 * Access API (window.showDirectoryPicker). Classic script, exposes window.SlopSyncProviders.local.
 * No network: every call is file I/O in the browser. Browsers cannot speak SMB, NFS or WebDAV. A NAS or network
 * drive works only when the operating system has already mounted it as a folder; that folder is then picked here.
 * Chrome and Edge only. Firefox and Safari have no showDirectoryPicker, so pick() says so.
 * The picked folder handle is kept in IndexedDB ('slop-sync-local' / 'handles'). Later calls check permission and
 * ask again when the browser has dropped it; a request needs a button press (user activation).
 * Same shape as the other providers: upload(auth, name, blob, opts), download(auth, name, opts) and
 * list(auth, prefix, opts). auth is ignored (there is no token). opts.folder is a subfolder of the picked folder. */
(function () {
  'use strict';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup2.js
  const DB_NAME = 'slop-sync-local';
  const STORE = 'handles';
  const KEY = 'dir';
  let store = null; // {get(), put(v), del()} as promises; tests inject one with setHandleStore

  const err = (message, code) => Object.assign(new Error(message), { code });
  const supported = () => typeof window.showDirectoryPicker === 'function';

  function idbStore() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(new Error(tr('ui.sync.store_folder'))); };
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
  const hs = () => store || (store = idbStore());

  // Plain names only: one path segment, the same rule as sync.js.
  function safe(name) {
    const s = String(name == null ? '' : name);
    if (!s || s.length > 200 || s === '.' || s === '..' || /[\/\\\u0000-\u001f]/.test(s)) throw err(tr('ui.sync.bad_name'), 'name');
    return s;
  }

  // The picked folder, or a message when none is chosen. No prompt, no network.
  async function root() {
    const h = await hs().get(KEY);
    if (!h) throw err(tr('ui.sync.no_folder'), 'not-connected');
    return h;
  }

  // Checks permission and asks for it when the browser needs it. Refusal is a plain error, never a silent write.
  async function permitted(handle, mode) {
    const opts = { mode };
    if (!handle.queryPermission || (await handle.queryPermission(opts)) === 'granted') return;
    if (handle.requestPermission && (await handle.requestPermission(opts)) === 'granted') return;
    throw err(tr('ui.sync.no_permission'), 'permission');
  }

  // A subfolder of the picked folder; null when it is missing and create is false.
  async function dirFor(base, folder, create) {
    if (!folder) return base;
    try { return await base.getDirectoryHandle(safe(folder), { create }); } catch (e) { if (create) throw e; return null; }
  }

  // Writes through createWritable, which replaces the file only on close: a failed write leaves the old file.
  async function upload(auth, name, blob, opts = {}) {
    const n = safe(name);
    const base = await root();
    await permitted(base, 'readwrite');
    const dir = await dirFor(base, opts.folder, true);
    const fh = await dir.getFileHandle(n, { create: true });
    const w = await fh.createWritable();
    try { await w.write(blob); await w.close(); } catch (e) { try { await w.abort(); } catch (x) { /* already closed */ } throw e; }
    return { id: n, name: n, path: (opts.folder ? opts.folder + '/' : '') + n };
  }

  // Returns a File (a Blob), or null when no file with that name exists.
  async function download(auth, name, opts = {}) {
    const n = safe(name);
    const base = await root();
    await permitted(base, 'read');
    const dir = await dirFor(base, opts.folder, false);
    if (!dir) return null;
    let fh;
    try { fh = await dir.getFileHandle(n); } catch (e) { return null; }
    return fh.getFile();
  }

  // Lists the plain files in the folder whose name starts with prefix. Subfolders are skipped.
  async function list(auth, prefix = '', opts = {}) {
    const base = await root();
    await permitted(base, 'read');
    const dir = await dirFor(base, opts.folder, false);
    if (!dir) return [];
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !name.startsWith(prefix)) continue;
      const f = await h.getFile();
      out.push({ id: name, name, size: f.size || 0, modified: f.lastModified ? new Date(f.lastModified).toISOString() : '' });
    }
    return out;
  }

  // Asks the person to pick a folder (needs a button press). Resolves to {ok, name} or {ok: false, error}.
  async function pick() {
    if (!supported()) return { ok: false, unsupported: true, error: tr('ui.sync.needs_chrome') };
    let h;
    try { h = await window.showDirectoryPicker({ id: 'slop-backup', mode: 'readwrite' }); } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelled: true, error: tr('ui.sync.no_pick') };
      throw e;
    }
    await hs().put(KEY, h);
    return { ok: true, name: h.name };
  }

  // The chosen folder's name, or null. Reads IndexedDB only.
  async function chosen() {
    const h = await hs().get(KEY).catch(() => null);
    return h ? { name: h.name } : null;
  }

  async function forget() { await hs().del(KEY); }

  // 'none' (no folder chosen), or the browser's answer for read and write: 'granted', 'prompt' or 'denied'.
  // Never asks the person, so it is safe to call on every render.
  async function permission() {
    const h = await hs().get(KEY).catch(() => null);
    if (!h) return 'none';
    if (!h.queryPermission) return 'granted';
    return h.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
  }

  // Asks the browser for read and write access to the chosen folder. Needs a button press (user activation).
  async function allow() {
    const h = await hs().get(KEY).catch(() => null);
    if (!h) return 'none';
    if (!h.requestPermission) return 'granted';
    return h.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  }

  window.SlopSyncProviders = window.SlopSyncProviders || {};
  window.SlopSyncProviders.local = {
    get label() { return tr('ui.sync.local_label'); }, upload, download, list, pick, chosen, forget, supported, permission, allow,
    setHandleStore(s) { store = s; }
  };
})();
