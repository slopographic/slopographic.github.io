// The example CSVs (shared/data/examples.js): header names, row widths, quoting, and the importers' own rules
// (SKU, Name and Price columns for inventory; valid EAN check digits). Runs in a vm context, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'data');
const ctx = { crypto: globalThis.crypto };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['barcode.js', 'examples.js']) vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const X = ctx.SlopExamples, B = ctx.SlopData.barcode;
// Values made in the vm context have another Array prototype; copy them before deepEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** RFC 4180 rows (quotes, doubled quotes, commas inside quotes). */
function parse(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

test('there is an example for every import', () => {
  assert.deepEqual(plain(X.kinds()), ['label', 'inventory', 'contacts', 'crm']);
});

test('each CSV header matches its info columns, and every row has the same width', () => {
  for (const kind of X.kinds()) {
    const info = X.info(kind), rows = parse(X.csv(kind));
    assert.deepEqual(rows[0], plain(info.columns), `${kind} header`);
    assert.ok(rows.length > 1, `${kind} has rows`);
    for (const r of rows) assert.equal(r.length, info.columns.length, `${kind} row width`);
    assert.match(info.note, /\S/);
    assert.match(X.filename(kind), /\.csv$/);
  }
});

test('inventory example has the columns the product importer reads', () => {
  const header = parse(X.csv('inventory'))[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  for (const need of ['sku', 'name', 'price']) assert.ok(header.includes(need), need);
  assert.ok(header.includes('ean'));
  assert.ok(header.includes('reorderlevel'));
});

test('inventory and label examples carry valid EAN-13 values', () => {
  for (const kind of ['inventory', 'label']) {
    const rows = parse(X.csv(kind)), ci = rows[0].indexOf('EAN');
    for (const r of rows.slice(1)) if (r[ci]) assert.equal(B.isValidEan(r[ci]), true, `${kind} ${r[ci]}`);
  }
});

test('label example has a Qty column and the SKU, Name, Price and EAN fields', () => {
  const header = parse(X.csv('label'))[0];
  assert.deepEqual(header, ['SKU', 'Name', 'Price', 'EAN', 'Qty']);
});

test('values with commas are quoted and read back intact', () => {
  const rows = parse(X.csv('inventory'));
  assert.equal(rows[3][2], 'Mint slime, travel size');
  assert.equal(X.csv('inventory').split('\n')[3].includes('"Mint slime, travel size"'), true);
});

test('unknown kinds are refused', () => {
  assert.throws(() => X.csv('nope'), /No example/);
  assert.throws(() => X.info('nope'), /No example/);
});
