/* SlopCutout runtime: starts ONNX Runtime Web and makes the model sessions, in the configuration memory.js plans, and
 * retries lighter when a device runs out of memory (memory.js says why: WebKit on iOS 16/17 refuses ORT's 4 GB shared
 * memory); on iOS / iPadOS before 17, where ORT cannot build any session, it fails at once with code 'unavailable'.
 * Classic script for the worker (importScripts after memory.js); the page-free parts are injected, so Node tests drive it
 * with a fake ORT. Sets self.SlopCutoutRuntime = { create(opts) }.
 * opts: { cfg (vendor, models, sources, ios, ua: live object, read when used), models (SlopCutoutModels),
 *         fetchCached(url, { sha256, bytes, onProgress }) → { buffer, cached }, importModule(url), fetchText(url), gpuOK() } */
(function (root) {
  'use strict';
  const MEM = root.SlopCutoutMemory;
  const now = () => (root.performance ? performance.now() : Date.now());

  function create(o) {
    const cfg = o.cfg, Ms = o.models, sessions = new Map();
    const src = (base, file) => (cfg.sources && cfg.sources[file]) || base + file;
    let started = null, startKey = null, starts = 0, light = false, env = null, backend = null;

    /** A Blob URL of a script's text (patched when asked): a fresh module instance, or the plain-memory glue. */
    async function blobURL(url, patch) {
      const text = await o.fetchText(url);
      return URL.createObjectURL(new Blob([patch ? patch(text) : text], { type: 'text/javascript' }));
    }
    async function environment() {
      if (!env) {
        const ios = !!cfg.ios, nav = root.navigator || {};
        env = { ios, crossOriginIsolated: !!root.crossOriginIsolated, sharedMemory: ios ? false : MEM.sharedMemoryOK(), gpu: !!(await o.gpuOK()), cores: nav.hardwareConcurrency || 2 };
      }
      return env;
    }
    /** iOS / iPadOS before 17 (memory.js): nothing is downloaded or started. cfg.ua stands in for the browser's (tests). */
    const tooOld = () => MEM.tooOldForEngine({ ios: !!cfg.ios, ua: cfg.ua || (root.navigator || {}).userAgent, modern: MEM.modernEngine() });
    /** Release the sessions (all, or all but one model's). */
    function drop(keep) {
      for (const [id, p] of sessions) if (id !== keep) { sessions.delete(id); p.then((s) => s.release && s.release()).catch(() => {}); }
    }

    /** ONNX Runtime started in a configuration, once. Another configuration, or a start after a failed one, imports a
     *  fresh copy of ORT (it keeps a failed start for good, and each copy holds its own WebAssembly memory). The first start
     *  imports the vendored file itself, as before. */
    function start(conf, progress) {
      const key = JSON.stringify(conf);
      if (started && startKey === key) return started;
      const fresh = starts++ > 0, gpu = conf.backend === 'webgpu';
      const js = gpu ? 'ort.min.mjs' : 'ort.wasm.min.mjs', glue = gpu ? 'ort-wasm-simd-threaded.jsep.mjs' : 'ort-wasm-simd-threaded.mjs', wasm = gpu ? 'ort-wasm-simd-threaded.jsep.wasm' : 'ort-wasm-simd-threaded.wasm';
      startKey = key;
      const p = started = (async () => {
        const ort = await o.importModule(fresh ? await blobURL(src(cfg.vendor, js)) : src(cfg.vendor, js));
        ort.env.wasm.numThreads = conf.numThreads;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = { mjs: conf.sharedMemory ? src(cfg.vendor, glue) : await blobURL(src(cfg.vendor, glue), MEM.patchGlue), wasm: src(cfg.vendor, wasm) };
        ort.env.logLevel = 'error';
        const bin = await o.fetchCached(src(cfg.vendor, wasm), { onProgress: (x) => progress(Object.assign({ phase: 'runtime' }, x)) });
        ort.env.wasm.wasmBinary = conf.sharedMemory ? bin.buffer : MEM.patchWasm(bin.buffer).buffer;
        return { ort, conf, backend: gpu ? 'webgpu' : 'wasm' };
      })();
      p.catch(() => { if (started === p) started = null; });
      return p;
    }

    /** One session: start ORT in attempt.config, read the model, create. cpu: WebAssembly even in the WebGPU build. */
    async function make(a, progress, cpu) {
      const rt = await start(a.config, progress), ort = rt.ort, m = Ms.get(a.model);
      const file = await o.fetchCached(src(cfg.models, m.file), { sha256: m.sha256, bytes: m.bytes, onProgress: (x) => progress(Object.assign({ phase: 'model', model: m.id }, x)) });
      progress({ phase: 'init', model: m.id });
      const t0 = now();
      let s = null;
      if (rt.backend === 'webgpu' && !cpu) {
        try { s = await ort.InferenceSession.create(file.buffer, { executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'all' }); s.backend = 'webgpu'; }
        catch (e) { if (MEM.isLowMemory(e)) throw e; console.warn('SlopCutout: WebGPU session failed, using WebAssembly', e); }
      }
      if (!s) { s = await ort.InferenceSession.create(file.buffer, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); s.backend = 'wasm'; }
      Object.assign(s, { initMs: now() - t0, cached: file.cached, model: m.id, ort, light: !rt.conf.sharedMemory });
      backend = s.backend;
      return s;
    }
    /** Keep a session promise for a model; a failed one is forgotten. */
    function keep(id, p) {
      sessions.set(id, p);
      p.catch(() => { if (sessions.get(id) === p) sessions.delete(id); });
      return p;
    }
    /** The session for a model, made once. On a low-memory error: the light configuration, then the smallest model
     *  (the session's .model says which model it runs); every attempt failing rejects with code 'low-memory'. */
    function session(modelId, progress) {
      const id = Ms.get(modelId).id;
      if (sessions.has(id)) return sessions.get(id);
      if (tooOld()) return Promise.reject(Object.assign(new Error('The background remover cannot start in this browser (ONNX Runtime needs iOS / iPadOS 17 or later)'), { code: 'unavailable' }));
      return keep(id, (async () => {
        const list = MEM.attempts(id, await environment(), { light });
        const r = await MEM.withRetry(list, (a) => make(a, progress), (e, a) => {
          console.warn('SlopCutout: out of memory (' + (e.message || e) + ') with', JSON.stringify(a), '- trying a lighter setup');
          light = true; started = null;
          drop(id);
        });
        return r.value;
      })());
    }
    /** A WebGPU run failed: the same model on WebAssembly, in the same ORT. */
    function wasmSession(modelId, progress) {
      const id = Ms.get(modelId).id, old = sessions.get(id);
      return keep(id, (async () => {
        const prev = old ? await old.catch(() => null) : null;
        if (prev && prev.release) prev.release().catch(() => {});
        return make({ config: startKey ? JSON.parse(startKey) : MEM.LIGHT, model: prev ? prev.model : id }, progress, true);
      })());
    }
    /** A model pass ran out of memory: free everything and make the session again, light (and smaller if need be). */
    function lighter(modelId, progress) {
      light = true; started = null;
      drop();
      return session(modelId, progress);
    }

    return {
      session, wasmSession, lighter,
      get backend() { return backend; },
      get light() { return light; },
      loaded: () => [...sessions.keys()],
    };
  }

  root.SlopCutoutRuntime = { create };
})(typeof self !== 'undefined' ? self : globalThis);
