// Random barcode values (shared/data/barcode.js): check digits, lengths, alphabets, prefixes, uniqueness.
// The seeded generator makes the uniqueness checks repeatable; the crypto path is checked for shape only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WORDS, PIN } from './data-env.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'data', 'barcode.js');
const ctx = { crypto: globalThis.crypto };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of WORDS) { vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: f }); if (f === WORDS[0]) vm.runInContext(PIN, ctx); }   // the messages' English words
vm.runInContext(await readFile(FILE, 'utf8'), ctx, { filename: 'barcode.js' });
const B = ctx.SlopData.barcode;
const seeded = (seed) => B.seededRand(seed);

test('check digit matches the GS1 weights', () => {
  assert.equal(B.checkDigit('400638133393'), 1);
  assert.equal(B.checkDigit('501234567890'), 0);
  assert.equal(B.checkDigit('978020137962'), 4);
  assert.equal(B.checkDigit('0000000000'), 0);
  assert.equal(B.checkDigit('12345678901'), 2);
});

test('isValidEan accepts good check digits and rejects bad ones', () => {
  assert.equal(B.isValidEan('4006381333931'), true);
  assert.equal(B.isValidEan('4006381333932'), false);
  assert.equal(B.isValidEan('12345'), false);
  assert.equal(B.isValidEan('abcdefgh'), false);
});

test('EAN-13, EAN-8 and UPC-A values have the right length and a valid check digit', () => {
  for (const [sym, len] of [['ean13', 13], ['ean8', 8], ['upca', 12]]) {
    for (let i = 0; i < 300; i++) {
      const v = B.randomValue({ symbology: sym, rand: seeded(i + 1) });
      assert.equal(v.length, len, `${sym} length`);
      assert.match(v, /^\d+$/);
      assert.equal(B.isValidEan(v), true, `${sym} ${v} check digit`);
    }
  }
});

test('EAN prefix is kept and the rest is random digits', () => {
  const r = seeded(7);
  for (let i = 0; i < 100; i++) {
    const v = B.randomValue({ symbology: 'ean13', prefix: '950', rand: r });
    assert.ok(v.startsWith('950'));
    assert.equal(B.isValidEan(v), true);
  }
  assert.throws(() => B.randomValue({ symbology: 'ean13', prefix: 'AB' }), /digits only/);
  assert.throws(() => B.randomValue({ symbology: 'ean8', prefix: '1234567' }), /shorter/);
});

test('code 128 uses the requested length and character kind', () => {
  const r = seeded(3);
  assert.equal(B.randomValue({ symbology: 'code128', rand: r }).length, 12);
  assert.equal(B.randomValue({ symbology: 'code128', length: 20, rand: r }).length, 20);
  for (let i = 0; i < 200; i++) {
    assert.match(B.randomValue({ symbology: 'code128', kind: 'digits', length: 9, rand: r }), /^\d{9}$/);
    assert.match(B.randomValue({ symbology: 'code128', kind: 'letters', length: 9, rand: r }), /^[A-Z]{9}$/);
    assert.match(B.randomValue({ symbology: 'code39', length: 10, rand: r }), /^[0-9A-Z]{10}$/);
  }
  assert.equal(B.randomValue({ symbology: 'code128', prefix: 'SKU-', length: 8, rand: r }).slice(0, 4), 'SKU-');
});

test('QR and Data Matrix default to 16 characters; out-of-range lengths are refused', () => {
  assert.equal(B.randomValue({ symbology: 'qrcode', rand: seeded(1) }).length, 16);
  assert.equal(B.randomValue({ symbology: 'datamatrix', rand: seeded(1) }).length, 16);
  assert.throws(() => B.randomValue({ symbology: 'code128', length: 0 }), /Length/);
  assert.throws(() => B.randomValue({ symbology: 'code128', length: 81 }), /Length/);
  assert.throws(() => B.randomValue({ symbology: 'aztec' }), /No random generator/);
});

test('seeded values are repeatable and distinct per seed', () => {
  const a = B.randomValues(20, { symbology: 'ean13', rand: seeded(42) });
  const b = B.randomValues(20, { symbology: 'ean13', rand: seeded(42) });
  const c = B.randomValues(20, { symbology: 'ean13', rand: seeded(43) });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('randomValues returns distinct values', () => {
  const vals = B.randomValues(500, { symbology: 'code128', kind: 'digits', length: 8, rand: seeded(99) });
  assert.equal(vals.length, 500);
  assert.equal(new Set(vals).size, 500);
  const eans = B.randomValues(200, { symbology: 'upca', rand: seeded(5) });
  assert.equal(new Set(eans).size, 200);
  assert.ok(eans.every((v) => B.isValidEan(v)));
});

test('randomValues refuses when the alphabet cannot give that many values', () => {
  assert.throws(() => B.randomValues(11, { symbology: 'code128', kind: 'digits', length: 1, rand: seeded(1) }), /Not enough distinct/);
  assert.throws(() => B.randomValues(0, { symbology: 'code128' }), /Count/);
});

test('the crypto path (no rand) gives valid values', () => {
  const v = B.randomValue({ symbology: 'ean13' });
  assert.equal(v.length, 13);
  assert.equal(B.isValidEan(v), true);
  const many = B.randomValues(50, { symbology: 'code39', length: 12 });
  assert.equal(new Set(many).size, 50);
  assert.ok(many.every((x) => /^[0-9A-Z]{12}$/.test(x)));
});
