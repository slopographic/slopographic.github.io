// Spreading the browser test pages over parallel runs (tests/shard.mjs): the shard argument, balanced slices that every
// machine computes the same way, the pool that runs a few at a time, and the timings file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShard, shardPages, pool, mergeTimings, DEFAULT_SECS } from '../shard.mjs';

test('the shard argument is i/n with 1 <= i <= n', () => {
  assert.deepEqual(parseShard('3/8'), { index: 3, count: 8 });
  for (const bad of ['', '0/4', '5/4', '2', 'a/b', '1/0']) assert.throws(() => parseShard(bad), /i\/n/, bad);
});

test('every page lands in exactly one slice, and each slice is in name order', () => {
  const pages = Array.from({ length: 23 }, (_, i) => `tests/p${String(i).padStart(2, '0')}.test.html`);
  const slices = shardPages(pages, 4);
  assert.equal(slices.length, 4);
  assert.deepEqual(slices.flat().sort(), [...pages].sort());
  for (const s of slices) assert.deepEqual(s, [...s].sort());
});

test('slices are balanced by recorded time: the slow page gets a slice of its own', () => {
  const timings = { 'slow.html': 120, 'a.html': 10, 'b.html': 10, 'c.html': 10, 'd.html': 10, 'e.html': 10, 'f.html': 10 };
  const slices = shardPages(Object.keys(timings), 2, timings);
  assert.deepEqual(slices[0], ['slow.html']);
  assert.equal(slices[1].length, 6);
});

test('the split does not depend on the order of the input, and unknown pages count as the default time', () => {
  const pages = ['x.html', 'b.html', 'q.html', 'a.html', 'm.html'];
  const t = { 'q.html': 9 };
  assert.deepEqual(shardPages(pages, 3, t), shardPages([...pages].reverse(), 3, t));
  assert.deepEqual(shardPages(['n.html'], 1), [['n.html']]);
  assert.ok(DEFAULT_SECS > 0);
});

test('more slices than pages leaves some slices empty', () => {
  assert.deepEqual(shardPages(['a.html'], 3).map((s) => s.length), [1, 0, 0]);
});

test('pool runs at most the limit at once and returns the results in item order', async () => {
  let running = 0, peak = 0;
  const out = await pool([30, 5, 20, 1, 10], 2, async (ms, i) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running--;
    return i * 10;
  });
  assert.deepEqual(out, [0, 10, 20, 30, 40]);
  assert.equal(peak, 2);
  assert.deepEqual(await pool([], 4, async () => 1), []);
});

test('timings merge: this run replaces the old times, rounded to tenths, keys sorted', () => {
  assert.deepEqual(mergeTimings({ 'b.html': 5, 'a.html': 1 }, { 'b.html': 7.26, 'c.html': 0.04 }), { 'a.html': 1, 'b.html': 7.3, 'c.html': 0 });
});
