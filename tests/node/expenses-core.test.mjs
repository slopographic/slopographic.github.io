// Slop Expenses, the pure parts (expenses/js/core/expenses.js): the tax inside an amount, the list filter, the monthly
// summary and the CSV export. Also SlopBiz.refusal (shared/biz/biz.js), the readable line for a refused Result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
// SlopI18n with the English business words (shared/biz/i18n), so SlopBiz.refusal reads as it does on a page
require('../../shared/i18n/i18n.js');
globalThis.SlopI18n = globalThis.SlopI18n.create({ defaultLang: 'en', profile: null });   // English in any build (a white-label build may choose another language first)
vm.runInNewContext(readFileSync(new URL('../../shared/biz/i18n/en/biz.js', import.meta.url), 'utf8'), { window: globalThis });
const X = require('../../expenses/js/core/expenses.js');
const B = require('../../shared/biz/biz.js');
require('../../shared/data/money.js');   // SlopData.money.plainMinor, which the CSV is given
const plain = (m, c) => globalThis.SlopData.money.plainMinor(m, c || 'USD');

test('the tax inside an amount that includes it, at a rate in basis points', () => {
  assert.equal(X.taxIn(2400, 2000), 400);     // 24.00 at 20%
  assert.equal(X.taxIn(1000, 700), 65);       // 10.00 at 7%: 65.42 rounds to 65
  assert.equal(X.taxIn(1000, 0), 0);
  assert.equal(X.taxIn(1000, -5), 0);
  assert.equal(X.taxIn(NaN, 2000), 0);
});

const E = [
  { id: '1', date: '2026-10-01', supplier: 'City Taxi', description: 'Airport', amount: 2400, tax: 400, account: '5000', status: 'posted', currency: 'EUR', method: 'card', createdAt: 1 },
  { id: '2', date: '2026-10-15', supplier: 'Paper Co', description: 'Printer paper', amount: 950, tax: 0, account: '5100', status: 'void', currency: 'EUR', method: 'cash', createdAt: 2 },
  { id: '3', date: '2026-09-30', supplier: 'Cloud host', notes: 'Annual, "pro" plan', amount: 12000, tax: 2000, account: '5100', status: 'posted', currency: 'EUR', method: 'bank', createdAt: 3 },
  { id: '4', date: '2026-10-15', supplier: 'Old', amount: 1, account: '5000', status: 'posted', deletedAt: 9 },
];

test('filter: search in supplier, description and notes; status; dates; newest first; deleted left out', () => {
  assert.deepEqual(X.filter(E).map((e) => e.id), ['2', '1', '3']);
  assert.deepEqual(X.filter(E, { search: 'PAPER' }).map((e) => e.id), ['2']);
  assert.deepEqual(X.filter(E, { search: 'pro plan' }).map((e) => e.id), []);
  assert.deepEqual(X.filter(E, { search: '"pro"' }).map((e) => e.id), ['3']);
  assert.deepEqual(X.filter(E, { status: 'posted' }).map((e) => e.id), ['1', '3']);
  assert.deepEqual(X.filter(E, { from: '2026-10-01', to: '2026-10-14' }).map((e) => e.id), ['1']);
});

test('summary: posted expenses by month, newest first, with tax and the total per account', () => {
  assert.deepEqual(X.summary(E), [
    { month: '2026-10', currency: 'EUR', count: 1, amount: 2400, tax: 400, byAccount: { 5000: 2400 } },
    { month: '2026-09', currency: 'EUR', count: 1, amount: 12000, tax: 2000, byAccount: { 5100: 12000 } },
  ]);
  assert.deepEqual(X.summary([]), []);
});

test('CSV: a header, oldest first, decimal amounts, category names, quoted cells; deleted ones left out', () => {
  const text = X.csv(E, { 5000: 'Expenses', 5100: 'Office' }, plain);
  const lines = text.trim().split('\r\n');
  assert.equal(lines[0], 'Date,Supplier,Description,Category,Amount,Tax,Currency,Paid by,Status,Notes');
  assert.equal(lines.length, 4);
  assert.equal(lines[1], '2026-09-30,Cloud host,,5100 Office,120.00,20.00,EUR,bank,posted,"Annual, ""pro"" plan"');
  assert.equal(lines[2], '2026-10-01,City Taxi,Airport,5000 Expenses,24.00,4.00,EUR,card,posted,');
  assert.ok(text.endsWith('\r\n'));
  assert.equal(X.csv([{ date: '2026-01-01', supplier: 'A', amount: 500, account: '5000', status: 'posted', currency: 'JPY' }], {}, plain).split('\r\n')[1].split(',')[4], '500');
});

test('SlopBiz.refusal: field errors, plain words for the code with the message, and the app\'s own words', () => {
  assert.equal(B.refusal({ ok: false, code: 'invalid', errors: [{ field: 'supplier', message: 'is required' }, { field: '', message: 'tax cannot be more than the amount paid' }] }, { fields: { supplier: 'Supplier' } }),
    'Supplier is required. tax cannot be more than the amount paid');
  assert.equal(B.refusal({ ok: false, code: 'invalid_transition', message: 'only a posted expense can be voided' }), 'That change is not allowed: only a posted expense can be voided');
  assert.equal(B.refusal({ ok: false, code: 'invalid_transition' }, { plain: { invalid_transition: 'Not for a void expense' } }), 'Not for a void expense');
  assert.equal(B.refusal({ ok: false, code: 'weird', message: 'odd' }), 'odd');
  assert.equal(B.refusal(null), 'Something went wrong');
  assert.equal(B.refusal({ ok: false, code: 'in_use', message: 'it has stock moves' }, { plain: { in_use: 'Cannot delete' }, brackets: true }), 'Cannot delete (it has stock moves)');
});
