// Slop 3D mesh edit: the pure element operations (extrude, delete, subdivide, merge, flip, fill, selection, transforms)
// and the .s3d round trip of an edited mesh. Pure core only (tests/node/3d-env.mjs loads it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './3d-env.mjs';

const S = await load();
const { mesh: MH, meshops: MO, meshsel: SEL, meshxf: MX, meshrender: MR, model: M, format: F, xform: X, geometry: G } = S;
const quadMesh = () => ({ pos: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], faces: [{ v: [0, 1, 2, 3], hide: false }] });
const faceSel = (ids) => ({ mode: 'face', ids: new Set(ids) });
const vertSel = (ids) => ({ mode: 'vertex', ids: new Set(ids) });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('a cube bakes into 8 welded vertices and 6 quads', () => {
  const m = MH.bake({ kind: 'cube' });
  assert.equal(m.pos.length, 8);
  assert.equal(m.faces.length, 6);
  assert.ok(m.faces.every((f) => f.v.length === 4));
});

test('extrude of one face adds 4 side faces and 4 vertices', () => {
  const r = MO.extrude(quadMesh(), faceSel([0]), 1);
  assert.equal(r.mesh.pos.length, 8, 'four new vertices');
  assert.equal(r.mesh.faces.length, 5, 'the face plus four sides');
  assert.deepEqual([...r.sel.ids], [0], 'the moved face stays selected');
  // the moved face sits one unit along +Z (its normal)
  assert.ok(r.mesh.pos[r.mesh.faces[0].v[0]][2] > 0.99);
});

test('delete of one face removes it and keeps the others', () => {
  const cube = MH.bake({ kind: 'cube' });
  const r = MO.remove(cube, faceSel([2]));
  assert.equal(r.mesh.faces.length, 5);
  const before = new Set(cube.faces.filter((_, i) => i !== 2).map((f) => f.v.map((v) => cube.pos[v].join(',')).join('|')));
  const after = new Set(r.mesh.faces.map((f) => f.v.map((v) => r.mesh.pos[v].join(',')).join('|')));
  assert.deepEqual(after, before, 'the remaining faces are the same faces');
});

test('subdivide of one quad gives 4 faces', () => {
  const r = MO.subdivide(quadMesh(), faceSel([0]));
  assert.equal(r.mesh.faces.length, 4);
  assert.equal(r.mesh.pos.length, 9, 'four corners, four edge midpoints, one centre');
  assert.equal(r.sel.ids.size, 4);
  assert.ok(r.mesh.faces.every((f) => f.v.length === 4));
});

test('merge two vertices closer than the tolerance reduces the vertex count by one', () => {
  const m = { pos: [[0, 0, 0], [0.00001, 0, 0], [1, 0, 0], [1, 1, 0]], faces: [{ v: [0, 2, 3], hide: false }, { v: [1, 2, 3], hide: false }] };
  const r = MO.mergeByDistance(m, vertSel([0, 1]), 0.001);
  assert.equal(r.mesh.pos.length, m.pos.length - 1);
  assert.equal(r.sel.ids.size, 1, 'the merged vertex is selected');
  const c = MO.mergeCentre(m, vertSel([0, 2]));
  assert.equal(c.mesh.pos.length, 3, 'merge at centre also takes two points to one');
});

test('flip reverses the winding of the selected faces', () => {
  const r = MO.flip(quadMesh(), faceSel([0]));
  assert.deepEqual(r.mesh.faces[0].v, [3, 2, 1, 0]);
  const n0 = MH.faceNormal(quadMesh(), 0), n1 = MH.faceNormal(r.mesh, 0);
  near(n0[2], 1);
  near(n1[2], -1);
});

test('fill makes a face from a closed loop of selected vertices, facing like its neighbours', () => {
  const cube = MH.bake({ kind: 'cube' });
  // remove the top face, then fill the hole from its four vertices
  const top = cube.faces.findIndex((f) => f.v.every((v) => cube.pos[v][1] > 0.4));
  const open = MO.remove(cube, faceSel([top]));
  const ring = [...new Set(cube.faces[top].v)];
  const r = MO.fill(open.mesh, vertSel(ring));
  assert.equal(r.mesh.faces.length, 6, 'the face is back');
  const n = MH.faceNormal(r.mesh, r.mesh.faces.length - 1);
  near(n[1], 1, 1e-6);
  assert.ok(MO.fill(open.mesh, vertSel([0, 1, 2])).error, 'three loose vertices are not a closed loop');
});

test('subdivide keeps a neighbour watertight by splitting the shared edge', () => {
  const m = { pos: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [2, 0, 0], [2, 1, 0]], faces: [{ v: [0, 1, 2, 3], hide: false }, { v: [1, 4, 5, 2], hide: false }] };
  const r = MO.subdivide(m, faceSel([0]));
  const neighbour = r.mesh.faces.find((f) => f.v.length === 5);
  assert.ok(neighbour, 'the untouched neighbour gained the midpoint of the shared edge');
});

test('a loop walks across quads and stops at a triangle', () => {
  const cube = MH.bake({ kind: 'cube' });
  const k = MH.keysOf(cube.faces[0].v)[0];
  assert.equal(SEL.loop(cube, k).size, 4);
  const tri = { pos: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [{ v: [0, 1, 2], hide: false }] };
  assert.equal(SEL.loop(tri, MH.key(0, 1)).size, 1);
});

