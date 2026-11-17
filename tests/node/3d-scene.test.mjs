// Slop 3D pure logic: scene model, .s3d round trip, history, snapping, groups and the validator.
// Covers: 3d/js/core/ops.js, 3d/js/core/model.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './3d-env.mjs';

const S = await load();
const { model: M, ops: O, history: H, format: F, xform: X, snap: SN } = S;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const addCube = (sc, parent = null, p = [0, 0, 0]) => M.addNode(sc, { type: 'mesh', name: 'Cube', geom: { kind: 'cube' }, transform: { p } }, parent);

test('a scene round-trips through .s3d exactly', () => {
  let sc = M.defaultScene('Round trip');
  const a = addCube(sc, null, [1, 2, 3]);
  const g = O.group(a.scene, [a.id]);
  const b = O.duplicate(g.scene, [g.id]);
  const text = F.serialize(b.scene);
  const r = F.parse(text);
  assert.equal(r.ok, true, r.errors && r.errors.join('; '));
  assert.deepEqual(plain(r.scene), plain(b.scene));
  assert.equal(F.serialize(r.scene), text);
  assert.equal(r.scene.format, 'slop-3d');
  assert.equal(r.scene.version, 1);
});

test('history undo and redo restore exact snapshots', () => {
  const h = H.createHistory();
  const a = { v: 1 }, b = { v: 2, list: [1, 2] }, c = { v: 3 };
  h.reset(a);
  assert.equal(h.record(b), true);
  assert.equal(h.record(b), false, 'an identical snapshot is not recorded');
  h.record(c);
  assert.deepEqual(plain(h.undo()), plain(b));
  assert.deepEqual(plain(h.undo()), plain(a));
  assert.equal(h.undo(), null);
  assert.deepEqual(plain(h.redo()), plain(b));
  assert.deepEqual(plain(h.redo()), plain(c));
  assert.equal(h.redo(), null);
  h.record({ v: 9 });
  assert.equal(h.canRedo(), false, 'a new record drops the redo branch');
});

test('history merges consecutive records with one key into one step', () => {
  const h = H.createHistory();
  h.reset({ x: 0 });
  h.record({ x: 1 }, 'drag');
  h.record({ x: 2 }, 'drag');
  h.record({ x: 3 }, 'drag');
  assert.equal(h.length, 2);
  assert.deepEqual(plain(h.undo()), { x: 0 });
  assert.deepEqual(plain(h.redo()), { x: 3 });
});

test('snapping rounds to the grid step', () => {
  assert.equal(SN.snap(0.4, 0.25), 0.5);
  assert.equal(SN.snap(0.37, 0.25), 0.25);
  assert.equal(SN.snap(0.12, 0.25), 0);
  assert.equal(SN.snap(-0.13, 0.25), -0.25);
  assert.equal(SN.snap(1.234, 0), 1.234, 'step 0 means off');
  assert.deepEqual(SN.snapVec([0.26, 1.7, -2.2], 0.5), [0.5, 1.5, -2]);
});

test('a group transform applies to its children', () => {
  let sc = M.defaultScene('Group');
  const g = M.addNode(sc, { type: 'group', name: 'G', transform: { p: [10, 0, 0], r: [0, 90, 0], s: [2, 2, 2] } });
  const c = addCube(g.scene, g.id, [1, 0, 0]);
  const W = M.worldMatrix(c.scene, c.id);
  const p = X.point(W, [0, 0, 0]);
  // Ry(90) turns the scaled local offset (2, 0, 0) into (0, 0, -2), then the group moves it to x = 10.
  near(p[0], 10); near(p[1], 0); near(p[2], -2);
  const moved = O.moveBy(c.scene, [g.id], [0, 3, 0]);
  const p2 = X.point(M.worldMatrix(moved, c.id), [0, 0, 0]);
  near(p2[1], 3); near(p2[0], 10); near(p2[2], -2);
  // The child's local transform is untouched by moving its parent.
  assert.deepEqual(plain(moved.nodes[c.id].transform.p), [1, 0, 0]);
});

test('reparenting an id that is not a node of the scene (__proto__ from a foreign drag) changes nothing', () => {
  const sc = addCube(M.defaultScene('Drag')).scene;
  for (const id of ['__proto__', 'constructor', 'prototype', 'nope']) assert.equal(O.reparent(sc, id, null, -1), null, id);
  assert.equal(O.reparent(sc, sc.roots[0], '__proto__', -1), null);
  const proto = Object.getPrototypeOf(M.defaultScene('x').nodes);   // the Object.prototype of the scripts' own realm
  assert.equal(proto.transform, undefined);
  assert.equal(proto.parent, undefined);
});

test('reparenting keeps the world position', () => {
  let sc = M.defaultScene('Reparent');
  const c = addCube(sc, null, [1, 2, 3]);
  const g = M.addNode(c.scene, { type: 'group', name: 'G', transform: { p: [5, 0, 0] } });
  const moved = O.reparent(g.scene, c.id, g.id, -1);
  assert.ok(moved);
  const p = X.point(M.worldMatrix(moved, c.id), [0, 0, 0]);
  near(p[0], 1); near(p[1], 2); near(p[2], 3);
  near(moved.nodes[c.id].transform.p[0], -4);
  assert.equal(O.reparent(moved, g.id, c.id, -1), null, 'a mesh cannot take children');
  assert.equal(O.reparent(moved, g.id, g.id, -1), null, 'a group cannot hold itself');
});

