// Slop Ledger financial statements (ledger/js/core/statements.js): periods, profit and loss, and the balance sheet with the
// result to date, from the journal through SlopData.ledger.summarize.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
const DATA = ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js', 'ledger.js'].map((f) => 'shared/data/' + f);
for (const f of [...DATA, 'ledger/js/core/statements.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const F = ctx.SlopLedger.statements;
const plain = (v) => JSON.parse(JSON.stringify(v));
const CHART = [{ code: '1000', name: 'Cash', type: 'asset' }, { code: '1010', name: 'Bank', type: 'asset' }, { code: '1200', name: 'Accounts Receivable', type: 'asset' },
  { code: '2100', name: 'Sales Tax Payable', type: 'liability' }, { code: '3000', name: 'Equity', type: 'equity' }, { code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { code: '5000', name: 'Expenses', type: 'expense' }];
const J = (id, date, lines) => ({ id, date, lines: lines.map(([account, debit, credit]) => ({ account, debit, credit })) });
const BOOKS = [
  J('own', '2025-12-01', [['1010', 500000, 0], ['3000', 0, 500000]]),           // the owner puts 5,000 in
  J('inv', '2026-02-10', [['1200', 120000, 0], ['4000', 0, 100000], ['2100', 0, 20000]]),
  J('pay', '2026-03-01', [['1010', 120000, 0], ['1200', 0, 120000]]),
  J('exp', '2026-04-15', [['5000', 30000, 0], ['1010', 0, 30000]]),
  J('old', '2025-11-20', [['5000', 10000, 0], ['1010', 0, 10000]]),             // last year's cost
];

test('periods: this month, quarter and year, and last year', () => {
  assert.deepEqual(plain(F.period('month', '2026-02-14')), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(plain(F.period('quarter', '2026-05-03')), { from: '2026-04-01', to: '2026-06-30' });
  assert.deepEqual(plain(F.period('year', '2026-10-24')), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(plain(F.period('last-year', '2026-10-24')), { from: '2025-01-01', to: '2025-12-31' });
});

test('profit and loss for a period: revenue less expenses, only entries inside it', () => {
  const p = F.profitAndLoss(BOOKS, CHART, { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(plain(p.revenue), [{ code: '4000', name: 'Sales Revenue', amount: 100000 }]);
  assert.deepEqual(plain(p.expenses), [{ code: '5000', name: 'Expenses', amount: 30000 }]);
  assert.deepEqual([p.totalRevenue, p.totalExpenses, p.result], [100000, 30000, 70000]);
  assert.equal(F.profitAndLoss(BOOKS, CHART, { from: '2025-01-01', to: '2025-12-31' }).result, -10000);
});

test('balance sheet at a date: assets equal liabilities plus equity and the result to date', () => {
  const b = F.balanceSheet(BOOKS, CHART, { at: '2026-04-30' });
  assert.deepEqual(plain(b.assets), [{ code: '1010', name: 'Bank', amount: 580000 }]);   // AR is settled: not listed
  assert.deepEqual(plain(b.liabilities), [{ code: '2100', name: 'Sales Tax Payable', amount: 20000 }]);
  assert.deepEqual(plain(b.equity), [{ code: '3000', name: 'Equity', amount: 500000 }]);
  assert.equal(b.resultToDate, 60000);   // 100,000 revenue less 30,000 this year and 10,000 last year
  assert.deepEqual([b.totalAssets, b.totalLiabilities, b.totalEquity, b.balanced], [580000, 20000, 560000, true]);
  const early = F.balanceSheet(BOOKS, CHART, { at: '2026-02-28' });
  assert.equal(early.assets.find((a) => a.code === '1200').amount, 120000);   // the invoice is still owed then
  assert.equal(early.balanced, true);
});
