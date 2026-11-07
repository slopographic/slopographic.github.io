// SlopCutoutRuntime (shared/cutout/runtime.js, with shared/cutout/memory.js and models.js) driven by a fake ONNX Runtime:
// the configuration each start gets, the retry when session creation throws RangeError: Out of memory (a fresh ORT copy,
// plain-memory glue and wasm), the fall back to the smallest model, and the final low-memory error.
// Run with: node --test tests/node/cutout-runtime.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['memory.js', 'models.js', 'runtime.js']) await import(path.join(ROOT, 'shared/cutout', f));
const { SlopCutoutRuntime: RT, SlopCutoutModels: M } = globalThis;
const VENDOR = path.join(ROOT, 'vendor/onnxruntime-web/');
const TINY_WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).buffer;
const OOM = 'no available backend found. ERR: [wasm] RangeError: Out of memory';

/** A fake ORT world: fail(start, model) decides whether InferenceSession.create throws (start = 0, 1, ... per import). */
function world({ fail = () => false, gpu = false, ios = false } = {}) {
  const log = { imports: [], creates: [], texts: [], released: [] };
  const cfg = { vendor: 'https://x/vendor/', models: 'https://x/models/', sources: null, ios };
  const rt = RT.create({
    cfg, models: M, gpuOK: async () => gpu,
    fetchText: async (url) => { log.texts.push(url); return readFileSync(VENDOR + url.split('/').pop(), 'utf8'); },
    fetchCached: async (url) => ({ buffer: url.endsWith('.wasm') ? TINY_WASM : new ArrayBuffer(4), cached: true }),
    importModule: async (url) => {
      const start = log.imports.length, ort = { env: { wasm: {} } };
      log.imports.push(url);
      ort.InferenceSession = { create: async (buf, opts) => {
        const model = M.ids.find((id) => log.pendingModel === id) || '?';
        log.creates.push({ start, eps: opts.executionProviders.join(','), threads: ort.env.wasm.numThreads, mjs: ort.env.wasm.wasmPaths.mjs });
        if (fail(start, model, opts)) throw new Error(OOM);
        return { inputNames: ['in'], outputNames: ['out'], release: async () => { log.released.push(start + ':' + model); } };
      } };
      return ort;
    },
  });
  return { rt, log, cfg };
}
// the fake reads which model a session is for from the model file's progress callback
const progressFor = (log) => (p) => { if (p.phase === 'init') log.pendingModel = p.model; };

test('desktop: one start with the shipped files, no patching, no retry (the fast path is untouched)', async () => {
  const { rt, log } = world();
  const s = await rt.session('quality', progressFor(log));
  assert.equal(s.model, 'quality');
  assert.equal(s.backend, 'wasm');
  assert.equal(s.light, false);
  assert.deepEqual(log.imports, ['https://x/vendor/ort.wasm.min.mjs']);
  assert.equal(log.creates[0].mjs, 'https://x/vendor/ort-wasm-simd-threaded.mjs');
  assert.deepEqual(log.texts, [], 'nothing is fetched to patch');
  assert.equal(await rt.session('quality'), s, 'one session per model');
});

test('desktop with WebGPU: the full build and the webgpu provider', async () => {
  const { rt, log } = world({ gpu: true });
  const s = await rt.session('fast', progressFor(log));
  assert.equal(s.backend, 'webgpu');
  assert.deepEqual(log.imports, ['https://x/vendor/ort.min.mjs']);
  assert.equal(log.creates[0].eps, 'webgpu,wasm');
});

test('iOS: plain memory from the start (patched glue as a Blob URL), one thread', async () => {
  const { rt, log } = world({ ios: true });
  const s = await rt.session('fast', progressFor(log));
  assert.equal(s.light, true);
  assert.equal(log.creates.length, 1);
  assert.match(log.creates[0].mjs, /^blob:/);
  assert.equal(log.creates[0].threads, 1);
  assert.deepEqual(log.texts, ['https://x/vendor/ort-wasm-simd-threaded.mjs']);
});

test('RangeError: Out of memory on the first create → a fresh ORT copy with plain memory, same model', async () => {
  const { rt, log } = world({ fail: (start) => start === 0 });
  const s = await rt.session('quality', progressFor(log));
  assert.equal(s.model, 'quality');
  assert.equal(s.light, true);
  assert.equal(log.imports.length, 2);
  assert.match(log.imports[1], /^blob:/, 'a new module instance (ORT keeps a failed start)');
  assert.match(log.creates[1].mjs, /^blob:/);
  assert.equal(rt.light, true);
  // a later model starts light at once
  await rt.session('portrait', progressFor(log));
  assert.equal(log.creates.length, 3);
  assert.match(log.creates[2].mjs, /^blob:/);
});

test('the asked model never fits → the smallest model runs instead; nothing fits → code low-memory', async () => {
  const a = world({ fail: (start, model) => model !== 'fast' });
  const s = await a.rt.session('quality', progressFor(a.log));
  assert.equal(s.model, 'fast');
  assert.equal(a.log.creates.length, 3, 'planned, light, light + fast');
  const b = world({ fail: () => true, ios: true });
  await assert.rejects(b.rt.session('portrait', progressFor(b.log)), (e) => e.code === 'low-memory');
  assert.equal(b.log.creates.length, 2, 'light, light + fast');
  // a failed session is forgotten: the next call tries again
  await assert.rejects(b.rt.session('portrait', progressFor(b.log)), (e) => e.code === 'low-memory');
  assert.equal(b.log.creates.length, 4);
});

test('another error is not retried', async () => {
  const { rt, log } = world({ fail: () => { throw new Error('Download failed (404)'); } });
  await assert.rejects(rt.session('fast', progressFor(log)), /Download failed/);
  assert.equal(log.creates.length, 1);
});

test('lighter(): a model pass out of memory frees the sessions and starts over light', async () => {
  const { rt, log } = world();
  await rt.session('quality', progressFor(log));
  const s = await rt.lighter('quality', progressFor(log));
  assert.equal(s.light, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log.released, ['0:quality'], 'the old session is released');
  assert.deepEqual(rt.loaded(), ['quality']);
});

test('ORT that cannot build a session in this browser (iOS 16.4) → code unavailable after the light start, not a raw error', async () => {
  const { rt, log } = world({ fail: () => { throw new Error("Can't create a session. ERROR_CODE: 1, ERROR_MESSAGE: Could not find OrtValue with name '1000'"); } });
  await assert.rejects(rt.session('fast', progressFor(log)), (e) => e.code === 'unavailable');
  assert.equal(log.creates.length, 2, 'the shipped start, then a fresh light one');
  assert.match(log.creates[1].mjs, /^blob:/);
});

test('iOS / iPadOS before 17: code unavailable at once, nothing imported or downloaded; iOS 17 starts as before', async () => {
  const { rt, log, cfg } = world({ ios: true });
  cfg.ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  await assert.rejects(rt.session('quality', progressFor(log)), (e) => e.code === 'unavailable' && /iOS/.test(e.message));
  assert.deepEqual(log.imports, []);
  assert.deepEqual(log.texts, []);
  assert.deepEqual(rt.loaded(), []);
  cfg.ua = 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const s = await rt.session('fast', progressFor(log));
  assert.equal(s.light, true);
  assert.equal(log.imports.length, 1);
});
