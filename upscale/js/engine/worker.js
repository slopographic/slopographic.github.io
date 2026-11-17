/* Slop Upscale worker: runs ONNX Runtime Web and the per-tile work off the page. Classic worker: importScripts for the
 * helpers, import() for ONNX Runtime's ES module. WebAssembly only, one thread (the site has no SharedArrayBuffer).
 * Protocol (every message carries id):
 *   page   → { id, type: 'load', model, bytes? }                   bytes: the model file when it is not bundled (verified here)
 *          → { id, type: 'tile', model|null, w, h, scale, rgba }  rgba: the padded tile, w×h RGBA (transferred)
 *   worker → { id, type: 'loaded', model }
 *          → { id, type: 'tile', w, h, rgba }                     w*scale × h*scale RGBA (transferred)
 *          → { id, type: 'error', message }
 * model null = Lanczos only (no network). Luma models (FSRCNN) run on Y; their colour is the Lanczos colour with the
 * network's luminance put in place of the Lanczos luminance, so the colour does not shift. */
/* global importScripts, self, SlopCutoutLoader, SlopUpscaleLanczos, SlopUpscaleModels */
'use strict';
importScripts('../../../shared/cutout/loader.js', '../core/lanczos.js', '../core/models.js');
const L = self.SlopCutoutLoader, LZ = self.SlopUpscaleLanczos, M = self.SlopUpscaleModels;
const ROOT = new URL('../../../', self.location.href).href;
const ORT = ROOT + 'vendor/onnxruntime-web/';
let ortp = null;
const sessions = new Map();

/** ONNX Runtime Web, the WebAssembly-only build, with its wasm taken from the same cache the background remover uses. */
function ort() {
  if (!ortp) ortp = (async () => {
    const o = await import(ORT + 'ort.wasm.min.mjs');
    o.env.wasm.numThreads = 1;
    o.env.wasm.proxy = false;
    o.env.logLevel = 'error';
    o.env.wasm.wasmPaths = { mjs: ORT + 'ort-wasm-simd-threaded.mjs', wasm: ORT + 'ort-wasm-simd-threaded.wasm' };
    const bin = await L.fetchCached(ORT + 'ort-wasm-simd-threaded.wasm', {});
    o.env.wasm.wasmBinary = bin.buffer;
    return o;
  })().catch((e) => { ortp = null; throw e; });
  return ortp;
}

async function sha256Hex(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

/** The session for a model: from the bytes sent (opt-in models) or the bundled file (checked against its hash). */
async function session(id, bytes) {
  if (sessions.has(id)) return sessions.get(id);
  const m = M.get(id);
  if (!m) throw new Error('Unknown model ' + id);
  const o = await ort();
  let buf;
  if (bytes) {
    if (bytes.byteLength !== m.bytes || (await sha256Hex(bytes)) !== m.sha256) throw new Error(`${m.name}: the file does not match its checksum`);
    buf = bytes;
  } else if (m.bundled) {
    buf = (await L.fetchCached(ROOT + m.path, { sha256: m.sha256, bytes: m.bytes })).buffer;
  } else {
    throw new Error(`${m.name} is not installed. Get it from Get more first.`);
  }
  const s = await o.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const entry = { s, o, m };
  sessions.set(id, entry);
  return entry;
}

/** Runs the network on one padded tile. Returns RGBA at scale. */
async function infer(entry, rgba, w, h, scale) {
  const { s, o, m } = entry;
  const ow = w * scale, oh = h * scale, n = w * h, on = ow * oh;
  const out = new Uint8ClampedArray(on * 4);
  if (m.channels === 'rgb') {
    const x = new Float32Array(3 * n);
    for (let p = 0; p < n; p++) { x[p] = rgba[p * 4] / 255; x[n + p] = rgba[p * 4 + 1] / 255; x[2 * n + p] = rgba[p * 4 + 2] / 255; }
    const res = await s.run({ [s.inputNames[0]]: new o.Tensor('float32', x, [1, 3, h, w]) });
    const y = res[s.outputNames[0]].data;
    for (let p = 0; p < on; p++) {
      out[p * 4] = y[p] * 255; out[p * 4 + 1] = y[on + p] * 255; out[p * 4 + 2] = y[2 * on + p] * 255; out[p * 4 + 3] = 255;
    }
    return out;
  }
  // luma: the network sees Y only; colour stays Lanczos, its luminance is replaced by the network's
  const base = LZ.resizeRGBA(rgba, w, h, ow, oh);
  const x = new Float32Array(n);
  for (let p = 0; p < n; p++) x[p] = (0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]) / 255;
  const res = await s.run({ [s.inputNames[0]]: new o.Tensor('float32', x, [1, 1, h, w]) });
  const y = res[s.outputNames[0]].data;
  for (let p = 0; p < on; p++) {
    const q = p * 4;
    const lum = (0.299 * base[q] + 0.587 * base[q + 1] + 0.114 * base[q + 2]) / 255;
    const d = (y[p] - lum) * 255;
    out[q] = base[q] + d; out[q + 1] = base[q + 1] + d; out[q + 2] = base[q + 2] + d; out[q + 3] = base[q + 3];
  }
  return out;
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'load') {
      await session(msg.model, msg.bytes ? new Uint8Array(msg.bytes) : null);
      self.postMessage({ id: msg.id, type: 'loaded', model: msg.model });
    } else if (msg.type === 'tile') {
      const { w, h, scale } = msg, rgba = new Uint8ClampedArray(msg.rgba);
      let out;
      if (!msg.model) out = LZ.resizeRGBA(rgba, w, h, w * scale, h * scale);
      else out = await infer(await session(msg.model, null), rgba, w, h, scale);
      self.postMessage({ id: msg.id, type: 'tile', w: w * scale, h: h * scale, rgba: out.buffer }, [out.buffer]);
    } else {
      throw new Error('Unknown message ' + msg.type);
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: 'error', message: (err && err.message) || String(err) });
  }
};
