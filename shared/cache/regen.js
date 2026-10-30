/* SlopRegen: the local caches that are made again on demand, and only those. Clearing them never touches documents
 * or Drive files: the Drive (slop-hub), the documents and the backups live in other databases, which are not listed.
 * Cleared:
 *   thumbs   Drive thumbnails and waveform peaks (IndexedDB slop-drive-thumbs, store thumbs)
 *   faces    face-detection results (IndexedDB slop-faces, store results)
 *   models   downloaded AI model files (Cache API webllm/model, webllm/config, webllm/wasm), except models
 *            imported from a folder on this computer, which have no download to make again
 *   cutout   the cut-out model cache (Cache slop-cutout-v1 and its IndexedDB fallback slop-cutout, store files)
 *   packs    downloaded library packs (IndexedDB slop-library, stores packs and files)
 *   aitools  AI Tools models installed from the Get more page (IndexedDB slop-aitools, stores models and files)
 * Every call resolves with the number of entries removed per kind. SlopRegen.only(kind) clears one kind. A missing database or a blocked browser counts as 0.
 * Classic script; adds window.SlopRegen. */
(function (g) {
  'use strict';
  const LOCAL_HOST = 'https://local-model.slopographic.invalid/';
  const WEBLLM = ['webllm/model', 'webllm/config', 'webllm/wasm'];
  const ok = (p, fallback = 0) => p.then((v) => v, () => fallback);

  /** Empties one object store of an existing database. Never creates the database. */
  function clearStore(name, store) {
    if (!g.indexedDB) return Promise.resolve(0);
    return ok(new Promise((res, rej) => {
      const r = g.indexedDB.open(name);
      r.onupgradeneeded = () => r.transaction.abort(); // missing: nothing to clear, and it is not created
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(store)) { d.close(); res(0); return; }
        const t = d.transaction(store, 'readwrite'), s = t.objectStore(store), n = s.count();
        t.oncomplete = () => { d.close(); res(n.result || 0); };
        t.onerror = t.onabort = () => { d.close(); rej(t.error || new Error('aborted')); };
        s.clear();
      };
    }));
  }
  /** Removes the webllm model files, keeping the models imported from a folder. */
  async function clearModels() {
    if (!g.caches) return 0;
    let n = 0;
    for (const scope of WEBLLM) {
      const c = await ok(caches.open(scope), null);
      if (!c) continue;
      for (const req of await ok(c.keys(), [])) if (!req.url.startsWith(LOCAL_HOST) && (await ok(c.delete(req), false))) n++;
    }
    return n;
  }
  /** Empties several object stores of one database. */
  async function clearStores(name, stores) {
    let n = 0;
    for (const store of stores) n += await clearStore(name, store);
    return n;
  }
  async function clearCutout() {
    if (!g.caches) return 0;
    const cache = await ok(caches.open('slop-cutout-v1'), null);
    const n = cache ? (await ok(cache.keys(), [])).length : 0;
    await ok(caches.delete('slop-cutout-v1'), false);
    return n + (await clearStore('slop-cutout', 'files'));
  }

  const ONE = {
    thumbs: () => clearStore(g.SLOP_THUMB_DB || 'slop-drive-thumbs', 'thumbs'),
    faces: () => clearStore(g.SLOP_FACES_DB || 'slop-faces', 'results'),
    models: clearModels,
    cutout: clearCutout,
    packs: () => clearStores('slop-library', ['packs', 'files']),
    aitools: () => clearStores('slop-aitools', ['models', 'files']),
  };

  g.SlopRegen = {
    /** Clears one kind: 'thumbs' | 'faces' | 'models' | 'cutout' | 'packs' | 'aitools'. Resolves with the number removed (0 for an unknown kind). */
    only(kind) { return ONE[kind] ? ok(ONE[kind]().catch(() => 0), 0) : Promise.resolve(0); },
    /** Clears every regenerable cache. Resolves with { thumbs, faces, models, cutout } counts. */
    async clear() {
      const thumbs = await clearStore(g.SLOP_THUMB_DB || 'slop-drive-thumbs', 'thumbs');
      const faces = await clearStore(g.SLOP_FACES_DB || 'slop-faces', 'results');
      const models = await clearModels();
      const cutout = await clearCutout();
      return { thumbs, faces, models, cutout };
    },
  };
})(window);
