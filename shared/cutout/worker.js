/* SlopCutout worker: runs ONNX Runtime Web and the full pre/post-processing off the main thread.
 * Classic worker (importScripts for the pipeline, dynamic import() for ONNX Runtime's ES module).
 * Backend: WebGPU when available (full build), else single-thread WebAssembly SIMD (wasm-only build).
 * No COOP/COEP on the site → no SharedArrayBuffer → numThreads = 1, proxy off. Starting ORT and the retries when a device
 * runs out of memory (iOS 16/17 refuse ORT's 4 GB shared memory): runtime.js and memory.js.
 * Protocol (all messages carry id): main → { type: 'init'|'load'|'segment'|'finish'|'release'|'cached'|'info'|'ping'|'fail', … }
 *                                   worker → { id, type: 'progress', data } | { id, type: 'done', data } | { id, type: 'error', message, code }. */
/* global importScripts */
'use strict';
importScripts('pipeline.js', 'refine.js', 'models.js', 'loader.js', 'memory.js', 'runtime.js');
const P = self.SlopCutoutPipeline, M = self.SlopCutoutModels, L = self.SlopCutoutLoader, MEM = self.SlopCutoutMemory;
const cfg = { vendor: new URL('../../vendor/onnxruntime-web/', self.location.href).href, models: new URL('../../vendor/models/', self.location.href).href, backend: 'auto', sources: null, ios: false };
const jobs = new Map();
/** One model pass at a time in this worker: segment messages are async, so two can be in flight here, and a session
 *  must not run twice at once (the WebGPU backend's run is asynchronous and shares its buffers between runs). */
let gate = Promise.resolve();
function exclusive(fn) { const p = gate.then(fn, fn); gate = p.catch(() => {}); return p; }
const send = (id, type, data, transfer) => self.postMessage({ id, type, data }, transfer || []);

/* ---------- ONNX Runtime ---------- */
async function gpuOK() {
  if (cfg.backend === 'wasm' || !self.navigator || !navigator.gpu) return false;
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) return false;
    const info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {}) || {};
    // A software adapter (SwiftShader, llvmpipe) is far slower than WebAssembly: skip it.
    if (a.isFallbackAdapter || info.isFallbackAdapter) return false;
    return !/swiftshader|llvmpipe|software|basic render/i.test([info.vendor, info.architecture, info.device, info.description].join(' '));
  } catch (e) { return false; }
}
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Download failed (' + r.status + ') for ' + url.split('/').pop());
  return r.text();
}
/** A source URL: the vendored file, or a Blob URL from an offline single-file build. */
const src = (base, file) => (cfg.sources && cfg.sources[file]) || base + file;
const RT = self.SlopCutoutRuntime.create({ cfg, models: M, fetchCached: L.fetchCached, importModule: (u) => import(u), fetchText, gpuOK });

/* ---------- images ---------- */
function pixels(img) {
  if (img && img.data && img.width) return { W: img.width, H: img.height, rgba: new Uint8ClampedArray(img.data.buffer || img.data) };
  const W = img.width, H = img.height, c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  if (img.close) img.close();
  return { W, H, rgba: x.getImageData(0, 0, W, H).data };
}

/** Run the model on rgba and return the low-res mask (Float32 0..1) and its size. */

/** Run the model on rgba and return the low-res mask (Float32 0..1) and its size. The session may run a smaller model
 *  than asked for (a device low on memory): its .model is the one used, and the input is made for that one. */
async function infer(modelId, rgba, W, H, progress) {
  let s = await RT.session(modelId, progress), t0 = 0, out = null, tensor = null;
  const pass = async () => {
    const m = M.get(s.model), [tw, th] = M.inputSize(m, W, H);
    progress({ phase: 'infer', model: m.id });
    const small = P.resizeRGBA(rgba, W, H, tw, th);
    tensor = new s.ort.Tensor('float32', P.toTensor(small, tw, th, m), [1, 3, th, tw]);
    t0 = performance.now();
    try { return await exclusive(() => s.run({ [s.inputNames.includes(m.input) ? m.input : s.inputNames[0]]: tensor })); }
    finally { if (tensor.dispose) tensor.dispose(); tensor = null; }
  };
  try {
    out = await pass();
    if (s.backend === 'webgpu') { const d = out[s.outputNames[0]].data; for (let i = 0; i < d.length; i += 97) if (!Number.isFinite(d[i])) throw new Error('non-finite output'); }
  } catch (e) {
    if (MEM.isLowMemory(e)) {   // the pass itself did not fit: start over light (and smaller)
      console.warn('SlopCutout: out of memory in a model pass, retrying lighter:', e.message || e);
      s = await RT.lighter(modelId, progress);
    } else if (s.backend === 'webgpu') {
      console.warn('SlopCutout: WebGPU run failed, retrying on WebAssembly:', e.message);
      s = await RT.wasmSession(modelId, progress);
    } else throw e;
    try { out = await pass(); }
    catch (e2) { if (!MEM.isLowMemory(e2)) throw e2; const err = new Error('Not enough memory for the background remover on this device'); err.code = 'low-memory'; throw err; }
  }
  const ms = performance.now() - t0, m = M.get(s.model);
  const res = out[s.outputNames[0]], dims = res.dims, low = new Float32Array(res.data);
  if (res.dispose) res.dispose();
  if (m.minMax) P.minMax(low); else for (let i = 0; i < low.length; i++) low[i] = P.clamp(low[i], 0, 1);
  return { low, mw: dims[dims.length - 1], mh: dims[dims.length - 2], ms, model: m.id, backend: s.backend, initMs: s.initMs, cached: s.cached, light: !!s.light };
}

