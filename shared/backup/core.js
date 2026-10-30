/* SlopBackupCore: export everything Slopographic keeps in this browser into ONE portable file, and restore it.
 * The file (slopographic-backup-YYYY-MM-DD.slop) is a ZIP:
 *   manifest.json   format, version, date, origin and counts
 *   local.json      every localStorage key on this origin (settings, saves, high scores, XP…)
 *   idb.json        every IndexedDB database (Slop Drive files and folders, app autosaves): schema + records
 *   blobs/<n>       binary values referenced from idb.json (file contents, image data, buffers)
 * Needs SlopZip (zip.js) and SlopBackupCodec (codec.js). Classic script, exposes window.SlopBackupCore. */
(function () {
  'use strict';
  if (window.SlopBackupCore) return;
  const FORMAT = 'slopographic-backup', VERSION = 1, DRIVE = 'slop-drive';
  const THUMBS = 'slop-drive-thumbs'; // the Drive's thumbnail cache: made again on demand, so it is not backed up
  const SECRET = new Set(['slop-ai-keys']); // the person's own AI provider keys (shared/ai/cloud/keys.js): they never leave this browser
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (t) => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Aborted')); });
  const pad = (n) => String(n).padStart(2, '0');
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js
  // The extension is SlopBackup.EXT (index.js, which loads this file); '.zip' only when this file is used on its own.
  const fileName = (d = new Date()) => `slopographic-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${(window.SlopBackup && window.SlopBackup.EXT) || '.zip'}`;

  async function dbNames() {
    let names = [];
    try { if (indexedDB.databases) names = (await indexedDB.databases()).map((d) => d.name).filter((n) => n && n !== THUMBS && !SECRET.has(n)); } catch (e) { /* unsupported */ }
    if (!names.includes(DRIVE)) names.push(DRIVE); // always try the Drive, even where databases() is missing
    return names;
  }
  function openDb(name, version, upgrade) {
    return new Promise((res, rej) => {
      const r = version ? indexedDB.open(name, version) : indexedDB.open(name);
      let timer = 0;
      r.onupgradeneeded = (e) => { if (upgrade) upgrade(r.result, r.transaction, e.oldVersion); };
      r.onsuccess = () => { clearTimeout(timer); const d = r.result; d.onversionchange = () => d.close(); res(d); };
      r.onerror = () => { clearTimeout(timer); rej(r.error); };
      r.onblocked = () => { timer = setTimeout(() => rej(new Error(`“${name}” is open in another tab. Close other Slopographic tabs and try again.`)), 6000); };
    });
  }

  /* ---------- export ---------- */
  async function readDb(name, blobs, enc) {
    const d = await openDb(name);
    try {
      const out = { name, version: d.version, stores: [] };
      const storeNames = [...d.objectStoreNames];
      if (!storeNames.length) return out;
      const t = d.transaction(storeNames, 'readonly');
      for (const sn of storeNames) {
        const s = t.objectStore(sn);
        const spec = { name: sn, keyPath: s.keyPath, autoIncrement: s.autoIncrement, records: [],
          indexes: [...s.indexNames].map((n) => { const i = s.index(n); return { name: n, keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry }; }) };
        const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
        for (let i = 0; i < vals.length; i++) spec.records.push(s.keyPath == null ? { k: enc(keys[i], blobs), v: enc(vals[i], blobs) } : { v: enc(vals[i], blobs) });
        out.stores.push(spec);
      }
      return out;
    } finally { d.close(); }
  }
  /** Build the backup. Resolves with { blob, name, manifest }. */
  async function exportAll({ onProgress = () => {} } = {}) {
    const enc = window.SlopBackupCodec.encode, blobs = [], local = {};
    onProgress(tr('ui.backup.reading_settings'));
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); local[k] = localStorage.getItem(k); }
    const dbs = [];
    for (const n of await dbNames()) {
      onProgress(tr('ui.backup.reading', { name: n }));
      try { dbs.push(await readDb(n, blobs, enc)); } catch (e) { console.warn('Backup: skipped database', n, e); }
    }
    const drive = dbs.find((d) => d.name === DRIVE), count = (sn) => ((drive && drive.stores.find((s) => s.name === sn)) || { records: [] }).records.length;
    const manifest = { format: FORMAT, version: VERSION, created: new Date().toISOString(), origin: location.origin, app: 'Slopographic',
      counts: { localStorage: Object.keys(local).length, databases: dbs.length, driveFiles: count('files'), driveFolders: count('folders'), blobs: blobs.length },
      bytes: blobs.reduce((n, b) => n + b.size, 0) };
    onProgress(tr('ui.backup.packing'));
    const entries = [{ name: 'manifest.json', data: JSON.stringify(manifest, null, 1) }, { name: 'local.json', data: JSON.stringify(local) }, { name: 'idb.json', data: JSON.stringify(dbs) }];
    blobs.forEach((b, i) => entries.push({ name: 'blobs/' + i, data: b }));
    const blob = await window.SlopZip.zip(entries);
    return { blob: new Blob([blob], { type: 'application/x-slopographic-backup' }), name: fileName(), manifest };
  }

  /* ---------- import ---------- */
  /** Read a backup file. Resolves with { manifest, local, dbs, bytesOf }. */
  async function read(file) {
    const entries = await window.SlopZip.unzip(file).catch(() => { throw new Error(tr('ui.backup.not_backup')); });
    const map = new Map(entries.map((e) => [e.name, e.bytes])), json = (n) => { const b = map.get(n); return b ? JSON.parse(new TextDecoder().decode(b)) : null; };
    const manifest = json('manifest.json');
    if (!manifest || manifest.format !== FORMAT) throw new Error(tr('ui.backup.not_backup'));
    if (manifest.version > VERSION) throw new Error(tr('ui.backup.newer'));
    return { manifest, local: json('local.json') || {}, dbs: json('idb.json') || [], bytesOf: (ref) => map.get('blobs/' + ref) || new Uint8Array(0) };
  }
  async function existing() { try { return indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null; } catch (e) { return null; } }
  async function restoreDb(spec, replace, dec, names) {
    const exists = names ? names.includes(spec.name) : true;
    let d = exists ? await openDb(spec.name) : null;
    if (d && !d.objectStoreNames.length) { d.close(); await req(indexedDB.deleteDatabase(spec.name)); d = null; } // empty shell: build it fresh
    let missing = d ? spec.stores.filter((s) => !d.objectStoreNames.contains(s.name)) : spec.stores;
    const target = Math.max(d ? d.version : 1, spec.version || 1);
    if (!d || (missing.length && target > d.version)) {
      if (d) d.close();
      d = await openDb(spec.name, target, (db) => {
        for (const s of spec.stores) if (!db.objectStoreNames.contains(s.name)) {
          const os = db.createObjectStore(s.name, { keyPath: s.keyPath == null ? undefined : s.keyPath, autoIncrement: !!s.autoIncrement });
          for (const i of s.indexes || []) try { os.createIndex(i.name, i.keyPath, { unique: !!i.unique, multiEntry: !!i.multiEntry }); } catch (e) { /* bad index spec */ }
        }
      });
      missing = spec.stores.filter((s) => !d.objectStoreNames.contains(s.name));
    }
    const stores = spec.stores.filter((s) => d.objectStoreNames.contains(s.name));
    let n = 0;
    try {
      if (stores.length) {
        const t = d.transaction(stores.map((s) => s.name), 'readwrite');
        for (const s of stores) {
          const os = t.objectStore(s.name);
          if (replace) os.clear();
          for (const r of s.records) { const v = dec(r.v); if (os.keyPath == null) os.put(v, dec(r.k)); else os.put(v); n++; }
        }
        await done(t);
      }
    } finally { d.close(); }
    return { records: n, skipped: missing.map((s) => spec.name + '/' + s.name) };
  }
  /** Restore a backup. mode 'merge' adds and overwrites (the backup wins), 'replace' empties first.
   * parts: { local, idb } (both true by default). Resolves with a summary. */
  async function importBackup(file, { mode = 'merge', parts = {}, onProgress = () => {} } = {}) {
    const b = file.manifest ? file : await read(file), replace = mode === 'replace';
    const out = { localStorage: 0, databases: 0, records: 0, skipped: [], errors: [] };
    if (parts.local !== false) {
      onProgress(tr('ui.backup.restoring_settings'));
      if (replace) localStorage.clear();
      for (const [k, v] of Object.entries(b.local)) try { localStorage.setItem(k, v); out.localStorage++; } catch (e) { out.errors.push('localStorage ' + k + ': ' + e.message); }
    }
    if (parts.idb !== false) {
      const dec = (j) => window.SlopBackupCodec.decode(j, b.bytesOf), names = await existing();
      for (const spec of b.dbs) {
        onProgress(tr('ui.backup.restoring', { name: spec.name }));
        try { const r = await restoreDb(spec, replace, dec, names); out.databases++; out.records += r.records; out.skipped.push(...r.skipped); }
        catch (e) { out.errors.push(spec.name + ': ' + e.message); }
      }
    }
    try { new BroadcastChannel('slopographic').postMessage({ type: 'drive:change', data: { what: 'restore' }, src: 'backup', time: Date.now() }); } catch (e) { /* no bus */ }
    return out;
  }
  window.SlopBackupCore = { exportAll, read, importBackup, fileName, dbNames, FORMAT, VERSION };
})();
