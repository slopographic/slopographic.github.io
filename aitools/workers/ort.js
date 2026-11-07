/* Slop AI Tools worker helper: loads ONNX Runtime Web (vendor/onnxruntime-web, WebAssembly, one thread, no
 * SharedArrayBuffer since the site sends no COOP/COEP headers) and makes sessions from bytes the page sent.
 * Classic script for infer.worker.js. Exposes self.SlopAIOrt = { get(), session(bytes) }. */
(function (root) {
  'use strict';
  const BASE = new URL('../../vendor/onnxruntime-web/', root.location.href).href;
  let ortp = null;
  /** The ONNX Runtime module, loaded once. */
  function get() {
    if (!ortp) ortp = import(BASE + 'ort.wasm.min.mjs').then((ort) => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: BASE + 'ort-wasm-simd-threaded.mjs', wasm: BASE + 'ort-wasm-simd-threaded.wasm' };
      ort.env.logLevel = 'error';
      return ort;
    }).catch((e) => { ortp = null; throw new Error('ONNX Runtime could not load: ' + e.message); });
    return ortp;
  }
  /** A session from the model bytes. Always the WebAssembly backend (the one every browser has). */
  async function session(bytes) {
    const ort = await get();
    return ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  root.SlopAIOrt = { get, session };
})(self);
