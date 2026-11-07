/* The optional 3D decoders: Draco (compressed meshes), meshoptimizer (compressed buffers) and the Basis Universal
 * transcoder (KTX2 textures). They are large and few files need them, so they are not in vendor/: they come from the
 * Slopographic cdn repository at its release tag (jsDelivr, then GitHub), only when a glTF or GLB file uses the extension, and each file is
 * checked against its SHA-256 before it runs (the same checksums are in each folder's manifest.json in the cdn repo,
 * engines/<name>/three-0.170.0/, with the licence and source notes). Browser only.
 *   needed(gltfJson)       → engine ids the file needs, e.g. ['draco']
 *   prepare(ids, { ask })  → asks once before the first download (SlopFirstRun), then loads and checks every file
 *   setFetch(fn)           → tests: replace the network (fn(url) → Promise<Response-like>) */

import '../cdn/assets.js';   // globalThis.SlopCdn: where the cdn files are served from, and the checked download

const C = globalThis.SlopCdn;
/** The engines' folder in the cdn repository, and its first URL (the release tag in shared/cdn/assets.js keeps it fixed). */
export const CDN_DIR = 'engines/';
export const CDN_BASE = C.url(CDN_DIR);

export const ENGINES = {
  draco: { label: 'ui.d3.engine_draco', dir: 'draco/three-0.170.0/', ext: ['KHR_draco_mesh_compression'], files: {
    'draco_wasm_wrapper.js': ['8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6', 58456],
    'draco_decoder.wasm': ['a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac', 192420],
  } },
  meshopt: { label: 'ui.d3.engine_meshopt', dir: 'meshopt/three-0.170.0/', ext: ['EXT_meshopt_compression', 'KHR_meshopt_compression'], files: {
    'meshopt_decoder.module.js': ['01f48524f4bac6141eaba07e94cc36e7ee56f311796fa6117c159842941b0468', 24850],
  } },
  basis: { label: 'ui.d3.engine_basis', dir: 'basis/three-0.170.0/', ext: ['KHR_texture_basisu'], files: {
    'basis_transcoder.js': ['8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1', 57529],
    'basis_transcoder.wasm': ['6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a', 527333],
  } },
};

let fetchImpl = (url) => fetch(url, { cache: 'force-cache' });
/** Tests replace the network with a function that serves the files (and can serve wrong bytes). */
export function setFetch(fn) { fetchImpl = fn || ((url) => fetch(url, { cache: 'force-cache' })); loaded.clear(); }
/** Every engine URL fetched so far (tests read it to check that nothing loads unless a file needs it). */
export const requested = [];

/** The engines a glTF file needs, from its extensionsUsed and extensionsRequired lists. */
export function needed(json) {
  const used = new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])]);
  return Object.keys(ENGINES).filter((id) => ENGINES[id].ext.some((e) => used.has(e)));
}

const loaded = new Map();   // engine id → Promise<{ file name → blob URL }>
const TYPES = { js: 'text/javascript', wasm: 'application/wasm' };

/** Downloads one engine's files, checks each SHA-256 and returns blob URLs by file name. */
function load(id) {
  if (!loaded.has(id)) {
    const e = ENGINES[id];
    const p = (async () => {
      const urls = {};
      for (const [name, [hash]] of Object.entries(e.files)) {
        const list = C.urls(CDN_DIR + e.dir + name);
        requested.push(list[0]);
        const buf = await C.fetchVerified(list, { label: name, sha256: hash, index: 'its checksum' }, { fetch: (u) => fetchImpl(u), onFallback: (err, next) => requested.push(next) });
        urls[name] = URL.createObjectURL(new Blob([buf], { type: TYPES[name.split('.').pop()] || 'application/octet-stream' }));
      }
      return urls;
    })();
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return loaded.get(id);
}

/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
let asked = null;
/** The first-use notice before the first decoder download (once per browser, like the video engine's). */
function askOnce(ids) {
  if (!asked) {
    const downloads = ids.map((id) => ({ name: ENGINES[id].label, bytes: Object.values(ENGINES[id].files).reduce((n, f) => n + f[1], 0) }));
    asked = typeof window !== 'undefined' && window.SlopFirstRun
      ? window.SlopFirstRun.once('3d-decoders', { title: 'ui.firstrun.d3_title', downloads, lines: ['ui.firstrun.d3_text'] })   // keys: shared/i18n/ui/<code>/firstrun.js
      : Promise.resolve(true);
  }
  return asked.then((ok) => { if (!ok) asked = null; return ok; });
}

/** Loads the engines a file needs. Throws a readable error when the person says no or the download fails. */
export async function prepare(ids, { ask = true } = {}) {
  if (!ids.length) return {};
  if (ask && !(await askOnce(ids))) throw Object.assign(new Error(tr('ui.d3.declined')), { shown: true });
  const out = {};
  for (const id of ids) {
    try { out[id] = await load(id); } catch (e) {
      throw Object.assign(new Error(tr('ui.d3.load_failed', { engine: tr(ENGINES[id].label), error: e.message })), { shown: true });
    }
  }
  return out;
}

/** Sets up a GLTFLoader with the engines a file needs. T: three.js; L: { DRACOLoader, KTX2Loader } classes. */
export async function attach(loader, ids, urls, T, L) {
  const manager = (map) => { const m = new T.LoadingManager(); m.setURLModifier((u) => map[u.split('/').pop()] || u); return m; };
  if (ids.includes('draco')) {
    const d = new L.DRACOLoader(manager(urls.draco));
    d.setDecoderConfig({ type: 'wasm' });
    loader.setDRACOLoader(d);
  }
  if (ids.includes('meshopt')) {
    const mod = await import(urls.meshopt['meshopt_decoder.module.js']);
    await mod.MeshoptDecoder.ready;
    loader.setMeshoptDecoder(mod.MeshoptDecoder);
  }
  if (ids.includes('basis')) {
    const k = new L.KTX2Loader(manager(urls.basis));
    // No renderer here: the transcoder makes plain RGBA pixels, which every exporter and viewer can use.
    k.workerConfig = { astcSupported: false, astcHDRSupported: false, etc1Supported: false, etc2Supported: false, dxtSupported: false, bptcSupported: false, pvrtcSupported: false };
    loader.setKTX2Loader(k);
  }
}