test('duplicate makes new ids and keeps the hierarchy', () => {
  let sc = M.defaultScene('Dup');
  const g = M.addNode(sc, { type: 'group', name: 'G' });
  const c1 = addCube(g.scene, g.id), c2 = addCube(c1.scene, g.id);
  const d = O.duplicate(c2.scene, [g.id]);
  assert.equal(d.ids.length, 1);
  const copy = d.scene.nodes[d.ids[0]];
  assert.notEqual(copy.id, g.id);
  assert.equal(copy.children.length, 2);
  for (const k of copy.children) assert.ok(!(k in c2.scene.nodes), 'children get fresh ids');
  assert.equal(d.scene.roots.indexOf(d.ids[0]), d.scene.roots.indexOf(g.id) + 1, 'the copy sits next to the original');
});

test('removing a group removes everything below it', () => {
  let sc = M.defaultScene('Del');
  const g = M.addNode(sc, { type: 'group', name: 'G' });
  const c = addCube(g.scene, g.id);
  const out = M.removeNodes(c.scene, [g.id]);
  assert.equal(out.nodes[g.id], undefined);
  assert.equal(out.nodes[c.id], undefined);
  assert.equal(out.roots.includes(g.id), false);
  assert.equal(out.roots.length, 2, 'the two default lights stay');
});

test('ungroup returns the children to the parent, in place', () => {
  let sc = M.defaultScene('Ungroup');
  const a = addCube(sc, null, [4, 0, 0]);
  const g = O.group(a.scene, [a.id]);
  const out = O.ungroup(g.scene, g.id);
  assert.equal(out.nodes[g.id], undefined);
  assert.deepEqual(plain(out.roots.filter((id) => out.nodes[id].type === 'mesh')), [a.id]);
  near(out.nodes[a.id].transform.p[0], 4);
});

test('setField and moveBy respect nesting and only move top-level nodes', () => {
  let sc = M.defaultScene('Fields');
  const c = addCube(sc);
  const s1 = O.setField(c.scene, c.id, 'material.color', '#ff0000');
  assert.equal(s1.nodes[c.id].material.color, '#ff0000');
  assert.equal(O.setField(c.scene, 'nope', 'name', 'x'), null);
  const m = O.moveBy(s1, [c.id], [1, 0, 0.5]);
  assert.deepEqual(plain(m.nodes[c.id].transform.p), [1, 0, 0.5]);
});

test('bounds of a unit cube are plus and minus half a unit', () => {
  let sc = M.defaultScene('Bounds');
  const c = addCube(sc);
  const bb = O.bounds(c.scene);
  near(bb.min[0], -0.5); near(bb.max[2], 0.5); near(bb.max[1], 0.5);
});

test('the validator rejects bad files without throwing', () => {
  const good = () => plain(addCube(M.defaultScene('V')).scene);
  const cases = {
    'null': null,
    'a string': 'hello',
    'an array': [],
    'wrong format': Object.assign(good(), { format: 'other' }),
    'newer version': Object.assign(good(), { version: 99 }),
    'no nodes': Object.assign(good(), { nodes: undefined }),
    'NaN position': (() => { const s = good(); const k = Object.keys(s.nodes).find((i) => s.nodes[i].type === 'mesh'); s.nodes[k].transform.p = [NaN, 0, 0]; return s; })(),
    'bad colour': (() => { const s = good(); const k = Object.keys(s.nodes).find((i) => s.nodes[i].type === 'mesh'); s.nodes[k].material.color = 'red'; return s; })(),
    'negative radius': (() => { const s = good(); const k = Object.keys(s.nodes).find((i) => s.nodes[i].type === 'mesh'); s.nodes[k].geom = { kind: 'sphere', radius: -1, segments: 8, rings: 4 }; return s; })(),
    'unknown shape': (() => { const s = good(); const k = Object.keys(s.nodes).find((i) => s.nodes[i].type === 'mesh'); s.nodes[k].geom = { kind: 'dragon' }; return s; })(),
    'index out of range': (() => { const s = good(); const k = Object.keys(s.nodes).find((i) => s.nodes[i].type === 'mesh'); s.nodes[k].geom = { kind: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 7] }; return s; })(),
    'a loop of parents': (() => { const s = good(); s.nodes.a = { id: 'a', type: 'group', name: 'a', visible: true, parent: 'b', transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, children: ['b'] }; s.nodes.b = { id: 'b', type: 'group', name: 'b', visible: true, parent: 'a', transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, children: ['a'] }; return s; })(),
    'a missing root': (() => { const s = good(); s.roots = []; return s; })(),
    'a light with no kind': (() => { const s = good(); s.nodes.l = { id: 'l', type: 'light', name: 'L', visible: true, parent: null, transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, light: { kind: 'laser', color: '#ffffff', intensity: 1 } }; s.roots.push('l'); return s; })(),
  };
  for (const [label, input] of Object.entries(cases)) {
    let r;
    assert.doesNotThrow(() => { r = F.validate(input); }, label);
    assert.equal(r.ok, false, `${label} should be refused`);
    assert.ok(r.errors.length > 0, label);
  }
  const newer = F.validate(cases['newer version']);
  assert.match(newer.errors[0], /newer/);
  for (const text of ['{not json', '', 'null', '{"format":"slop-3d"}']) {
    let r;
    assert.doesNotThrow(() => { r = F.parse(text); });
    assert.equal(r.ok, false);
  }
  assert.equal(F.validate(good()).ok, true, 'a good scene still passes');
});
