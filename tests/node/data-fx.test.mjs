// Unit tests for shared/data currency support: rate lookup, scaling, foreign postings, reversals, trial balance
// in base currency, and the ECB CSV parse (fixture only, never the network). Run: node tests/run.mjs data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, DATA_FILES, fakeTx, plain, ECB_FIXTURE } from './fx-env.mjs';

const D = (await loadInto(DATA_FILES.map((f) => `data/${f}`))).SlopData;
const { fx, ledger, locale, rates, schema } = { fx: D.fx, ledger: D.ledger, locale: D.locale, rates: D.rates, schema: D.schema };
const A = schema.ACCT;
const ok = (r) => assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);

/** A USD ledger with one EUR rate row (1 EUR = 1.0842 USD on 2026-10-01). */
async function usdLedger() {
  const tx = fakeTx(D);
  const r = await tx.put('exchangeRates', { base: 'EUR', quote: 'USD', date: '2026-10-01', rate: 1084200, source: 'manual' });
  ok(r);
  return { tx, row: r.value };
}
const eurEntry = (date = '2026-10-11', source = 'manual:1') => ({
  date, memo: 'Consulting', source, currency: 'EUR',
  lines: [{ account: A.BANK, debit: 1000 }, { account: A.REVENUE, credit: 1000 }],
});

test('rate scaling: 1.0842 applied to 1000 gives 1084, and half-up rounding at a tie', () => {
  assert.equal(fx.scale(1000, 1084200), 1084);
  assert.equal(fx.scale(5, 500000), 3);       // 2.5 rounds away from zero
  assert.equal(fx.scale(-5, 500000), -3);
  assert.equal(fx.scale(4, 500000), 2);       // 2.0
  assert.equal(fx.invert(1084200), 922339);   // 1 / 1.0842 scaled by 1e6, rounded
});

test('rate text is read to six decimals, half-up beyond that, and refused when not a positive decimal', () => {
  assert.equal(locale.parseRate('1.0842'), 1084200);
  assert.equal(locale.parseRate('180.25'), 180250000);
  assert.equal(locale.parseRate('0.0000005'), 1);      // seventh decimal 5 rounds up
  assert.equal(locale.parseRate('0.0000004'), null);   // rounds to zero: not a positive rate
  assert.equal(locale.parseRate('1,0842'), null);
  assert.equal(locale.parseRate('-1.0'), null);
  assert.equal(locale.parseRate(''), null);
});

test('latest rate on or before the date; none before the first row; a reversed row is used inverted', () => {
  const rows = [
    { id: 'a', base: 'EUR', quote: 'USD', date: '2026-10-01', rate: 1080000, createdAt: 1 },
    { id: 'b', base: 'EUR', quote: 'USD', date: '2026-10-05', rate: 1090000, createdAt: 2 },
  ];
  assert.equal(fx.pickRate(rows, 'EUR', 'USD', '2026-10-04').row.id, 'a');
  assert.equal(fx.pickRate(rows, 'EUR', 'USD', '2026-10-05').row.id, 'b');
  assert.equal(fx.pickRate(rows, 'EUR', 'USD', '2026-09-30'), null);
  assert.equal(fx.pickRate(rows, 'EUR', 'GBP', '2026-10-05'), null);
  const back = fx.pickRate(rows, 'USD', 'EUR', '2026-10-05');
  assert.equal(back.inverted, true);
  assert.equal(back.rate, 917431);
});

test('a same-day tie goes to the row created last (a correction)', () => {
  const rows = [
    { id: 'old', base: 'EUR', quote: 'USD', date: '2026-10-05', rate: 1090000, createdAt: 1 },
    { id: 'fix', base: 'EUR', quote: 'USD', date: '2026-10-05', rate: 1091000, createdAt: 9 },
  ];
  assert.equal(fx.pickRate(rows, 'EUR', 'USD', '2026-10-05').row.id, 'fix');
});

test('rateOn fails with a clear error when no rate exists, and never falls back to 1:1', async () => {
  const { tx } = await usdLedger();
  const r = await fx.rateIn(tx, 'EUR', 'USD', '2026-09-30');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_rate');
  assert.match(r.message, /EUR to USD on or before 2026-09-30/);
  assert.equal(r.message.includes('1:1'), false);
});

