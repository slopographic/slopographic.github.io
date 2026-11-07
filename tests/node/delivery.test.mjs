// Slop Orders' delivery note (orders/js/core/delivery.js): one row per line with the product's unit, no prices, and totals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../../orders/js/core/delivery.js');

test('rows with SKU, description, quantity and the product unit (each without a product); lines and items counted', () => {
  const order = { lines: [
    { productId: 'p1', sku: 'PAP-A4', description: 'Copy paper', qty: 5, unitPrice: 650 },
    { description: 'Delivery', qty: 1, unitPrice: 900 },
    { productId: 'gone', sku: 'OLD', description: 'Old item', qty: 2 },
  ] };
  const note = D.noteOf(order, [{ id: 'p1', unit: 'ream' }]);
  assert.deepEqual(note.rows, [
    { sku: 'PAP-A4', description: 'Copy paper', qty: 5, unit: 'ream' },
    { sku: '', description: 'Delivery', qty: 1, unit: 'each' },
    { sku: 'OLD', description: 'Old item', qty: 2, unit: 'each' },
  ]);
  assert.deepEqual([note.lines, note.items], [3, 8]);
  assert.ok(!('unitPrice' in note.rows[0]));
});
