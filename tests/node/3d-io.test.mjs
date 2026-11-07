// The shared 3D I/O module (shared/3d-io) in Node: a cube written as OBJ, STL (binary and ASCII) and PLY (binary and
// ASCII) reads back with the same vertex and triangle counts and the same bounds; format detection; the drop report;
// units, axis and merging; the cdn decoder table. glTF, GLB, USDZ, 3MF, DAE and FBX need a browser: see
// tests/3d-io/io.test.html.
// Covers: shared/3d-io/formats.js, shared/3d-io/read.js, shared/3d-io/write.js, shared/3d-io/scene.js, shared/3d-io/mtl.js
// Covers: shared/3d-io/convert.js, shared/3d-io/resources.js, shared/3d-io/decoders.js, shared/3d-io/textures.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// SlopI18n with the English words of the 3D messages (ui.d3.*, shared/i18n/ui/en/misc.js), as on a page: the readers,
// writers and the status line read them when they speak. Covers: shared/i18n/ui/en/misc.js
const require = createRequire(import.meta.url);
require('../../shared/i18n/i18n.js');
globalThis.SlopI18n = globalThis.SlopI18n.create({ defaultLang: 'en', profile: null });
globalThis.window = globalThis;
require('../../shared/i18n/ui/en/misc.js');
delete globalThis.window;

const V = '../../vendor/three/';
const T = await import(V + 'three.module.min.js');
const { readModel } = await import('../../shared/3d-io/read.js');
const { writeModel } = await import('../../shared/3d-io/write.js');
const { stats, bounds, transform, bake, merge } = await import('../../shared/3d-io/scene.js');
const { formatOf, stlIsBinary, plyEncoding, referencedFiles } = await import('../../shared/3d-io/formats.js');
const { convertModel, dropped } = await import('../../shared/3d-io/convert.js');
const { needed, ENGINES, CDN_BASE } = await import('../../shared/3d-io/decoders.js');
const { mergeGeometries } = await import(V + 'addons/utils/BufferGeometryUtils.js');

/** A 2 × 2 × 2 cube at the origin, with a named red material, inside a group (12 triangles, 24 vertices). */
function cube() {
  const g = new T.Group();
  g.name = 'Box';
  const m = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial({ name: 'Red paint', color: 0xff0000, roughness: 0.4 }));
  m.name = 'Cube';
  g.add(m);
  return g;
}
const file = async (f) => ({ name: f.name, blob: f.blob });
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const head = async (blob) => new Uint8Array(await blob.slice(0, 512).arrayBuffer());

for (const [fmt, binary] of [['stl', true], ['stl', false], ['ply', true], ['ply', false], ['obj', undefined]]) {
  test(`a cube written as ${fmt}${binary === undefined ? '' : binary ? ' (binary)' : ' (ASCII)'} reads back with the same triangles and bounds`, async () => {
    const { files } = await writeModel(cube(), fmt, { name: 'cube', binary });
    assert.equal(files[0].name, `cube.${fmt}`);
    const back = await readModel(await Promise.all(files.map(file)));
    assert.equal(back.format, fmt);
    const s = stats(back.root);
    assert.equal(s.triangles, 12);
    assert.ok(s.vertices === 24 || s.vertices === 36, `vertices: ${s.vertices}`);
    const b = bounds(back.root);
    assert.ok(near(b.min, [-1, -1, -1]) && near(b.max, [1, 1, 1]), JSON.stringify(b));
    if (fmt === 'stl') {
      const bytes = new Uint8Array(await files[0].blob.arrayBuffer());
      assert.equal(stlIsBinary(bytes), binary);
      if (binary) assert.equal(bytes.length, 84 + 12 * 50, 'binary STL: 80-byte header, count, 50 bytes a triangle');
      else assert.match(await files[0].blob.text(), /^solid[\s\S]*facet normal[\s\S]*endsolid/);
    }
    if (fmt === 'ply') assert.equal(plyEncoding(await head(files[0].blob)), binary ? 'binary_little_endian' : 'ascii');
  });
}

