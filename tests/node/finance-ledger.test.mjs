// Slop Ledger and the finance readers, the pure parts: the SIE import plan (ledger/js/core/sie-import.js: accounts mapped
// onto the chart, the opening balances and vouchers as balanced entries, what is skipped and why) and bank statement
// lines from OFX, QIF, camt.053 and MT940 (ledger/js/core/bank.js linesFromStatement).
// Covers: ledger/js/core/sie-import.js, ledger/js/core/bank.js
import './ui-words.mjs';   // the warnings' English words
import './tables-dom-shim.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSie } from '../../shared/finance/sie.js';
import { readFinance } from '../../shared/finance/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIX = path.join(ROOT, 'tests/finance/fixtures');
const bytes = (f) => new Uint8Array(readFileSync(path.join(FIX, f)));
const ctx = vm.createContext({});
for (const f of ['shared/data/readtext.js', 'ledger/js/core/bank.js', 'ledger/js/core/sie-import.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const { sieImport: I, bank: B } = ctx.SlopLedger;
const plain = (v) => JSON.parse(JSON.stringify(v));
const CHART = [{ code: '1000', name: 'Cash', type: 'asset' }, { code: '1010', name: 'Bank', type: 'asset' }, { code: '1930', name: 'Bank account', type: 'asset' },
  { code: '3000', name: 'Equity', type: 'equity' }, { code: '3001', name: 'Equity two', type: 'equity' }, { code: '5000', name: 'Expenses', type: 'expense' }];

test('accounts: new ones added, same code and type kept, another name offered as a rename, a code of another type gets a free code', () => {
  const m = readSie(bytes('ankan-sie4.se'));
  const a = Object.fromEntries(plain(I.mapAccounts(m, CHART)).map((x) => [x.sie, x]));
  assert.deepEqual([a['1510'].action, a['1510'].code, a['1510'].type], ['add', '1510', 'asset']);
  assert.deepEqual([a['1930'].action, a['1930'].here, a['1930'].name], ['rename', 'Bank account', 'Företagskonto']);
  assert.equal(a['3001'].action, 'map');             // 3001 is an equity account here; the SIE 3001 is revenue
  assert.equal(a['3001'].code, '3002');
  assert.ok(a['3001'].note.includes('3001 is Equity two (equity) here'));
  assert.equal(a['2081'].type, 'equity');
  // the person picks another code
  const b = Object.fromEntries(plain(I.mapAccounts(m, CHART, { 3001: '3100' })).map((x) => [x.sie, x]));
  assert.deepEqual([b['3001'].action, b['3001'].code], ['map', '3100']);
  const c = Object.fromEntries(plain(I.mapAccounts(m, CHART, { 3001: '1000' })).map((x) => [x.sie, x]));
  assert.equal(c['3001'].action, 'conflict');
});

test('sub-accounts with more than four digits join their parent of the same type', () => {
  const m = readSie(bytes('hb-quirks.se'));
  const a = Object.fromEntries(plain(I.mapAccounts(m, [])).map((x) => [x.sie, x]));
  assert.deepEqual([a['19301'].action, a['19301'].code], ['merge', '1930']);
});

test('plan: one opening-balance entry on the first day of the year, one entry per voucher, debits equal credits, in öre', () => {
  const m = readSie(bytes('ankan-sie4.se'));
  const p = plain(I.plan(m, { chart: CHART, digits: 2 }));
  assert.equal(p.key, '559999-0001:2025-01-01');
  assert.equal(p.entries.length, 5);
  const [ib, a1] = p.entries;
  assert.equal(ib.what, 'Opening balances');
  assert.equal(ib.input.date, '2025-01-01');
  assert.equal(ib.input.source, 'sie:559999-0001:2025-01-01:ib');
  assert.deepEqual(ib.input.lines.find((l) => l.account === '1930'), { account: '1930', debit: 5000000, credit: 0 });
  assert.equal(a1.input.memo, 'A1 Faktura 1001, Kund Åkesson');
  assert.equal(a1.input.currency, 'SEK');
  assert.deepEqual(a1.input.lines.map((l) => [l.account, l.debit, l.credit]), [['1930', 1250000, 0], ['3002', 0, 1000000], ['2611', 0, 250000]]);
  for (const e of p.entries) assert.equal(e.input.lines.reduce((t, l) => t + l.debit, 0), e.input.lines.reduce((t, l) => t + l.credit, 0));
  assert.deepEqual(p.skipped, []);
  // a second import: everything already there
  const again = plain(I.plan(m, { chart: CHART, sources: new Set(p.entries.map((e) => e.input.source)) }));
  assert.equal(again.entries.length, 0);
  assert.ok(again.skipped.every((s) => s.why === 'already imported'));
});

test('plan: an unbalanced voucher, a voucher with no lines and unbalanced opening balances are skipped with the reason', () => {
  const p = plain(I.plan(readSie(bytes('hb-quirks.se')), { chart: [] }));
  const why = Object.fromEntries(p.skipped.map((s) => [s.what, s.why]));
  assert.equal(why['Voucher A8 (2025-08-05)'], 'it does not balance (off by 1.00)');
  assert.equal(why['Voucher A9 (2025-08-10)'], 'it has fewer than two lines with an amount');
  assert.equal(p.entries.length, 1);
  assert.ok(why['Opening balances'].startsWith('they come to nothing'));   // 1930 and its sub-account 19301 cancel out
  assert.ok(p.entries.some((e) => e.what === 'Voucher A7 (2025-08-01)'));
  const i4 = plain(I.plan(readSie(bytes('fakt-4i.si')), { chart: [] }));
  assert.equal(i4.entries[0].input.source, 'sie:Testbolaget-Ankan-AB:-:#1');
});

test('bank lines from statements: minor units, the counterparty with the text, pending skipped, same keys on a second read', () => {
  const m = readFinance(bytes('ankan-camt053-v02.xml'), 'x.xml').model;
  const r = plain(B.linesFromStatement(m, { digits: 2 }));
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.lines.map((l) => [l.date, l.amount, l.description]), [['2026-10-05', 250000, 'Kund Åkesson & Co · Faktura 1002'], ['2026-10-12', -75000, 'Kontorsvaror i Påhittstad · Kortköp']]);
  assert.deepEqual(plain(B.linesFromStatement(m, { digits: 2 })).lines.map((l) => l.key), r.lines.map((l) => l.key));
  const ofx = plain(B.linesFromStatement(readFinance(bytes('checking-v1.ofx'), 'a.ofx').model));
  assert.deepEqual(ofx.lines.map((l) => [l.amount, l.description]), [[120000, 'ACME LTD · Invoice INV-0001'], [-450, 'Café Corner'], [-8900, 'Chairs & Desks Inc']]);
  assert.equal(I.freeCode('3000', new Set(['3000', '3001'])), '3002');
});
