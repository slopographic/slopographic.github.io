// SlopSample (shared/sample): the seeded generator, the words of each language, people, goods and the business records.
// The same seed gives the same sample; different seeds differ; colours read on white; phones stay in the ranges kept for
// fiction; every record passes the store's own checks (SlopData.schema.prepare).
// Covers: shared/sample/rng.js, shared/sample/en.js, shared/sample/sv.js, shared/sample/people.js, shared/sample/goods.js, shared/sample/records.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLE_FILES = ['shared/sample/rng.js', 'shared/sample/en.js', 'shared/sample/sv.js', 'shared/sample/people.js', 'shared/sample/goods.js', 'shared/sample/records.js'];
const DATA = ['shared/data/money.js', 'shared/data/barcode.js', 'shared/data/schema-checks.js', 'shared/data/schema-defs.js', 'shared/data/schema.js'];
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of DATA.concat(SAMPLE_FILES)) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const S = ctx.SlopSample, D = ctx.SlopData;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('rng: the same seed gives the same numbers; another seed others; fork is independent of the parent', () => {
  const a = S.rng('4821'), b = S.rng('4821'), c = S.rng('4822');
  const xs = Array.from({ length: 20 }, () => a.next()), ys = Array.from({ length: 20 }, () => b.next()), zs = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const r = S.rng('x');
  for (let i = 0; i < 500; i++) { const n = r.int(3, 7); assert.ok(n >= 3 && n <= 7 && Number.isInteger(n)); }
  assert.deepEqual(plain(S.rng('p').fork('a').next()), plain(S.rng('p').fork('a').next()));
  assert.deepEqual(S.rng('s').shuffle([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
  assert.equal(S.hashSeed('abc'), S.hashSeed('abc'));
});

test('seeds: newSeed is four or five digits; normSeed keeps a typed seed and makes one for an empty field', () => {
  assert.match(S.newSeed(() => 0), /^\d{4}$/);
  assert.match(S.newSeed(() => 0.9999), /^\d{5}$/);
  assert.equal(S.normSeed('  hello '), 'hello');
  assert.equal(S.normSeed('x'.repeat(60)).length, S.MAX_SEED);
  assert.match(S.normSeed('', () => 0.5), /^\d+$/);
});

test('locales: en and sv are listed; sv-SE is Swedish; an unknown language is English', () => {
  assert.deepEqual(plain(S.LOCALES.map((l) => l[0])).sort(), ['en', 'sv']);
  assert.equal(S.locale('sv-SE').name, 'Svenska');
  assert.equal(S.locale('xx').name, 'English');
});

test('identity: deterministic per seed and locale, with addresses that never reach anyone', () => {
  for (const locale of ['en', 'sv']) {
    const a = S.identity('4821', { locale }), b = S.identity('4821', { locale });
    assert.deepEqual(plain(a), plain(b));
    assert.notDeepEqual(plain(a), plain(S.identity('4822', { locale })));
    for (let i = 0; i < 60; i++) {
      const p = S.identity(String(i), { locale });
      assert.match(p.email, /^[a-z0-9.]+@[a-z0-9]+\.example$/, p.email);
      assert.match(p.website, /\.example$/);
      assert.ok(p.name && p.title && p.company && p.address, JSON.stringify(p));
      if (locale === 'en') assert.match(p.phone, /^\+44 (20 7946 0|117 496 0|161 496 0|113 496 0|131 496 0|141 496 0|29 2018 0|114 496 0)\d{3}$/, p.phone);
      else assert.match(p.phone, /^\+46 (8 465 004 |31 390 06 |40 628 04 |980 319 2)\d{2}$/, p.phone);
      if (p.mobile) assert.match(p.mobile, locale === 'en' ? /^\+44 7700 900\d{3}$/ : /^\+46 70 174 06 (0[5-9]|[1-9]\d)$/);
    }
  }
  assert.equal(S.slug('Åsa Östlund & Co'), 'asa-ostlund-and-co');
});

test('colour: the same seed, the same colour; every colour reads on white (4.5:1)', () => {
  assert.equal(S.colour('7'), S.colour('7'));
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const c = S.colour(String(i)); assert.match(c, /^#[0-9a-f]{6}$/); assert.ok(S.contrast(c, '#ffffff') >= 4.5, c); seen.add(c); }
  assert.ok(seen.size > 150, 'colours vary');
  assert.ok(Math.abs(S.contrast('#000000', '#ffffff') - 21) < 1e-9);
});

test('goods: prices in minor units scaled to the currency; lines are valid and deterministic', () => {
  const usd = S.lines('9', { currency: 'USD' }), again = S.lines('9', { currency: 'USD' });
  assert.deepEqual(plain(usd), plain(again));
  for (let i = 0; i < 100; i++) {
    for (const l of S.lines(String(i), { locale: i % 2 ? 'sv' : 'en' })) {
      assert.ok(Number.isInteger(l.unitPrice) && l.unitPrice > 0 && Number.isInteger(l.qty) && l.qty >= 1, JSON.stringify(l));
      assert.ok([0, 500, 600, 1200, 2000, 2500].includes(l.taxRate));
    }
  }
  const avg = (cur) => { let s = 0; for (let i = 0; i < 200; i++) s += S.item(String(i), { currency: cur, kind: 'product' }).price; return s / 200; };
  assert.ok(avg('SEK') > avg('USD') * 5, 'kronor prices are higher');
  assert.equal(S.item('1', { currency: 'JPY', digits: 0, kind: 'product' }).price % 1, 0);
  assert.equal(S.addDays('2026-02-27', 3), '2026-03-02');
  const d = S.day('3', '2026-01-01', '2026-01-31');
  assert.ok(d >= '2026-01-01' && d <= '2026-01-31');
});

test('records: every collection, both languages, passes the store checks; the same seed gives the same record', () => {
  const base = { today: '2026-07-01', currency: 'USD', accounts: ['5000'] };
  for (const c of S.COLLECTIONS) {
    for (let i = 0; i < 25; i++) {
      const ctx2 = Object.assign({ locale: i % 2 ? 'sv' : 'en', skus: new Set() }, base);
      const out = S.record(c, String(i), ctx2);
      const rec = Object.assign({}, out.record);
      if (out.customer) {
        const cp = D.schema.prepare('customers', out.customer);
        assert.ok(cp.ok, c + ' customer: ' + JSON.stringify(cp.errors));
        rec.customerId = 'c1';
      }
      if (c === 'products') rec.id = 'p1';
      const p = D.schema.prepare(c, rec, { deferNumber: true });
      assert.ok(p.ok, `${c} #${i}: ${JSON.stringify(p.errors)} ${JSON.stringify(rec)}`);
    }
    assert.deepEqual(plain(S.record(c, 'same', base)), plain(S.record(c, 'same', base)), c);
  }
  const q = S.record('quotes', '4821', base);
  assert.ok(q.record.lines.length >= 1 && q.customer.name && q.record.validUntil, 'a quote has a customer and lines');
  assert.equal(S.record('purchases', '1', base).customer.supplier, true);
  assert.throws(() => S.record('journal', '1', base), /No samples/);
  const skus = new Set();
  const a = S.record('products', '1', { skus }).record.sku, b = S.record('products', '1', { skus }).record.sku;
  assert.notEqual(a, b, 'a SKU in use is skipped');
});