/* ---------- handlers ---------- */
const handlers = {
  ping(d, progress) { for (let i = 1; i <= ((d && d.steps) || 0); i++) progress({ phase: 'ping', loaded: i, total: d.steps }); return { pong: d && d.value, time: Date.now() }; },
  fail: (d) => { const e = new Error((d && d.message) || 'Requested failure'); if (d && d.code) e.code = d.code; throw e; },
  init(d) { Object.assign(cfg, d || {}); return { ok: true }; },
  async info() { return { backend: RT.backend, light: RT.light, gpu: !!(self.navigator && navigator.gpu), loaded: RT.loaded(), jobs: jobs.size }; },
  async load(d, progress) { const s = await RT.session(d.model, progress); return { model: s.model, backend: s.backend, initMs: s.initMs, cached: s.cached, light: !!s.light }; },
  async cached() {
    const out = {};
    for (const id of M.ids) out[id] = await L.isCached(src(cfg.models, M.MODELS[id].file), M.MODELS[id].sha256);
    return out;
  },
  /** { image, model, jobId?, refine = true, settings } → { width, height, base, mask, cutout, timings } */
  async segment(d, progress) {
    const t0 = performance.now();
    const { W, H, rgba } = pixels(d.image);
    const r = await infer(d.model, rgba, W, H, progress);
    progress({ phase: 'refine', model: d.model });
    const t1 = performance.now();
    const base = d.refine === false ? P.plainUpsample(r.low, r.mw, r.mh, W, H) : P.guidedUpsample(rgba, W, H, r.low, r.mw, r.mh, d.guided || {});
    const fin = P.finish(rgba, W, H, base, null, d.settings || {});
    if (d.jobId != null) jobs.set(d.jobId, { rgba, W, H, base });
    const baseOut = d.jobId != null ? base.slice() : base;
    const timings = { total: performance.now() - t0, infer: r.ms, post: performance.now() - t1, init: r.initMs, backend: r.backend, cached: r.cached, light: r.light, input: M.inputSize(r.model, W, H) };
    return { result: { width: W, height: H, base: baseOut, mask: fin.mask, cutout: fin.cutout, low: d.wantLow ? r.low : null, lowSize: [r.mw, r.mh], model: r.model, asked: M.get(d.model).id, timings },
      transfer: [baseOut.buffer, fin.mask.buffer, fin.cutout.buffer] };
  },
  /** { jobId, edit?, settings, base? } → { mask, cutout } using the job's stored pixels. */
  async finish(d) {
    const j = jobs.get(d.jobId);
    if (!j) throw new Error('Unknown cutout job ' + d.jobId);
    if (d.base) j.base = new Uint8ClampedArray(d.base);
    const fin = P.finish(j.rgba, j.W, j.H, j.base, d.edit ? new Uint8ClampedArray(d.edit) : null, d.settings || {});
    return { result: { width: j.W, height: j.H, mask: fin.mask, cutout: fin.cutout }, transfer: [fin.mask.buffer, fin.cutout.buffer] };
  },
  /** { jobId, image, base } → stores pixels + an existing base mask (from an earlier segment) for finish(). */
  job(d) {
    const { W, H, rgba } = pixels(d.image), base = new Uint8ClampedArray(d.base);
    if (base.length !== W * H) throw new Error('Mask size does not match the image');
    jobs.set(d.jobId, { rgba, W, H, base });
    return { width: W, height: H };
  },
  release(d) { jobs.delete(d.jobId); return { ok: true }; },
};

self.onmessage = async (e) => {
  const { id, type, data } = e.data || {};
  const h = handlers[type];
  if (!h) { self.postMessage({ id, type: 'error', message: 'Unknown message ' + type }); return; }
  try {
    const out = await h(data, (p) => send(id, 'progress', p));
    if (out && out.transfer) send(id, 'done', out.result, out.transfer); else send(id, 'done', out);
  } catch (err) {
    // code 'low-memory': the device could not fit the model in any configuration (the page says so in its own words)
    self.postMessage({ id, type: 'error', message: (err && err.message) || String(err), code: MEM.isLowMemory(err) ? 'low-memory' : (err && err.code) || null });   // 'unavailable': ORT cannot start here
  }
};
