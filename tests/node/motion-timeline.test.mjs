// Node tests for shared/motion/timeline.js: sampling, pure key edits, validation and JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './motion-env.mjs';

const M = await load();
const isRange = (e) => e.name === 'RangeError';
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);

function sample2Targets() {
  let tl = M.timeline.create({ duration: 2 });
  tl = M.timeline.addKey(tl, 'box', 'x', { t: 0, value: 0, ease: 'linear' });
  tl = M.timeline.addKey(tl, 'box', 'x', { t: 2, value: 100 });
  tl = M.timeline.addKey(tl, 'box', 'colour', { t: 0, value: { r: 0, g: 0, b: 0, a: 1 } });
  tl = M.timeline.addKey(tl, 'box', 'colour', { t: 1, value: { r: 255, g: 255, b: 255, a: 1 } });
  tl = M.timeline.addKey(tl, 'label', 'text', { t: 0, value: 'hello' });
  tl = M.timeline.addKey(tl, 'label', 'text', { t: 1, value: 'bye' });
  tl = M.timeline.addKey(tl, 'label', 'pos', { t: 0.5, value: [10, 20] });
  tl = M.timeline.addKey(tl, 'label', 'pos', { t: 1.5, value: [30, 40] });
  return tl;
}

test('sample returns values for two targets at a given time', () => {
  const tl = sample2Targets();
  assert.deepEqual(plain(M.timeline.targets(tl)), ['box', 'label']);
  const mid = plain(M.timeline.sample(tl, 0.5));
  near(mid.box.x, 25);
  assert.deepEqual(mid.box.colour, { r: 127.5, g: 127.5, b: 127.5, a: 1 });
  assert.equal(mid.label.text, 'hello', 'string steps hold until their next key');
  assert.deepEqual(mid.label.pos, [10, 20]);
  const at1 = plain(M.timeline.sample(tl, 1));
  assert.equal(at1.label.text, 'bye', 'at a key time the new key is active');
  assert.deepEqual(at1.box.colour, { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(at1.label.pos, [20, 30]);
});

test('sample defaults to the playhead and holds values at both ends', () => {
  let tl = sample2Targets();
  tl = M.timeline.seek(tl, 2);
  assert.equal(tl.playhead, 2);
  near(plain(M.timeline.sample(tl)).box.x, 100);
  assert.equal(plain(M.timeline.sample(tl, -5)).label.text, 'hello');
  assert.equal(plain(M.timeline.sample(tl, 9)).label.text, 'bye');
});

test('seek clamps to [0, duration] when loop is none and wraps otherwise', () => {
  const tl = M.timeline.create({ duration: 2 });
  assert.equal(M.timeline.seek(tl, 5).playhead, 2);
  assert.equal(M.timeline.seek(tl, -1).playhead, 0);
  const looped = M.timeline.create({ duration: 2, loop: 'loop' });
  near(M.timeline.seek(looped, 5).playhead, 1);
  assert.throws(() => M.timeline.seek(tl, NaN), isRange);
});

test('addKey, moveKey, updateKey and deleteKey return new objects and leave the input alone', () => {
  const base = sample2Targets();
  const before = JSON.stringify(base);
  const added = M.timeline.addKey(base, 'box', 'x', { t: 1, value: 40 });
  assert.equal(M.timeline.getKeys(added, 'box', 'x').length, 3);
  const moved = M.timeline.moveKey(added, 'box', 'x', 1, 1.5);
  assert.deepEqual(plain(M.timeline.getKeys(moved, 'box', 'x').map((k) => k.t)), [0, 1.5, 2]);
  const updated = M.timeline.updateKey(moved, 'box', 'x', 1, { value: 77, ease: 'easeInQuad' });
  assert.equal(M.timeline.getKeys(updated, 'box', 'x')[1].value, 77);
  const deleted = M.timeline.deleteKey(updated, 'box', 'x', 0);
  assert.equal(M.timeline.getKeys(deleted, 'box', 'x').length, 2);
  assert.equal(JSON.stringify(base), before, 'input timeline unchanged');
  assert.notEqual(added, base);
});

test('addKey at an existing time replaces that key; moveKey onto another key throws', () => {
  const tl = sample2Targets();
  const replaced = M.timeline.addKey(tl, 'box', 'x', { t: 0, value: 5 });
  assert.equal(M.timeline.getKeys(replaced, 'box', 'x').length, 2);
  assert.equal(M.timeline.getKeys(replaced, 'box', 'x')[0].value, 5);
  assert.throws(() => M.timeline.moveKey(tl, 'box', 'x', 0, 2), isRange);
  assert.throws(() => M.timeline.moveKey(tl, 'box', 'x', 0, -1), isRange);
  assert.throws(() => M.timeline.moveKey(tl, 'box', 'x', 9, 1), isRange);
});

test('deleting the last key removes the track and an empty target disappears', () => {
  let tl = M.timeline.create({ duration: 1 });
  tl = M.timeline.addKey(tl, 'solo', 'x', { t: 0, value: 1 });
  assert.deepEqual(plain(M.timeline.targets(tl)), ['solo']);
  tl = M.timeline.deleteKey(tl, 'solo', 'x', 0);
  assert.deepEqual(plain(M.timeline.targets(tl)), []);
  assert.throws(() => M.timeline.deleteKey(tl, 'solo', 'x', 0), isRange);
});

test('addKey rejects a value of another kind and bad times', () => {
  const tl = sample2Targets();
  assert.throws(() => M.timeline.addKey(tl, 'box', 'x', { t: 3, value: [1, 2] }), isRange);
  assert.throws(() => M.timeline.addKey(tl, 'box', 'x', { t: -1, value: 1 }), isRange);
  assert.throws(() => M.timeline.addKey(tl, 'box', 'x', { t: 1, value: 1, ease: 'nope' }), isRange);
});

test('validate reports bad timelines without throwing', () => {
  assert.equal(M.timeline.validate(sample2Targets()).length, 0);
  assert.ok(M.timeline.validate({ duration: -1, loop: 'none', playhead: 0, tracks: {} }).length > 0);
  assert.ok(M.timeline.validate({ duration: 1, loop: 'spin', playhead: 0, tracks: {} }).length > 0);
  assert.ok(M.timeline.validate({ duration: 1, loop: 'none', playhead: 0, tracks: { a: { x: [{ t: 0, value: 'q' }, { t: 0, value: 1 }] } } }).length > 0);
  assert.ok(M.timeline.validate(null).length > 0);
  assert.throws(() => M.timeline.create({ duration: NaN }), isRange);
});

test('timeline serializes to plain JSON and parses back to an equal timeline', () => {
  const tl = sample2Targets();
  const text = M.timeline.serialize(tl);
  const obj = JSON.parse(text);
  assert.equal(obj.version, 1);
  assert.equal(obj.loop, 'none');
  assert.deepEqual(obj.tracks.label.pos[1], { t: 1.5, value: [30, 40] });
  const back = M.timeline.parse(text);
  assert.deepEqual(plain(back), plain(tl));
  assert.deepEqual(plain(M.timeline.sample(back, 1)), plain(M.timeline.sample(tl, 1)));
});

test('parse accepts hand-written JSON with defaults and rejects broken JSON', () => {
  const tl = M.timeline.parse({ duration: 1, tracks: { card: { scale: [{ t: 0, value: 1 }, { t: 1, value: 2, ease: [0.4, 0, 0.2, 1] }] } } });
  assert.equal(tl.loop, 'none');
  assert.equal(tl.playhead, 0);
  const mid = M.timeline.sample(tl, 0.5).card.scale;
  assert.ok(mid > 1 && mid < 2, 'eased midpoint lies between the keys');
  assert.throws(() => M.timeline.parse('{not json'), isRange);
  assert.throws(() => M.timeline.parse('{"duration":1,"tracks":{"a":{"x":[{"t":2,"value":1},{"t":1,"value":2}]}}}'), isRange);
});
