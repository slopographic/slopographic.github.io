// SlopCutoutMemory (shared/cutout/memory.js): the ONNX Runtime configuration chosen from the environment, the retries on
// out-of-memory, and the plain-memory patches of the vendored glue and wasm that let iOS 16/17 (which refuse ORT's 4 GB
// shared memory with "RangeError: Out of memory") run the background remover. Run with: node --test tests/node/cutout-memory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
await import(path.join(ROOT, 'shared/cutout/memory.js'));
const MEM = globalThis.SlopCutoutMemory;
const VENDOR = path.join(ROOT, 'vendor/onnxruntime-web/');
const plain = (o) => JSON.parse(JSON.stringify(o));
const LIGHT = { backend: 'wasm', sharedMemory: false, numThreads: 1, proxy: false };

test('plan(): desktop keeps the shipped fast path; iOS or a refused shared memory gets a plain one; threads only when isolated', () => {
  assert.deepEqual(MEM.plan({ gpu: true, sharedMemory: true, cores: 8 }), { backend: 'webgpu', sharedMemory: true, numThreads: 1, proxy: false });
  assert.deepEqual(MEM.plan({ gpu: false, sharedMemory: true, cores: 8 }), { backend: 'wasm', sharedMemory: true, numThreads: 1, proxy: false });
  assert.deepEqual(MEM.plan({ gpu: false, sharedMemory: true, crossOriginIsolated: true, cores: 8 }), { backend: 'wasm', sharedMemory: true, numThreads: 4, proxy: false });
  assert.deepEqual(MEM.plan({ ios: true, crossOriginIsolated: true, cores: 6 }), LIGHT, 'iOS: plain memory, one thread');
  assert.deepEqual(MEM.plan({ sharedMemory: false, crossOriginIsolated: true, cores: 16 }), LIGHT, 'the probe said no');
  assert.deepEqual(MEM.plan({ ios: true, gpu: true }), { ...LIGHT, backend: 'webgpu' }, 'WebGPU stays when there is an adapter');
  assert.deepEqual(MEM.plan(), { backend: 'wasm', sharedMemory: true, numThreads: 1, proxy: false });
});

test('attempts(): planned, then light, then light with the smallest model; nothing twice', () => {
  const desk = { gpu: true, sharedMemory: true };
  assert.deepEqual(plain(MEM.attempts('quality', desk)), [
    { config: MEM.plan(desk), model: 'quality' }, { config: LIGHT, model: 'quality' }, { config: LIGHT, model: 'fast' }]);
  assert.deepEqual(plain(MEM.attempts('quality', { ios: true })), [{ config: LIGHT, model: 'quality' }, { config: LIGHT, model: 'fast' }]);
  assert.deepEqual(plain(MEM.attempts('fast', { ios: true })), [{ config: LIGHT, model: 'fast' }]);
  assert.deepEqual(plain(MEM.attempts('portrait', desk, { light: true })), [{ config: LIGHT, model: 'portrait' }, { config: LIGHT, model: 'fast' }]);
});

test('isLowMemory(): the errors WebKit and ORT give when memory runs out, and nothing else', () => {
  for (const m of ['no available backend found. ERR: [wasm] RangeError: Out of memory', 'RangeError: Out of memory', 'Aborted(OOM)', 'std::bad_alloc',
    'Cannot enlarge memory arrays', 'could not allocate memory']) assert.ok(MEM.isLowMemory(new Error(m)), m);
  assert.ok(MEM.isLowMemory(new RangeError('Out of memory')));
  assert.ok(MEM.isLowMemory(Object.assign(new Error('x'), { code: 'low-memory' })));
  for (const m of ['Maximum call stack size exceeded', 'Download failed (404)', 'Checksum mismatch', 'room for more']) assert.ok(!MEM.isLowMemory(new Error(m)), m);
  assert.ok(!MEM.isLowMemory(null));
});

test('withRetry(): a factory that throws RangeError first succeeds on the lighter attempt', async () => {
  const list = MEM.attempts('quality', { gpu: true, sharedMemory: true }), seen = [], retried = [];
  const r = await MEM.withRetry(list, async (a, i) => {
    seen.push(i);
    if (i === 0) throw new RangeError('Out of memory');
    return { model: a.model, light: !a.config.sharedMemory };
  }, (e, a, i) => retried.push([e.message, i]));
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(retried, [['Out of memory', 0]]);
  assert.deepEqual(r.value, { model: 'quality', light: true });
  assert.equal(r.index, 1);
});

test('withRetry(): every attempt out of memory → code low-memory (the smallest model was tried); another error stops at once', async () => {
  const list = MEM.attempts('quality', { ios: true }), tried = [];
  await assert.rejects(MEM.withRetry(list, async (a) => { tried.push(a.model); throw new Error('no available backend found. ERR: [wasm] RangeError: Out of memory'); }),
    (e) => e.code === 'low-memory' && /Out of memory/.test(e.message) && /RangeError/.test(e.cause.message));
  assert.deepEqual(tried, ['quality', 'fast']);
  let n = 0;
  await assert.rejects(MEM.withRetry(list, async () => { n++; throw new Error('Download failed (404)'); }), (e) => e.message === 'Download failed (404)' && !e.code);
  assert.equal(n, 1);
});

