// SlopIsolate video: the temporal smoothing of the matte (slopisolate/js/video/smooth.js), loaded in a vm context
// so the browser file runs unchanged. Run with: node tests/run.mjs slopisolate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console, Math, Uint8ClampedArray };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'slopisolate', 'js', 'video', 'smooth.js'), 'utf8'), ctx, { filename: 'smooth.js' });
const SM = ctx.CO.video.smooth;
const arr = (xs) => new ctx.Uint8ClampedArray(xs);
const list = (a) => Array.from(a);

test('the first frame is kept as it is (no previous mask to blend with)', () => {
  const raw = arr([0, 40, 200, 255]);
  assert.deepEqual(list(SM.step(null, raw, 0.35)), [0, 40, 200, 255]);
});

test('later frames move a small weight of the way towards the new mask', () => {
  const prev = arr([0, 100, 200, 255]), raw = arr([255, 100, 0, 255]);
  // 0 + 0.35 * 255 = 89.25 -> 89 ; 100 unchanged ; 200 - 0.35 * 200 = 130 ; 255 unchanged
  assert.deepEqual(list(SM.step(prev, raw, 0.35)), [89, 100, 130, 255]);
});

test('weight 1 follows the new mask exactly, weight 0 holds the previous one', () => {
  const prev = arr([10, 20]), raw = arr([250, 0]);
  assert.deepEqual(list(SM.step(prev, raw, 1)), [250, 0]);
  assert.deepEqual(list(SM.step(prev, raw, 0)), [10, 20]);
});

test('the default weight is small (a flicker of one frame moves the edge by a fraction)', () => {
  assert.ok(SM.WEIGHT > 0 && SM.WEIGHT <= 0.5, 'WEIGHT = ' + SM.WEIGHT);
  const prev = arr([0]), raw = arr([255]);
  const once = SM.step(prev, raw, SM.WEIGHT)[0];
  assert.ok(once < 128, 'one bright frame must not flip an edge: ' + once);
});

test('a one-frame flicker decays back towards the steady mask', () => {
  // steady background at 0, a single frame at 255 at t=2, then steady again
  let state = null, seq = [];
  const frames = [0, 0, 255, 0, 0, 0, 0, 0];
  for (const v of frames) { state = SM.step(state, arr([v]), 0.35); seq.push(state[0]); }
  assert.equal(seq[1], 0);
  assert.ok(seq[2] > 0 && seq[2] < 128, 'spike is damped: ' + seq[2]);
  assert.ok(seq[seq.length - 1] < seq[2] / 2, 'and fades: ' + seq.join(','));
});

test('series() smooths a whole list and keeps the first frame', () => {
  const out = SM.series([arr([0, 255]), arr([255, 255]), arr([255, 0])], 0.5);
  assert.deepEqual(Array.from(out, list), [[0, 255], [128, 255], [192, 128]]);
});

test('out-of-range weights are clamped and the output array can be reused', () => {
  const prev = arr([0]), raw = arr([200]), out = arr([9]);
  assert.equal(SM.step(prev, raw, 5, out), out);
  assert.equal(out[0], 200);
  assert.equal(SM.step(prev, raw, -3, out)[0], 0);
});
