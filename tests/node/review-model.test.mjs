// SlopReview model: select all, none, invert, the checked count and total size, and group handling.
// Loads the real shared/review/model.js in a vm context (see storage-env.mjs). Run: node tests/run.mjs review
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './storage-env.mjs';

const ctx = await loadClassic(['shared/review/model.js']);
const M = ctx.SlopReview.model;
const items = M.normalise([
  { id: 'a', label: 'A', size: 100, group: 'Thumbs', checked: true },
  { id: 'b', label: 'B', size: 2048, group: 'Thumbs', checked: false },
  { id: 'c', label: 'C', group: 'Faces', checked: true },
  { id: 'd', label: 'D', size: 1024 * 1024, checked: true },
]);

test('normalise keeps the order, drops repeated and blank ids, and reads the flags', () => {
  const out = [...M.normalise([{ id: 'x', label: 'X', checked: 1 }, { id: 'x', label: 'again' }, { label: 'no id' }, null, { id: 'y' }])];
  assert.deepEqual(out.map((i) => i.id), ['x', 'y']);
  assert.equal(out[0].checked, true);
  assert.equal(out[1].checked, false);
  assert.equal(out[1].size, undefined);
  assert.equal(out[1].group, '');
});

test('the starting selection is each item\'s own checked flag', () => {
  assert.deepEqual([...M.initial(items)].sort(), ['a', 'c', 'd']);
});

test('select all and select none', () => {
  assert.deepEqual([...M.selectAll(items)], ['a', 'b', 'c', 'd']);
  assert.equal(M.selectNone().size, 0);
});

test('invert flips every item, so checked becomes unchecked and the rest checked', () => {
  const start = M.initial(items);
  assert.deepEqual([...M.invert(items, start)], ['b']);
  assert.deepEqual([...M.invert(items, M.selectNone())].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...M.invert(items, M.selectAll(items))], []);
});

test('invert and the other operations do not change their input set', () => {
  const start = M.initial(items);
  M.invert(items, start); M.toggle(start, 'b'); M.selectAll(items);
  assert.deepEqual([...start].sort(), ['a', 'c', 'd']);
});

test('toggle adds or removes one id and returns a new set', () => {
  const start = M.initial(items);
  const on = M.toggle(start, 'b');
  assert.equal(on.has('b'), true);
  assert.equal(start.has('b'), false);
  assert.equal(M.toggle(on, 'b').has('b'), false);
});

test('summary gives the checked count and the total size of the checked items', () => {
  const s = M.summary(items, M.initial(items));
  assert.equal(s.count, 3);
  assert.equal(s.total, 100 + 1024 * 1024);
  assert.equal(s.hasSizes, true);
  assert.equal(s.all, false);
  assert.equal(M.summary(items, M.selectAll(items)).all, true);
  assert.equal(M.summary(items, M.selectAll(items)).total, 100 + 2048 + 1024 * 1024);
});

test('summary counts an item without a size but leaves it out of the total', () => {
  const s = M.summary(items, new Set(['c']));
  assert.equal(s.count, 1);
  assert.equal(s.total, 0);
  const none = M.summary(M.normalise([{ id: 'p', label: 'P' }]), new Set(['p']));
  assert.equal(none.count, 1);
  assert.equal(none.hasSizes, false);
});

test('groups keep the order each group first appears; ungrouped items form the group ""', () => {
  const g = [...M.groups(items)].map((x) => ({ name: x.name, items: [...x.items] }));
  assert.deepEqual(g.map((x) => x.name), ['Thumbs', 'Faces', '']);
  assert.deepEqual(g[0].items.map((i) => i.id), ['a', 'b']);
});

test('rows put one heading before each named group and none before ungrouped items', () => {
  const rows = [...M.rows(items)];
  assert.deepEqual(rows.map((r) => (r.type === 'group' ? 'G:' + r.name + ':' + r.count : r.item.id)),
    ['G:Thumbs:2', 'a', 'b', 'G:Faces:1', 'c', 'd']);
});

test('bytes and plural read well', () => {
  assert.equal(M.bytes(0), '0 B');
  assert.equal(M.bytes(1536), '1.5 KB');
  assert.equal(M.bytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(M.bytes(20 * 1024 * 1024 * 1024), '20 GB');
  assert.equal(M.bytes(undefined), '');
  assert.equal(M.plural(1, 'file'), '1 file');
  assert.equal(M.plural(3, 'file'), '3 files');
  assert.equal(M.plural(2, 'copy', 'copies'), '2 copies');
});

test('ids come back in list order, only the checked ones', () => {
  assert.deepEqual([...M.ids(items, new Set(['d', 'a']))], ['a', 'd']);
});
