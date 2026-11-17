/* Slop AI Tools: the model manager. Lists each model with its licence, size, source and status
 * (bundled, installed, needs download), installs a model only when the caller asks (get-more.js asks first),
 * checks every file's byte length and SHA-256 before anything is stored (download.js; a big file comes in parts), and keeps the verified files in
 * IndexedDB (database "slop-aitools"). A model is stored in one transaction or not at all. Bundled files are
 * read from vendor/models/ and checked against the same index. Classic script; exposes window.SlopAIManager. */
(function (root) {
  'use strict';
  /** The text of an aitools.* key (aitools/i18n), or the English given: other apps' pages may not load these tables. */
  const tr = (k, en) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k) : en; };
  const R = root.SlopAIModels;
  const DB = 'slop-aitools', VER = 1, SMALL = 64 * 1024;
  const SITE = typeof document !== 'undefined' && document.currentScript ? new URL('../', document.currentScript.src).href : new URL('/', root.location.href).href;
  let dbp = null;
  const bundledCache = new Map();

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('IndexedDB is not available in this browser')); return; }
      let r;
      try { r = root.indexedDB.open(DB, VER); } catch (e) { reject(e); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(r.error || new Error('IndexedDB could not open')); };
      r.onblocked = () => { dbp = null; reject(new Error('Another tab is holding the AI tools database')); };
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function request(store, mode, make) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), r = make(t.objectStore(store));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  /** Lowercase hex SHA-256. Needs a secure context (https or localhost): crypto.subtle is missing otherwise. */
  async function sha256Hex(buf) {
    if (!(root.crypto && root.crypto.subtle)) throw new Error('This page must be opened over https to check model files');
    const d = new Uint8Array(await root.crypto.subtle.digest('SHA-256', buf));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  /** Checks bytes against one index entry: exact length, then SHA-256. Throws with a plain reason. */
  async function verify(buf, f) {
    if (!buf || buf.byteLength !== f.size) throw new Error(`${f.name}: ${buf ? buf.byteLength : 0} bytes, expected ${f.size}`);
    const got = await sha256Hex(buf);
    if (got !== f.sha256) throw new Error(`${f.name}: SHA-256 does not match the index`);
    return buf;
  }

  /** Stored record for a model, or null. Never throws: a blocked database reads as "not installed". */
  async function record(id) {
    try { return (await request('models', 'readonly', (s) => s.get(id))) || null; } catch (e) { return null; }
  }
  /** Status: 'bundled' (no download needed), 'installed' (stored and verified), 'update' (stored, but the index gained small
   *  files since, such as Whisper's config.json: under 64 KB, fetched without asking again, see ensureFiles) or
   *  'needs-download'. A model stored before a big file changed needs downloading again: readAll would miss it. */
  async function status(id) {
    const m = R.byId(id);
    if (!m) return 'unknown';
    const remote = R.remoteFiles(m);
    if (!remote.length) return 'bundled';
    const rec = await record(id), have = new Set(((rec && rec.files) || []).map((f) => f.name + ':' + f.sha256));
    if (!rec) return 'needs-download';
    const missing = remote.filter((f) => !have.has(f.name + ':' + f.sha256));
    if (!missing.length) return 'installed';
    return missing.reduce((n, f) => n + f.size, 0) <= SMALL ? 'update' : 'needs-download';
  }
  /** One row per model: the index entry, its status and when it was installed. */
  async function list() {
    const rows = [];
    for (const m of R.MODELS) {
      const rec = await record(m.id);
      rows.push({ model: m, status: await status(m.id), installedAt: rec ? rec.installedAt : null });
    }
    return rows;
  }

  /**
   * Downloads, verifies and stores the remote files of one model (those not already stored with the same SHA-256). Only
   * call this after the person confirmed the licence and size (get-more.js, the speech Language and model dialog).
   * onProgress({ file, index, count, loaded, total }): loaded and total in bytes over the whole model. opts.signal cancels.
   * Any failure or a cancel stores nothing. A file in parts is joined and checked whole (download.js).
   */
  async function install(id, onProgress, opts = {}) {
    const m = R.byId(id);
    if (!m) throw new Error('Unknown model ' + id);
    const remote = R.remoteFiles(m), rec = await record(id);
    const have = new Set(((rec && rec.files) || []).map((f) => f.name + ':' + f.sha256));
    const todo = remote.filter((f) => !have.has(f.name + ':' + f.sha256)), blobs = new Map();
    const total = todo.reduce((n, f) => n + f.size, 0);
    let n = 0, before = 0;
    for (const f of todo) {
      n++;
      const tell = (loaded) => { if (onProgress) onProgress({ file: f.name, index: n, count: todo.length, loaded: before + loaded, total }); };
      const buf = await (await downloader()).fetchFile(f, { fetch: (u, o) => root.fetch(u, o), sha256Hex, allowedUrl: R.allowedUrl, signal: opts.signal, onBytes: tell });
      before += f.size;
      blobs.set(f.name, new Blob([buf]));
    }
    if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(['models', 'files'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storing the model was cancelled'));
      for (const f of todo) t.objectStore('files').put({ key: `${id}/${f.name}`, blob: blobs.get(f.name) });
      t.objectStore('models').put({ id, installedAt: (rec && rec.installedAt) || new Date().toISOString(), licence: m.licence, files: remote.map((f) => ({ name: f.name, size: f.size, sha256: f.sha256 })) });
    });
    // The dialog named the download, its size and licence and the person agreed: the first-run notice would only ask again.
    if (root.SlopFirstRun && root.SlopFirstRun.mark) root.SlopFirstRun.mark('aitools');
    return { id, files: todo.length };
  }
  /** download.js and the cdn helper it uses (shared/cdn/assets.js): on the page already, or loaded once from the site
   *  (pages that only read models skip them). */
  let dlp = null;
  const addScript = (path) => new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = new URL(path, SITE).href;
    sc.onload = resolve;
    sc.onerror = () => reject(new Error('The downloader could not load'));
    document.head.append(sc);
  });
  function downloader() {
    if (root.SlopAIDownload && root.SlopCdn) return Promise.resolve(root.SlopAIDownload);
    if (!dlp) {
      dlp = (root.SlopCdn ? Promise.resolve() : addScript('shared/cdn/assets.js'))
        .then(() => (root.SlopAIDownload ? null : addScript('aitools/download.js')))
        .then(() => { if (!root.SlopAIDownload) throw new Error('The downloader did not load'); return root.SlopAIDownload; });
      dlp.catch(() => { dlp = null; });
    }
    return dlp;
  }
  /** Bytes stored on this device for the given models (all when ids is missing). */
  async function usage(ids) {
    let n = 0;
    for (const m of R.MODELS) {
      if (ids && !ids.includes(m.id)) continue;
      const rec = await record(m.id);
      if (rec) n += (rec.files || []).reduce((a, f) => a + (f.size || 0), 0);
    }
    return n;
  }

  /** Removes a stored model and its files. */
  async function remove(id) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(['models', 'files'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      const m = R.byId(id);
      for (const f of R.remoteFiles(m || { files: [] })) t.objectStore('files').delete(`${id}/${f.name}`);
      t.objectStore('models').delete(id);
    });
  }

  /** The bytes of every file of a model, keyed by file name, ready to hand to a worker (ArrayBuffers). */
  async function readAll(id) {
    const m = R.byId(id);
    if (!m) throw new Error('Unknown model ' + id);
    const remote = R.remoteFiles(m);
    if (remote.length && window.SlopFirstRun && !(await SlopFirstRun.once('aitools', {
      title: tr('aitools.first.title', 'Run this AI tool on this device'),
      lines: [tr('aitools.first.line', 'This tool runs its model in your browser. The model is downloaded once and kept by this browser for next time.')],
      downloads: remote.map((f) => ({ name: f.name, bytes: f.size || 0 })),
    }))) throw new Error('cancelled');
    const out = {};
    for (const f of m.files) {
      if (f.path) out[f.name] = (await bundled(f)).slice(0); // a copy: the worker takes ownership of what it is sent
      else {
        const row = await request('files', 'readonly', (s) => s.get(`${id}/${f.name}`));
        if (!row || !row.blob) throw new Error(`${f.name} is not installed. Press Get more first.`);
        out[f.name] = await verify(await row.blob.arrayBuffer(), f);
      }
    }
    return out;
  }
  /** A bundled file: fetched once per page, verified, then kept in memory. */
  function bundled(f) {
    if (!bundledCache.has(f.path)) bundledCache.set(f.path, (async () => {
      const r = await fetch(new URL(f.path, SITE).href, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`);
      return verify(await r.arrayBuffer(), f);
    })().catch((e) => { bundledCache.delete(f.path); throw e; }));
    return bundledCache.get(f.path);
  }

  root.SlopAIManager = { list, status, install, usage, remove, readAll, record, verify, sha256Hex, available: () => open().then(() => true, () => false), site: SITE };
})(typeof window !== 'undefined' ? window : globalThis);
