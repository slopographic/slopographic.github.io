/* HEIC and HEIF photos (iPhone pictures): the decoder, libheif with the libde265 HEVC decoder compiled to WebAssembly
 * (libheif-js 1.23.5; LGPL-3.0, see the cdn's engines/libheif/libheif-js-1.23.5/SOURCE.md). Its two files (about 1.5 MB)
 * are fetched just in time from the Slopographic cdn at its release tag, the first time a HEIC photo is decoded, after the
 * shared first-use notice (shared/firstrun/notice.js). The download goes through the shared installer
 * (shared/library/install.js: allowed host, byte length and SHA-256 checked, kept in IndexedDB), so it happens once per
 * browser. Decoding runs in a Web Worker (worker.js). The same shape as the camera RAW engine (shared/raw/engine.js).
 * Classic script; exposes window.SlopHeicEngine:
 *   PACK, NOTICE                          the engine as an installer pack, and its first-use notice
 *   ready({ ask, onStatus }) -> Promise   resolves when the engine can run; rejects (err.code 'declined' when the person
 *                                         said no; ask: false never shows the notice and rejects instead)
 *   decode(bytes, { ask }, onStatus) -> Promise<{ width, height, data, count }>   the primary picture as RGBA (the
 *                                         file's rotation and mirroring applied); count: the pictures in the file
 *   installed() -> Promise<boolean>       forget() -> Promise   (removes the stored engine, for tests and settings) */
(function (root) {
  'use strict';
  const doc = root.document;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || root.SlopHeicBase || (root.location && root.location.href) || '';
  // the engine's folder in the cdn repository: the installer fetches it from there (shared/cdn/assets.js: jsDelivr, then GitHub)
  const BASE = 'engines/libheif/libheif-js-1.23.5/';
  const FILES = [
    { name: 'libheif.js', size: 91255, sha256: '376c0bb483c23ac458cd22d718074693748ea75eddc3e4929353d4153e365a2e' },
    { name: 'libheif.wasm', size: 1463506, sha256: '184d3d20f8323877f13e9f5254f9c6a0ce272c9a3a2f823b0b2bcd2ee9f73f80' },
  ];
  const PACK = {
    id: 'engine-libheif', kind: 'model', name: 'HEIC photo decoder (libheif 1.23.5, WebAssembly)', licence: 'LGPL-3.0',
    licenceUrl: 'https://github.com/slopographic/cdn/blob/main/' + BASE + 'SOURCE.md', size: FILES.reduce((n, f) => n + f.size, 0), files: FILES.map((f) => ({ ...f, cdn: BASE + f.name })),
  };
  // the words are keys (shared/i18n/ui/<code>/firstrun.js), read by SlopFirstRun when the notice shows
  /** A word shown to the person (ui.heic.*): status lines and errors, in the chosen language when they are made. A worker's
   * error is a key it gives (its own failures) or the decoder's own text, shown as it is (SlopI18n.label). */
  const tr = (k, v) => { const I = root.SlopI18n; return I ? I.label(k, v) : k; };
  const NOTICE = {
    title: 'ui.firstrun.heic_title',
    lines: ['ui.firstrun.heic_text'],
    downloads: [{ name: () => tr('ui.firstrun.heic_name', { version: '1.23.5' }), bytes: PACK.size }],
  };
  // SlopUI too: SlopFirstRun lets everything through when a page has no dialog kit, and the engine must not download unasked
  const DEPS = [['SlopUI', '../slopui.js'], ['SlopLibraryManifest', '../library/manifest.js'], ['SlopLibraryStore', '../library/store.js'], ['SlopLibraryInstall', '../library/install.js'], ['SlopFirstRun', '../firstrun/notice.js']];
  let depsP = null, readyP = null, worker = null, seq = 0;
  const pending = new Map();

  function load(src) {
    return new Promise((res, rej) => { const s = doc.createElement('script'); s.src = new URL(src, SELF).href; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); doc.head.append(s); });
  }
  function deps() {
    if (!root.SlopUI && doc && !doc.querySelector('link[href*="slopui.css"]')) {
      doc.head.append(Object.assign(doc.createElement('link'), { rel: 'stylesheet', href: new URL('../slopui.css', SELF).href }));
    }
    if (!depsP) depsP = DEPS.reduce((p, [g, src]) => p.then(() => (root[g] ? null : load(src))), Promise.resolve());
    depsP.catch(() => { depsP = null; });
    return depsP;
  }

  /** The stored engine record when it is the current version (same checksums), or null. */
  async function record() {
    const rows = await root.SlopLibraryStore.listPacks().catch(() => []);
    const r = rows.find((x) => x.id === PACK.id);
    return r && FILES.every((f) => r.files.some((g) => g.name === f.name && g.sha256 === f.sha256)) ? r : null;
  }
  async function installed() { await deps(); return !!(await record()); }
  function declined() { const e = new Error(tr('ui.heic.declined')); e.code = 'declined'; return e; }

  function call(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
  }
  /** Stops the worker and fails what was waiting, so the next call starts a fresh one. */
  function reset(err) {
    try { if (worker) worker.terminate(); } catch (e) { /* gone */ }
    worker = null; readyP = null;
    for (const p of pending.values()) p.reject(err || new Error(tr('ui.heic.stopped')));
    pending.clear();
  }
  /** Starts the worker with the stored files (the script as a blob URL, the WebAssembly as bytes). */
  async function start() {
    const S = root.SlopLibraryStore;
    const [js, wasm] = await Promise.all(FILES.map((f) => S.getBlob(`${PACK.id}/${f.name}`)));
    if (!js || !wasm) throw new Error(tr('ui.heic.missing'));
    const jsUrl = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
    worker = new Worker(new URL('worker.js', SELF).href);
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.out); else p.reject(new Error(tr(data.error)));
    };
    worker.onerror = (e) => reset(new Error(e && e.message ? tr('ui.heic.crashed_why', { error: e.message }) : tr('ui.heic.crashed')));
    const buf = await wasm.arrayBuffer();
    await call({ op: 'init', jsUrl, wasm: buf }, [buf]);
  }

  async function prepare(o) {
    const say = (s) => { if (o.onStatus) o.onStatus(s); };
    await deps();
    if (!(await record())) {
      if (o.ask === false) throw declined();
      if (!(await root.SlopFirstRun.once('heic-engine', NOTICE))) throw declined();
      say(tr('ui.heic.downloading'));
      try { await root.SlopLibraryInstall.install(PACK, (s) => say(tr('ui.heic.progress', { status: s }))); } catch (e) { throw new Error(tr('ui.heic.download_failed', { error: e.message })); }
    }
    say(tr('ui.heic.starting'));
    await start();
  }
  function ready(o = {}) {
    if (!readyP) { readyP = prepare(o); readyP.catch(() => { if (worker) reset(); readyP = null; }); }
    return readyP;
  }

  /** Decodes one HEIC or HEIF file. bytes: Uint8Array or ArrayBuffer (copied, so the caller keeps it). */
  async function decode(bytes, opts = {}, onStatus) {
    await ready({ ask: opts.ask, onStatus });
    const copy = new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);
    return call({ op: 'decode', bytes: copy }, [copy.buffer]);
  }
  async function forget() {
    reset();
    await deps();
    await root.SlopLibraryStore.removePack(PACK.id).catch(() => {});
  }

  root.SlopHeicEngine = { PACK, NOTICE, ready, decode, installed, forget, reset };
})(typeof window !== 'undefined' ? window : globalThis);
