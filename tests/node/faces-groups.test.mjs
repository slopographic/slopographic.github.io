// Face groups (shared/faces/): clustering by embedding, merge, move, split, not-this-person, regroup and undo, all with
// fixed vectors so the result is deterministic. Also the landmark decoding, the alignment transform, the cosine distance
// and the view state's versioned envelope. No browser and no model: the classic scripts run in a vm context with a
// stub localStorage. Named so that both `node tests/run.mjs drive` and `node tests/run.mjs gallery` run it.
// Run alone: node --test tests/node/faces-groups.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
/** A fresh classic-script global with the files run in order. */
function load(files, { storage = memoryStorage(), profile = null } = {}) {
  const et = new EventTarget();
  const sandbox = {
    console, localStorage: storage, CustomEvent, Map, Set, Float32Array,
    addEventListener: (...a) => et.addEventListener(...a),
    dispatchEvent: (e) => et.dispatchEvent(e),
  };
  if (profile) sandbox.SlopProfile = profile;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(f), sandbox, { filename: f });
  return sandbox;
}
const GROUP_FILES = ['shared/faces/decode.js', 'shared/faces/recognize.js', 'shared/faces/groups.js'];

// Unit-length 3-d vectors: A1 and A2 are one person, B1 and B2 another, C a third.
const A1 = [1, 0, 0], A2 = [0.98, 0.199, 0], B1 = [0, 1, 0], B2 = [0.05, 0.9987, 0], C = [0, 0, 1];
const faces = () => [
  { ref: 'gallery:p1#0', emb: A1 }, { ref: 'gallery:p2#0', emb: A2 },
  { ref: 'gallery:p3#0', emb: B1 }, { ref: 'gallery:p3#1', emb: B2 }, { ref: 'gallery:p4#0', emb: C },
];
const shape = (s) => JSON.parse(JSON.stringify(s));
const listOf = (F, s) => shape(F.groups.list(s).map((g) => [g.name, g.refs]));

describe('clustering by embedding', () => {
  test('faces that look alike form one group; others start their own, in ref order', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const s = F.groups.cluster(F.groups.empty(), faces(), 0.3);
    assert.deepEqual(listOf(F, s), [
      ['', ['gallery:p1#0', 'gallery:p2#0']],
      ['', ['gallery:p3#0', 'gallery:p3#1']],
      ['', ['gallery:p4#0']],
    ]);
    assert.deepEqual(shape(s.groups.map((g) => g.id)), ['p1', 'p2', 'p3']);
  });

  test('the result does not depend on the order the faces arrive in', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const a = F.groups.cluster(F.groups.empty(), faces(), 0.3);
    const b = F.groups.cluster(F.groups.empty(), faces().reverse(), 0.3);
    assert.deepEqual(shape(a), shape(b));
  });

  test('the threshold decides: a strict one splits what a loose one joins', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const strict = F.groups.cluster(F.groups.empty(), faces(), 0.001);
    assert.equal(strict.groups.length, 5);
    const loose = F.groups.cluster(F.groups.empty(), faces(), 1.2);
    assert.equal(loose.groups.length, 1);
    assert.equal(F.groups.list(loose)[0].refs.length, 5);
  });

  test('a face without an embedding is left out; a face already in a group keeps it', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const withNone = faces().concat([{ ref: 'gallery:p9#0', emb: null }]);
    const s = F.groups.cluster(F.groups.empty(), withNone, 0.3);
    assert.equal(s.assign['gallery:p9#0'], undefined);
    const again = F.groups.cluster(s, faces().map((f) => (f.ref === 'gallery:p2#0' ? { ref: f.ref, emb: C } : f)), 0.3);
    assert.equal(again.assign['gallery:p2#0'], s.assign['gallery:p2#0']);
  });
});

