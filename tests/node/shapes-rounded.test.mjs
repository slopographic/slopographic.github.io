// shared/shapes/rounded.js: rounded-rectangle geometry shared by Slop Vector and PhotoSLOP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'shapes', 'rounded.js');
const ctx = { };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(FILE, 'utf8'), ctx, { filename: 'rounded.js' });
const SS = ctx.SlopShapes;
const H = (v) => JSON.parse(JSON.stringify(v)); // arrays from the vm realm compare as plain arrays
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('a 100x50 rectangle with radius 60 clamps every corner to 25', () => {
  const c = SS.clampRadii(100, 50, 60);
  c.forEach((r) => near(r, 25));
  const d = SS.svgPath({ x: 0, y: 0, w: 100, h: 50, radius: 60 });
  assert.equal((d.match(/A25 25 0 0 1 /g) || []).length, 4);
});

test('the clamp scales all radii by the same factor, so the tightest side decides', () => {
  const c = SS.clampRadii(100, 50, { tl: 40, tr: 40, br: 10, bl: 10 });
  // Top side needs 80 <= 100 (fine); left side needs 40 + 10 = 50 <= 50 (fine); right side 40 + 10 = 50 fits too.
  assert.deepEqual(H(c.map((r) => Math.round(r * 1000) / 1000)), [40, 40, 10, 10]);
  const e = SS.clampRadii(100, 50, { tl: 80, tr: 80, br: 0, bl: 0 });
  // Top side: tl + tr = 160 > 100, factor 0.625. Left and right sides (80 > 50) give 0.625 too. 80 * 0.625 = 50.
  near(e[0], 50); near(e[1], 50); near(e[2], 0); near(e[3], 0);
});

test('per-corner radii produce four circular arcs with those radii', () => {
  const rect = { x: 10, y: 20, w: 200, h: 100, radius: { tl: 10, tr: 12, br: 14, bl: 8 } };
  const segs = SS.segments(rect);
  const arcs = segs.filter((s) => s.c === 'A');
  assert.equal(arcs.length, 4);
  assert.deepEqual(H(arcs.map((a) => a.r)), [12, 14, 8, 10]);
  const d = SS.svgPath(rect);
  assert.equal((d.match(/A/g) || []).length, 4);
  assert.equal(d[0], 'M', 'path starts with a move');
  assert.equal(d[d.length - 1], 'Z', 'path closes');
});

test('zero radius gives a plain rectangle with no arcs', () => {
  assert.equal(SS.svgPath({ x: 0, y: 0, w: 100, h: 50, radius: 0 }), 'M0 0L100 0L100 50L0 50Z');
  assert.equal(SS.svgPath({ x: 0, y: 0, w: 100, h: 50 }), 'M0 0L100 0L100 50L0 50Z');
  assert.equal(SS.segments({ x: 0, y: 0, w: 100, h: 50, radius: [0, 0, 0, 0] }).some((s) => s.c === 'A'), false);
});

test('a degenerate box stays finite and invalid radii count as zero', () => {
  assert.equal(SS.svgPath({ x: 0, y: 0, w: 0, h: 0, radius: 9 }).includes('NaN'), false);
  assert.deepEqual(H(SS.radii("abc")), [0, 0, 0, 0]);
  assert.deepEqual(H(SS.radii(-4)), [0, 0, 0, 0]);
});

test('canvasPath draws the same arcs through arcTo on a 2D context', () => {
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; return true; } });
  const out = SS.canvasPath(g, { x: 0, y: 0, w: 100, h: 50, radius: 10 });
  assert.equal(out, g);
  assert.equal(calls.filter((c) => c[0] === 'arcTo').length, 4);
  assert.equal(calls[0][0], 'beginPath');
  assert.equal(calls.at(-1)[0], 'closePath');
});