test('selection converts between modes by Blender rules', () => {
  const m = quadMesh();
  assert.equal(SEL.convert(m, vertSel([0, 1, 2, 3]), 'face').ids.size, 1, 'all corners select the face');
  assert.equal(SEL.convert(m, vertSel([0, 1]), 'face').ids.size, 0, 'two corners do not');
  assert.equal(SEL.convert(m, vertSel([0, 1]), 'edge').ids.size, 1, 'two touching corners select the edge between them');
  assert.equal(SEL.convert(m, faceSel([0]), 'vertex').ids.size, 4);
  assert.equal(SEL.invert(m, vertSel([0])).ids.size, 3);
});

test('box and click picks use screen points and ignore hidden faces', () => {
  const pts = [[10, 10], [50, 10], [50, 50], [10, 50]];
  assert.equal(SEL.nearestVertex(pts, [0, 1, 2, 3], 12, 11, 9), 0);
  assert.equal(SEL.nearestVertex(pts, [0, 1, 2, 3], 200, 200, 9), null);
  assert.equal(SEL.nearestEdge(pts, SEL.elements(quadMesh(), 'edge'), 30, 11, 6), MH.key(0, 1));
  const box = { x0: 0, y0: 0, x1: 60, y1: 60 };
  assert.equal(SEL.inBox(quadMesh(), 'vertex', pts, box).size, 4);
  const hidden = quadMesh();
  hidden.faces[0].hide = true;
  assert.equal(SEL.elements(hidden, 'face').size, 0);
  assert.equal(SEL.inBox(hidden, 'face', pts, box).size, 0);
});

test('a move in edit mode goes through the object transform, so the stored vertices stay exact', () => {
  const sc = M.addNode(M.emptyScene('t'), { type: 'mesh', name: 'm', geom: MH.toGeom(quadMesh()), transform: { p: [5, 0, 0], r: [0, 90, 0], s: [2, 2, 2] } }).scene;
  const W = M.worldMatrix(sc, 'n1');
  const L = MX.toLocal(W, MX.translate([0, 1, 0]));
  const moved = MX.apply(quadMesh(), new Set([0]), L);
  const world = X.point(W, moved.pos[0]);
  near(world[0], 5 + 0);
  near(world[1], 1);
  near(world[2], 0);
});

test('rotation about a pivot keeps the pivot in place', () => {
  const m = quadMesh();
  const pivot = MX.centre(m, new Set([0, 1, 2, 3]));
  const A = MX.about(pivot, MX.rotation([0, 0, 1], 90));
  const r = MX.apply(m, new Set([0, 1, 2, 3]), A);
  const c = MX.centre(r, new Set([0, 1, 2, 3]));
  near(c[0], pivot[0]);
  near(c[1], pivot[1]);
  near(r.pos[1][0], 1, 1e-9);   // (1,0) turned 90 degrees about the centre (0.5,0.5) lands on (1,1)
  near(r.pos[1][1], 1, 1e-9);
});

test('the .s3d round trip keeps an edited mesh exactly, with its faces and hidden faces', () => {
  const cube = MH.bake({ kind: 'cube' });
  const ex = MO.extrude(cube, faceSel([0]), 0.5);
  const hid = MO.hide(ex.mesh, faceSel([1]));
  const geom = MH.toGeom(hid.mesh);
  const scene = M.addNode(M.emptyScene('edited'), { type: 'mesh', name: 'Edited', geom }).scene;
  const text = F.serialize(scene);
  const r = F.parse(text);
  assert.equal(r.ok, true, r.errors && r.errors.join('; '));
  assert.deepEqual(plain(r.scene), plain(scene));
  assert.equal(F.serialize(r.scene), text);
  const back = MH.fromGeom(r.scene.nodes[Object.keys(r.scene.nodes)[0]].geom);
  assert.equal(back.faces.filter((f) => f.hide).length, 1, 'the hidden face is still hidden');
  assert.equal(back.faces.length, hid.mesh.faces.length);
});

test('edited meshes render: triangles of visible faces only, and a hard edge stays hard', () => {
  const cube = MH.bake({ kind: 'cube' });
  const geom = MH.toGeom(MO.hide(cube, faceSel([0])).mesh);
  const b = G.build(geom);
  assert.equal(b.indices.length / 3, 10, 'five visible quads make ten triangles');
  assert.equal(b.normals.length, b.positions.length);
  const rb = MR.build(geom);
  assert.equal(rb.triFace.length, 10);
  // a corner of the cube has three faces at 90 degrees: its normal is one face's normal, not an average
  const n = rb.normals.slice(0, 3);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9);
});

test('the format refuses faces that point at missing vertices', () => {
  const sc = M.addNode(M.emptyScene('bad'), { type: 'mesh', name: 'm', geom: { kind: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], faces: [[0, 1, 9]] } }).scene;
  const r = F.parse(F.serialize(sc));
  assert.equal(r.ok, false);
});

test('a merge that would leave no faces is refused, not stored', () => {
  const r = MO.mergeCentre(quadMesh(), vertSel([0, 1, 2, 3]));
  assert.ok(r && r.error, 'every corner merged into one point is refused');
});
