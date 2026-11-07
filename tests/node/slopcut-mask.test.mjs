// SlopCut clip masks: the pure geometry in slopcut/js/core/mask.js (shape outlines, coverage with expansion and
// invert, bounds, sanitising and point simplification). Loaded in a vm context so the browser file runs unchanged.
// Run with: node tests/run.mjs slopcut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'slopcut', 'js', 'core', 'mask.js'), 'utf8'), ctx, { filename: 'mask.js' });
const MK = ctx.SE.mask;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b} (±${eps})`);
const J = (v) => JSON.parse(JSON.stringify(v)); // vm-realm arrays and objects compare as plain values
const rect = (o) => MK.make('rect', null, Object.assign({ x: 0, y: 0, w: 100, h: 60 }, o));

test('a default rectangle is half the frame, centred on the clip', () => {
  const m = MK.make('rect', { w: 1920, h: 1080 });
  assert.equal(m.shape, 'rect');
  assert.equal(m.x, 0); assert.equal(m.y, 0);
  assert.equal(m.w, 960); assert.equal(m.h, 540);
  assert.equal(m.invert, false); assert.equal(m.feather, 0); assert.equal(m.expand, 0);
  assert.equal(MK.make('rrect', { w: 1000, h: 500 }).r, 50); // 20% of the shorter side of the box
});

test('rectangle coverage: inside the box, outside it, and on the edge', () => {
  const m = rect({});
  assert.equal(MK.covered(m, 0, 0), true);
  assert.equal(MK.covered(m, 49, 29), true);
  assert.equal(MK.covered(m, 51, 0), false);
  assert.equal(MK.covered(m, 0, -31), false);
});

test('ellipse coverage follows the ellipse, not the box', () => {
  const m = MK.make('ellipse', null, { x: 0, y: 0, w: 100, h: 60 });
  assert.equal(MK.covered(m, 45, 0), true);
  assert.equal(MK.covered(m, 55, 0), false);
  assert.equal(MK.covered(m, 38, 22), false, 'a box corner is outside the ellipse');
  assert.equal(MK.covered(m, 0, 27), true);
});

test('ellipse area matches pi * a * b (sampled over its box)', () => {
  const m = MK.make('ellipse', null, { x: 0, y: 0, w: 200, h: 100 });
  let hit = 0, n = 0;
  for (let x = -100; x < 100; x += 0.5) for (let y = -50; y < 50; y += 0.5) { n++; if (MK.covered(m, x + 0.25, y + 0.25)) hit++; }
  near(hit / n, Math.PI / 4, 0.01);
});

test('rounded rectangle cuts the corners and keeps the straight sides', () => {
  const m = MK.make('rrect', null, { x: 0, y: 0, w: 100, h: 100, r: 40 });
  assert.equal(MK.covered(m, -49, -49), false, 'the corner outside the arc');
  assert.equal(MK.covered(m, -30, -30), true, 'the arc centre is inside');
  assert.equal(MK.covered(m, -49, 0), true, 'a side away from the corners');
  // a radius larger than half the side is clamped: r 500 on 100x60 is a full pill / ellipse-like end
  const big = MK.make('rrect', null, { x: 0, y: 0, w: 100, h: 60, r: 500 });
  assert.equal(MK.covered(big, 0, 0), true);
  assert.equal(MK.covered(big, -49, -29), false);
});

test('a path mask uses its anchors; curves bulge out of the chord', () => {
  const tri = MK.path([{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 0, y: 50 }]);
  assert.equal(MK.covered(tri, 0, 0), true);
  assert.equal(MK.covered(tri, 60, 0), false);
  assert.equal(MK.covered(tri, -45, 45), false, 'below the left edge');
  // a curved top edge: the handles of the first two anchors pull it up to about y = -95 (the chord is at y = -50)
  const curved = MK.make('path', null, { pts: [
    { x: -50, y: -50, ix: 0, iy: 0, ox: 0, oy: -60 }, { x: 50, y: -50, ix: 0, iy: -60, ox: 0, oy: 0 },
    { x: 50, y: 50, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: -50, y: 50, ix: 0, iy: 0, ox: 0, oy: 0 }] });
  assert.equal(MK.covered(curved, 0, -80), true, 'between the curve and the chord: only the curve reaches here');
  assert.equal(MK.covered(curved, 0, -100), false, 'above the curve');
  assert.equal(MK.covered(curved, 0, 40), true);
});

test('expansion grows and shrinks the coverage by its distance from the outline', () => {
  const m = rect({});
  assert.equal(MK.covered(m, 53, 0), false);
  const grow = rect({ expand: 5 });
  assert.equal(MK.covered(grow, 53, 0), true);
  assert.equal(MK.covered(grow, 56, 0), false);
  assert.equal(MK.covered(grow, 0, 34), true);
  const shrink = rect({ expand: -10 });
  assert.equal(MK.covered(shrink, 45, 0), false, 'the band inside the edge is removed');
  assert.equal(MK.covered(shrink, 35, 0), true);
  const bounds = MK.bounds(grow);
  near(bounds.x0, -55); near(bounds.x1, 55); near(bounds.y0, -35); near(bounds.y1, 35);
  const sb = MK.bounds(shrink);
  near(sb.x1, 50, 1e-6); // shrinking does not move the bounds in (they stay the drawn outline)
});

test('invert flips the coverage and leaves the geometry alone', () => {
  const m = rect({ invert: true });
  assert.equal(MK.covered(m, 0, 0), false);
  assert.equal(MK.covered(m, 80, 0), true);
  assert.equal(MK.inside(m, 0, 0), true, 'the raw outline is not inverted');
  assert.equal(MK.covered(rect({ invert: true, expand: 5 }), 53, 0), false, 'expansion applies before the flip');
});

test('clean keeps valid masks and repairs broken ones', () => {
  assert.equal(MK.clean(null), null);
  assert.equal(MK.clean('nope'), null);
  const bad = MK.clean({ shape: 'star', x: 'a', w: -5, h: 1e9, feather: 9999, expand: -9999, invert: 1, pts: [null, { x: 1, y: NaN }] });
  assert.equal(bad.shape, 'rect');
  assert.equal(bad.x, 0);
  assert.equal(bad.w, 0);
  assert.equal(bad.feather, 500);
  assert.equal(bad.expand, -500);
  assert.equal(bad.invert, true);
  assert.equal(bad.pts.length, 1);
  assert.equal(bad.pts[0].y, 0);
  const m = MK.make('path', null, { pts: [{ x: 1, y: 2, ix: 3, iy: 4, ox: 5, oy: 6 }] });
  assert.equal(JSON.stringify(MK.clean(J(m))), JSON.stringify(m), 'clean is idempotent on a stored mask');
});

test('simplify keeps the corners of a freehand stroke and drops the points on its straight edges', () => {
  const pts = [];
  for (let x = 0; x <= 100; x += 5) pts.push({ x, y: 0 });
  pts.push({ x: 100, y: 50 });
  for (let x = 95; x >= 0; x -= 5) pts.push({ x, y: 50 });
  const s = MK.simplify(pts, 0.5);
  assert.equal(s.length, 4);
  assert.deepEqual(J(s.map((p) => [p.x, p.y])), [[0, 0], [100, 0], [100, 50], [0, 50]]);
  assert.equal(MK.simplify([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1).length, 2);
});

test('flatten gives closed polylines for every shape', () => {
  for (const m of [rect({}), MK.make('ellipse', null, { w: 50, h: 50 }), MK.make('rrect', null, { w: 50, h: 50, r: 10 }), MK.path([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }])]) {
    const polys = MK.flatten(m);
    assert.equal(polys.length, 1);
    assert.ok(polys[0].length >= 4);
    for (const [x, y] of polys[0]) assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
});
