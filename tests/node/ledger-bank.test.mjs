// Slop Ledger bank reconciliation, the pure part (ledger/js/core/bank.js): statement columns and lines, the bank's moves
// from the journal, and matching lines to moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({});
for (const f of ['shared/data/readtext.js', 'ledger/js/core/bank.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const B = ctx.SlopLedger.bank;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('columns: one amount column, or money out and money in; English and Swedish headers', () => {
  assert.deepEqual(plain(B.columns(['Date', 'Description', 'Amount', 'Balance'])), { date: 0, description: 1, amount: 2 });
  assert.deepEqual(plain(B.columns(['Transaction Date', 'Payee', 'Money Out', 'Money In', 'Balance'])), { date: 0, description: 1, debit: 2, credit: 3 });
  assert.deepEqual(plain(B.columns(['Bokföringsdag', 'Belopp', 'Mottagare'])), { date: 0, description: 2, amount: 1 });
  assert.equal(B.columns(['Name', 'Value']), null);
});

test('lines: dates and signed amounts read, the header found below a title, blank and balance rows skipped, keys unique', () => {
  const rows = [['My Bank statement'], [], ['Date', 'Description', 'Amount'], ['24/10/2026', 'ACME LTD  INV-0001', '1 200,00'], ['25/10/2026', 'Coffee', '-4,50'],
    ['25/10/2026', 'Coffee', '-4,50'], ['', 'Closing balance', '1191,00']];
  const r = B.linesOf(rows);
  assert.deepEqual(plain(r.lines.map((l) => [l.date, l.description, l.amount])), [['2026-10-24', 'ACME LTD INV-0001', 120000], ['2026-10-25', 'Coffee', -450], ['2026-10-25', 'Coffee', -450]]);
  assert.equal(r.skipped, 1);
  assert.notEqual(r.lines[1].key, r.lines[2].key);   // two identical coffees are two lines
  const again = B.linesOf(rows);
  assert.deepEqual(again.lines.map((l) => l.key), r.lines.map((l) => l.key));   // the same statement gives the same keys
  const two = B.linesOf([['Date', 'Payee', 'Debit', 'Credit'], ['2026-10-24', 'Rent', '900.00', ''], ['2026-10-25', 'Client', '', '250.00']]);
  assert.deepEqual(plain(two.lines.map((l) => l.amount)), [-90000, 25000]);
  assert.deepEqual(plain(B.linesOf([['Name'], ['x']])), { lines: [], skipped: 2, columns: null });
});

test('moves: what each journal entry did to the bank account', () => {
  const entries = [
    { id: 'j1', date: '2026-10-24', memo: 'Payment for INV-0001', lines: [{ account: '1010', debit: 120000, credit: 0 }, { account: '1200', debit: 0, credit: 120000 }] },
    { id: 'j2', date: '2026-10-25', memo: 'Expense', lines: [{ account: '5000', debit: 450, credit: 0 }, { account: '1010', debit: 0, credit: 450 }] },
    { id: 'j3', date: '2026-10-25', memo: 'Cash', lines: [{ account: '1000', debit: 100, credit: 0 }, { account: '4000', debit: 0, credit: 100 }] },
  ];
  assert.deepEqual(plain(B.moves(entries, '1010')), [{ journalId: 'j1', date: '2026-10-24', amount: 120000, memo: 'Payment for INV-0001' }, { journalId: 'j2', date: '2026-10-25', amount: -450, memo: 'Expense' }]);
});

test('match: same amount within the days allowed, nearest date first, each move used once, matched lines keep theirs', () => {
  const lines = [{ key: 'a', date: '2026-10-24', amount: 120000 }, { key: 'b', date: '2026-10-25', amount: -450 }, { key: 'c', date: '2026-10-28', amount: -450 },
    { key: 'd', date: '2026-11-30', amount: 999 }, { key: 'e', date: '2026-10-25', amount: -450, status: 'matched', journalId: 'j9' }];
  const mv = [{ journalId: 'j1', date: '2026-10-23', amount: 120000 }, { journalId: 'j2', date: '2026-10-27', amount: -450 }, { journalId: 'j9', date: '2026-10-25', amount: -450 },
    { journalId: 'j4', date: '2026-10-20', amount: 999 }];
  const pairs = B.match(lines, mv).map((p) => [p.line.key, p.move.journalId]);
  assert.deepEqual(plain(pairs), [['a', 'j1'], ['c', 'j2']]);   // c is 1 day from j2, b 2 days: c wins; j9 belongs to e; d is too far from j4
  assert.deepEqual(plain(B.match(lines, mv, { days: 2 }).map((p) => p.line.key)), ['a', 'c']);
});
