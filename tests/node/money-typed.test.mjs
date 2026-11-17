// Typed amounts in the visitor's language (shared/data/money.js: plainFromTyped, parseTyped, parsePercent, typedMinor).
// Covers: shared/data/money.js, shared/docs/model.js, admin/js/core/profile.js, ledger/js/core/journal.js, ledger/js/core/rates.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** A fresh context with money.js (and more files), and a stand-in SlopI18n whose language the test sets. */
function load(lang, files = []) {
  const ctx = { lang };
  ctx.window = ctx;
  ctx.SlopI18n = { get: () => ctx.lang, t: (k) => k };
  // the Result helpers (as in shared/data/store.js) and an exchange-rate store that hands back what it is given
  ctx.SlopData = { result: { ok: (value) => ({ ok: true, value }), fail: (code, message) => ({ ok: false, code, message }) }, fx: { addRate: async (r) => ({ ok: true, value: r }) },
    ledger: { TYPE_SIDE: {} } };
  vm.createContext(ctx);
  for (const f of ['shared/data/money.js', ...files]) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const M = load('en').SlopData.money;
const NBSP = ' ', NNBSP = ' ';

test('separators come from Intl for the language', () => {
  assert.deepEqual({ ...M.separators('en') }, { decimal: '.', group: ',', indian: false });
  assert.equal(M.separators('de').decimal, ',');
  assert.equal(M.separators('de').group, '.');
  assert.equal(M.separators('sv').decimal, ',');
  assert.match(M.separators('fr').group, /\s/);
  assert.equal(M.separators('hi').indian, true);
});

const CASES = {
  en: [['12.50', 1250], ['1,234.50', 123450], ['1,234', 123400], ['1,234,567.89', 123456789], ['12,50', null], ['1,5', null],
    ['1 234', null], ['1.234,50', null], ['12.345', null]],
  sv: [['12,50', 1250], ['12.50', 1250], [`1 234,50`, 123450], [`1${NBSP}234,50`, 123450], [`1${NNBSP}234,50`, 123450],
    [`1${NNBSP}234.50`, 123450], ['1.234,50', null], ['1,234', null], ['1 23,5', null]],
  de: [['12,50', 1250], ['12.50', 1250], ['1.234,50', 123450], ['1.234', 123400], ['1.234.567', 123456700], ['1.234.5', null],
    ['1 234,50', null], ['1,2,3', null]],
  fr: [['12,50', 1250], [`1${NNBSP}234,5`, 123450], [`1${NBSP}234,50`, 123450], ['1 234.50', 123450], ['1.234,50', null]],
  'pt-BR': [['12,50', 1250], ['1.234,56', 123456], ['1.234', 123400], ['12.5', 1250]],
  ja: [['12.50', 1250], ['1,234.5', 123450], ['12,50', null], ['1,5', null]],
};
for (const [lang, rows] of Object.entries(CASES)) {
  test(`typed amounts in ${lang}`, () => {
    for (const [text, want] of rows) assert.equal(M.parseTyped(text, 'USD', lang), want, `${lang} ${JSON.stringify(text)}`);
  });
}

test('edge cases: minus, spaces at the ends, too many decimals, JPY, nothing to read', () => {
  assert.equal(M.parseTyped('-12,5', 'USD', 'sv'), -1250);
  assert.equal(M.parseTyped('−12.5', 'USD', 'en'), -1250);     // the minus sign U+2212
  assert.equal(M.parseTyped('  7,5 ', 'USD', 'sv'), 750);
  assert.equal(M.parseTyped('12,345', 'USD', 'sv'), null);           // three decimals for a two-decimal currency: never rounded
  assert.equal(M.parseTyped('1.234', 'USD', 'en'), null);
  assert.equal(M.parseTyped('1.234', 'KWD', 'en'), 1234);            // three-decimal currency
  assert.equal(M.parseTyped('1.234', 'JPY', 'de'), 1234);            // de: grouping, a whole number of yen
  assert.equal(M.parseTyped('1234', 'JPY', 'ja'), 1234);
  assert.equal(M.parseTyped('12,5', 'JPY', 'sv'), null);             // yen have no decimals
  assert.equal(M.parseTyped('12.5', 'JPY', 'ja'), null);
  for (const bad of ['', ' ', '-', '+5', '.5', '5.', '5,', '1e3', '$5', '12,50 kr', '1  234']) assert.equal(M.parseTyped(bad, 'USD', 'sv'), null, bad);
});

test('ambiguous inputs follow the written rules, never a guess', () => {
  assert.equal(M.plainFromTyped('1,234', 'en'), '1234');      // en: a comma only groups
  assert.equal(M.plainFromTyped('1,5', 'en'), null);          // en: not 15 and not 1.5
  assert.equal(M.plainFromTyped('1.234', 'de'), '1234');      // de: fits the grouping pattern, so grouping
  assert.equal(M.plainFromTyped('1.2345', 'de'), '1.2345');   // de: does not fit it, so one dot is the decimal point
  assert.equal(M.plainFromTyped('1,234', 'sv'), '1.234');     // sv: a comma is the decimal mark
  assert.equal(M.plainFromTyped('12,34,567.5', 'hi'), '1234567.5');
  assert.equal(M.plainFromTyped('1,234,567', 'hi'), null);
});

test('the strict parser stays strict; typed follows the page language', () => {
  assert.equal(M.parseMinor('12,50'), null);
  assert.equal(M.parseMinor('1,000.00'), null);
  assert.equal(M.parseMinor('12.50'), 1250);
  const ctx = load('sv');
  assert.equal(ctx.SlopData.money.parseMinor('12,50', 'USD', { typed: true }), 1250);
  assert.equal(ctx.SlopData.money.parseTyped('12,50', 'USD'), 1250);
  ctx.lang = 'en';
  assert.equal(ctx.SlopData.money.parseTyped('12,50', 'USD'), null);
  assert.equal(M.uiLang(), 'en');
});

test('percentages: 0 to 100 with two decimals at most, as basis points', () => {
  assert.equal(M.parsePercent('7,5', { typed: 'sv' }), 750);
  assert.equal(M.parsePercent('25', { typed: 'de' }), 2500);
  assert.equal(M.parsePercent('7,5'), null);
  for (const bad of ['100.01', '-1', '7.555', 'x']) assert.equal(M.parsePercent(bad, { typed: 'en' }), null, bad);
});

test('text for inputs uses the language decimal mark and reads back', () => {
  assert.equal(M.typedMinor(1250, 'USD', 'sv'), '12,50');
  assert.equal(M.typedMinor(-5, 'EUR', 'de'), '-0,05');
  assert.equal(M.typedMinor(1250, 'USD', 'ja'), '12.50');
  assert.equal(M.typedMinor(500, 'JPY', 'fr'), '500');
  assert.equal(M.typedPlain('0.00', 'pt-BR'), '0,00');
  for (const lang of ['en', 'sv', 'de', 'fr', 'pt-BR', 'ja']) for (const n of [1, 99, 123456, 123456789]) {
    assert.equal(M.parseTyped(M.typedMinor(n, 'USD', lang), 'USD', lang), n, `${lang} ${n}`);
    assert.equal(M.parseTyped(M.typedMinor(n, 'KWD', lang), 'KWD', lang), n, `${lang} ${n} KWD`);
  }
});

test('the document model, the company profile, journal lines and rates read the page language', async () => {
  const ctx = load('sv', ['shared/data/currency.js', 'shared/docs/model.js', 'admin/js/core/profile.js', 'ledger/js/core/util.js',
    'ledger/js/core/journal.js', 'ledger/js/core/rates.js']);
  const Mo = ctx.SlopDocs.model;
  assert.equal(Mo.amountFromText('12,50', 'USD'), 1250);
  assert.equal(Mo.bpFromPercent('7,5'), 750);
  assert.equal(Mo.bpFromPercent(''), 0);
  assert.equal(Mo.bpFromPercent('100,5'), null);
  assert.equal(Mo.amountText(1250, 'USD'), '12,50');
  assert.equal(Mo.percentText(750), '7,5');
  const P = ctx.SlopAdmin.profile;
  const form = { companyName: 'AB', defaultCurrency: 'SEK', locale: 'sv-SE', defaultTaxRate: '12,5' };
  assert.equal(P.checked({}, form).value.defaultTaxRate, 1250);
  assert.equal(P.asForm({ defaultTaxRate: 1250 }).defaultTaxRate, '12,5');
  assert.equal(P.checked({}, { ...form, defaultTaxRate: '101' }).ok, false);
  const J = ctx.SlopLedger.journal;
  const entry = J.buildEntry({ date: '2026-10-01', currency: 'SEK', rows: [{ account: '1000', debit: '1 234,50' }, { account: '4000', credit: '1234.50' }] });
  assert.deepEqual([...entry.value.lines.map((l) => l.debit + l.credit)], [123450, 123450]);
  assert.equal(J.buildEntry({ date: '2026-10-01', currency: 'SEK', lang: 'en', rows: [{ account: '1000', debit: '12,50' }, { account: '4000', credit: '12.50' }] }).ok, false);
  const R = ctx.SlopLedger.rates;
  assert.equal((await R.addManual({ foreign: 'EUR', base: 'SEK', rateText: '11,4205', date: '2026-10-01' })).value.rate, 11420500);
  assert.equal((await R.addManual({ foreign: 'EUR', base: 'SEK', rateText: '11,42,05', date: '2026-10-01' })).ok, false);
  ctx.lang = 'en';
  assert.equal(Mo.amountFromText('12,50', 'USD'), null);
  assert.equal(Mo.percentText(750), '7.5');
  assert.equal(P.checked({}, form).ok, false);   // "12,5" is not a percentage in English
});
