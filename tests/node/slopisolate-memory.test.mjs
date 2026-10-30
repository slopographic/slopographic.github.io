// SlopIsolate's memory while painting Keep / Remove (a TestFlight tester on an iPhone 15 Pro: "when I remove and drag,
// after ~10 seconds it crashes"; iOS ended the page for memory and the app reloaded). Each finger move dropped the
// cut-out's canvas, so every repaint made a new full-size one (and its half-size levels, and the tint's), several 12 MP
// canvases a frame. Now: one undo step per stroke, undo bytes capped, the cut-out canvas kept and updated in the
// changed rect only, one repaint per frame however many moves came in it.
// The browser files run unchanged in a vm context. Run with: node --test tests/node/slopisolate-memory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (ctx, f) => vm.runInContext(readFileSync(path.join(ROOT, 'slopisolate', 'js', f), 'utf8'), ctx, { filename: f });

/** A context with brush, history, compose and process; canvases are stand-ins that count themselves. */
function app() {
  const events = [], frames = [], canvases = [], puts = [];
  const ctx = { console, JSON, Object, Array, Set, Map, Math, Uint8ClampedArray, Uint8Array, setTimeout, clearTimeout };
  ctx.window = ctx;
  ctx.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  vm.createContext(ctx);
  const canvas = (w, h) => {
    const c = { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
    const g = { putImageData: (...a) => puts.push(a.slice(1)), drawImage() {}, clearRect() {}, setTransform() {}, fillRect() {} };
    c.getContext = () => g;
    canvases.push(c);
    return c;
  };
  const U = { canvas, ctx: (c) => c.getContext(), debounce: (fn) => Object.assign((...a) => fn(...a), { flush: fn, cancel() {} }), isIOS: true };
  ctx.CO = { util: U, emit: (type, data) => events.push([type, data]), on: () => () => {} };
  ctx.CO.state = { items: [], activeId: null, get: () => null, current: () => null, modelOf: () => 'fast', setStatus() {} };
  ctx.SlopCutout = { finish: async () => null, release: async () => {} };
  for (const f of ['core/brush.js', 'core/history.js', 'render/compose.js', 'io/process.js']) load(ctx, f);
  const flush = () => { const fs = frames.splice(0); fs.forEach((fn) => fn()); return fs.length; };
  return { CO: ctx.CO, events, canvases, puts, flush };
}
const item = (w, h) => ({ id: 'a', w, h, hist: { undo: [], redo: [] }, base: new Uint8ClampedArray(w * h).fill(200), s: { threshold: 0.5, softness: 1 } });

test('a stroke of many moves is one undo step, holding only the tiles it touched', () => {
  const { CO } = app();
  const it = item(512, 512), st = CO.brush.begin(it, 'remove');
  CO.brush.line(st, 10, 10, 10, 10, 8, 1);
  for (let i = 1; i <= 300; i++) CO.brush.line(st, 10 + i, 10, 10 + i + 1, 10, 8, 1);   // 300 moves
  CO.history.push(it, CO.brush.end(st));
  assert.equal(it.hist.undo.length, 1);
  const bytes = CO.history.bytes(it);
  assert.ok(bytes > 0 && bytes <= 6 * 64 * 64, `${bytes} bytes for a short stroke`);
  CO.history.undo(it);
  assert.ok(it.edit.every((v) => v === 128));   // undo restores exactly
});

test('undo memory is bounded by bytes: the oldest strokes go, the newest stays and still undoes', () => {
  const { CO } = app();
  const it = item(128, 128);
  CO.history.maxBytes = 3 * 128 * 128;
  for (let n = 0; n < 7; n++) {   // each stroke covers the whole picture: 16 KB of tiles
    const st = CO.brush.begin(it, n % 2 ? 'keep' : 'remove');
    for (let y = 0; y < 128; y += 64) CO.brush.line(st, 0, y, 127, y, 48, 1);
    CO.history.push(it, CO.brush.end(st));
    assert.ok(CO.history.bytes(it) <= CO.history.maxBytes, `after stroke ${n + 1}: ${CO.history.bytes(it)} bytes`);
  }
  assert.ok(it.hist.undo.length >= 2 && it.hist.undo.length <= 3);
  const before = it.edit.slice();
  CO.history.undo(it);
  assert.notDeepEqual(it.edit, before);
  CO.history.redo(it);
  assert.deepEqual(it.edit, before);
  CO.history.maxBytes = 1;   // one step larger than the cap is still kept: the last stroke can always be undone
  const st = CO.brush.begin(it, 'keep');
  CO.brush.line(st, 5, 5, 50, 50, 10, 1);
  CO.history.push(it, CO.brush.end(st));
  assert.equal(it.hist.undo.length, 1);
  assert.ok(CO.history.maxBytes > 0);
});

test('the phone cap is smaller than a desktop one and leaves room for a few full-picture strokes', () => {
  const { CO } = app();
  assert.ok(CO.history.maxBytes >= 16 * 1048576 && CO.history.maxBytes <= 64 * 1048576, String(CO.history.maxBytes));
});

test('painting: one cut-out canvas for the whole stroke, updated in the changed rect, one repaint per frame', () => {
  const { CO, events, canvases, puts, flush } = app();
  const w = 400, h = 300, it = item(w, h);
  const act = { item: it, w, h, jobId: 1, mask: new Uint8ClampedArray(w * h).fill(255), cutout: { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h }, cut: null, rev: 0 };
  CO.process.active = act;
  const c0 = CO.compose.cutCanvas(act);
  assert.equal(canvases.length, 1);
  assert.deepEqual(puts.pop(), [0, 0]);   // the first time: all of it
  const st = CO.brush.begin(it, 'remove');
  let x = 50;
  for (let frame = 0; frame < 20; frame++) {
    for (let move = 0; move < 4; move++, x += 3) CO.process.live(it, CO.brush.line(st, x, 100, x + 3, 100, 6, 1));   // 4 moves a frame
    assert.equal(events.filter(([t]) => t === 'active').length, frame);
    assert.equal(flush(), 1);
    assert.equal(events.filter(([t]) => t === 'active').length, frame + 1);
    assert.equal(CO.compose.cutCanvas(act), c0);
    const p = puts.pop();
    assert.equal(p.length, 6);   // a dirty rect, never the whole picture
    assert.ok(p[4] < 30 && p[5] < 20, `rect ${p}`);
  }
  assert.equal(canvases.length, 1);
  assert.equal(act.mask[100 * w + 60], 0);   // the brush removed there
  CO.compose.touch(act, null);   // the worker's full result: the same canvas, all of it
  assert.equal(CO.compose.cutCanvas(act), c0);
  assert.deepEqual(puts.pop(), [0, 0]);
});

test('a look drawn again reuses the canvas it is given when the size fits', () => {
  const { CO, canvases } = app();
  const w = 64, h = 48, it = Object.assign(item(w, h), { bg: { mode: 'color', color: '#ffffff' }, shadow: { on: false }, crop: { mode: 'original' } });
  const act = { item: it, w, h, cutout: { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }, cut: null, rev: 0 };
  const a = CO.compose.render(it, act), n = canvases.length;
  assert.equal(CO.compose.render(it, act, a), a);
  assert.equal(canvases.length, n);
});