test('OBJ comes with an MTL file holding the material, and the OBJ reads it back', async () => {
  const { files } = await writeModel(cube(), 'obj', { name: 'cube' });
  assert.deepEqual(files.map((f) => f.name), ['cube.obj', 'cube.mtl']);
  const obj = await files[0].blob.text(), mtl = await files[1].blob.text();
  assert.match(obj, /^mtllib cube\.mtl$/m);
  assert.match(obj, /^usemtl Red_paint$/m);
  assert.match(mtl, /^newmtl Red_paint$/m);
  assert.match(mtl, /^Kd 1 0 0$/m);
  assert.deepEqual(referencedFiles('obj', obj), ['cube.mtl']);
  const back = await readModel(await Promise.all(files.map(file)));
  let color = null;
  back.root.traverse((o) => { if (o.isMesh) color = o.material.color.getHex(); });
  assert.equal(color, 0xff0000);
  const plain = await writeModel(cube(), 'obj', { name: 'cube', materials: false });
  assert.equal(plain.files.length, 1);
  assert.doesNotMatch(await plain.files[0].blob.text(), /mtllib|usemtl/);
});

test('a mirrored part keeps its faces outward, and transforms are baked into OBJ, STL and PLY', async () => {
  const g = cube();
  g.children[0].position.set(10, 0, 0);
  g.children[0].scale.set(-1, 1, 1);
  const { files } = await writeModel(g, 'stl', { name: 'm', binary: false });
  const back = await readModel([await file(files[0])]);
  const b = bounds(back.root);
  assert.ok(near(b.min, [9, -1, -1]) && near(b.max, [11, 1, 1]));
  // every facet normal points away from the centre
  const text = await files[0].blob.text();
  const facets = [...text.matchAll(/facet normal (\S+) (\S+) (\S+)\s+outer loop\s+vertex (\S+) (\S+) (\S+)/g)];
  assert.equal(facets.length, 12);
  for (const f of facets) {
    const nrm = f.slice(1, 4).map(Number), v = f.slice(4, 7).map(Number);
    assert.ok(nrm[0] * (v[0] - 10) + nrm[1] * v[1] + nrm[2] * v[2] > 0, 'outward');
  }
});

test('detection: magic bytes first, then the name, then the text', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(formatOf('x.bin', enc('glTF\u0002\u0000\u0000\u0000')), 'glb');
  assert.equal(formatOf('a', enc('Kaydara FBX Binary  \u0000')), 'fbx');
  assert.equal(formatOf('a.txt', enc('; FBX 7.4.0 project file\n')), 'fbx');
  assert.equal(formatOf('a', enc('ply\nformat ascii 1.0\n')), 'ply');
  assert.equal(formatOf('a.xml', enc('<?xml version="1.0"?>\n<COLLADA xmlns="x" version="1.4.1">')), 'dae');
  assert.equal(formatOf('a.3mf', new Uint8Array([0x50, 0x4b, 3, 4])), '3mf');
  assert.equal(formatOf('model', enc('solid cube\n facet normal 0 0 1\n')), 'stl');
  assert.equal(formatOf('model', enc('# made by hand\nv 0 0 0\nv 1 0 0\nf 1 2 3\n')), 'obj');
  assert.equal(formatOf('scene', enc('{"asset":{"version":"2.0"}}')), 'gltf');
  assert.equal(formatOf('part.STL', null), 'stl');
  assert.equal(formatOf('tex.jpeg', null), 'jpg');
  assert.equal(formatOf('notes.txt', enc('hello')), null);
  assert.deepEqual(referencedFiles('gltf', JSON.stringify({ buffers: [{ uri: 'a%20b.bin' }, { uri: 'data:x' }], images: [{ uri: 'tex/c.png' }] })), ['a b.bin', 'c.png']);
  assert.deepEqual(referencedFiles('mtl', 'newmtl a\nmap_Kd -s 1 1 1 textures/wood.png\nbump n.png\n'), ['wood.png', 'n.png']);
});

test('reading reports clear errors for broken files', async () => {
  const bad = (name, text) => readModel([{ name, blob: new Blob([text]) }]);
  await assert.rejects(bad('a.obj', '# nothing\n'), /no faces/);
  await assert.rejects(bad('a.txt', 'hello'), /None of these files/);
  await assert.rejects(bad('a.gltf', '{"asset":{"version":"1.0"}}'), /glTF 2\.0/);
  await assert.rejects(bad('a.gltf', JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: 4 }] })), /mesh\.bin/);
  await assert.rejects(bad('a.ply', 'ply\nelement vertex 0\nend_header\n'), /format line/);
});