describe('merge, move, split, not this person', () => {
  const base = () => {
    const F = load(GROUP_FILES).SlopFaces;
    return { F, s: F.groups.cluster(F.groups.empty(), faces(), 0.3) };
  };

  test('merge: one name, one group, every face once', () => {
    const { F, s } = base();
    const m = F.groups.merge(s, 'p1', 'p2', 'Ann');
    assert.deepEqual(listOf(F, m), [['Ann', ['gallery:p1#0', 'gallery:p2#0', 'gallery:p3#0', 'gallery:p3#1']], ['', ['gallery:p4#0']]]);
    const m2 = F.groups.merge(m, 'p3', 'p1');
    const all = F.groups.list(m2).flatMap((g) => g.refs);
    assert.equal(all.length, 5);
    assert.equal(new Set(all).size, 5);
    assert.deepEqual(listOf(F, m2), [['', ['gallery:p1#0', 'gallery:p2#0', 'gallery:p3#0', 'gallery:p3#1', 'gallery:p4#0']]]);
    assert.equal(F.groups.merge(m, 'p3', 'p3'), m); // no-op on the same group
    assert.equal(F.groups.merge(m, 'p3', 'nope'), m);
  });

  test('move: faces go to another group, the emptied group goes, and the faces are marked manual', () => {
    const { F, s } = base();
    const m = F.groups.move(s, ['gallery:p4#0'], 'p1');
    assert.deepEqual(listOf(F, m).map((x) => x[1].length), [3, 2]);
    assert.equal(F.groups.list(m).length, 2);
    assert.equal(m.manual['gallery:p4#0'], true);
    assert.equal(m.assign['gallery:p4#0'], 'p1');
  });

  test('split: the chosen faces go to a new group with the name given', () => {
    const { F, s } = base();
    const r = F.groups.split(s, ['gallery:p3#1'], 'Bo');
    assert.equal(r.id, 'p4');
    assert.deepEqual(listOf(F, r.state), [
      ['', ['gallery:p1#0', 'gallery:p2#0']],
      ['', ['gallery:p3#0']],
      ['', ['gallery:p4#0']],
      ['Bo', ['gallery:p3#1']],
    ]);
    assert.equal(r.state.manual['gallery:p3#1'], true);
  });

  test('not this person: the face leaves its group and is not grouped again by itself', () => {
    const { F, s } = base();
    const n = F.groups.notThis(s, ['gallery:p2#0']);
    assert.equal(n.assign['gallery:p2#0'], undefined);
    assert.equal(n.out['gallery:p2#0'], true);
    const again = F.groups.cluster(n, faces(), 0.3);
    assert.equal(again.assign['gallery:p2#0'], undefined);
    assert.equal(again.out['gallery:p2#0'], true);
  });

  test('rename, and prune removes the faces that are gone and the groups left empty', () => {
    const { F, s } = base();
    const r = F.groups.rename(s, 'p2', '  Cy ');
    assert.equal(r.groups.find((g) => g.id === 'p2').name, 'Cy');
    const pr = F.groups.prune(r, ['gallery:p1#0', 'gallery:p2#0']);
    assert.deepEqual(listOf(F, pr), [['', ['gallery:p1#0', 'gallery:p2#0']]]);
  });

  test('regroup rebuilds the automatic groups and keeps the manual edits', () => {
    const { F, s } = base();
    const moved = F.groups.move(s, ['gallery:p4#0'], 'p1');
    const loose = F.groups.regroup(moved, faces(), 1.2);
    assert.equal(loose.assign['gallery:p4#0'], 'p1');
    assert.equal(F.groups.list(loose).flatMap((g) => g.refs).length, 5);
    const strict = F.groups.regroup(moved, faces(), 0.001);
    assert.equal(strict.assign['gallery:p4#0'], 'p1');
    assert.equal(strict.assign['gallery:p3#1'] !== undefined, true);
  });

  test('undo: each edit goes back one step, up to the history limit', () => {
    const { F, s } = base();
    const h = F.groups.history();
    h.push(s);
    const m = F.groups.merge(s, 'p1', 'p2', 'Ann');
    assert.equal(h.size, 1);
    assert.deepEqual(shape(h.undo()), shape(s));
    assert.equal(h.undo(), null);
    for (let i = 0; i < 60; i++) h.push(m);
    assert.equal(h.size, 50);
  });
});

