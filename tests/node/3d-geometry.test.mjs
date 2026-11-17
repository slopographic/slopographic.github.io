// Slop 3D pure logic: primitive geometry (outward winding) and transform maths. Model files (OBJ, glTF, GLB and the rest)
// are read and written by the shared 3D I/O module: tests/node/3d-io.test.mjs, tests/3d-io/ and tests/3d/modelio.test.html.
// Covers: 3d/js/core/geometry.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './3d-env.mjs';

const S = await load();
const { geometry: G, xform: X, model: M, ops: O } = S;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

/** Every triangle must face outwards: its geometric normal agrees with the average vertex normal. */
function assertOutward(g, label) {
  const { positions: p, normals: n, indices: idx } = g;
  assert.equal(idx.length % 3, 0, label + ': whole triangles');
  assert.ok(idx.every((i) => i >= 0 && i < p.length / 3), label + ': indices in range');
  if (n) assert.equal(n.length, p.length, label + ': one normal per vertex');
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]), v = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cr) < 1e-12) continue; // degenerate sliver (a pole): nothing to check
    const avg = [0, 1, 2].map((k) => (n[a * 3 + k] + n[b * 3 + k] + n[c * 3 + k]) / 3);
    const dot = cr[0] * avg[0] + cr[1] * avg[1] + cr[2] * avg[2];
    assert.ok(dot >= -1e-9, `${label}: triangle ${t / 3} faces inwards (dot ${dot})`);
  }
}

test('every primitive has outward triangles and valid indices', () => {
  for (const kind of G.KINDS) {
    const g = G.build({ kind });
    assert.ok(g.positions.length > 0, kind);
    assertOutward(g, kind);
  }
  assertOutward(G.build({ kind: 'sphere', segments: 7, rings: 5, radius: 2 }), 'sphere 7x5');
  assertOutward(G.build({ kind: 'cone', segments: 3 }), 'cone 3');
  assertOutward(G.build({ kind: 'torus', segments: 6, sides: 4 }), 'torus');
});

test('primitive shapes clamp, reject and default parameters', () => {
  assert.equal(G.normalize({ kind: 'sphere', segments: 9999 }).segments, 256);
  assert.equal(G.normalize({ kind: 'sphere', radius: 'big' }).radius, 0.5);
  assert.equal(G.normalize({ kind: 'nope' }).kind, 'cube');
  assert.equal(G.check({ kind: 'cube', size: 1 }), null);
  assert.match(G.check({ kind: 'cube', size: -1 }), /size/);
  assert.match(G.check({ kind: 'sphere', radius: 1, segments: 2.5, rings: 4 }), /segments/);
  assert.match(G.check({ kind: 'mesh', positions: [0, 0], indices: [] }), /triangles|positions/);
});

test('the blob is deterministic for a seed and changes with it', () => {
  const a = G.build({ kind: 'blob', seed: 4 }), b = G.build({ kind: 'blob', seed: 4 }), c = G.build({ kind: 'blob', seed: 5 });
  assert.deepEqual(a.positions, b.positions);
  assert.notDeepEqual(a.positions, c.positions);
  assertOutward(a, 'blob');
});

test('a decomposed transform gives back its inputs', () => {
  const p = [1.5, -2, 0.25], r = [30, -45, 70], s = [1, 2, 0.5];
  const d = X.decompose(X.fromTRS(p, r, s));
  p.forEach((v, i) => near(d.p[i], v, 1e-6));
  r.forEach((v, i) => near(d.r[i], v, 1e-6));
  s.forEach((v, i) => near(d.s[i], v, 1e-6));
  const m = X.fromTRS(p, r, s), inv = X.invert(m), I = X.mul(inv, m);
  I.forEach((v, i) => near(v, i % 5 === 0 ? 1 : 0, 1e-9));
  assert.equal(X.invert([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), null, 'singular matrix');
});

test('quaternions match the equivalent Euler rotation', () => {
  const s = Math.SQRT1_2;
  const q = X.fromQuat([0, s, 0, s]); // 90° about Y
  const d = X.dir(q, [1, 0, 0]);
  near(d[0], 0); near(d[2], -1);
});

