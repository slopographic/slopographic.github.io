// Slop Upscale: tiling and stitching (deterministic, no browser). Run: node --test tests/node/upscale-tiling.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const T = require(path.join(here, '..', '..', 'upscale', 'js', 'core', 'tiling.js'));
const LZ = require(path.join(here, '..', '..', 'upscale', 'js', 'core', 'lanczos.js'));

/** A deterministic RGBA picture W×H (values depend on position, so a misplaced pixel shows up). */
function picture(W, H) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    d[p] = (x * 37 + y * 11) & 255; d[p + 1] = (x * 5 + y * 91) & 255; d[p + 2] = (x * y + 3) & 255; d[p + 3] = 255;
  }
  return d;
}

/** Nearest-neighbour upscale of an RGBA block by an integer scale. */
function nearest(src, w, h, s) {
  const out = new Uint8ClampedArray(w * h * s * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const q = ((Math.floor(y / s)) * w + Math.floor(x / s)) * 4, p = (y * w * s + x) * 4;
    out.set(src.subarray(q, q + 4), p);
  }
  return out;
}

/** The 3×3 box filter with edge replication, over a whole picture. */
function box3(src, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
        sum += src[(yy * w + xx) * 4 + c];
      }
      out[(y * w + x) * 4 + c] = Math.round(sum / 9);
    }
    out[(y * w + x) * 4 + 3] = 255;
  }
  return out;
}

/** Runs a per-tile model over a picture and stitches the cores, the way the page does. */
function tiledRun(src, W, H, s, o, model) {
  const plan = T.plan(W, H, o);
  const dst = new Uint8ClampedArray(W * H * s * s * 4);
  const dstW = W * s;
  for (const t of plan.tiles) {
    const crop = T.cropRGBA(src, W, t.src);
    const block = model(crop, t.src.w, t.src.h, s);
    const core = T.cropRGBA(block, t.src.w * s, T.scaleRect(t.inner, s));
    T.placeRGBA(dst, dstW, core, t.core.x * s, t.core.y * s, t.core.w * s, t.core.h * s);
  }
  return dst;
}

test('cores cover the picture exactly, once, for awkward sizes', () => {
  for (const [W, H, tile, overlap] of [[100, 100, 128, 16], [300, 170, 128, 16], [257, 129, 64, 8], [1, 1, 8, 4], [513, 7, 128, 0]]) {
    const plan = T.plan(W, H, { tile, overlap });
    const hit = new Uint8Array(W * H);
    for (const t of plan.tiles) for (let y = t.core.y; y < t.core.y + t.core.h; y++) for (let x = t.core.x; x < t.core.x + t.core.w; x++) hit[y * W + x]++;
    assert.ok(hit.every((v) => v === 1), `cores must cover every pixel once for ${W}x${H}/${tile}`);
    assert.equal(plan.cols, Math.ceil(W / Math.max(8, tile)));
    assert.equal(plan.rows, Math.ceil(H / Math.max(8, tile)));
  }
});

test('the plan is deterministic and the padded source stays inside the picture', () => {
  const a = T.plan(300, 170, { tile: 128, overlap: 16 });
  const b = T.plan(300, 170, { tile: 128, overlap: 16 });
  assert.deepEqual(a, b);
  for (const t of a.tiles) {
    assert.ok(t.src.x >= 0 && t.src.y >= 0 && t.src.x + t.src.w <= 300 && t.src.y + t.src.h <= 170);
    assert.equal(t.src.x + t.inner.x, t.core.x, 'inner must point at the core');
    assert.equal(t.src.y + t.inner.y, t.core.y);
    assert.ok(t.inner.x + t.inner.w <= t.src.w && t.inner.y + t.inner.h <= t.src.h);
  }
  const mid = a.tiles.find((t) => t.col === 1 && t.row === 0);
  assert.deepEqual(mid.src, { x: 112, y: 0, w: 160, h: 144 }, 'overlap of 16 on each side, clamped at the top');
  assert.deepEqual(mid.inner, { x: 16, y: 0, w: 128, h: 128 });
});

test('a per-pixel model stitches back to the whole-picture result for any tiling', () => {
  for (const [W, H, tile, overlap, s] of [[100, 100, 128, 16], [300, 170, 128, 16], [257, 129, 64, 8], [37, 23, 8, 0], [1, 1, 8, 4], [513, 7, 128, 0], [50, 40, 16, 40], [64, 64, 20, 3]]) {
    const src = picture(W, H);
    const whole = nearest(src, W, H, s);
    const tiled = tiledRun(src, W, H, s, { tile, overlap }, nearest);
    assert.deepEqual(tiled, whole, `${W}x${H} tile ${tile} overlap ${overlap} scale ${s}`);
  }
});

test('a 3x3 filter stitches exactly with overlap 1 or more, and seams without it', () => {
  const W = 90, H = 70, s = 1;
  const src = picture(W, H);
  const whole = box3(src, W, H);
  const withOverlap = tiledRun(src, W, H, s, { tile: 32, overlap: 1 }, (crop, w, h) => box3(crop, w, h));
  assert.deepEqual(withOverlap, whole);
  const noOverlap = tiledRun(src, W, H, s, { tile: 32, overlap: 0 }, (crop, w, h) => box3(crop, w, h));
  assert.notDeepEqual(noOverlap, whole, 'without overlap the tile edges differ from the picture');
});

test('cropRGBA and placeRGBA round trip a rectangle', () => {
  const W = 9, H = 5, src = picture(W, H);
  const r = { x: 2, y: 1, w: 4, h: 3 };
  const c = T.cropRGBA(src, W, r);
  assert.equal(c.length, 4 * 3 * 4);
  const dst = new Uint8ClampedArray(W * H * 4);
  T.placeRGBA(dst, W, c, r.x, r.y, r.w, r.h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const p = (y * W + x) * 4;
    if (inside) assert.deepEqual(dst.subarray(p, p + 4), src.subarray(p, p + 4));
    else assert.equal(dst[p], 0);
  }
});

test('invalid sizes are refused', () => {
  assert.throws(() => T.plan(0, 10), RangeError);
  assert.throws(() => T.plan(10, 2.5), RangeError);
});

test('Lanczos keeps flat colour flat and its weights add up to 1', () => {
  for (const [srcLen, dstLen] of [[10, 20], [20, 10], [7, 7], [3, 9]]) {
    for (const { w } of LZ.weights(srcLen, dstLen)) {
      const sum = w.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-5, `weights sum ${sum}`);
    }
  }
  const flat = new Uint8ClampedArray(6 * 4 * 4).fill(90);
  const up = LZ.resizeRGBA(flat, 6, 4, 13, 9);
  assert.ok(up.every((v) => v === 90), 'a flat picture stays flat');
  const same = picture(5, 4);
  assert.deepEqual(LZ.resizeRGBA(same, 5, 4, 5, 4), same, 'same size is the identity');
});
