// Finance files as tables (shared/finance/tables.js): the sheets File convert writes for SIE files and bank statements.
// Covers: shared/finance/tables.js
import './ui-words.mjs';   // the warnings' English words
import './tables-dom-shim.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSie } from '../../shared/finance/sie.js';
import { readCamt } from '../../shared/finance/camt053.js';
import { readMt940 } from '../../shared/finance/mt940.js';
import { sieSheets, sieVoucherRows, sieBalanceRows, statementSheets, statementRows, yearLabel } from '../../shared/finance/tables.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../finance/fixtures');
const bytes = (f) => new Uint8Array(readFileSync(path.join(FIX, f)));

test('SIE sheets: Info, Vouchers, Accounts, Balances, Periods; debit and credit apart; removed and added lines noted', () => {
  const m = readSie(bytes('ankan-sie4.se'));
  const sheets = sieSheets(m);
  assert.deepEqual(sheets.map((s) => s.name), ['Info', 'Vouchers', 'Accounts', 'Balances', 'Periods']);
  const v = sieVoucherRows(m);
  assert.deepEqual(v[0].slice(0, 9), ['Series', 'Number', 'Date', 'Voucher text', 'Account', 'Account name', 'Debit', 'Credit', 'Amount']);
  assert.deepEqual(v[1].slice(0, 9), ['A', '1', '2025-01-10', 'Faktura 1001, Kund Åkesson', '1930', 'Företagskonto', 12500, '', 12500]);
  assert.deepEqual(v[2].slice(4, 12), ['3001', 'Försäljning "special" 25 %', '', 10000, -10000, '', '', '1:10 6:P1']);
  assert.ok(v.some((r) => r[13] === 'Removed line (was 800.00)' && r[6] === '' && r[8] === ''));
  assert.ok(v.some((r) => r[13] === 'Added line' && r[4] === '6250'));
  assert.equal(v.length, 1 + 3 + 2 + 3 + 1 + 5);   // header, the lines of A1, A2, B1 (and its removed line), B2
  const debit = v.slice(1).reduce((t, r) => t + (r[6] || 0), 0), credit = v.slice(1).reduce((t, r) => t + (r[7] || 0), 0);
  assert.equal(Math.round(debit * 100), Math.round(credit * 100));
  const b = sieBalanceRows(m);
  assert.deepEqual(b[0], ['Account', 'Name', 'Type', 'Opening 2025', 'Closing 2025', 'Result 2025', 'Opening 2024']);
  assert.deepEqual(b.find((r) => r[0] === '1930'), ['1930', 'Företagskonto', 'Asset', 50000, 56575, '', 25000]);
  assert.equal(yearLabel(readSie(bytes('hb-quirks.se')), 0), '2025/26');
  const info = Object.fromEntries(sheets[0].rows);
  assert.equal(info.Checksum, 'Matches (#KSUMMA)');
  assert.equal(info.Vouchers, 4);
});

test('statement rows: one per transaction, money out negative; the Statement sheet checks the balances', () => {
  const m = readCamt(bytes('ankan-camt053-v02.xml'));
  const rows = statementRows(m);
  assert.deepEqual(rows[0], ['Date', 'Value date', 'Amount', 'Currency', 'Text', 'Counterparty', 'Reference', 'Type', 'Status', 'Bank id']);
  assert.deepEqual(rows[2].slice(0, 6), ['2026-10-12', '2026-10-13', -750, 'SEK', 'Kortköp', 'Kontorsvaror i Påhittstad']);
  const [tx, st] = statementSheets(m);
  assert.equal(tx.name, 'Transactions');
  const info = Object.fromEntries(st.rows);
  assert.equal(info.Check, 'Opening + transactions = closing');
  assert.equal(info['Money out'], -750);   // the pending line is listed but not counted
  const de = readMt940(bytes('ankan-de.sta'));
  assert.equal(statementRows(de)[0].at(-1), 'Account');   // several statements: the account of each line
});
