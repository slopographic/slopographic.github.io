// Bank statements (shared/finance/ofx.js, qif.js, camt053.js, mt940.js, model.js, index.js): each reader on the made-up
// samples in tests/finance/fixtures/, the quirks each format has in the wild, the balance check and the format sniff.
// camt.053 is XML: the small DOMParser stand-in of the Tables tests reads it here (in the browser it is the real one).
// Covers: shared/finance/ofx.js, shared/finance/qif.js, shared/finance/camt053.js, shared/finance/mt940.js, shared/finance/model.js, shared/finance/index.js
import { inSwedish } from './ui-words.mjs';   // the warnings' English words
import './tables-dom-shim.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOfx, ofxTree } from '../../shared/finance/ofx.js';
import { readQif, qifDate } from '../../shared/finance/qif.js';
import { readCamt } from '../../shared/finance/camt053.js';
import { readMt940, line61, balanceOf, info86 } from '../../shared/finance/mt940.js';
import { checkBalance, totals } from '../../shared/finance/model.js';
import { sniffFinance, formatOf, readFinance, readStatement } from '../../shared/finance/index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../finance/fixtures');
const bytes = (f) => new Uint8Array(readFileSync(path.join(FIX, f)));
const pick = (t, ...k) => k.map((x) => t[x]);

test('OFX 1.x (SGML, CHARSET 1252): leaves without end tags, the account, the period, signs and the closing balance', () => {
  const m = readOfx(bytes('checking-v1.ofx'));
  assert.equal(m.version, '102');
  assert.equal(m.account, '000000000 1234567890');
  assert.equal(m.currency, 'USD');
  assert.deepEqual([m.from, m.to, m.opening, m.closing, m.closingDate], ['2026-10-01', '2026-10-31', null, 1106.5, '2026-10-31']);
  assert.deepEqual(m.transactions.map((t) => pick(t, 'date', 'amount', 'counterparty')), [['2026-10-20', 1200, 'ACME LTD'], ['2026-10-21', -4.5, 'Café Corner'], ['2026-10-22', -89, 'Chairs & Desks Inc']]);
  assert.equal(m.transactions[0].text, 'ACME LTD · Invoice INV-0001');
  assert.equal(m.transactions[0].id, '2026102001');
  assert.equal(m.transactions[2].ref, '1001');
  assert.equal(m.transactions[2].valueDate, '2026-10-23');
  assert.deepEqual(m.warnings, []);
});

test('OFX 2.x (XML) credit card: CCSTMTRS, PAYEE name, a "+" amount, UTF-8', () => {
  const m = readOfx(bytes('card-v2.qfx'));
  assert.equal(m.version, '220');
  assert.equal(m.account, 'XXXX-0000-0000-4242');
  assert.equal(m.currency, 'EUR');
  assert.deepEqual(m.transactions.map((t) => pick(t, 'amount', 'counterparty', 'type')), [[-23.4, 'Bäckerei Müller', 'DEBIT'], [500, 'Payment, thank you', 'PAYMENT']]);
  assert.equal(m.closing, -123.4);
});

test('the OFX tree reader closes aggregates that SGML leaves open', () => {
  const t = ofxTree('<A><B>1<C><D>2</C><E>3</A>');
  assert.equal(t.kids[0].name, 'A');
  assert.deepEqual(t.kids[0].kids.map((k) => k.name), ['B', 'C', 'E']);
  assert.equal(t.kids[0].kids[1].kids[0].value, '2');
});

test('QIF: !Account name, apostrophe years, U and T, splits kept as one, category lists skipped', () => {
  const m = readQif(bytes('checking.qif'));
  assert.equal(m.account, 'Everyday Checking');
  assert.equal(m.dayFirst, false);
  assert.deepEqual(m.transactions.map((t) => pick(t, 'date', 'amount', 'counterparty', 'ref')), [['2026-10-20', 1200, 'ACME LTD', '1001'], ['2026-10-21', -4.5, 'Coffee Corner', ''], ['2026-10-22', -89, 'Office Chairs Inc', '']]);
  assert.equal(m.transactions[0].category, 'Sales');
  assert.equal(m.transactions[0].status, 'reconciled');
  assert.equal(m.currency, '');
});