test('rateOn (public) reads through the store; invalid codes and dates are refused', async () => {
  const { tx } = await usdLedger();
  const saved = D.store.readAll;
  D.store.readAll = (fn) => fn(tx);
  try {
    const r = await D.fx.rateOn('eur', 'usd', '2026-10-11');
    ok(r);
    assert.equal(r.value.rate, 1084200);
    assert.equal(r.value.base, 'EUR');
    assert.equal((await D.fx.rateOn('EUR', 'USD', '2026-09-01')).code, 'no_rate');
    assert.equal((await D.fx.rateOn('EURO', 'USD', '2026-10-11')).code, 'invalid');
    assert.equal((await D.fx.rateOn('EUR', 'USD', '11/10/2026')).code, 'invalid');
  } finally {
    D.store.readAll = saved;
  }
});

test('a EUR posting into a USD ledger stores amount, currency, amountBase and the rate row id', async () => {
  const { tx, row } = await usdLedger();
  const r = await ledger.postIn(tx, eurEntry());
  ok(r);
  const j = r.value;
  assert.equal(j.currency, 'EUR');
  assert.equal(j.amount, 1000);
  assert.equal(j.amountBase, 1084);
  assert.equal(j.rateId, row.id);
  assert.equal(j.rate, 1084200);
  assert.deepEqual(plain(j.lines), [
    { account: A.BANK, debit: 1084, credit: 0, origDebit: 1000, origCredit: 0 },
    { account: A.REVENUE, debit: 0, credit: 1084, origDebit: 0, origCredit: 1000 },
  ]);
});

test('a posting with no currency is in the base currency: amount equals amountBase, no rate', async () => {
  const tx = fakeTx(D);
  const r = await ledger.postIn(tx, { date: '2026-10-11', source: 'manual:base', lines: [{ account: A.BANK, debit: 500 }, { account: A.REVENUE, credit: 500 }] });
  ok(r);
  assert.equal(r.value.currency, 'USD');
  assert.equal(r.value.amount, 500);
  assert.equal(r.value.amountBase, 500);
  assert.equal(r.value.rateId, undefined);
});

test('a posting with no rate is refused and nothing is stored', async () => {
  const tx = fakeTx(D);
  const r = await ledger.postIn(tx, eurEntry('2026-10-11', 'manual:none'));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_rate');
  assert.equal(tx.tables.journal, undefined);
});

test('old postings never change when a newer rate row is added; new postings use the new rate', async () => {
  const { tx } = await usdLedger();
  ok(await ledger.postIn(tx, eurEntry('2026-10-02', 'manual:old')));
  const before = JSON.stringify(tx.tables.journal);
  ok(await tx.put('exchangeRates', { base: 'EUR', quote: 'USD', date: '2026-10-10', rate: 1090000, source: 'manual' }));
  assert.equal(JSON.stringify(tx.tables.journal), before);
  const later = await ledger.postIn(tx, eurEntry('2026-10-11', 'manual:new'));
  ok(later);
  assert.equal(later.value.rate, 1090000);
  assert.equal(later.value.amountBase, 1090);
});

test('reversing a foreign entry keeps its rate, so the reversal cancels the original in base', async () => {
  const { tx } = await usdLedger();
  const orig = (await ledger.postIn(tx, eurEntry('2026-10-11', 'manual:r'))).value;
  const rev = await ledger.reverseIn(tx, orig.id, { date: '2026-10-12' });
  ok(rev);
  assert.equal(rev.value.rateId, orig.rateId);
  assert.equal(rev.value.amountBase, 1084);
  assert.equal(rev.value.amount, 1000);
  assert.equal(rev.value.lines[0].credit, 1084);
  assert.equal(rev.value.lines[0].origCredit, 1000);
  const s = ledger.summarize(tx.tables.journal, schema.DEFAULT_CHART);
  assert.equal(s.balanced, true);
  assert.equal(s.rows.find((r) => r.code === A.BANK).balance, 0);
});

test('conversion residual: the rounding difference goes to the largest line on the short side', () => {
  const c = fx.convertLines([
    { account: '1200', debit: 1000 }, { account: '4000', credit: 500 }, { account: '2100', credit: 500 },
  ], 333333);
  assert.deepEqual(c.lines.map((l) => [l.account, l.debit, l.credit]), [['1200', 334, 0], ['4000', 0, 167], ['2100', 0, 167]]);
  assert.equal(c.amount, 1000);
  assert.equal(c.amountBase, 334);
});

