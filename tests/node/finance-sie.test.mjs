// SIE files (shared/finance/sie.js, sie-lex.js, text.js): the line reader, the records, the model, the checksum and the
// real-world quirks, on the made-up sample files in tests/finance/fixtures/.
// Covers: shared/finance/sie.js, shared/finance/sie-lex.js, shared/finance/text.js
import './ui-words.mjs';   // the warnings' English words
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSie, basType, looksLikeSie } from '../../shared/finance/sie.js';
import { tokens, records, crc32, checksum } from '../../shared/finance/sie-lex.js';
import { cp437, toCp437, decodeBytes, parseAmount, ymd, CP437_HIGH } from '../../shared/finance/text.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../finance/fixtures');
const bytes = (f) => new Uint8Array(readFileSync(path.join(FIX, f)));

test('code page 437 both ways, and the decoder picks UTF-8, CP437 or Windows-1252', () => {
  assert.equal([...CP437_HIGH].length, 128);
  assert.equal(cp437(Uint8Array.from([0x86, 0x84, 0x94, 0x8f, 0x8e, 0x99])), 'åäöÅÄÖ');
  assert.deepEqual([...toCp437('Åkesson €')], [0x8f, 0x6b, 0x65, 0x73, 0x73, 0x6f, 0x6e, 0x20, 0x3f]);
  assert.equal(decodeBytes(new TextEncoder().encode('Företag')).encoding, 'utf-8');
  assert.equal(decodeBytes(Uint8Array.from([0x46, 0xf6, 0x72])).text, 'För');            // Windows-1252
  assert.equal(decodeBytes(Uint8Array.from([0x46, 0x94, 0x72])).text, 'För');            // CP437
  assert.equal(decodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])).text, 'A');        // BOM dropped
});

test('amounts and dates: decimal point or comma, signs, YYYYMMDD and ISO', () => {
  assert.equal(parseAmount('-1000.50'), -1000.5);
  assert.equal(parseAmount('1000,50'), 1000.5);
  assert.equal(parseAmount('1 234,50'), 1234.5);
  assert.equal(parseAmount('1.234,50'), 1234.5);
  assert.equal(parseAmount('12.50-'), -12.5);
  assert.equal(parseAmount('1,234', { thousands3: true }), 1234);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(ymd('20250131'), '2025-01-31');
  assert.equal(ymd('2025-01-31'), '2025-01-31');
  assert.equal(ymd('20250230'), null);
});

test('the line reader: quotes, escaped quotes, object lists, empty fields', () => {
  const t = tokens('#TRANS 3001 {1 "10" 6 "P1"} -10000.00 "" "Text med \\"citat\\"" 2');
  assert.deepEqual(t.map((x) => x.t), ['f', 'f', 'list', 'f', 'f', 'f', 'f']);
  assert.deepEqual(t[2].v, ['1', '10', '6', 'P1']);
  assert.equal(t[4].v, '');
  assert.equal(t[5].v, 'Text med "citat"');
  assert.deepEqual(tokens('#PSALDO 0 202508 1910 { } 1243.50')[4], { t: 'list', v: [] });
  const recs = records('#VER A 1 20250101 "x"\n{\n#TRANS 1910 {} -5\n#TRANS 6250 {} 5\n}\n#KONTO 1910 Kassa\n');
  assert.equal(recs.length, 2);
  assert.equal(recs[0].sub.length, 2);
});

test('CRC-32 is the standard one (polynomial EDB88320): "123456789" gives CBF43926', () => {
  assert.equal((crc32(new TextEncoder().encode('123456789')) ^ 0xffffffff) >>> 0, 0xcbf43926);
  assert.equal(checksum(records('#FLAGGA 0\n#KONTO 1910 Kassa\n')).present, false);
  const cut = checksum(records('#FLAGGA 0\n#KSUMMA\n#KONTO 1910 Kassa\n'));
  assert.equal(cut.present, true);
  assert.equal(cut.ok, false);
});

