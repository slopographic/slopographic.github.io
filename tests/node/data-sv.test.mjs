// The business records' messages in Swedish: validation, status flows, repeat schedules, barcodes and the example files
// read shared/i18n/ui/sv/data.js, data2.js (and calendar.js: the repeat words) when Swedish is chosen (they were English in every language).
// Covers: shared/data/schema.js, shared/data/schema-defs.js, shared/data/schema-checks.js, shared/data/recurring.js,
// shared/data/barcode.js, shared/data/examples.js, shared/data/bundle-check.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const I18N = path.join(ROOT, 'shared', 'i18n');
const ctx = { crypto: globalThis.crypto };
ctx.window = ctx;
vm.createContext(ctx);
const run = async (f) => vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: path.basename(f) });
await run(path.join(I18N, 'i18n.js'));
vm.runInContext("window.SlopI18n = window.SlopI18n.create({ defaultLang: 'sv', profile: null });", ctx);
for (const c of ['en', 'sv']) for (const p of [c + '.js', c + '/data.js', c + '/data2.js', c + '/calendar.js']) await run(path.join(I18N, 'ui', p));
for (const f of ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js', 'numbering.js', 'ledger.js', 'bundle-check.js', 'recurring.js', 'examples.js']) {
  await run(path.join(ROOT, 'shared', 'data', f));
}
const D = ctx.SlopData;

test('a missing field and a bad value say so in Swedish', () => {
  const r = D.schema.prepare('customers', {});
  assert.equal(r.ok, false);
  assert.match(D.schema.errorText(r.errors), /^name är obligatoriskt$/);
  const p = D.schema.prepare('products', { sku: 'A', name: 'B', price: 100, taxRate: 20000 });
  assert.match(D.schema.errorText(p.errors), /momssats i baspunkter/);
});

test('a status move and a delete refusal are Swedish, with the status words too', () => {
  const why = D.schema.checkTransition('invoices', { status: 'draft' }, { status: 'paid' });
  assert.equal(why, 'en faktura kan inte gå från utkast till betald');
  assert.equal(D.schema.removable('orders', {}), 'order kan inte tas bort; avbryt dem i stället');
  assert.equal(D.schema.removable('invoices', { status: 'issued' }), 'utfärdade fakturor kan inte tas bort; makulera dem i stället');
});

test('repeat schedules, barcodes, example files and import checks read Swedish', () => {
  assert.equal(D.recurring.describe({ every: 1, unit: 'month' }), 'varje månad');
  assert.equal(D.recurring.describe({ every: 2, unit: 'week' }), 'var 2:e vecka');
  assert.throws(() => D.barcode.randomValues(0), /Antalet måste vara från 1 till 10/);
  assert.equal(ctx.SlopExamples.info('inventory').title, 'Lagerprodukter (CSV-import)');
  assert.deepEqual([...D.bundleCheck.validateBundle({}).errors], ['inte en exportfil från slop-data']);
});

test('the starting chart of accounts is named in Swedish when the books are set up', () => {
  assert.deepEqual([...D.schema.DEFAULT_CHART].map((a) => a.name), ['Kassa', 'Bank', 'Kundfordringar', 'Leverantörsskulder', 'Utgående moms', 'Eget kapital', 'Försäljning', 'Kostnader']);
  assert.equal(JSON.parse(JSON.stringify(D.schema.DEFAULT_CHART[0])).name, 'Kassa');   // a copy keeps the name, as the store saves it
});