describe('the fixed vectors and the maths', () => {
  test('cosine distance: 0 for the same direction, 1 for a right angle', () => {
    const F = load(GROUP_FILES).SlopFaces;
    assert.equal(F.cosineDistance([1, 0], [2, 0]), 0);
    assert.equal(F.cosineDistance([1, 0], [0, 3]), 1);
  });

  test('alignment: landmarks already on the template give the identity transform', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const T = F.similarity(F.TEMPLATE);
    for (const [k, v] of Object.entries({ a: 1, b: 0, tx: 0, ty: 0 })) assert.ok(Math.abs(T[k] - v) < 1e-9, k);
  });

  test('YuNet decoding keeps the five landmarks in source pixels', () => {
    const F = load(GROUP_FILES).SlopFaces;
    const n8 = 80 * 80, z = (n) => new Float32Array(n);
    const cls8 = z(n8), obj8 = z(n8), bb8 = z(n8 * 4), kps8 = z(n8 * 10);
    cls8[0] = 1; obj8[0] = 1; // one face at the top-left anchor, 8 px wide
    for (let k = 0; k < 5; k++) { kps8[2 * k] = 0.5; kps8[2 * k + 1] = 0.25; }
    const out = { cls_8: cls8, obj_8: obj8, bbox_8: bb8, kps_8: kps8, cls_16: z(400), obj_16: z(400), bbox_16: z(1600), cls_32: z(100), obj_32: z(100), bbox_32: z(400) };
    const boxes = F.decodeYunet(out, { scale: 1, minScore: 0.6 });
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].kps.length, 5);
    assert.deepEqual(shape(boxes[0].kps[0].map((x) => Math.round(x * 1000) / 1000)), [4, 2]);
    const kept = F.filterBoxes(boxes, { minScore: 0.6, maxIou: 0.3 });
    assert.ok(kept[0].kps, 'landmarks survive suppression');
  });
});

describe('the same-person threshold (Settings)', () => {
  test('read from the profile and kept between 0.2 and 0.8; the default is 0.4', () => {
    const files = ['shared/faces/groups.js', 'shared/faces/people.js'];
    const at = (v) => load(files, { profile: { get: (app, key, dflt) => (v === undefined ? dflt : v) } }).SlopFaces.threshold();
    assert.equal(at(undefined), 0.4);
    assert.equal(at(0.5), 0.5);
    assert.equal(at(0.05), 0.2);
    assert.equal(at(3), 0.8);
    assert.equal(at('nope'), 0.4);
  });
});

describe('view state: the versioned envelope', () => {
  const viewFiles = ['shared/faces/overlay.js', 'shared/faces/view.js'];
  test('the mode defaults to Count only; a valid envelope is read; any other version is ignored', () => {
    const none = load(viewFiles, { storage: memoryStorage() }).SlopFaces.view;
    assert.equal(none.mode(), 'count');
    const boxes = load(viewFiles, { storage: memoryStorage({ 'slop-faces-view': JSON.stringify({ v: 1, data: { mode: 'boxes' } }) }) }).SlopFaces.view;
    assert.equal(boxes.mode(), 'boxes');
    assert.equal(boxes.shown('gallery', 'x'), true);
    const v2 = load(viewFiles, { storage: memoryStorage({ 'slop-faces-view': JSON.stringify({ v: 2, data: { mode: 'boxes' } }) }) }).SlopFaces.view;
    assert.equal(v2.mode(), 'count');
    const junk = load(viewFiles, { storage: memoryStorage({ 'slop-faces-view': '{not json' }) }).SlopFaces.view;
    assert.equal(junk.mode(), 'count');
  });

  test('a photo\'s choice is stored per photo in its own envelope, and the default follows the mode', () => {
    const storage = memoryStorage();
    const V = load(viewFiles, { storage }).SlopFaces.view;
    assert.equal(V.shown('gallery', 'a'), false);
    V.setShown('gallery', 'a', true);
    assert.equal(V.shown('gallery', 'a'), true);
    assert.equal(V.shown('gallery', 'b'), false);
    assert.deepEqual(JSON.parse(storage.getItem('slop-faces-photos')), { v: 1, data: { 'gallery:a': true } });
    V.setShown('gallery', 'a', false);
    assert.equal(V.shown('gallery', 'a'), false);
    V.setMode('boxes');
    assert.equal(V.shown('gallery', 'c'), true);
    assert.equal(V.setMode('nope'), false);
    assert.equal(V.setMode('off'), true);
    assert.deepEqual(JSON.parse(storage.getItem('slop-faces-view')), { v: 1, data: { mode: 'off' } });
  });
});
