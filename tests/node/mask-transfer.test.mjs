// SlopMaskTransfer: alpha ↔ mask ↔ layer-mask pixels (shared/cutout/mask-transfer.js), loaded in a vm context so
// the browser file runs unchanged. Run with: node tests/run.mjs mask-transfer
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
vm.runInContext(readFileSync(path.join(ROOT, 'shared', 'cutout', 'mask-transfer.js'), 'utf8'), ctx, { filename: 'mask-transfer.js' });
const MT = ctx.SlopMaskTransfer;
const bytes = (a) => Array.from(a);

// A 3×2 cut-out: opaque subject in the top row, a half-transparent pixel and transparent corners below.
const W = 3, H = 2;
const rgba = new Uint8ClampedArray([
  10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  1, 2, 3, 128, 4, 5, 6, 0, 7, 8, 9, 0,
]);
const mask = Uint8ClampedArray.from([255, 255, 255, 128, 0, 0]);

test('fromAlpha reads the alpha channel as a mask', () => {
  assert.deepEqual(bytes(MT.fromAlpha(rgba, W, H)), bytes(Uint8ClampedArray.from([255, 255, 255, 128, 0, 0])));
});

test('toAlpha writes black pixels whose alpha is the mask value', () => {
  const px = MT.toAlpha(mask);
  assert.equal(px.length, W * H * 4);
  for (let i = 0; i < mask.length; i++) {
    assert.deepEqual(bytes(px.subarray(i * 4, i * 4 + 3)), [0, 0, 0]);
    assert.equal(px[i * 4 + 3], mask[i]);
  }
});

test('alpha → mask → alpha round trip keeps every value', () => {
  const back = MT.fromAlpha(MT.toAlpha(MT.fromAlpha(rgba, W, H)), W, H);
  assert.deepEqual(bytes(back), bytes(MT.fromAlpha(rgba, W, H)));
});

test('the grey mask image round-trips through fromGrey', () => {
  assert.deepEqual(bytes(MT.fromGrey(MT.toGrey(mask))), bytes(mask));
  assert.equal(MT.toGrey(mask)[3], 255, 'the grey image is opaque');
});

test('applyAlpha multiplies the existing alpha and keeps colour', () => {
  const out = MT.applyAlpha(rgba, mask);
  assert.deepEqual(bytes(out.subarray(0, 3)), [10, 20, 30]);
  assert.equal(out[3], 255);
  assert.equal(out[4 * 3 + 3], Math.round(128 * 128 / 255)); // half-transparent pixel under a half mask
  assert.equal(out[5 * 4 + 3], 0);
  assert.equal(rgba[3], 255, 'the input is not changed');
});

test('a mask made from the alpha reproduces the cut-out when applied again', () => {
  const m = MT.fromAlpha(rgba, W, H);
  const again = MT.applyAlpha(new Uint8ClampedArray(rgba.map((v, i) => (i % 4 === 3 ? 255 : v))), m);
  for (let i = 0; i < W * H; i++) assert.ok(Math.abs(again[i * 4 + 3] - rgba[i * 4 + 3]) <= 1);
});
