// Reading text (shared/data/readtext.js: amounts and dates) and a receipt's lines (expenses/js/core/receipt.js), as OCR
// gives them, into supplier, date, total and tax.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
for (const f of ['shared/data/readtext.js', 'expenses/js/core/receipt.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const R = ctx.SlopExpenses.receipt, T = ctx.SlopData.readText;

test('amounts in a line: dot or comma decimals, thousands, and no percentages', () => {
  assert.deepEqual([...T.amountsIn('Coffee 2 x 3.50   7.00')], [350, 700]);
  assert.deepEqual([...T.amountsIn('Summa 1 234,50 kr')], [123450]);
  assert.deepEqual([...T.amountsIn('TOTAL $1,234.5')], [123450]);
  assert.deepEqual([...T.amountsIn('Moms 25,00 % 61,20')], [6120]);
  assert.deepEqual([...T.amountsIn('Order 10442 table 7')], []);
});

test('one signed amount from a statement cell: signs, brackets, both decimal marks, thousands', () => {
  assert.equal(T.amountOf('-1 234,50'), -123450);
  assert.equal(T.amountOf('(12.00)'), -1200);
  assert.equal(T.amountOf('12.00-'), -1200);
  assert.equal(T.amountOf('€-3,20'), -320);
  assert.equal(T.amountOf('+5'), 500);
  assert.equal(T.amountOf('1.234'), 123400);
  assert.equal(T.amountOf('1,234.56'), 123456);
  assert.equal(T.amountOf('1.234,56'), 123456);
  assert.equal(T.amountOf('12,5'), 1250);
  assert.equal(T.amountOf(''), null);
  assert.equal(T.amountOf('n/a'), null);
});

test('dates: ISO, day first or month first, two-digit years, and month names; not an impossible day', () => {
  assert.equal(T.dateIn('2026-10-24 14:02'), '2026-10-24');
  assert.equal(T.dateIn('Date: 24/10/2026'), '2026-10-24');
  assert.equal(T.dateIn('10/24/2026'), '2026-10-24');       // 24 cannot be a month
  assert.equal(T.dateIn('03/04/2026', false), '2026-03-04');
  assert.equal(T.dateIn('03/04/2026'), '2026-04-03');
  assert.equal(T.dateIn('24.10.26'), '2026-10-24');
  assert.equal(T.dateIn('24 Oct 2026'), '2026-10-24');
  assert.equal(T.dateIn('October 24, 2026'), '2026-10-24');
  assert.equal(T.dateIn('20261024'), '2026-10-24');
  assert.equal(T.dateIn('31/02/2026'), null);
});

test('a US café receipt: the supplier, the date, the total (not the subtotal) and the tax', () => {
  const r = R.parse(['BLUE BOTTLE COFFEE', '315 Linden St', 'Tel 415-555-0199', '10/24/2026 08:15', 'Latte 5.50', 'Croissant 4.25',
    'Subtotal 9.75', 'Sales Tax 0.84', 'TOTAL $10.59', 'Visa **** 1234'], { currency: 'USD', dayFirst: false });
  assert.equal(r.supplier, 'BLUE BOTTLE COFFEE');
  assert.equal(r.date, '2026-10-24');
  assert.equal(r.total, 1059);
  assert.equal(r.tax, 84);
  assert.equal(r.currency, 'USD');
  assert.deepEqual([...r.found], ['supplier', 'date', 'total', 'tax']);
});

test('a Swedish receipt: Summa, Moms with its rate, decimal commas, kr', () => {
  const r = R.parse(['KVITTO', 'ICA Nära Söder', 'Org nr 556677-8899', '2026-10-24 17:41', 'Mjölk 1,5 l   18,90', 'Bröd   34,00',
    'Summa   52,90', 'Moms 12%   5,67', 'Att betala   52,90 SEK'], { currency: 'SEK' });
  assert.equal(r.supplier, 'ICA Nära Söder');
  assert.equal(r.total, 5290);
  assert.equal(r.tax, 567);
  assert.equal(r.date, '2026-10-24');
  assert.equal(r.currency, 'SEK');
});

test('with no total line the largest amount off the tax lines is the total; a tax above the total is dropped; nothing found is null', () => {
  const r = R.parse(['Parking garage', 'Ticket 4471', '2h  6.00', 'Paid 6.00', 'VAT 60.00'], { currency: 'GBP' });
  assert.equal(r.total, 600);
  assert.equal(r.tax, null);   // 60.00 is more than the total: a misread
  const e = R.parse([], { currency: 'EUR' });
  assert.deepEqual([e.supplier, e.date, e.total, e.tax, e.currency, e.found.length], [null, null, null, null, 'EUR', 0]);
});
