// Slop 3D scene3d config: validation (all or nothing), building objects as scene nodes, and export of the primitives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './3d-env.mjs';

const S = await load();
const { config: C, model: M, ops: O, format: F } = S;

const sample = () => ({
  objects: [
    { type: 'cube', name: 'Crate', position: [1, 0, -2], rotation: [0, 45, 0], scale: [2, 1, 1], material: { color: '#884422', roughness: 0.3 } },
    { type: 'sphere', params: { radius: 0.75, segments: 24, rings: 12 } },
    { type: 'group', name: 'Pair', children: [{ type: 'torus', position: [0, 1, 0] }, { type: 'cone' }] },
  ],
  lights: [{ type: 'directional', color: '#fff0dd', intensity: 1.5, position: [4, 6, 2] }, { type: 'ambient' }],
});

function buildInto(scene, trees) {
  let doc = scene;
  for (const t of trees) doc = O.importTree(doc, t, null, -1).scene;
  return doc;
}

test('a valid config validates and builds one tree per object and light', () => {
  const r = C.validate(sample());
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.trees.length, 5);
  assert.equal(r.trees[0].type, 'mesh');
  assert.deepEqual(plain(r.trees[0].transform.p), [1, 0, -2]);
  assert.equal(r.trees[0].material.color, '#884422');
  assert.equal(r.trees[1].geom.radius, 0.75);
  assert.equal(r.trees[2].type, 'group');
  assert.equal(r.trees[2].children.length, 2);
  assert.equal(r.trees[3].light.kind, 'directional');
  assert.equal(r.trees[4].light.kind, 'ambient');
});

test('a bad entry refuses the whole config, with the path of the problem', () => {
  const data = sample();
  data.objects[1].type = 'pyramid';
  data.objects.push({ type: 'cube', position: [1, 2] });
  const r = C.validate(data);
  assert.equal(r.ok, false);
  assert.equal(r.trees.length, 0, 'nothing is built from a bad config');
  assert.ok(r.errors.some((e) => e.startsWith('objects[1].type')));
  assert.ok(r.errors.some((e) => e.startsWith('objects[3].position')));
});

test('bad values are named: colours, ranges and shape parameters', () => {
  const r = C.validate({ objects: [{ type: 'cube', material: { color: 'red', opacity: 2 } }, { type: 'sphere', params: { radius: -1 } }], lights: [{ type: 'ambient', intensity: 500 }] });
  assert.equal(r.ok, false);
  const text = r.errors.join('\n');
  assert.match(text, /objects\[0\]\.material\.color/);
  assert.match(text, /objects\[0\]\.material\.opacity/);
  assert.match(text, /objects\[1\]\.params/);
  assert.match(text, /lights\[0\]\.intensity/);
});

test('a bare list is read as objects, and an empty config is valid with nothing to build', () => {
  const r = C.validate([{ type: 'plane' }]);
  assert.equal(r.ok, true);
  assert.equal(r.trees.length, 1);
  assert.equal(C.validate({}).trees.length, 0);
  assert.equal(C.validate('nope').ok, false);
});

test('the built objects are ordinary scene nodes and the scene saves as .s3d', () => {
  const r = C.validate(sample());
  const scene = buildInto(M.defaultScene('cfg'), r.trees);
  const meshes = Object.values(scene.nodes).filter((n) => n.type === 'mesh');
  assert.equal(meshes.length, 4, 'crate, sphere, and the torus and cone inside the group');
  const back = F.parse(F.serialize(scene));
  assert.equal(back.ok, true, back.errors && back.errors.join('; '));
});

test('export writes the visible primitives and lights in config shape, with world transforms', () => {
  let scene = M.defaultScene('out');
  const made = O.importTree(scene, C.validate(sample()).trees[0]).scene;
  const g = O.importTree(made, C.validate({ objects: [{ type: 'group', name: 'G', position: [10, 0, 0], children: [{ type: 'cylinder', position: [0, 2, 0] }] }] }).trees[0]).scene;
  const exp = C.exportScene(g);
  assert.equal(exp.skipped, 0);
  const cyl = exp.data.objects.find((o) => o.type === 'cylinder');
  assert.ok(cyl, 'the cylinder is written');
  assert.deepEqual(plain(cyl.position.map((v) => Math.round(v * 1e6) / 1e6)), [10, 2, 0], 'its world position, not its local one');
  assert.equal(exp.data.lights.length, 2, 'the sun and the ambient light are both written');
  const crate = exp.data.objects.find((o) => o.type === 'cube');
  assert.equal(crate.material.color, '#884422');
});

test('export then import gives back the same primitives', () => {
  const first = C.validate(sample()).trees;
  const scene = buildInto(M.defaultScene('x'), first);
  const exp = C.exportScene(scene);
  const again = C.validate(exp.data);
  assert.equal(again.ok, true, again.errors.join('; '));
  assert.equal(again.trees.filter((t) => t.type === 'mesh').length, 4);
  const sphere = again.trees.find((t) => t.geom && t.geom.kind === 'sphere');
  assert.equal(sphere.geom.radius, 0.75);
});

test('edited or imported meshes are left out of the export and counted', () => {
  const scene = M.addNode(M.emptyScene('m'), { type: 'mesh', name: 'Raw', geom: { kind: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } }).scene;
  const exp = C.exportScene(scene);
  assert.equal(exp.skipped, 1);
  assert.equal(exp.data.objects.length, 0);
});
