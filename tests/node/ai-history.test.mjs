// Slop AI's message history (shared/ai/history.js): Up/Down recall as in the Claude Code CLI. One list for every app on
// the device, the last 100, no repeat of the newest; the draft comes back after the newest; storage that throws is fine.
// Covers: shared/ai/history.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../shared/ai/history.js', import.meta.url), 'utf8');
function load(storage) {
  const data = new Map();
  const ls = storage || { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const w = { localStorage: ls, document: {} };
  w.window = w;
  vm.runInContext(SRC, vm.createContext(w));
  return { H: w.SlopAIKit.history, data };
}
const box = (value = '') => { const b = { value }; return { b, cur: (H) => H.cursor(() => b.value, (t) => { b.value = t; }) }; };

test('add keeps the order, skips blanks and a repeat of the newest, keeps the last 100, in localStorage', () => {
  const { H, data } = load();
  H.add('one'); H.add('two'); H.add('two'); H.add('  '); H.add('one');
  assert.deepEqual([...H.list()], ['one', 'two', 'one']);
  assert.deepEqual(JSON.parse(data.get('slop-ai.history')), ['one', 'two', 'one']);
  for (let i = 0; i < 130; i++) H.add('m' + i);
  assert.equal(H.list().length, 100);
  assert.equal(H.list()[99], 'm129');
});

test('Up goes back, Down forward and finally to the draft being typed', () => {
  const { H } = load();
  ['first', 'second', 'third'].forEach(H.add);
  const { b, cur } = box('half-typed'), c = cur(H);
  assert.equal(c.down(), false, 'Down on the draft does nothing');
  assert.equal(c.up(), true); assert.equal(b.value, 'third');
  c.up(); assert.equal(b.value, 'second');
  c.up(); assert.equal(b.value, 'first');
  assert.equal(c.up(), false, 'no older message'); assert.equal(b.value, 'first');
  c.down(); c.down(); assert.equal(b.value, 'third');
  c.down(); assert.equal(b.value, 'half-typed', 'the draft is back');
  assert.equal(c.down(), false);
  c.up(); b.value = 'third, edited'; c.reset();
  c.up(); assert.equal(b.value, 'third'); c.down(); assert.equal(b.value, 'third, edited');
});

test('the arrows recall only from the first line (Up) or the last line (Down), with nothing selected', () => {
  const { H } = load();
  const ta = (value, s, e = s) => ({ value, selectionStart: s, selectionEnd: e });
  assert.equal(H.atEdge(ta('one line', 4), 'up'), true);
  assert.equal(H.atEdge(ta('one line', 4), 'down'), true);
  assert.equal(H.atEdge(ta('a\nb', 3), 'up'), false);
  assert.equal(H.atEdge(ta('a\nb', 1), 'up'), true);
  assert.equal(H.atEdge(ta('a\nb', 1), 'down'), false);
  assert.equal(H.atEdge(ta('\nb', 0), 'up'), true);
  assert.equal(H.atEdge(ta('abc', 0, 3), 'up'), false, 'a selection moves with the arrows as usual');
});

test('storage that throws (a private window, full quota): the list lives in the page', () => {
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const { H } = load(bad);
  H.add('kept here');
  assert.deepEqual([...H.list()], ['kept here']);
});
