/* Camera RAW: the full decoder, LibRaw 0.22.1 compiled to WebAssembly (libraw-wasm 1.6.0; LibRaw is LGPL-2.1 or
 * CDDL-1.0, see the cdn's engines/libraw/libraw-wasm-1.6.0/SOURCE.md). Its two files (about 1.4 MB) are fetched just in
 * time from the Slopographic cdn at its release tag, the first time a RAW file is developed, after the shared first-use
 * notice (shared/firstrun/notice.js). The download goes through the shared installer (shared/library/install.js: allowed
 * host, byte length and SHA-256 checked, kept in IndexedDB), so it happens once per browser. Decoding runs in a Web
 * Worker (worker.js). Loads its helpers on first use. Classic script; exposes window.SlopRawEngine:
 *   PACK                                  the engine as an installer pack (files, sizes, checksums, pinned URLs)
 *   settingsFor(opts) -> LibRaw settings  pure: { wb: 'camera'|'auto'|'daylight', exposure (EV), highlights:
 *                                         'clip'|'blend'|'rebuild', bits: 8|16, half }
 *   ready({ ask, onStatus }) -> Promise   resolves when the engine can run; rejects (err.code 'declined' when the
 *                                         person said no; ask: false never shows the notice and rejects instead)
 *   decode(bytes, opts, onProgress) -> Promise<{ width, height, bits, data, meta }>   see worker.js for data
 *   installed() -> Promise<boolean>       forget() -> Promise   (removes the stored engine, for tests and settings) */
