// Slop Inventory's price list (inventory/js/core/pricelist.js): rows by name with the price with tax, the search, the CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../../shared/data/money.js');
const P = require('../../inventory/js/core/pricelist.js');
const plain = (m) => globalThis.SlopData.money.plainMinor(m, 'USD');
const PRODUCTS = [
  { sku: 'W-2', name: 'Widget', price: 1000, taxRate: 2000, unit: 'box', ean: '4006381333931' },
  { sku: 'A-1', name: 'Anchor, steel', price: 333, taxRate: 750 },
  { sku: 'W-1', name: 'Widget', price: 999, taxRate: 0 },
];

test('rows: by name then SKU, with the unit (each by default) and the price with tax rounded as on invoices', () => {
  assert.deepEqual(P.rows(PRODUCTS).map((r) => [r.sku, r.unit, r.price, r.gross]), [['A-1', 'each', 333, 358], ['W-1', 'each', 999, 999], ['W-2', 'box', 1000, 1200]]);
});

test('search: SKU, name or EAN, any case', () => {
  assert.deepEqual(P.rows(PRODUCTS, { search: 'widg' }).map((r) => r.sku), ['W-1', 'W-2']);
  assert.deepEqual(P.rows(PRODUCTS, { search: '4006381' }).map((r) => r.sku), ['W-2']);
  assert.deepEqual(P.rows(PRODUCTS, { search: 'a-1' }).map((r) => r.sku), ['A-1']);
});

test('CSV: a header, plain amounts, the tax as a percent, quoted names', () => {
  const lines = P.csv(P.rows(PRODUCTS), plain).trim().split('\r\n');
  assert.equal(lines[0], 'SKU,Name,Unit,Price,Tax %,Price with tax');
  assert.equal(lines[1], 'A-1,"Anchor, steel",each,3.33,7.50,3.58');
  assert.equal(lines[3], 'W-2,Widget,box,10.00,20.00,12.00');
});
