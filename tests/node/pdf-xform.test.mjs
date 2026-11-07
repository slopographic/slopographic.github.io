// The transform math of a selected box (pdf/js/editor/xform.js): corners and handles of a turned box, a point inside it,
// resizing along its own edges with the opposite side or corner kept, keeping the aspect from a corner, turning with
// the 15° snap, and the anchor kept when a box changes size.
// Covers: pdf/js/editor/xform.js
// Run: node --test tests/node/pdf-xform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const X = createRequire(import.meta.url)('../../pdf/js/editor/xform.js');
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} ≈ ${b}`);

test('corners, handles and the inside of an upright and a quarter-turned box', () => {
  const b = { cx: 50, cy: 20, w: 40, h: 10, ang: 0 };
  assert.deepEqual(X.corners(b), [[30, 15], [70, 15], [70, 25], [30, 25]]);
  assert.deepEqual(X.handleAt(b, 'e'), [70, 20]);
  assert.deepEqual(X.handleAt(b, 'rot', 5), [50, 10]);
  assert.ok(X.inside(b, 69, 24) && !X.inside(b, 71, 20));
  const q = { cx: 0, cy: 0, w: 40, h: 10, ang: 90 }, ne = X.handleAt(q, 'ne');
  near(ne[0], 5); near(ne[1], 20); // the right edge of a box turned clockwise a quarter points down
  const r = X.bounds(q); near(r.w, 10); near(r.h, 40);
});

test('resizing keeps the opposite side, also on a turned box; a corner keeps the aspect when asked', () => {
  const b = { cx: 50, cy: 20, w: 40, h: 10, ang: 0 };
  const e = X.resize(b, 'e', 10, 99, {});
  near(e.w, 50); near(e.h, 10); near(e.cx, 55); near(e.cy, 20);
  const k = X.resize(b, 'se', 40, 0, { keep: true });
  near(k.k, 2); near(k.w, 80); near(k.h, 20); near(k.cx - k.w / 2, 30); near(k.cy - k.h / 2, 15);
  const t = { cx: 0, cy: 0, w: 40, h: 10, ang: 90 }, s = X.resize(t, 'e', 0, 10, {}); // along its own x axis, which points down
  near(s.w, 50); near(s.cx, 0); near(s.cy, 5);
  const m = X.resize(b, 'w', 100, 0, { min: 4 });
  near(m.w, 4); near(m.cx + m.w / 2, 70);
});

test('turning about the centre, with the 15° snap, and angles kept in (-180, 180]', () => {
  const b = { cx: 0, cy: 0, w: 10, h: 10, ang: 0 };
  near(X.turn(b, 0, -10, 10, 0), 90);
  near(X.turn(b, 0, -10, 10, -9, true), 45);
  near(X.turn({ ...b, ang: 170 }, 0, -10, 10, 0), -100);
  assert.equal(X.norm(-0.0000000001), 0);
  assert.equal(X.norm(540), 180);
});

test('keepAnchor: a corner of the old box stays where it was for the new size', () => {
  const b = { cx: 50, cy: 20, w: 40, h: 10, ang: 0 };
  assert.deepEqual(X.keepAnchor(b, -1, -1, 60, 30), [60, 30]);
  const t = { cx: 0, cy: 0, w: 40, h: 10, ang: 90 }, c = X.keepAnchor(t, -1, -1, 60, 10), q = X.corners({ ...t, cx: c[0], cy: c[1], w: 60 })[0], o = X.corners(t)[0];
  near(q[0], o[0]); near(q[1], o[1]);
});