(function (root) {
  'use strict';
  const doc = root.document;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || (root.location && root.location.href) || '';
  // the engine's folder in the cdn repository: the installer fetches it from there (shared/cdn/assets.js: jsDelivr, then GitHub)
  const BASE = 'engines/libraw/libraw-wasm-1.6.0/';
  const FILES = [
    { name: 'libraw.js', size: 69155, sha256: 'e23952fca5b268550af1f84619af5c0c035e5db3bde0e4d5a20300f1614a9487' },
    { name: 'libraw.wasm', size: 1417725, sha256: '8947f7e668e488461c3e9defe7007583aa8477b4886aa603b36b407f2f0846ff' },
  ];
  const PACK = {
    id: 'engine-libraw', kind: 'model', name: 'Camera RAW engine (LibRaw 0.22.1, WebAssembly)', licence: 'LGPL-2.1 or CDDL-1.0',
    licenceUrl: 'https://github.com/slopographic/cdn/blob/main/' + BASE + 'SOURCE.md', size: FILES.reduce((n, f) => n + f.size, 0), files: FILES.map((f) => ({ ...f, cdn: BASE + f.name })),
  };
  // the words are keys (shared/i18n/ui/<code>/firstrun.js), read by SlopFirstRun when the notice shows
  /** A word shown to the person (ui.raw.*): status lines and errors, in the chosen language when they are made. A worker's
   * error is a key it gives (its own failures) or the decoder's own text, shown as it is (SlopI18n.label). */
  const tr = (k, v) => { const I = root.SlopI18n; return I ? I.label(k, v) : k; };
  const NOTICE = {
    title: 'ui.firstrun.raw_title',
    lines: ['ui.firstrun.raw_text'],
    downloads: [{ name: () => tr('ui.firstrun.raw_name', { version: '0.22.1' }), bytes: PACK.size }],
  };
  // SlopUI too: SlopFirstRun lets everything through when a page has no dialog kit (File convert's pages), and the
  // engine must not download without the notice
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

  const HIGHLIGHT = { clip: 0, blend: 2, rebuild: 5 };
  /** LibRaw settings for the develop options. Exposure is a brightness factor of 2^EV after LibRaw's own auto level. */
  function settingsFor(o = {}) {
    const ev = Math.max(-3, Math.min(3, Number(o.exposure) || 0));
    return {
      useCameraWb: o.wb === 'camera' || o.wb == null, useAutoWb: o.wb === 'auto',
      bright: Math.round(Math.pow(2, ev) * 1000) / 1000, highlight: HIGHLIGHT[o.highlights] || 0,
      outputBps: o.bits === 16 ? 16 : 8, outputColor: 1, userFlip: -1, halfSize: !!o.half, userQual: o.half ? 0 : 3,
    };
  }

  /** The stored engine record when it is the current version (same checksums), or null. */
  async function record() {
    const rows = await root.SlopLibraryStore.listPacks().catch(() => []);
    const r = rows.find((x) => x.id === PACK.id);
    return r && FILES.every((f) => r.files.some((g) => g.name === f.name && g.sha256 === f.sha256)) ? r : null;
  }
  async function installed() { await deps(); return !!(await record()); }

  function declined() { const e = new Error(tr('ui.raw.declined')); e.code = 'declined'; return e; }

  /** Starts the worker with the stored files (the script as a blob URL, the WebAssembly as bytes). */
  async function start() {
    const S = root.SlopLibraryStore;
    const [js, wasm] = await Promise.all(FILES.map((f) => S.getBlob(`${PACK.id}/${f.name}`)));
    if (!js || !wasm) throw new Error(tr('ui.raw.missing'));
    const jsUrl = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
    worker = new Worker(new URL('worker.js', SELF).href, { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.progress) { if (p.onProgress) p.onProgress(data.progress); return; }
      pending.delete(data.id);
      if (data.ok) p.resolve(data.out); else p.reject(new Error(tr(data.error)));
    };
    worker.onerror = (e) => { reset(new Error(e && e.message ? tr('ui.raw.crashed_why', { error: e.message }) : tr('ui.raw.crashed'))); };
    const buf = await wasm.arrayBuffer();
    await call({ op: 'init', jsUrl, wasm: buf }, [buf]);
  }
  function call(msg, transfer, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
  }
  /** Stops the worker and fails what was waiting, so the next call starts a fresh one. */
  function reset(err) {
    try { if (worker) worker.terminate(); } catch (e) { /* gone */ }
    worker = null; readyP = null;
    for (const p of pending.values()) p.reject(err || new Error(tr('ui.raw.stopped')));
    pending.clear();
  }

  async function prepare(o) {
    const say = (s) => { if (o.onStatus) o.onStatus(s); };
    await deps();
    if (!(await record())) {
      if (o.ask === false) throw declined();
      if (!(await root.SlopFirstRun.once('raw-engine', NOTICE))) throw declined();
      say(tr('ui.raw.downloading'));
      try { await root.SlopLibraryInstall.install(PACK, (s) => say(tr('ui.raw.progress', { status: s }))); } catch (e) { throw new Error(tr('ui.raw.download_failed', { error: e.message })); }
    }
    say(tr('ui.raw.starting'));
    await start();
  }
  function ready(o = {}) {
    if (!readyP) { readyP = prepare(o); readyP.catch(() => { if (worker) reset(); readyP = null; }); }
    return readyP;
  }

  /** Develops one RAW file. bytes: Uint8Array or ArrayBuffer (copied, so the caller keeps it). */
  async function decode(bytes, opts = {}, onProgress) {
    const say = (s) => { if (onProgress) onProgress(s); };
    await ready({ ask: opts.ask, onStatus: say });
    const copy = new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);   // a typed array is copied by the constructor
    // the worker's steps (open, develop) are keys ui.raw.step_open, ui.raw.step_develop
    return call({ op: 'decode', bytes: copy, settings: settingsFor(opts) }, [copy.buffer], (p) => say(tr('ui.raw.step_' + p)));
  }

  async function forget() {
    reset();
    await deps();
    await root.SlopLibraryStore.removePack(PACK.id).catch(() => {});
  }

  root.SlopRawEngine = { PACK, NOTICE, settingsFor, ready, decode, installed, forget, reset };
})(typeof window !== 'undefined' ? window : globalThis);
