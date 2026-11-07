/* Slop Hub: how Slopographic apps talk to each other.
 *  - Slop Drive: a shared IndexedDB store (same origin, this device only) of files and nested folders
 *    that every app can put files into and open files from. The Drive app (drive/) manages it.
 *  - Bus: live messages between open apps/tabs over BroadcastChannel('slopographic').
 *  - Send to…: put a file in the Drive and open another app on it (?drive=<id>).
 * Classic script, needs shared/apps.js (and shared/slopui.js for the dialogs). Exposes window.SlopHub.
 * Records:  file   { id, name, type, size, from, time, modified, opened, folderId, starred, trashedAt, meta, blob }
 *           folder { id, name, parentId, time, modified, starred, trashedAt }   (folderId/parentId null = root)
 * DB 'slop-drive' v2 (window.SLOP_DRIVE_DB overrides the name, for tests). v1 records are migrated on upgrade
 * and normalised on every read, so files written by an old cached hub still show up correctly. */
(function () {
  'use strict';
  if (window.SlopHub) return;
  const ROOT = (() => { const s = document.currentScript && document.currentScript.src; return s ? new URL('../', s).href : new URL('/', location.href).href; })();
  const apps = () => window.SLOP_APPS || [];
  const appById = (id) => apps().find((a) => a.id === id);
  const urlOf = (app, params) => { const u = new URL(app.path, ROOT); if (params) for (const k in params) u.searchParams.set(k, params[k]); return u.href; };

  /* ---------- Slop Drive: storage ---------- */
  const DB_NAME = window.SLOP_DRIVE_DB || 'slop-drive', DB_VER = 2;
  const normFile = (r) => r && Object.assign({ folderId: null, starred: false, trashedAt: null, modified: r.time || 0, opened: 0, meta: {}, from: 'unknown' }, r);
  const normFolder = (f) => f && Object.assign({ parentId: null, starred: false, trashedAt: null, modified: f.time || 0 }, f);
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Storage is unavailable')); return; }
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = (e) => {
        const d = r.result, t = r.transaction;
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }).createIndex('time', 'time');
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
        if (e.oldVersion > 0 && e.oldVersion < 2) {
          t.objectStore('files').openCursor().onsuccess = (ev) => { const c = ev.target.result; if (!c) return; c.update(normFile(c.value)); c.continue(); };
        }
      };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
      r.onblocked = () => console.warn('Slop Drive: close other Slopographic tabs to finish upgrading storage');
    });
    return dbp;
  }
  /** Run fn(store | {files, folders}) in one transaction; resolves with the last request's result. */
  /** A full storage quota shows the storage dialog once (shared/storage/ui.js); the error still goes to the caller. */
  const full = (e) => { try { if (window.SlopStorage && window.SlopStorage.handle) window.SlopStorage.handle(e, { what: 'this file' }); } catch (x) { /* dialog unavailable */ } return e; };
  async function tx(mode, fn, stores = 'files') {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      const s = Array.isArray(stores) ? Object.fromEntries(stores.map((n) => [n, t.objectStore(n)])) : t.objectStore(stores);
      const r = fn(s);
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(full(t.error)); t.onabort = () => rej(full(t.error || new Error('Aborted')));
    });
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const changed = (what, data) => {
    emit('drive:' + what, data); emit('drive:change', { what, ...data });
    try { window.dispatchEvent(new CustomEvent('slop-drive-change', { detail: { what } })); } catch (e) { /* old browser */ }   // this page's own changes (the bus skips them)
  };

  /** Save blob as a Drive file. New files go into the app's own folder (app, or else from, when it is a registered app
   * id; see appFolderId). folderId is only used when given. An existing record (id) keeps its folder. */
  async function put(blob, { name = 'Untitled', from = 'unknown', meta = {}, folderId, id, app } = {}) {
    const now = Date.now();
    const prev = id ? await get(id) : null;
    if (folderId === undefined) folderId = prev ? prev.folderId : await appFolderId(app || from);
    const rec = { id: id || newId(), name, type: blob.type || 'application/octet-stream', size: blob.size, from, time: now, modified: now, opened: 0, folderId: folderId || null, starred: false, trashedAt: null, meta, blob };
    await tx('readwrite', (s) => s.put(rec));
    changed('put', { id: rec.id, name, type: rec.type, from, folderId });
    return rec.id;
  }
  const get = async (id) => normFile(await tx('readonly', (s) => s.get(id)));
  /** list({ accept, folderId, trashed }): folderId undefined = every folder; trashed false (default) | true | 'any'. Newest first. */
  async function list({ accept, folderId, trashed = false } = {}) {
    const all = ((await tx('readonly', (s) => s.getAll())) || []).map(normFile);
    return all.filter((r) => (!accept || matches(r.type, accept)) && (folderId === undefined || r.folderId === folderId) &&
      (trashed === 'any' || !!r.trashedAt === !!trashed)).sort((a, b) => b.time - a.time);
  }
  /** Merge a patch into a file record (rename, move, star, trash…). Resolves with the new record. */
  async function update(id, patch, { touch = true } = {}) {
    let out = null;
    await tx('readwrite', (s) => { const g = s.get(id); g.onsuccess = () => { if (!g.result) return; out = Object.assign(normFile(g.result), patch); if (touch) out.modified = Date.now(); if (patch.blob) { out.size = patch.blob.size; out.type = patch.type || patch.blob.type || out.type; } s.put(out); }; return g; });
    if (out) changed('update', { id, patch: Object.keys(patch) });
    return out;
  }
  async function remove(id) { await tx('readwrite', (s) => s.delete(id)); changed('remove', { id }); }
  async function clear() { await tx('readwrite', (s) => { s.files.clear(); return s.folders.clear(); }, ['files', 'folders']); changed('clear', {}); }
  const touch = (id) => update(id, { opened: Date.now() }, { touch: false }).catch(() => null);

  /* ---------- Slop Drive: folders ---------- */
  async function createFolder(name = 'New folder', parentId = null, { id, app } = {}) {
    const now = Date.now(), f = { id: id || newId(), name, parentId, time: now, modified: now, starred: false, trashedAt: null };
    if (app) f.app = app;
    await tx('readwrite', (s) => s.put(f), 'folders');
    changed('folder', { id: f.id, parentId });
    return f.id;
  }
  const getFolder = async (id) => normFolder(await tx('readonly', (s) => s.get(id), 'folders'));
  async function listFolders({ parentId, trashed = 'any' } = {}) {
    const all = ((await tx('readonly', (s) => s.getAll(), 'folders')) || []).map(normFolder);
    return all.filter((f) => (parentId === undefined || f.parentId === parentId) && (trashed === 'any' || !!f.trashedAt === !!trashed))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
  async function updateFolder(id, patch) {
    let out = null;
    await tx('readwrite', (s) => { const g = s.get(id); g.onsuccess = () => { if (!g.result) return; out = Object.assign(normFolder(g.result), patch, { modified: Date.now() }); s.put(out); }; return g; }, 'folders');
    if (out) changed('folder', { id });
    return out;
  }
  async function removeFolder(id) { await tx('readwrite', (s) => s.delete(id), 'folders'); changed('folder', { id, removed: true }); }
  /* ---------- Slop Drive: app folders ----------
   * Each registered app keeps the files it makes in one root folder named after it (SLOP_APPS name), made on first
   * use and tagged app: <id> so Drive lists it as that app's folder. A person can rename or move it; the tag stays. */
  const making = new Map();
  /** The id of an app's folder, created on first use. Resolves with null for an unknown app id. */
  function appFolderId(appId) {
    const app = appId && appById(appId);
    if (!app) return Promise.resolve(null);
    if (!making.has(appId)) making.set(appId, (async () => {
      try {
        const mine = (await listFolders()).find((f) => f.app === appId && !f.trashedAt);
        if (mine) return mine.id;
        const taken = new Set((await listFolders({ parentId: null })).map((f) => f.name));
        let name = app.name;
        for (let n = 2; taken.has(name); n++) name = `${app.name} (${n})`;
        return await createFolder(name, null, { app: appId });
      } finally { making.delete(appId); }
    })());
    return making.get(appId);
  }
  /** A named subfolder inside an app's folder (made on first use), e.g. "Templates" in Slop Docs. Null for an unknown app. */
  async function appSubfolderId(appId, name) {
    const parent = await appFolderId(appId);
    if (!parent) return null;
    const found = (await listFolders({ parentId: parent })).find((f) => f.name === name && !f.trashedAt);
    return found ? found.id : createFolder(name, parent);
  }
  /** Folders from the root down to id (excluding the root itself). */
  async function folderPath(id) {
    const all = new Map((await listFolders()).map((f) => [f.id, f])), out = [];
    for (let f = all.get(id), n = 0; f && n < 64; f = all.get(f.parentId), n++) out.unshift(f);
    return out;
  }
  /** Is this file or folder hidden because it, or a folder above it, is in the Trash? */
  function inTrash(item, folders) {
    if (item.trashedAt) return true;
    for (let p = folders.get(item.folderId !== undefined ? item.folderId : item.parentId), n = 0; p && n < 64; p = folders.get(p.parentId), n++) if (p.trashedAt) return true;
    return false;
  }
  function matches(type, accept) {
    const list = [].concat(accept);
    return list.some((p) => p === '*' || p === type || (p.endsWith('/*') && type.startsWith(p.slice(0, -1))));
  }

  /* ---------- Bus ---------- */
  const handlers = new Map();
  const self = { id: newId(), app: null };
  let bc = null;
  try { bc = new BroadcastChannel('slopographic'); bc.onmessage = (e) => dispatch(e.data); } catch (e) { /* old browser: same-tab only */ }
  function dispatch(msg) { if (!msg || msg.src === self.id) return; for (const fn of handlers.get(msg.type) || []) try { fn(msg.data, msg); } catch (e) { console.warn(e); } for (const fn of handlers.get('*') || []) fn(msg.data, msg); }
  function on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); }
  function emit(type, data) { const msg = { type, data, src: self.id, app: self.app, time: Date.now() }; if (bc) bc.postMessage(msg); return msg; }
  /** Announce this app; others can see who is open. */
  const peers = new Map();
  function register(appId) {
    self.app = appId;
    emit('hello', { app: appId });
    on('hello', (d, m) => { peers.set(m.src, { app: d.app, time: m.time }); emit('here', { app: appId }); });
    on('here', (d, m) => peers.set(m.src, { app: d.app, time: m.time }));
    on('bye', (d, m) => peers.delete(m.src));
    addEventListener('pagehide', () => emit('bye', { app: appId }));
  }
  const openApps = () => [...new Set([...peers.values()].map((p) => p.app))];

  /* ---------- Send to / open from ---------- */
  function appsAccepting(type) { return apps().filter((a) => a.kind === 'app' && a.id !== self.app && (a.accepts || []).some((p) => matches(type, p))); }
  /** Put blob in the Drive (root unless folderId) and open appId on it. Pass { id } to open an existing Drive file instead. */
  async function sendTo(appId, blob, name, { newTab = true, from = self.app, folderId, id } = {}) {
    const app = appById(appId); if (!app) throw new Error('Unknown app ' + appId);
    const fid = id || await put(blob, { name, from, folderId });
    const url = urlOf(app, { drive: fid });
    // SlopHub.sameTab: the AI assistant moving a task to the next app opens it in this tab (shared/ai/handoff.js)
    if (newTab && !(window.SlopHub && window.SlopHub.sameTab)) { const w = window.open(url, '_blank'); if (!w) location.href = url; } else location.href = url;
    return fid;
  }
  /** The "Open in…" items for an output: made by the one outbound builder, SlopOuttake (shared/intake/outtake.js, loaded
   * after this file). openIn(o) is SlopOuttake.items(o); sendMenuItems(getBlob, name, type, { folder }) is the older call
   * ("Send to PhotoSlop", …, and "Save to Slop Drive…" with folder). */
  const openIn = (o) => (window.SlopOuttake ? window.SlopOuttake.items(o) : []);
  const sendMenuItems = (getBlob, name, type, opts = {}) => openIn({ get: getBlob, name, type, verb: 'ui.outtake.send_to', folder: !!opts.folder });
  /** If this page was opened with ?drive=<id>, return that Drive record (once) and tidy the URL. */
  async function consumeLaunch() {
    const u = new URL(location.href), id = u.searchParams.get('drive');
    if (!id) return null;
    u.searchParams.delete('drive'); history.replaceState(null, '', u.pathname + u.search + u.hash);
    try { const r = await get(id); if (r) touch(id); return r; } catch (e) { return null; }
  }
  /** A word from the shared tables (shared/i18n: ui/<code>.js and ui/<code>/shell.js), the key without SlopI18n. */
  const word = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  /** A file size for people, in the chosen language: "512 B", "3.4 KB", "48 KB", "2.5 MB", "1.20 GB" in English, "3,4 kB" in
   *  Swedish; "—" when unknown. The number is SlopI18n.num with that many decimals. The one copy for every app. */
  function fmtSize(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    const [v, d, key] = n < 1024 ? [n, 0, 'ui.size.b'] : n < 1048576 ? [n / 1024, n < 10240 ? 1 : 0, 'ui.size.kb']
      : n < 1073741824 ? [n / 1048576, 1, 'ui.size.mb'] : [n / 1073741824, 2, 'ui.size.gb'];
    const r = Number(v.toFixed(d));   // rounded as before (toFixed), then written in the language
    const num = window.SlopI18n ? window.SlopI18n.num(r, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }) : r.toFixed(d);
    return word(key, { size: num });
  }

  /* ---------- Pickers (shared/drive/picker.js, loaded on first use) ---------- */
  const loaded = new Map();
  function loadScript(rel) {
    if (window.SlopLoad) return SlopLoad.script(new URL(rel, ROOT).href); // the shared loader (shared/load) where the page has it
    if (!loaded.has(rel)) loaded.set(rel, new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL(rel, ROOT).href; s.onload = res; s.onerror = () => { loaded.delete(rel); rej(new Error('Could not load ' + rel)); }; document.head.append(s); }));
    return loaded.get(rel);
  }
  const picker = () => loadScript('shared/drive/picker.js').then(() => window.SlopDrivePicker);
  /** A Slop Drive file picker with folder navigation. Resolves with a record or null. */
  const pickFromDrive = (opts = {}) => picker().then((p) => p.pickFile(opts)).catch((e) => { console.warn(e); if (window.SlopUI) SlopUI.toast(word('ui.no_drive')); return null; });
  /** Choose a Drive folder. Resolves with a folder id, null for the root, or undefined if cancelled. */
  const pickFolder = (opts = {}) => picker().then((p) => p.pickFolder(opts));
  /** Ask for a folder, then put blob there. The picker opens in the app's folder (see appFolderId), so a plain
   * "Save here" keeps the file in its app's folder. Resolves with the new file id, or null if cancelled. */
  async function saveToDrive(blob, name, { from = self.app || 'unknown', app, title } = {}) {
    const start = await appFolderId(app || from);
    const folderId = await pickFolder({ title: title || word('ui.tabs.save_title', { name }), start });
    if (folderId === undefined) return null;
    const id = await put(blob, { name, from, folderId });
    if (window.SlopUI) SlopUI.toast(word('ui.hub.saved_drive'));
    return id;
  }

  window.SlopHub = { apps, appById, urlOf, put, get, list, update, remove, clear, touch, createFolder, getFolder, listFolders, updateFolder, removeFolder, folderPath, inTrash, appFolderId, appSubfolderId,
    on, emit, register, openApps, appsAccepting, sendTo, openIn, sendMenuItems, consumeLaunch, pickFromDrive, pickFolder, saveToDrive, matches, fmtSize, loadScript, self,
    driveTx: tx, normFile, normFolder, ROOT, DB_NAME };
  // In the iPhone/iPad app, Slop Drive also keeps its files in the app's folder (the Files app): shared/native/files-sync.js
  const nativeFiles = window.SlopNative && window.SlopNative.files ? window.SlopNative.files() : null;
  if (nativeFiles) window.SlopHub.nativeSync = loadScript('shared/native/files-plan.js').then(() => loadScript('shared/native/files-sync.js'))
    .then(() => window.SlopNativeSync || null).catch((e) => { console.warn('Slop Drive: the app folder sync did not load', e); return null; });
})();
