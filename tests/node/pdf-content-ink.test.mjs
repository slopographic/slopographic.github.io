// The colour a page's content draws its text in (pdf/js/core/content-ink.js): fill and stroke colours in every device
// space, named spaces (ICCBased by its alternate, Indexed, Separation), q/Q, render modes and text inside forms.
// Run with: node --test tests/node/pdf-content-ink.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lx = require('../../pdf/js/core/content-lex.js');
const Ink = require('../../pdf/js/core/content-ink.js');

const fonts = (n) => (n === 'F1' ? { two: false, width: () => 500 } : null);
const T = [{ x0: 50, x1: 75, y: 700, fs: 10 }]; // "Hello" at 50,700 in F1 10
const line = (pre) => Lx.lex(pre + ' BT /F1 10 Tf 50 700 Td (Hello) Tj ET');
const ink = (pre, res) => Ink.ink(line(pre), Object.assign({ fonts }, res || {}), T);
const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('device colours: grey, RGB and CMYK (as pdf.js draws CMYK); black when nothing is set', () => {
  assert.deepEqual(ink(''), [0, 0, 0]);
  assert.deepEqual(ink('0.5 g'), [0.5, 0.5, 0.5]);
  assert.deepEqual(ink('1 0.5 0 rg'), [1, 0.5, 0]);
  assert.ok(near(ink('0 1 1 0 k'), Ink.cmyk(0, 1, 1, 0)));
  const red = Ink.cmyk(0, 1, 1, 0);
  assert.ok(red[0] > 0.85 && red[1] < 0.25 && red[2] < 0.25, 'CMYK red is red: ' + red);
  assert.deepEqual(ink('/DeviceRGB cs 0.2 0.4 0.6 sc'), [0.2, 0.4, 0.6]);
  assert.deepEqual(ink('/DeviceGray cs'), [0, 0, 0]);
});

test('the stroke colour paints stroked-only text; invisible text has no colour; q/Q restores', () => {
  assert.deepEqual(ink('1 0 0 rg 0 0 1 RG 1 Tr'), [0, 0, 1]);
  assert.deepEqual(ink('1 0 0 rg 0 0 1 RG 2 Tr'), [1, 0, 0]);
  assert.equal(ink('1 0 0 rg 3 Tr'), null);
  assert.deepEqual(ink('1 1 1 rg q 0 0 0 rg Q'), [1, 1, 1]);
});

test('named spaces: ICCBased as its alternate, Indexed through its lookup, Separation through its tint', () => {
  const space = (n) => ({
    CS0: { kind: 'rgb' },
    CS1: { kind: 'indexed', base: { kind: 'rgb' }, hival: 1, lookup: '\x00\x00\x00\xff\x80\x00' },
    CS2: { kind: 'sep', base: { kind: 'cmyk' }, c0: [0, 0, 0, 0], c1: [1, 0, 0, 0], N: 1 },
    CS3: { kind: 'pattern' },
  })[n] || null;
  assert.deepEqual(ink('/CS0 cs 0 1 0 scn', { space }), [0, 1, 0]);
  assert.deepEqual(ink('/CS1 cs 1 scn', { space }), [1, 128 / 255, 0]);
  assert.ok(near(ink('/CS2 cs 0.5 scn', { space }), Ink.cmyk(0.5, 0, 0, 0)));
  assert.ok(near(ink('/CS2 cs', { space }), Ink.cmyk(1, 0, 0, 0)), 'a Separation starts at full tint');
  assert.equal(ink('/CS3 cs /P0 scn', { space }), null);
  assert.equal(ink('/Nope cs 1 scn', { space }), null);
});

test('text in a form is found where the form puts it, in the colour it inherits or sets', () => {
  const formRes = { fonts };
  const form = { ops: Lx.lex('BT /F1 10 Tf 0 0 Td (Hello) Tj ET'), matrix: [1, 0, 0, 1, 50, 700], res: formRes };
  const res = { fonts: () => null, form: (n) => (n === 'Fm0' ? form : null) };
  assert.deepEqual(Ink.ink(Lx.lex('0.9 0.8 0.1 rg /Fm0 Do'), res, T), [0.9, 0.8, 0.1]);
  form.ops = Lx.lex('0 0 1 rg BT /F1 10 Tf 0 0 Td (Hello) Tj ET');
  assert.deepEqual(Ink.ink(Lx.lex('1 0 0 rg /Fm0 Do'), res, T), [0, 0, 1]);
  assert.equal(Ink.ink(Lx.lex('1 0 0 rg /Fm0 Do'), res, [{ x0: 300, x1: 320, y: 700, fs: 10 }]), null);
});

test('the colour most of the line is in wins; other lines do not count', () => {
  const ops = Lx.lex('BT /F1 10 Tf 50 700 Td 1 0 0 rg (Hell) Tj 0 0 1 rg (o) Tj 0 g 0 -20 Td (Other) Tj ET');
  assert.deepEqual(Ink.ink(ops, { fonts }, T), [1, 0, 0]);
  assert.deepEqual(Ink.ink(ops, { fonts }, [{ x0: 50, x1: 80, y: 680, fs: 10 }]), [0, 0, 0]);
});
