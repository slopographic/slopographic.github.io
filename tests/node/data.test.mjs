// Unit tests for shared/data: money, barcodes and record schema (no storage).
// Run: node tests/run.mjs data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './data-env.mjs';

const D = await load(['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js']);
const { money, barcode, schema } = D;
const CUST = 'c1';
const line = (o = {}) => ({ description: 'Bolt', qty: 2, unitPrice: 1050, taxRate: 2000, ...o });

test('mulDiv rounds half away from zero', () => {
  assert.equal(money.mulDiv(5, 1, 10), 1);
  assert.equal(money.mulDiv(4, 1, 10), 0);
  assert.equal(money.mulDiv(15, 1, 10), 2);
  assert.equal(money.mulDiv(25, 1, 10), 3);
  assert.equal(money.mulDiv(-5, 1, 10), -1);
  assert.equal(money.mulDiv(-4, 1, 10), 0);
});

test('tax is rounded on each line, half up', () => {
  assert.equal(money.taxOn(1000, 2000), 200);
  assert.equal(money.taxOn(999, 2000), 200);
  assert.equal(money.taxOn(1, 1000), 0);
  assert.equal(money.taxOn(5, 1000), 1);
  assert.throws(() => money.mulDiv(1.5, 1, 1), /whole numbers/);
});

test('line and document totals come from the lines', () => {
  assert.deepEqual(plain(money.lineAmounts(line({ qty: 3, unitPrice: 333 }))), { net: 999, tax: 200, total: 1199 });
  const t = plain(money.documentTotals([line(), line({ taxRate: 0, unitPrice: 500, qty: 1 })]));
  assert.deepEqual(t, {
    subtotal: 2600, tax: 420, total: 3020,
    byRate: [{ rate: 0, net: 500, tax: 0 }, { rate: 2000, net: 2100, tax: 420 }],
  });
});

test('plainMinor is exact plain text with the currency digits and round-trips with parseMinor', () => {
  assert.equal(money.plainMinor(1250, 'USD'), '12.50');
  assert.equal(money.plainMinor(-5, 'USD'), '-0.05');
  assert.equal(money.plainMinor(0, 'EUR'), '0.00');
  assert.equal(money.plainMinor(500, 'JPY'), '500');
  assert.equal(money.plainMinor(900719925474099, 'USD'), '9007199254740.99');
  for (const n of [1, 99, 100, 123456789]) assert.equal(money.parseMinor(money.plainMinor(n, 'USD')), n);
});

test('parseMinor reads plain decimals and refuses extra precision', () => {
  assert.equal(money.parseMinor('12.34'), 1234);
  assert.equal(money.parseMinor('12.3'), 1230);
  assert.equal(money.parseMinor('12'), 1200);
  assert.equal(money.parseMinor('-0.5'), -50);
  assert.equal(money.parseMinor('12.345'), null);
  assert.equal(money.parseMinor('1,000.00'), null);
  assert.equal(money.parseMinor('abc'), null);
  assert.equal(money.parseMinor('12.5', 'JPY'), null);
  assert.equal(money.parseMinor('1250', 'JPY'), 1250);
});

test('formatMinor uses Intl and the currency digits', () => {
  assert.equal(money.formatMinor(123456, 'USD', 'en-US'), '$1,234.56');
  assert.equal(money.formatMinor(1005, 'USD', 'en-US'), '$10.05');
  assert.equal(money.formatMinor(1250, 'JPY', 'en-US'), '¥1,250');
  assert.equal(money.digits('USD'), 2);
  assert.equal(money.digits('JPY'), 0);
});

test('GS1 check digits: EAN-13, GTIN-8, and the check digit validator', () => {
  assert.equal(barcode.checkDigit('400638133393'), 1);
  assert.equal(barcode.isValidEan('4006381333931'), true);
  assert.equal(barcode.isValidEan('4006381333932'), false);
  assert.equal(barcode.isValidEan('96385074'), true);
  assert.equal(barcode.isValidEan('96385075'), false);
  assert.equal(barcode.isValidEan('12345'), false);
  assert.equal(barcode.isValidEan('4006381333931X'), false);
  assert.equal(barcode.normalizeEan(' 4006-381 333931 '), '4006381333931');
});