test('an ORT that cannot build a session (iOS 16.4: allocation planner) is retried light, then gives code unavailable', async () => {
  const planner = "Can't create a session. ERROR_CODE: 1, ERROR_MESSAGE: allocation_planner.cc:237 Could not find OrtValue with name '1000'";
  assert.ok(MEM.isEngineFailure(new Error(planner)));
  assert.ok(MEM.isEngineFailure(new Error('no available backend found. ERR: [wasm] RangeError: Out of memory')));
  assert.ok(!MEM.isEngineFailure(new Error('Download failed (404)')));
  const tried = [];
  await assert.rejects(MEM.withRetry(MEM.attempts('fast', {}), async (a) => { tried.push(a.config.sharedMemory); throw new Error(planner); }),
    (e) => e.code === 'unavailable' && /cannot start/.test(e.message));
  assert.deepEqual(tried, [true, false], 'the shipped start, then the light one');
  // one attempt out of memory, the next unable to start: the device is low on memory
  let i = 0;
  await assert.rejects(MEM.withRetry(MEM.attempts('fast', {}), async () => { throw new Error(i++ ? planner : 'RangeError: Out of memory'); }), (e) => e.code === 'low-memory');
});

test('patchGlue(): both vendored glues lose their shared memories and the mailbox waitAsync; an unknown glue is refused', () => {
  for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.jsep.mjs']) {
    const src = readFileSync(VENDOR + f, 'utf8'), out = MEM.patchGlue(src);
    assert.match(src, /new WebAssembly\.Memory\(\{initial:256,maximum:65536,shared:!0\}\)/, f + ' ships the 4 GB shared memory');
    assert.ok(!out.includes('shared:!0'), f);
    assert.ok(out.includes('new WebAssembly.Memory({initial:256,maximum:65536})'), f);
    assert.ok(out.includes('globalThis.SharedArrayBuffer??class{}'), f);
    assert.ok(!/=!Atomics\.waitAsync\|\|/.test(out), f);
    assert.ok(Math.abs(out.length - src.length) < 200, f + ': only those places change');
  }
  assert.throws(() => MEM.patchGlue('export default function(){}'), /glue changed/);
});

// A module that imports a shared memory "a"."m" (1 page) and reads it with i32.atomic.load: what ORT's wasm does.
const ATOMIC = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 5, 1, 0x60, 0, 1, 0x7f, 2, 9, 1, 1, 0x61, 1, 0x6d, 2, 3, 1, 1,
  3, 2, 1, 0, 7, 5, 1, 1, 0x66, 0, 0, 10, 10, 1, 8, 0, 0x41, 0, 0xfe, 0x10, 2, 0, 0x0b]);

test('patchWasm(): an imported shared memory becomes plain, atomics still run on it; the input is left alone', () => {
  const mem = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  assert.throws(() => new WebAssembly.Instance(new WebAssembly.Module(ATOMIC), { a: { m: mem } }), WebAssembly.LinkError);
  const before = ATOMIC.slice(), r = MEM.patchWasm(ATOMIC.buffer);
  assert.equal(r.patched, 1);
  assert.deepEqual(ATOMIC, before, 'a copy is patched');
  const inst = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(r.buffer)), { a: { m: mem } });
  new Int32Array(mem.buffer)[0] = 42;
  assert.equal(inst.exports.f(), 42);
  assert.throws(() => MEM.patchWasm(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), /Not a WebAssembly/);
});

test('patchWasm(): both vendored ORT binaries import one shared memory; patched they still validate, same length', () => {
  for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.wasm']) {
    const b = readFileSync(VENDOR + f), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    const r = MEM.patchWasm(ab);
    assert.equal(r.patched, 1, f);
    assert.equal(r.buffer.byteLength, ab.byteLength, f);
    assert.ok(WebAssembly.validate(new Uint8Array(r.buffer)), f);
  }
});

test('sharedMemoryOK() answers without throwing', () => {
  assert.equal(typeof MEM.sharedMemoryOK(), 'boolean');
});

test('tooOldForEngine(): iOS / iPadOS before 17 (by user agent, else by the engine) cannot run ORT; others can', () => {
  const UA = {
    iphone16: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
    appIphone16: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ipad17: 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ipadDesktop16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    ipadApp: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    iphone18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    chromeIos16: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0 Mobile/15E148 Safari/604.1',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
  };
  assert.equal(MEM.iosVersion(UA.iphone16), 16);
  assert.equal(MEM.iosVersion(UA.appIphone16), 16);
  assert.equal(MEM.iosVersion(UA.ipad17), 17);
  assert.equal(MEM.iosVersion(UA.ipadDesktop16), 16);
  assert.equal(MEM.iosVersion(UA.ipadApp), 0);
  assert.equal(MEM.iosVersion(UA.chromeIos16), 16);
  assert.equal(MEM.iosVersion(''), 0);
  const old = (ua, ios = true, modern = true) => MEM.tooOldForEngine({ ios, ua, modern });
  assert.ok(old(UA.iphone16));
  assert.ok(old(UA.appIphone16));
  assert.ok(old(UA.ipadDesktop16));
  assert.ok(old(UA.chromeIos16));
  assert.ok(!old(UA.ipad17, true, false), 'the user agent wins over the engine probe');
  assert.ok(!old(UA.iphone18));
  assert.ok(!old(UA.ipadApp), 'no version named: an engine with iOS 17 JavaScript runs');
  assert.ok(old(UA.ipadApp, true, false), 'no version named: an engine without it is iOS 16');
  assert.ok(!old(UA.mac, false), 'a Mac (Safari 16 runs ORT) is never refused');
  assert.ok(!MEM.tooOldForEngine(null));
  assert.equal(MEM.modernEngine(), true, 'Node has the RegExp v flag');
});
