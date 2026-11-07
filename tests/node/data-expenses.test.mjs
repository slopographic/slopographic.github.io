// Expenses (shared/data/expenses.js), the pure parts: the journal lines an expense posts, and the totals of a list. The
// recording and voiding against IndexedDB are in tests/data/expenses.test.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, PURE, plain } from './data-env.mjs';

const S = await load([...PURE, 'expenses.js']);
const X = S.expenses;

test('an expense with tax: net to its expense account, tax to the tax account, the total out of the bank; balanced', () => {
  const lines = plain(X.expenseLines({ amount: 2400, tax: 400, account: '5100', method: 'bank' }));
  assert.deepEqual(lines, [
    { account: '5100', debit: 2000, credit: 0 },
    { account: '2100', debit: 400, credit: 0 },
    { account: '1010', debit: 0, credit: 2400 },
  ]);
  assert.equal(lines.reduce((s, l) => s + l.debit - l.credit, 0), 0);
});

test('cash comes out of cash; no tax and no account mean two lines on the default expense account', () => {
  assert.deepEqual(plain(X.expenseLines({ amount: 999, method: 'cash' })), [
    { account: '5000', debit: 999, credit: 0 },
    { account: '1000', debit: 0, credit: 999 },
  ]);
  assert.equal(X.expenseLines({ amount: 10, method: 'card' })[1].account, '1010', 'a card payment comes out of the bank');
});

test('an expense that is all tax posts no zero line for the expense account', () => {
  const lines = plain(X.expenseLines({ amount: 500, tax: 500, method: 'bank' }));
  assert.deepEqual(lines.map((l) => l.account), ['2100', '1010']);
});

test('totals leave out void and deleted expenses, count bills owed (and what is to pay), and group the amount by account', () => {
  const t = plain(X.totals([
    { amount: 1000, tax: 200, account: '5000', status: 'posted' },
    { amount: 500, account: '5100', status: 'posted' },
    { amount: 700, account: '5000', status: 'void' },
    { amount: 900, account: '5000', status: 'posted', deletedAt: 1 },
    { amount: 300, account: '5100', status: 'owed' },   // a bill not paid yet counts, and is what is still to pay
  ]));
  assert.deepEqual(t, { count: 3, amount: 1800, tax: 200, owed: 300, byAccount: { 5000: 1000, 5100: 800 } });
  assert.deepEqual(plain(X.totals()), { count: 0, amount: 0, tax: 0, owed: 0, byAccount: {} });
});

test('the schema has the expenses collection: posting only, tax not above the amount, an expense account code', () => {
  const d = S.schema.def('expenses');
  assert.equal(d.postingOnly, true);
  assert.deepEqual(plain(d.check({ amount: 100, tax: 101 })), ['tax cannot be more than the amount paid']);
  assert.deepEqual(plain(d.check({ amount: 100, tax: 20 })), []);
  assert.ok(S.store.DB_VERSION >= 5, 'the database version that adds the expenses store');
});
