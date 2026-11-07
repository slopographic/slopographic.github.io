// Slop Sheets: the header row in sort and filter (shared/sheets/query.js). A first row of text over data is a header:
// sort and filter leave it on top, and the filter's value list leaves it out.
// Run: node --test tests/node/sheets-query-header.test.mjs
// Covers: shared/sheets/query.js, sheetview/js/state.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetFromGrid, KEY } from '../../shared/sheets/csv.js';
import { headerRows, visibleOrder, distinctValues, emptyFilter } from '../../shared/sheets/query.js';
import { createStore } from '../../sheetview/js/state.js';

const PRICES = [
  ['SKU', 'Product', 'Category', 'Unit price (EUR)'],
  ['BW-1', 'Oat milk', 'Dairy-free', '2.85'],
  ['BW-2', 'Beans', 'Coffee', '18.50'],
  ['BW-3', 'Tea', 'Tea', '6.80'],
];
const prices = () => sheetFromGrid('Price list', PRICES);

test('a text row over a number column is a header; a sheet of text only, a one-row sheet or a number row is not', () => {
  assert.equal(headerRows(prices()), 1);
  assert.equal(headerRows(sheetFromGrid('t', [['a', 'b'], ['c', 'd']])), 0);
  assert.equal(headerRows(sheetFromGrid('t', [['a', 'b']])), 0);
  assert.equal(headerRows(sheetFromGrid('t', [['1', 'b'], ['2', 'd']])), 0);
  assert.equal(headerRows(sheetFromGrid('t', [['', ''], ['2', 'd']])), 0);
});

test('a bold first row of text is a header even over text columns', () => {
  const s = sheetFromGrid('t', [['Name', 'City'], ['Ann', 'Oslo'], ['Bob', 'Rome']]);
  s.bold = new Set([KEY(0, 0), KEY(0, 1)]);
  assert.equal(headerRows(s), 1);
});

test('sorting keeps the header row first in both directions', () => {
  const s = prices();
  assert.deepEqual(visibleOrder(s, { sort: { col: 3, dir: 1 }, head: 1 }), [0, 1, 3, 2]);
  assert.deepEqual(visibleOrder(s, { sort: { col: 3, dir: -1 }, head: 1 }), [0, 2, 3, 1]);
  assert.deepEqual(visibleOrder(s, { sort: { col: 1, dir: 1 }, head: 1 }), [0, 2, 1, 3]);
  // Without a head, the old behaviour: every row sorts (text after numbers).
  assert.deepEqual(visibleOrder(s, { sort: { col: 3, dir: 1 } }), [1, 3, 2, 0]);
});

test('filtering leaves the header row on top and its text out of the value list', () => {
  const s = prices();
  const f = { ...emptyFilter(), values: new Set(['Coffee']) };
  assert.deepEqual(visibleOrder(s, { filters: new Map([[2, f]]), head: 1 }), [0, 2]);
  assert.deepEqual(distinctValues(s, 2, 1).map((v) => v.text), ['Coffee', 'Dairy-free', 'Tea']);
  const num = { ...emptyFilter(), op: '>', num: 5 };
  assert.deepEqual(visibleOrder(s, { filters: new Map([[3, num]]), head: 1 }), [0, 2, 3]);
});

test('the viewer store finds the header when a file opens and sorts under it', () => {
  const store = createStore();
  store.addDoc({ name: 'Price list.csv', format: 'csv', sheets: [prices()] });
  assert.equal(store.head(), 1);
  store.cycleSort(3);
  store.cycleSort(3);
  assert.deepEqual(store.order(), [0, 2, 3, 1]);
});