test('QIF from Europe: day first found from the dates, decimal comma with thousands dots, Windows-1252, a broken item reported', () => {
  const m = readQif(bytes('hyra-eu.qif'));
  assert.equal(m.dayFirst, true);
  assert.deepEqual(m.transactions.map((t) => pick(t, 'date', 'amount', 'counterparty')), [['2026-10-24', -1234.5, 'Hyresvärd AB'], ['2026-10-25', 2500, 'Kund Åkesson']]);
  assert.equal(m.warnings.length, 1);
  assert.equal(qifDate('6/ 1/94', false), '1994-06-01');
  assert.equal(qifDate("1/ 2'05", false), '2005-01-02');
  assert.equal(qifDate('2026-10-24', false), '2026-10-24');
});

test('camt.053.001.02: IBAN, balances, CRDT and DBIT, debtor or creditor as the counterparty, NOTPROVIDED dropped, pending kept but not in the check', () => {
  const m = readCamt(bytes('ankan-camt053-v02.xml'));
  assert.equal(m.message, 'camt.053.001.02');
  assert.equal(m.account, 'SE0000000000000000000001');
  assert.deepEqual([m.currency, m.from, m.to, m.opening, m.closing], ['SEK', '2026-10-01', '2026-10-31', 10000, 11750]);
  assert.deepEqual(m.transactions.map((t) => pick(t, 'date', 'amount', 'counterparty', 'ref', 'status')), [
    ['2026-10-05', 2500, 'Kund Åkesson & Co', 'INV-1002', 'BOOK'], ['2026-10-12', -750, 'Kontorsvaror i Påhittstad', '', 'BOOK'], ['2026-10-31', -99, '', '', 'PDNG']]);
  assert.equal(m.transactions[0].text, 'Faktura 1002');
  assert.equal(m.transactions[0].type, 'PMNT-RCDT-ESCT');
  assert.equal(m.transactions[1].valueDate, '2026-10-13');
  assert.equal(checkBalance(m), null);
  assert.deepEqual(m.warnings, []);
});

test('camt.053.001.08: Othr account id, PRCD debit opening, DtTm dates, Dbtr/Pty/Nm, a structured reference, a reversal', () => {
  const m = readCamt(bytes('ankan-camt053-v08.xml'));
  assert.equal(m.message, 'camt.053.001.08');
  assert.equal(m.account, '9999-1234567');
  assert.deepEqual([m.opening, m.closing, m.closingDate], [-50, 100, '2026-10-31']);
  assert.deepEqual(m.transactions.map((t) => pick(t, 'date', 'amount', 'counterparty', 'text')), [['2026-10-02', 200, 'Beispiel GmbH', 'RF18539007547034'], ['2026-10-03', -50, '', 'Reversal of a credit']]);
  assert.equal(m.transactions[1].reversal, true);
  assert.equal(checkBalance(m), null);
});

test('MT940 fields: :61: with entry date, funds code, reversal marks, :60F: balances, German and Dutch :86:', () => {
  assert.deepEqual(pick(line61('2610201020CR1200,00NTRFNONREF//BANK-0001\nINVOICE PAYMENT'), 'date', 'amount', 'type', 'ref', 'bankRef', 'details'), ['2026-10-20', 1200, 'NTRF', '', 'BANK-0001', 'INVOICE PAYMENT']);
  assert.equal(line61('2612310102D89,00NCHK1001//X').date, '2027-01-02');   // entry date in the new year
  assert.equal(line61('261231RD10,00NTRFREV-1').amount, 10);                  // reversal of a debit: money in
  assert.equal(line61('261231RC10,00NTRFREV-2').amount, -10);
  assert.deepEqual(balanceOf('D261019EUR1000,00'), { amount: -1000, date: '2026-10-19', currency: 'EUR' });
  assert.deepEqual(info86('166?00GUTSCHRIFT?20EREF+INV-0001?21SVWZ+Rechnung INV-0001?32ACME LTD?33LONDON'), { text: 'Rechnung INV-0001', counterparty: 'ACME LTD LONDON', ref: 'INV-0001' });
  assert.equal(info86('/NAME/J. JANSEN/REMI/USTD//Factuur 2026-17/').counterparty, 'J. JANSEN');
});

