/* Slop Image to 3D: monocular depth with Depth Anything V2 Small (Apache-2.0) through ONNX Runtime Web
 * (vendor/onnxruntime-web, CPU/WebAssembly). The model is opt-in: it lives in the Get more library (packs.json,
 * pack "depth-anything-v2-small") and is read from SlopLibraryStore. Nothing is fetched here. Classic script, page only.
 * Sets window.SlopImg3D.depth: installed(), estimate(rgba, W, H) → { data: Float32 (higher = nearer), w, h }.
 * Licence and source: img3d/HANDOFF.md. The file's SHA-256 is checked on every load. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const tr = (k, en) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k) : en; };   // English when the tables are missing
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const VENDOR = new URL('../../../vendor/onnxruntime-web/', SELF).href;
  const MODEL = {
    id: 'depth-anything-v2-small', file: 'depth-anything-v2-small.onnx', bytes: 27258801,
    sha256: 'fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d',
    side: 518, multiple: 14, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225],
    input: 'pixel_values', output: 'predicted_depth', licence: 'Apache-2.0',
  };
  let sessionP = null;

  /** True when the pack is in this browser's Get more library. Never throws. */
  async function installed() {
    try { return !!root.SlopLibraryStore && (await root.SlopLibraryStore.listPacks()).some((r) => r.id === MODEL.id); } catch (e) { return false; }
  }

  /** Loads ONNX Runtime (once), checks the stored file's SHA-256 and creates the session. */
  function session() {
    if (!sessionP) sessionP = (async () => {
      const ort = await import(VENDOR + 'ort.wasm.min.mjs');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: VENDOR + 'ort-wasm-simd-threaded.mjs', wasm: VENDOR + 'ort-wasm-simd-threaded.wasm' };
      ort.env.logLevel = 'error';
      const blob = await root.SlopLibraryStore.getBlob(MODEL.id + '/' + MODEL.file);
      if (!blob) throw new Error(tr('img3d.model.missing', 'The depth model is not in this browser. Get more adds it.'));
      const buf = await blob.arrayBuffer();
      const hash = await root.SlopLibraryManifest.sha256Hex(buf);
      if (buf.byteLength !== MODEL.bytes || hash !== MODEL.sha256) throw new Error(tr('img3d.model.bad_hash', 'The stored depth model failed its SHA-256 check. Remove it and get it again.'));
      const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { ort, s };
    })().catch((e) => { sessionP = null; throw e; });
    return sessionP;
  }

  /** Input size [w, h]: height 518, width keeps the aspect ratio, both multiples of 14. */
  function inputSize(W, H) {
    const h = MODEL.side, w = Math.min(2 * MODEL.side, Math.max(MODEL.multiple, Math.round(h * W / H / MODEL.multiple) * MODEL.multiple));
    return [w, h];
  }

  /** Runs the model on RGBA bytes. Resolves with the relative depth at the model's input size. */
  async function estimate(rgba, W, H, onStatus) {
    if (onStatus) onStatus(tr('img3d.model.loading', 'Loading the depth model…'));
    const { ort, s } = await session();
    const [w, h] = inputSize(W, H);
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.putImageData(new ImageData(new Uint8ClampedArray(rgba), W, H), 0, 0);
    const small = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const sx = small.getContext('2d', { willReadFrequently: true });
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(cv, 0, 0, w, h);
    const px = sx.getImageData(0, 0, w, h).data, plane = w * h;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) input[c * plane + i] = (px[i * 4 + c] / 255 - MODEL.mean[c]) / MODEL.std[c];
    if (onStatus) onStatus(tr('img3d.model.estimating', 'Estimating depth on this device…'));
    const out = await s.run({ [MODEL.input]: new ort.Tensor('float32', input, [1, 3, h, w]) });
    const res = out[MODEL.output], dims = res.dims;
    const data = Float32Array.from(res.data);
    return { data, w: dims[dims.length - 1], h: dims[dims.length - 2] };
  }

  ns.depth = { MODEL, installed, estimate, inputSize };
})(typeof window !== 'undefined' ? window : globalThis);
