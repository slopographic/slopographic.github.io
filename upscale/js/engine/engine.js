/* Slop Upscale engine (page side): the worker, and a request per tile. Classic script; sets SlopUpscaleEngine.
 *   load(modelId, bytes?)            Promise: loads the model in the worker (bytes for an opt-in model)
 *   tile(model, rgba, w, h, scale)   Promise<{ w, h, rgba }>: model null = Lanczos only
 *   isLoaded(model)                  whether the worker already holds the model (so the bytes need not be read again)
 *   cancel()                         stops the worker at once; every waiting call rejects with 'Cancelled'
 * The worker is made on first use and again after a cancel. Nothing is sent anywhere else. */
(function (root) {
  'use strict';
  const SRC = new URL('./worker.js', (document.currentScript && document.currentScript.src) || location.href).href;
  let worker = null, seq = 0, loaded = new Set();
  const waiting = new Map();

  function make() {
    if (worker) return worker;
    worker = new Worker(SRC);
    worker.onmessage = (e) => {
      const m = e.data || {}, w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.type === 'error') w.reject(new Error(m.message));
      else w.resolve(m);
    };
    worker.onerror = (e) => {
      const msg = (e && e.message) || 'The upscaler stopped';
      for (const [id, w] of waiting) { waiting.delete(id); w.reject(new Error(msg)); }
      stop();
    };
    return worker;
  }
  function stop() {
    if (worker) worker.terminate();
    worker = null; loaded = new Set();
  }
  function call(msg, transfer) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      try { make().postMessage({ id, ...msg }, transfer || []); }
      catch (e) { waiting.delete(id); reject(e); }
    });
  }

  const E = {
    async load(model, bytes) {
      if (loaded.has(model)) return;
      const req = { type: 'load', model };
      if (bytes) req.bytes = bytes;
      await call(req, bytes ? [bytes] : []);
      loaded.add(model);
    },
    async tile(model, rgba, w, h, scale) {
      const r = await call({ type: 'tile', model, w, h, scale, rgba: rgba.buffer }, [rgba.buffer]);
      return { w: r.w, h: r.h, rgba: new Uint8ClampedArray(r.rgba) };
    },
    isLoaded(model) { return loaded.has(model); },
    cancel() {
      for (const [id, w] of waiting) { waiting.delete(id); w.reject(new Error('Cancelled')); }
      stop();
    },
  };
  root.SlopUpscaleEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
