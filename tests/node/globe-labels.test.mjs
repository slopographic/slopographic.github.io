// The homepage globe's name labels, the pure part (home/globe/labels.js): how many, where, which icons get one, and that
// they never overlap each other, the copy or a taken box, and stay inside the hero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const L = createRequire(import.meta.url)('../../home/globe/labels.js');
const base = { W: 1280, H: 800, cx: 900, cy: 400, r: 260, prev: new Set(), rects: [], block: [] };
const c = (id, x, y, z, more = {}) => ({ id, text: 'App ' + id, x, y, z, half: 24, op: 1, match: false, ...more });
const ids = (out) => out.map((p) => p.id);
const clash = (a, b) => a.l < b.l + b.w && b.l < a.l + a.w && a.t < b.t + b.h && b.t < a.t + a.h;

test('limits: a few at rest, more while searching, fewer at phone width', () => {
  assert.ok(L.limit(false, false) <= 6 && L.limit(false, true) < L.limit(false, false));
  assert.ok(L.limit(true, false) > L.limit(false, false) && L.limit(true, true) < L.limit(true, false));
  assert.ok(L.limit(false, true) >= 2);
});

test('a box sits under its icon, sized from the text, smaller at phone width, kept inside the hero', () => {
  const b = L.boxFor(c('a', 500, 300, 1), { W: 1280 });
  assert.equal(b.t, 300 + 24 + 6);
  assert.ok(Math.abs(b.l + b.w / 2 - 500) < 1);
  assert.ok(L.boxFor({ ...c('a', 500, 300, 1), text: 'A much longer app name' }, { W: 1280 }).w > b.w);
  assert.ok(L.boxFor(c('a', 500, 300, 1), { W: 390, narrow: true }).w < b.w);
  assert.equal(L.boxFor({ ...c('a', 200, 300, 1), text: 'A very long app name: with a long description' }, { W: 390, narrow: true }).w, L.NARROW_MAX);
  const edge = L.boxFor(c('a', 2, 300, 1), { W: 390, narrow: true });
  assert.ok(edge.l >= L.EDGE[1]);
  const right = L.boxFor(c('a', 388, 300, 1), { W: 390, narrow: true });
  assert.ok(right.l + right.w <= 390 - L.EDGE[1]);
});

test('a long label near the right of a 1280 px hero keeps a margin inside its edge (a search for "batch")', () => {
  const text = 'Batch workflows across apps';
  for (const x of [1150, 1230, 1279]) {
    const b = L.boxFor({ ...c('wf', x, 300, 1), text }, { W: 1280 });
    assert.ok(L.EDGE[0] >= 12, 'a real margin, not a few pixels');
    assert.ok(b.l + b.w <= 1280 - L.EDGE[0], `${x}: right edge ${b.l + b.w}`);
    assert.ok(b.w >= text.length * 11 * 0.68 + 18, 'wide enough for the uppercase mono text with its letter spacing');
  }
  const left = L.boxFor({ ...c('wf', 3, 300, 1), text }, { W: 1280 });
  assert.ok(left.l >= L.EDGE[0]);
  const out = L.pick([{ ...c('wf', 1260, 400, 0.9, { match: true }), text }], { ...base, W: 1280, searching: true, max: 6 });
  assert.equal(out.length, 1);
  assert.ok(out[0].l + out[0].w <= 1280 - L.EDGE[0]);
});

test('at rest: only icons facing you near the centre, the front-most and most central first, at most the limit', () => {
  const cands = [
    c('front', 900, 380, 0.98), c('side', 1000, 330, 0.7), c('back', 900, 200, -0.5), c('edge', 1150, 600, 0.55),
    c('faded', 860, 520, 0.9, { op: 0.2 }), c('low', 780, 520, 0.8), c('more1', 800, 300, 0.85), c('more2', 1040, 520, 0.8),
  ];
  const out = L.pick(cands, { ...base, max: 3 });
  assert.equal(out.length, 3);
  assert.deepEqual(ids(out), ['front', 'more1', 'side']);
  for (const no of ['back', 'faded', 'edge']) assert.ok(!ids(out).includes(no), no);
});

test('labels never overlap: a colliding one is skipped for the next that fits', () => {
  const cands = [c('a', 900, 400, 1), c('b', 910, 404, 0.99), c('c', 900, 470, 0.97), c('d', 760, 300, 0.9)];
  const out = L.pick(cands, { ...base, max: 5 });
  assert.ok(ids(out).includes('a') && !ids(out).includes('b'));
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!clash(out[i], out[j]), out[i].id + ' ' + out[j].id);
  // many icons crowding the front: still no two boxes touch
  const crowd = Array.from({ length: 40 }, (_, i) => c('n' + i, 820 + (i % 8) * 22, 330 + Math.floor(i / 8) * 30, 0.95 - i * 0.001));
  const many = L.pick(crowd, { ...base, max: 12 });
  assert.ok(many.length >= 3);
  for (let i = 0; i < many.length; i++) for (let j = i + 1; j < many.length; j++) assert.ok(!clash(many[i], many[j]));
});

test('they keep clear of the copy, of taken boxes (a hovered icon\'s own chip) and of the hero\'s edges', () => {
  const a = c('a', 900, 400, 1);
  assert.deepEqual(ids(L.pick([a], { ...base, max: 3 })), ['a']);
  assert.deepEqual(ids(L.pick([a], { ...base, max: 3, rects: [{ l: 850, t: 420, r: 1000, b: 460 }] })), []);
  assert.deepEqual(ids(L.pick([a], { ...base, max: 3, block: [L.boxFor(a, base)] })), []);
  assert.deepEqual(ids(L.pick([c('low', 900, 790, 1)], { ...base, cy: 700, max: 3 })), []);
});

test('a label shown last time holds on a little past the thresholds, so it does not flicker at the edge', () => {
  const edge = c('e', 900, 400, 0.45);
  assert.deepEqual(ids(L.pick([edge], { ...base, max: 3 })), []);
  assert.deepEqual(ids(L.pick([edge], { ...base, max: 3, prev: new Set(['e']) })), ['e']);
  // and it wins a close call against a newcomer it would collide with
  const a = c('a', 900, 400, 0.9), b = c('b', 905, 402, 0.92);
  assert.equal(L.pick([a, b], { ...base, max: 3, prev: new Set(['a']) })[0].id, 'a');
});

test('searching: the matches on the near side are named, the rest never; as many as fit up to the limit', () => {
  const cands = [
    c('m1', 900, 400, 0.9, { match: true }), c('m2', 700, 300, 0.2, { match: true }), c('m3', 1100, 520, 0.1, { match: true }),
    c('mback', 900, 200, -0.6, { match: true }), c('other', 820, 600, 1), c('m4', 760, 520, 0.5, { match: true }),
  ];
  const out = L.pick(cands, { ...base, searching: true, max: L.limit(true, false) });
  assert.deepEqual(ids(out).sort(), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(out[0].id, 'm1');
  assert.deepEqual(ids(L.pick(cands, { ...base, searching: true, max: 2 })), ['m1', 'm4']);
});