test('MT940 files: two messages in blocks (Windows-1252), and a Dutch file without blocks; balances add up', () => {
  const de = readMt940(bytes('ankan-de.sta'));
  assert.equal(de.statements.length, 2);
  assert.equal(de.account, 'DE00000000000000000001');
  assert.deepEqual([de.currency, de.opening, de.closing], ['EUR', 1000, 2116.5]);
  assert.equal(de.transactions.length, 4);
  assert.equal(de.transactions[1].text, 'Café Corner');
  assert.equal(de.transactions[2].text, 'Chairs and Desks Inc Office chair');
  assert.deepEqual(de.warnings, []);
  const nl = readMt940(bytes('jansen-nl.mt940'));
  assert.deepEqual(nl.transactions.map((t) => pick(t, 'amount', 'counterparty', 'text', 'ref')), [[150, 'J. JANSEN', 'Factuur 2026-17', 'EREF-9'], [-25, 'Verzekering BV', 'Premie oktober', '']]);
  assert.deepEqual(totals(nl), { count: 2, moneyIn: 150, moneyOut: -25, pending: 0 });
  assert.equal(checkBalance(nl), null);
});

test('a statement whose balances do not add up says so', () => {
  const m = readMt940(':20:X\n:25:1\n:60F:C261001SEK100,00\n:61:261002C5,00NTRFA\n:62F:C261002SEK200,00\n');
  assert.ok(m.warnings[0].includes('the closing balance says 200.00'));
});

test('format sniff and dispatch: by content first, extension second; plain CSV is not finance', () => {
  const head = (f) => bytes(f).subarray(0, 512);
  assert.deepEqual(['ankan-sie4.se', 'checking-v1.ofx', 'card-v2.qfx', 'checking.qif', 'ankan-camt053-v02.xml', 'ankan-de.sta', 'jansen-nl.mt940'].map((f) => sniffFinance(head(f))),
    ['sie', 'ofx', 'ofx', 'qif', 'camt053', 'mt940', 'mt940']);
  assert.equal(sniffFinance(new TextEncoder().encode('Date,Description,Amount\n2026-10-20,x,5\n')), null);
  assert.equal(formatOf('export.si', null), 'sie');
  assert.equal(formatOf('statement.txt', head('jansen-nl.mt940')), 'mt940');
  const r = readFinance(bytes('ankan-camt053-v02.xml'), 'x.xml');
  assert.deepEqual([r.kind, r.format], ['statement', 'camt053']);
  assert.equal(readFinance(bytes('fakt-4i.si'), 'FAKT.SI').kind, 'ledger');
  assert.throws(() => readStatement(bytes('fakt-4i.si'), 'FAKT.SI'), /SIE/);
  assert.throws(() => readFinance(new TextEncoder().encode('hello'), 'a.txt'), /not a file this reader knows/);
});

test('the readers\' warnings follow the chosen language (Swedish was English)', () => {
  const m = inSwedish(() => readQif('nothing here\n'));
  assert.equal(m.warnings[0], 'Inga banktransaktioner hittades. En QIF-fil börjar med en rad som !Type:Bank.');
  const o = inSwedish(() => readOfx('<html></html>'));
  assert.equal(o.warnings[0], 'Inget <OFX>-element hittades: det här är ingen OFX-fil.');
});