test('SIE 4 (CP437, CRLF, checksum): identity, accounts, balances, vouchers, added and removed lines', () => {
  const m = readSie(bytes('ankan-sie4.se'));
  assert.equal(m.format, 'sie');
  assert.equal(m.type, '4');
  assert.equal(m.company, 'Testbolaget Ankan AB');
  assert.equal(m.orgNo, '559999-0001');
  assert.equal(m.generatedBy, 'Märta');
  assert.equal(m.currency, 'SEK');
  assert.deepEqual(m.years, [{ index: 0, from: '2025-01-01', to: '2025-12-31' }, { index: -1, from: '2024-01-01', to: '2024-12-31' }]);
  assert.equal(m.checksum.ok, true);
  assert.deepEqual(m.warnings, []);
  const acct = Object.fromEntries(m.accounts.map((a) => [a.number, a]));
  assert.equal(acct['1930'].name, 'Företagskonto');
  assert.equal(acct['3001'].name, 'Försäljning "special" 25 %');
  assert.equal(acct['2081'].type, 'equity');      // #KTYP S on a 20xx account
  assert.equal(acct['2440'].type, 'liability');   // BAS, no #KTYP
  assert.equal(acct['3001'].type, 'revenue');
  assert.deepEqual(acct['1930'].sru, ['7281']);
  assert.equal(m.openingBalances.filter((b) => b.year === 0).length, 4);
  assert.equal(m.closingBalances.find((b) => b.account === '1930').amount, 56575);
  assert.equal(m.results.find((b) => b.account === '3001').amount, -10000);
  assert.equal(m.periodBalances.length, 2);
  assert.deepEqual(m.periodBalances[1].objects, [{ dim: '1', id: '10' }]);
  assert.equal(m.vouchers.length, 4);
  const [a1, a2, b1, b2] = m.vouchers;
  assert.deepEqual([a1.series, a1.number, a1.date, a1.text], ['A', '1', '2025-01-10', 'Faktura 1001, Kund Åkesson']);
  assert.deepEqual(a1.lines[1].objects, [{ dim: '1', id: '10' }, { dim: '6', id: 'P1' }]);
  assert.equal(a2.regDate, '2025-01-16');
  assert.equal(a2.lines[0].text, 'Hyra');
  assert.equal(a2.lines[0].quantity, 1);
  assert.equal(a2.lines[0].date, undefined);     // the same as the voucher date
  // #BTRANS kept apart, #RTRANS read once (its #TRANS copy skipped)
  assert.deepEqual(b1.lines.map((l) => [l.account, l.amount, !!l.added]), [['1930', -1000], ['2641', 200], ['6250', 800, true]].map(([a, n, x]) => [a, n, !!x]));
  assert.deepEqual(b1.removed.map((l) => [l.account, l.amount]), [['6110', 800]]);
  assert.equal(b2.lines.length, 5);
  assert.ok(m.vouchers.every((v) => v.balanced));
});

test('quirks: UTF-8 file that says PC8, lower-case label, decimal comma, ISO date, no object list, "" for the list, "{" on the #VER line', () => {
  const m = readSie(bytes('hb-quirks.se'));
  assert.equal(m.type, '4');
  assert.equal(m.company, 'Påhittade Konsult HB');
  assert.equal(m.generated, '2026-01-31');
  assert.deepEqual(m.years, [{ index: 0, from: '2025-07-01', to: '2026-06-30' }]);
  const [a7, a8, a9] = m.vouchers;
  assert.deepEqual(a7.lines.map((l) => [l.account, l.amount]), [['1930', 6250], ['3041', -5000], ['2611', -1250]]);
  assert.equal(a7.lines[2].text, 'Moms');
  assert.equal(a7.balanced, true);
  assert.equal(a8.balanced, false);
  assert.equal(a9.lines.length, 0);
  assert.ok(m.warnings.some((w) => w.includes('A8 does not balance (off by 1.00)')));
  assert.ok(m.warnings.some((w) => w.includes('A9 has no transaction lines')));
  assert.equal(m.openingBalances.find((b) => b.account === '19301').amount, -1000.5);
});

test('SIE 4I (import file, empty series and number) and SIE 1 in Windows-1252', () => {
  const i = readSie(bytes('fakt-4i.si'));
  assert.equal(i.vouchers.length, 1);
  assert.deepEqual([i.vouchers[0].series, i.vouchers[0].number], ['', '']);
  const one = readSie(bytes('ankan-sie1.se'));
  assert.equal(one.type, '1');
  assert.equal(one.accounts.find((a) => a.number === '2099').name, 'Årets resultat');
  assert.equal(one.vouchers.length, 0);
  assert.equal(one.closingBalances.length, 3);
});

test('sniff and BAS types', () => {
  assert.ok(looksLikeSie('#FLAGGA 0\r\n#PROGRAM x 1\r\n'));
  assert.ok(!looksLikeSie('Date,Amount\n2026-01-01,5\n'));
  assert.deepEqual(['1510', '2081', '2440', '3001', '4010', '8310', '8910'].map(basType), ['asset', 'equity', 'liability', 'revenue', 'expense', 'revenue', 'expense']);
});
