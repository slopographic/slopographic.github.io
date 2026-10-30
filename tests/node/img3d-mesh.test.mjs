// Slop Image to 3D: the pure height-field mesh (counts, scale, smoothing, subject mask), point and splat grids,
// and the .s3d scene (checked by Slop 3D's own validator). The OBJ and GLB exports (the shared 3D I/O writer) are tested in
// the browser: tests/img3d/img3d.spec.js.
// Loads Slop 3D's pure core and the img3d core into one vm context. Not a browser test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FILES } from './3d-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { TextEncoder, TextDecoder };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(await readFile(path.join(ROOT, '3d', 'js', 'core', f), 'utf8'), ctx, { filename: f });
for (const f of ['hfmesh.js', 'prepare.js', 's3d.js']) vm.runInContext(await readFile(path.join(ROOT, 'img3d', 'js', 'core', f), 'utf8'), ctx, { filename: f });
const I = ctx.SlopImg3D, HF = I.hf, S3 = ctx.Slop3D;
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

/** A w×h RGBA image: a left-to-right ramp, so luminance rises with x. */
function ramp(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = Math.round((255 * x) / (w - 1)); rgba.set([v, v, v, 255], i); }
  return rgba;
}
const zRange = (p) => { let lo = Infinity, hi = -Infinity; for (let i = 2; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); } return [lo, hi]; };

test('a height field has one vertex per grid cell and two triangles per quad', () => {
  const prep = I.prepare(ramp(8, 5), 8, 5, { grid: 8 });
  assert.equal(prep.gw, 8);
  assert.equal(prep.gh, 5);
  const m = HF.heightField(prep, { scale: 0.3, smooth: 0 });
  assert.equal(m.positions.length / 3, 40, 'vertices = 8 × 5');
  assert.equal(m.uv.length / 2, 40);
  assert.equal(m.indices.length, 7 * 4 * 6, 'indices = (8-1) × (5-1) quads × 6');
  assert.equal(m.normals.length, m.positions.length);
  assert.ok(Math.max(...m.indices) < 40, 'every index names a vertex');
});

test('the grid keeps the picture aspect and the long side is the requested size', () => {
  assert.deepEqual(plain(HF.gridFor(64, 64, 64)), { gw: 64, gh: 64 });
  assert.deepEqual(plain(HF.gridFor(400, 200, 128)), { gw: 128, gh: 64 });
  assert.deepEqual(plain(HF.gridFor(1, 1000, 16)), { gw: 2, gh: 16 }, 'never below 2 cells');
});

test('depth scale sets the displacement: the nearest vertex sits at z = scale, the farthest at z = 0', () => {
  const prep = I.prepare(ramp(6, 6), 6, 6, { grid: 6 });
  for (const scale of [0.3, 1.5]) {
    const m = HF.heightField(prep, { scale, smooth: 0 });
    const [lo, hi] = zRange(m.positions);
    near(lo, 0);
    near(hi, scale);
  }
});

test('the plane is one unit tall and aspect wide, centred on the origin', () => {
  const prep = I.prepare(ramp(20, 10), 20, 10, { grid: 20 });
  const m = HF.heightField(prep, { scale: 0 });
  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { xlo = Math.min(xlo, m.positions[i]); xhi = Math.max(xhi, m.positions[i]); ylo = Math.min(ylo, m.positions[i + 1]); yhi = Math.max(yhi, m.positions[i + 1]); }
  near(xhi - xlo, 2, 1e-4);
  near(yhi - ylo, 1, 1e-4);
  near(xlo + xhi, 0, 1e-4);
});

test('smoothing keeps the counts and softens the depth', () => {
  const prep = I.prepare(ramp(12, 12), 12, 12, { grid: 12, depth: { data: Float32Array.from({ length: 144 }, (_, i) => (i === 70 ? 1 : 0)), w: 12, h: 12 } });
  const sharp = HF.heightField(prep, { scale: 1, smooth: 0 }), soft = HF.heightField(prep, { scale: 1, smooth: 2 });
  assert.equal(soft.positions.length, sharp.positions.length);
  assert.equal(soft.indices.length, sharp.indices.length);
  assert.ok(zRange(soft.positions)[1] < zRange(sharp.positions)[1], 'the peak comes down');
});

test('a subject mask drops the triangles of the background and the vertices no triangle uses', () => {
  const w = 10, h = 10;
  const prep = I.prepare(ramp(w, h), w, h, { grid: w });
  // Subject: the left half (x < 5). Vertices at x >= 5 are background.
  prep.mask = Float32Array.from({ length: w * h }, (_, i) => (i % w < 5 ? 1 : 0));
  const m = HF.heightField(prep, { scale: 0.3 });
  const quads = (w - 1) * (h - 1);
  assert.ok(m.indices.length / 3 < quads * 2, 'some triangles were dropped');
  assert.equal(m.indices.length / 3, 4 * 9 * 2, 'the four left columns of quads, two triangles each');
  assert.equal(m.positions.length / 3, 5 * 10, 'only the subject columns keep their vertices');
  assert.ok(Math.max(...m.indices) < m.positions.length / 3);
});

test('a 64×64 test picture makes a 4096-vertex, 23814-index height field', () => {
  const prep = I.prepare(ramp(64, 64), 64, 64, { grid: 64 });
  const m = HF.heightField(prep, { scale: 0.3, smooth: 1 });
  assert.equal(m.positions.length / 3, 4096);
  assert.equal(m.indices.length, 63 * 63 * 6);
});

test('the fallback is brightness and says so; a model depth is used as given', () => {
  const dark = I.prepare(ramp(4, 4), 4, 4, { grid: 4 });
  assert.equal(dark.source, 'luminance');
  const model = I.prepare(ramp(4, 4), 4, 4, { grid: 4, depth: { data: new Float32Array(16).map((_, i) => i), w: 4, h: 4 } });
  assert.equal(model.source, 'model');
  assert.ok(model.depth[15] > model.depth[0]);
  const inv = I.prepare(ramp(4, 4), 4, 4, { grid: 4, invert: true });
  near(inv.depth[0] + dark.depth[0], 1, 1e-6);
});

test('point cloud and splat grids have one entry per kept vertex', () => {
  const prep = I.prepare(ramp(9, 7), 9, 7, { grid: 9 });
  const pts = HF.pointCloud(prep, { scale: 0.3 });
  assert.equal(pts.positions.length / 3, 63);
  assert.equal(pts.colors.length, pts.positions.length);
  const sp = HF.splats(prep, { scale: 0.3, size: 1 });
  assert.equal(sp.sizes.length, 63);
  assert.ok(sp.sizes.every((v) => v > 0));
});

test('the .s3d scene passes Slop 3D\'s own validator and round-trips through its parser', () => {
  const prep = I.prepare(ramp(16, 8), 16, 8, { grid: 16 });
  const m = HF.heightField(prep, { scale: 0.3, smooth: 1 });
  const scene = I.s3d.sceneOf(m, { name: 'Test', texture: 'data:image/jpeg;base64,AAAA' });
  const v = S3.format.validate(plain(scene));
  assert.deepEqual(plain(v.errors), []);
  assert.ok(v.ok);
  assert.equal(scene.nodes.n1.geom.uvs.length, m.positions.length / 3 * 2);
  const parsed = S3.format.parse(JSON.stringify(scene));
  assert.equal(parsed.ok, true);
});