test('trial balance in base currency; foreign totals reported apart; a broken foreign entry is caught', () => {
  const j = (id, lines, extra = {}) => ({ id, date: '2026-10-11', source: id, lines, ...extra });
  const base = j('b1', [{ account: A.BANK, debit: 500, credit: 0 }, { account: A.REVENUE, debit: 0, credit: 500 }]);
  const eur = j('e1', [
    { account: A.BANK, debit: 1084, credit: 0, origDebit: 1000, origCredit: 0 },
    { account: A.REVENUE, debit: 0, credit: 1084, origDebit: 0, origCredit: 1000 },
  ], { currency: 'EUR', amount: 1000, amountBase: 1084, rateId: 'r1', rate: 1084200 });
  const s = ledger.summarize([base, eur], schema.DEFAULT_CHART);
  assert.equal(s.balanced, true);
  assert.equal(s.debit, 1584);
  assert.deepEqual(plain(s.foreign), [{ currency: 'EUR', debit: 1000, credit: 1000, balanced: true }]);

  const broken = j('e2', [
    { account: A.BANK, debit: 1084, credit: 0, origDebit: 1000, origCredit: 0 },
    { account: A.REVENUE, debit: 0, credit: 1084, origDebit: 0, origCredit: 999 },
  ], { currency: 'EUR', amount: 1000, amountBase: 1084, rateId: 'r1', rate: 1084200 });
  const bad = ledger.summarize([broken], schema.DEFAULT_CHART);
  assert.equal(bad.balanced, false);
  assert.ok(bad.errors.some((e) => /does not balance in EUR/.test(e)));
});

test('ECB CSV parse: date, rates scaled by 1e6, stale and empty rows skipped, bad input refused (fixture only)', () => {
  const r = rates.parseEcb(ECB_FIXTURE);
  ok(r);
  assert.equal(r.value.date, '2026-10-09');
  assert.deepEqual(plain(r.value.rates), [
    { quote: 'USD', rate: 1160000 }, { quote: 'JPY', rate: 180250000 }, { quote: 'GBP', rate: 871200 },
  ]);
  assert.equal(rates.parseEcb('').ok, false);
  assert.equal(rates.parseEcb('not csv at all').ok, false);
  assert.equal(rates.parseEcb(ECB_FIXTURE.replace('OBS_VALUE', 'VALUE')).code, 'invalid');
  assert.equal(rates.parseEcb(ECB_FIXTURE.replace('1.1600', 'abc')).ok, false);
  assert.equal(rates.parseEcb(ECB_FIXTURE.replace('2026-10-09,180.25', '09/10/2026,180.25')).ok, false);
  const onlyEmpty = ECB_FIXTURE.split('\n').filter((l) => !/,\d{4}-\d{2}-\d{2},\d/.test(l)).join('\n');
  assert.equal(rates.parseEcb(onlyEmpty).code, 'invalid');
});

test('ECB rows: one per currency with source ecb for today, same-day repeat is unchanged, a failed download stores nothing', async () => {
  const tx = fakeTx(D);
  const savedT = D.store.transact;
  D.store.transact = (fn) => fn(tx);
  try {
    const okFetch = async () => ({ ok: true, status: 200, text: async () => ECB_FIXTURE });
    const first = await rates.updateRates({ fetch: okFetch, allowed: () => true, today: '2026-10-11' });
    ok(first);
    assert.equal(first.value.added.length, 3);
    assert.equal(tx.tables.exchangeRates.length, 3);
    for (const row of tx.tables.exchangeRates) {
      assert.equal(row.source, 'ecb');
      assert.equal(row.base, 'EUR');
      assert.equal(row.date, '2026-10-11');
      assert.equal(row.note, 'ECB reference 2026-10-09');
    }
    const again = await rates.updateRates({ fetch: okFetch, allowed: () => true, today: '2026-10-11' });
    assert.equal(again.value.unchanged.length, 3);
    assert.equal(tx.tables.exchangeRates.length, 3);

    const down = await rates.updateRates({ fetch: async () => { throw new TypeError('offline'); }, allowed: () => true, today: '2026-10-12' });
    assert.equal(down.ok, false);
    assert.equal(down.code, 'network');
    assert.match(down.message, /No rates were stored/);
    assert.equal(tx.tables.exchangeRates.length, 3);

    const notOk = await rates.updateRates({ fetch: async () => ({ ok: false, status: 503 }), allowed: () => true, today: '2026-10-12' });
    assert.equal(notOk.code, 'http');
    assert.match(notOk.message, /503/);
  } finally {
    D.store.transact = savedT;
  }
});

test('an uploaded tax-free invoice in EUR converts its lines and total, then issues in base', async () => {
  const { tx } = await usdLedger();
  const lines = D.billing.invoiceLines({ subtotal: 2100, tax: 420, total: 2520 });
  const r = await ledger.postIn(tx, { date: '2026-10-11', source: 'invoice:x:issue', currency: 'EUR', lines });
  ok(r);
  assert.equal(r.value.amount, 2520);
  assert.equal(r.value.amountBase, 2732);   // 2520 x 1.0842 = 2732.184
  const s = ledger.summarize(tx.tables.journal, schema.DEFAULT_CHART);
  assert.equal(s.balanced, true);
});