test('the drop report says what each format cannot keep', () => {
  const s = { meshes: 3, points: 1, lines: 0, vertices: 10, triangles: 4, materials: 2, textures: 1, colors: true, uvs: true, skinning: false, morphs: false, lights: 1, cameras: 0, animations: 2 };
  const stl = dropped(s, 'stl');
  for (const w of ['2 materials', '1 texture', 'vertex colours', 'texture coordinates (UVs)', '2 animations', '1 point cloud', '1 light']) assert.ok(stl.includes(w), w);
  assert.deepEqual(dropped(s, 'glb'), []);
  assert.deepEqual(dropped(s, 'glb', { animations: false }), ['2 animations']);
  assert.ok(dropped(s, 'obj').includes('vertex colours') && !dropped(s, 'obj').includes('2 materials'));
  assert.ok(dropped(s, 'obj', { materials: false }).includes('2 materials'));
  assert.ok(dropped(s, 'ply').includes('2 materials') && !dropped(s, 'ply').includes('vertex colours'));
});

test('units, axis and merging', async () => {
  const g = transform(cube(), { scale: 1000, up: 'z-to-y' });
  const b = bounds(g);
  assert.ok(near(b.size, [2000, 2000, 2000], 1e-3));
  const two = cube();
  const c2 = two.children[0].clone();
  c2.position.set(5, 0, 0);
  c2.material = new T.MeshStandardMaterial({ name: 'Blue', color: 0x0000ff });
  two.add(c2);
  const one = merge(bake(two), mergeGeometries);
  assert.equal(one.children.length, 1);
  assert.equal(stats(one).triangles, 24);
  assert.equal(one.children[0].material.length, 2, 'one material per part');
  const { files } = await writeModel(one, 'obj', { name: 'two' });
  const obj = await files[0].blob.text();
  assert.equal((obj.match(/^usemtl /gm) || []).length, 2, 'OBJ: one object per material');
});

test('convertModel: STL to PLY with a scale, and the status line names the size and what was left out', async () => {
  const { files } = await writeModel(cube(), 'stl', { name: 'part' });
  const r = await convertModel([await file(files[0])], 'ply', { scale: 10, binary: true });
  assert.equal(r.files[0].name, 'part.ply');
  assert.match(r.info, /12 triangles/);
  assert.match(r.info, /Size 20 × 20 × 20 units/);
  const glbish = await convertModel([await file((await writeModel(cube(), 'obj', { name: 'c' })).files[0]), await file((await writeModel(cube(), 'obj', { name: 'c' })).files[1])], 'stl', {});
  assert.match(glbish.info, /STL cannot hold 1 material/);
});

test('the cdn decoders: which extensions need which engine, pinned to the release tag, each file with a SHA-256', () => {
  assert.deepEqual(needed({ extensionsUsed: ['KHR_draco_mesh_compression', 'KHR_texture_basisu'] }), ['draco', 'basis']);
  assert.deepEqual(needed({ extensionsRequired: ['EXT_meshopt_compression'] }), ['meshopt']);
  assert.deepEqual(needed({ extensionsUsed: ['KHR_materials_unlit'] }), []);
  assert.equal(CDN_BASE, `https://cdn.jsdelivr.net/gh/slopographic/cdn@${globalThis.SlopCdn.TAG}/engines/`);
  for (const e of Object.values(ENGINES)) for (const [hash, bytes] of Object.values(e.files)) { assert.match(hash, /^[0-9a-f]{64}$/); assert.ok(bytes > 1000); }
});

test('the 3D words follow the language (shared/i18n/ui/sv/misc.js): what a format drops and a refusal', async () => {
  // they were English in every language; ui.d3.* keys now, read when the message is made
  const en = globalThis.SlopI18n;
  globalThis.SlopI18n = en.create({ defaultLang: 'sv', profile: null });
  globalThis.window = globalThis;
  try {
    require('../../shared/i18n/ui/sv/misc.js');
    const s = { meshes: 1, triangles: 12, vertices: 24, materials: 1, textures: 0, animations: 2 };
    assert.deepEqual(dropped(s, 'stl'), ['1 material', '2 animationer']);
    await assert.rejects(readModel([{ name: 'a.txt', blob: new Blob(['hello']) }]), /^Error: Ingen av filerna är en 3D-modell/);
  } finally { globalThis.SlopI18n = en; delete globalThis.window; }
  assert.deepEqual(dropped({ animations: 2 }, 'stl'), ['2 animations']);
});