test('prepare trims, applies defaults and dedupes tags', () => {
  const r = schema.prepare('customers', { name: '  Ada ', categories: ['vip', ' vip ', '', 'wholesale'], email: '  ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'Ada');
  assert.deepEqual(plain(r.value.categories), ['vip', 'wholesale']);
  assert.equal(r.value.stage, 'lead');
  assert.equal('email' in r.value, false);
});

test('customers: stage must be in the pipeline and unknown fields are refused', () => {
  const r = schema.prepare('customers', { name: 'A', stage: 'won', foo: 1 });
  assert.equal(r.ok, false);
  const fields = r.errors.map((e) => e.field);
  assert.ok(fields.includes('stage'));
  assert.ok(fields.includes('foo'));
  assert.equal(schema.prepare('customers', { name: 'A', stage: 'customer' }).ok, true);
  assert.equal(schema.prepare('customers', { name: '' }).ok, false);
});

test('products: sku required, EAN checked, price a whole non-negative amount', () => {
  const ok = schema.prepare('products', { sku: 'B-1', name: 'Bolt', price: 1050, taxRate: 2000, ean: '4006 381 333931' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.ean, '4006381333931');
  assert.equal(ok.value.unit, 'each');
  assert.ok(schema.prepare('products', { sku: 'B-1', name: 'Bolt', price: 1050, taxRate: 2000, ean: '4006381333932' }).errors.some((e) => e.field === 'ean'));
  assert.ok(schema.prepare('products', { sku: 'B 1', name: 'Bolt', price: 1050, taxRate: 2000 }).errors.some((e) => e.field === 'sku'));
  assert.ok(schema.prepare('products', { sku: 'B-1', name: 'Bolt', price: -1, taxRate: 2000 }).errors.some((e) => e.field === 'price'));
  assert.ok(schema.prepare('products', { sku: 'B-1', name: 'Bolt', price: 1.5, taxRate: 2000 }).errors.some((e) => e.field === 'price'));
});

test('draft invoices derive line and document totals and take no number', () => {
  const r = schema.prepare('invoices', { customerId: CUST, date: '2026-10-11', lines: [line()] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.subtotal, 2100);
  assert.equal(r.value.tax, 420);
  assert.equal(r.value.total, 2520);
  assert.equal(r.value.lines[0].total, 2520);
  assert.equal(r.value.number, undefined);
  assert.equal(r.value.status, 'draft');
});

test('a draft cannot carry a number; an issued invoice needs one unless numbering is deferred', () => {
  assert.ok(schema.prepare('invoices', { customerId: CUST, date: '2026-10-11', lines: [line()], number: 'INV-0001' }).errors.length > 0);
  const issued = { customerId: CUST, date: '2026-10-11', status: 'issued', lines: [line()] };
  assert.ok(schema.prepare('invoices', issued).errors.some((e) => /needs a number/.test(e.message)));
  assert.equal(schema.prepare('invoices', issued, { deferNumber: true }).ok, true);
  assert.equal(schema.prepare('invoices', { ...issued, number: 'INV-0001' }).ok, true);
});

test('dates must be real calendar dates', () => {
  const r = schema.prepare('invoices', { customerId: CUST, date: '2026-02-30', lines: [line()] });
  assert.ok(r.errors.some((e) => e.field === 'date'));
  assert.ok(schema.prepare('invoices', { customerId: CUST, date: '2024-02-29', lines: [line()] }).ok);
});

test('stored totals must match the lines', () => {
  const r = schema.prepare('invoices', { customerId: CUST, date: '2026-10-11', lines: [line()] });
  const stored = { ...r.value, id: 'i1' };
  const bad = { ...stored, total: stored.total + 1 };
  assert.ok(schema.validate('invoices', bad).some((e) => /does not match the lines/.test(e.message)));
  assert.equal(schema.validate('invoices', stored).length, 0);
  assert.ok(schema.validate('invoices', r.value).some((e) => e.field === 'id'));
});

test('invoice transitions: draft to issued to paid or void, and issued documents are fixed', () => {
  const draft = { status: 'draft', lines: [] };
  assert.equal(schema.checkTransition('invoices', draft, { ...draft, status: 'issued' }), null);
  assert.match(schema.checkTransition('invoices', { status: 'issued' }, { status: 'draft' }), /cannot go from issued to draft/);
  assert.match(schema.checkTransition('invoices', { status: 'void' }, { status: 'issued' }), /void to issued/);
  const issued = { status: 'issued', customerId: CUST, date: '2026-10-11', number: 'INV-0001', lines: [1], notes: '', total: 5, subtotal: 5, tax: 0 };
  assert.equal(schema.checkTransition('invoices', issued, { ...issued, status: 'paid' }), null);
  assert.match(schema.checkTransition('invoices', issued, { ...issued, total: 6 }), /cannot be changed/);
});

test('numbering only moves forward; immutable collections refuse changes', () => {
  assert.match(schema.checkTransition('numbering', { next: 5 }, { next: 4 }), /forward/);
  assert.equal(schema.checkTransition('numbering', { next: 5 }, { next: 5 }), null);
  assert.match(schema.checkTransition('journal', {}, {}), /cannot be changed/);
});

test('removal rules: issued invoices, closed orders, accounts and sequences are kept', () => {
  assert.equal(schema.removable('invoices', { status: 'draft' }), null);
  assert.match(schema.removable('invoices', { status: 'issued' }), /void them/);
  assert.match(schema.removable('orders', { status: 'open' }), /cancel/);
  assert.match(schema.removable('accounts', { code: '1000' }), /cannot be deleted/);
  assert.match(schema.removable('journal', {}), /cannot be deleted/);
  assert.equal(schema.removable('customers', { name: 'x' }), null);
});

test('movement sign rules and journal shape', () => {
  assert.match(schema.movementError('receipt', -1), /must add stock/);
  assert.match(schema.movementError('sale', 2), /must remove stock/);
  assert.equal(schema.movementError('sale', -2), null);
  assert.match(schema.movementError('count', 0), /non-zero/);
  assert.equal(schema.movementError('transfer', -3), null);

  const both = schema.journalErrors([{ account: '1000', debit: 5, credit: 5 }, { account: '4000', debit: 0, credit: 0 }]);
  assert.equal(both.length, 2);
  assert.match(schema.journalErrors([{ account: '1000', debit: 100, credit: 0 }, { account: '4000', debit: 0, credit: 90 }])[0], /do not balance/);
  assert.equal(schema.journalErrors([{ account: '1000', debit: 100, credit: 0 }, { account: '4000', debit: 0, credit: 100 }]).length, 0);
});

test('journal lines refuse negative, fractional and zero amounts; unbalanced entries fail validation', () => {
  const neg = schema.prepare('journal', { date: '2026-10-11', source: 'x:1', lines: [{ account: '1000', debit: -5 }, { account: '4000', credit: -5 }] }, { skipKey: true });
  assert.equal(neg.ok, false);
  const frac = schema.prepare('journal', { date: '2026-10-11', source: 'x:2', lines: [{ account: '1000', debit: 5.5 }, { account: '4000', credit: 5 }] }, { skipKey: true });
  assert.ok(frac.errors.some((e) => /debit/.test(e.field)));
  const unbal = schema.prepare('journal', { date: '2026-10-11', source: 'x:3', lines: [{ account: '1000', debit: 100 }, { account: '4000', credit: 90 }] }, { skipKey: true });
  assert.ok(unbal.errors.some((e) => /do not balance/.test(e.message)));
  const fine = schema.prepare('journal', { date: '2026-10-11', source: 'x:4', lines: [{ account: '1000', debit: 100 }, { account: '4000', credit: 100 }] }, { skipKey: true });
  assert.equal(fine.ok, true);
  assert.deepEqual(plain(fine.value.lines[0]), { account: '1000', debit: 100, credit: 0 });
});

test('errorText gives one readable line', () => {
  assert.equal(schema.errorText([{ field: 'qty', message: 'is required' }]), 'qty is required');
  assert.equal(schema.errorText([]), 'invalid record');
  assert.equal(schema.ACCT.AR, '1200');
  assert.equal(schema.DEFAULT_CHART.length, 8);   // with 2000 Accounts Payable
  assert.equal(schema.ACCT.AP, '2000');
});
