// Removing text from a page's content stream (pdf/js/core/content-lex.js, content-strip.js, content-fills.js, content-ink.js): the
// operators of the text that goes are rewritten so the rest of the page keeps its place, and every other operator stays
// byte for byte. Run with: node --test tests/node/pdf-content-strip.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lx = require('../../pdf/js/core/content-lex.js');
const St = require('../../pdf/js/core/content-strip.js');
const Fi = require('../../pdf/js/core/content-fills.js');
const Ink = require('../../pdf/js/core/content-ink.js');

// every glyph of F1 is half an em wide; F2 is a two-byte font a full em wide; F9 cannot be measured
const fonts = (n) => (n === 'F1' ? { two: false, width: () => 500 } : n === 'F2' ? { two: true, width: () => 1000 } : null);
const hex = (s) => Lx.hexOf(s);
const placed = (src) => St.glyphs(Lx.lex(src), fonts).map((g) => [String.fromCharCode(g.code), +g.x.toFixed(3), +g.y.toFixed(3)]);
const textOf = (src) => St.glyphs(Lx.lex(src), fonts).map((g) => String.fromCharCode(g.code)).join('');

test('the lexer reads operands, strings with escapes, hex, arrays, dictionaries and inline images', () => {
  const src = '%c\nq /P <</MCID 3>> BDC (a\\(b\\)\\101\\\nc) Tj <4142> Tj [(x) -20 (y)] TJ EMC BI /W 1 /H 1 ID \x00\xff\nEI Q';
  const ops = Lx.lex(src);
  assert.deepEqual(ops.map((o) => o.op), ['q', 'BDC', 'Tj', 'Tj', 'TJ', 'EMC', 'BI', 'Q']);
  assert.equal(ops[1].args[1].dict.MCID, 3);
  assert.equal(ops[2].args[0].str, 'a(b)Ac');
  assert.equal(ops[3].args[0].str, 'AB');
  assert.deepEqual(ops[4].args[0].map((v) => (typeof v === 'number' ? v : v.str)), ['x', -20, 'y']);
  assert.equal(src.slice(ops[4].s, ops[4].e), '[(x) -20 (y)] TJ');
  assert.equal(src.slice(ops[6].s, ops[6].e), 'BI /W 1 /H 1 ID \x00\xff\nEI');
});

const LINE = 'q BT 0 0 0 rg /F1 10 Tf 1 0 0 1 50 700 Tm ' + hex('Hello') + ' Tj ET Q\n';
const NEXT = 'q BT /F1 10 Tf 1 0 0 1 50 680 Tm (Other line) Tj ET Q\n';

test('a whole line goes: its Tj leaves the stream, every other operator stays byte for byte', () => {
  const src = '1 0 0 rg 0 0 100 100 re f\n' + LINE + NEXT;
  const r = St.strip(src, fonts, [{ x0: 50, x1: 75, y: 700, fs: 10 }]);
  assert.equal(r.dropped, 5);
  assert.equal(r.text, src.replace(hex('Hello') + ' Tj', ''));
  assert.equal(textOf(r.text), 'Other line');
});

test('text that goes before kept text in the same BT leaves a move by its width; after it, nothing', () => {
  const src = 'BT /F1 10 Tf 50 700 Td (Hello) Tj (World) Tj ET';
  assert.equal(St.strip(src, fonts, [{ x0: 50, x1: 75, y: 700, fs: 10 }]).text, 'BT /F1 10 Tf 50 700 Td [-2500] TJ (World) Tj ET');
  assert.equal(St.strip(src, fonts, [{ x0: 75, x1: 100, y: 700, fs: 10 }]).text, 'BT /F1 10 Tf 50 700 Td (Hello) Tj  ET');
});

test('part of a line goes and the text after it keeps its place', () => {
  const src = 'BT /F1 10 Tf 50 700 Td (Hello big world) Tj (!) Tj ET';
  const before = placed(src);
  // "big " is characters 6..9: x 80..100, centres 82.5 … 97.5
  const r = St.strip(src, fonts, [{ x0: 80, x1: 100, y: 700, fs: 10 }]);
  assert.equal(r.dropped, 4);
  const after = placed(r.text);
  assert.equal(after.map((g) => g[0]).join(''), 'Hello world!');
  assert.deepEqual(after, before.filter((g, i) => i < 6 || i > 9));
});

test('a TJ keeps its kerning, and spacing (Tc, Tw, Tz) is part of the removed advance', () => {
  const src = 'BT /F1 10 Tf 2 Tc 3 Tw 80 Tz 1 0 0 1 10 500 Tm [(A) -100 (B C) 50 (D)] TJ (E) Tj ET';
  const before = placed(src);
  const gB = before[1], gD = before[4];
  const r = St.strip(src, fonts, [{ x0: gB[1] - 1, x1: gD[1] - 1, y: 500, fs: 10 }]); // drops "B C"
  const after = placed(r.text);
  assert.equal(after.map((g) => g[0]).join(''), 'ADE');
  assert.deepEqual(after, [before[0], before[4], before[5]]);
  assert.match(r.text, /\[<41> -2450 <44>\] TJ/); // -100, the 24 units of "B C" with its spacing, +50: one move
});

test("' and \" keep their line move and spacing when their text goes", () => {
  const src = 'BT /F1 10 Tf 12 TL 1 0 0 1 20 300 Tm (one) Tj (two) \' 1 2 (three) " (four) \' ET';
  const before = placed(src);
  const r = St.strip(src, fonts, [{ x0: 0, x1: 200, y: 288, fs: 10 }, { x0: 0, x1: 200, y: 276, fs: 10 }]);
  assert.match(r.text, /T\* \[-1500\] TJ/);
  assert.match(r.text, /1 Tw 2 Tc T\* \[/);
  assert.deepEqual(placed(r.text), before.filter((g) => g[2] === 300 || g[2] === 264));
});

test('a two-byte font is measured per code pair', () => {
  const src = 'BT /F2 10 Tf 100 100 Td <00410042> Tj <0043> Tj ET';
  const r = St.strip(src, fonts, [{ x0: 110, x1: 120, y: 100, fs: 10 }]);
  assert.equal(r.dropped, 1);
  assert.match(r.text, /\[<0041> -1000\] TJ/);
  assert.deepEqual(placed(r.text).map((g) => g[1]), [100, 120]);
});

test('nothing is removed from text in an unmeasured font, invisible or clipping text, or a turned line', () => {
  assert.equal(St.strip('BT /F9 10 Tf 50 700 Td (Hello) Tj ET', fonts, [{ x0: 40, x1: 90, y: 700, fs: 10 }]), null);
  assert.equal(St.strip('BT 3 Tr /F1 10 Tf 50 700 Td (Hello) Tj ET', fonts, [{ x0: 40, x1: 90, y: 700, fs: 10 }]), null);
  assert.equal(St.strip('BT 7 Tr /F1 10 Tf 50 700 Td (Hello) Tj ET', fonts, [{ x0: 40, x1: 90, y: 700, fs: 10 }]), null);
  assert.equal(St.strip('BT /F1 10 Tf 0 1 -1 0 50 700 Tm (Hello) Tj ET', fonts, [{ x0: 40, x1: 90, y: 700, fs: 10 }]), null);
  // after an unmeasured font the pen is lost until the next line move: the glyph is not guessed
  const src = 'BT /F9 10 Tf 50 700 Td (x) Tj /F1 10 Tf (Hello) Tj 0 -20 Td (Next) Tj ET';
  assert.equal(St.strip(src, fonts, [{ x0: 0, x1: 300, y: 700, fs: 10 }]), null);
  assert.equal(St.strip(src, fonts, [{ x0: 0, x1: 300, y: 680, fs: 10 }]).dropped, 4);
});

test('the matrix and q/Q are followed: text drawn under a scale is found where it lands', () => {
  const src = 'q 2 0 0 2 0 0 cm BT /F1 10 Tf 10 10 Td (Hi) Tj ET Q BT /F1 10 Tf 10 10 Td (Lo) Tj ET';
  const r = St.strip(src, fonts, [{ x0: 20, x1: 40, y: 20, fs: 20 }]);
  assert.equal(r.dropped, 2);
  assert.equal(textOf(r.text), 'Lo');
});

test('the colour under a box: the last filled rectangle that holds it, white on bare paper, null over an image or shading', () => {
  const src = '0.945 0.929 0.894 rg 0 0 595 842 re f q 0.2 g 100 100 50 20 re f Q q 50 0 0 50 300 300 cm /Im1 Do Q ' +
    'BT /F1 10 Tf 60 700 Td (Hi) Tj ET /Sh1 sh';
  const ops = Lx.lex(src), text = ops.findIndex((o) => o.op === 'Tj'), xobj = (n) => (n === 'Im1' ? { image: true } : null);
  assert.deepEqual(Fi.under(ops, { x0: 60, y0: 698, x1: 80, y1: 710 }, text, xobj), [0.945, 0.929, 0.894]);
  assert.deepEqual(Fi.under(ops, { x0: 110, y0: 105, x1: 120, y1: 110 }, text, xobj), [0.2, 0.2, 0.2]);
  assert.equal(Fi.under(ops, { x0: 120, y0: 110, x1: 170, y1: 115 }, text, xobj), null); // half on the grey box
  assert.equal(Fi.under(ops, { x0: 310, y0: 310, x1: 320, y1: 320 }, text, xobj), null); // the image
  assert.equal(Fi.under(ops, { x0: 60, y0: 698, x1: 80, y1: 710 }, null, xobj), null); // the shading painted last covers all
  assert.equal(Fi.under(ops, { x0: 60, y0: 698, x1: 80, y1: 710 }, text), null); // an XObject it cannot look into: not flat
  assert.deepEqual(Fi.under(Lx.lex('BT /F1 10 Tf (x) Tj ET'), { x0: 0, y0: 0, x1: 5, y1: 5 }), [1, 1, 1]);
  assert.deepEqual(Fi.under(Lx.lex('0 0 1 0 k 0 0 10 10 re f'), { x0: 1, y0: 1, x1: 2, y1: 2 }), Ink.cmyk(0, 0, 1, 0)); // as pdf.js draws it
  assert.equal(Fi.under(Lx.lex('/Pattern cs /P0 scn 0 0 10 10 re f'), { x0: 1, y0: 1, x1: 2, y1: 2 }), null);
});

test('a form is followed into: its rectangles are found where its matrix puts them', () => {
  const form = { ops: Lx.lex('0 0 1 rg 0 0 10 10 re f q 0 g 2 2 1 1 re f Q'), matrix: [10, 0, 0, 10, 100, 100], xobj: null };
  const ops = Lx.lex('1 1 1 rg 0 0 500 500 re f /Fm0 Do'), xobj = (n) => (n === 'Fm0' ? form : null);
  assert.deepEqual(Fi.under(ops, { x0: 150, y0: 150, x1: 190, y1: 190 }, null, xobj), [0, 0, 1]);
  assert.equal(Fi.under(ops, { x0: 110, y0: 110, x1: 140, y1: 140 }, null, xobj), null); // the black square inside it
  assert.deepEqual(Fi.under(ops, { x0: 300, y0: 300, x1: 310, y1: 310 }, null, xobj), [1, 1, 1]);
  assert.equal(Fi.regions(ops, xobj).length, 3);
});

test('a rectangle drawn as a closed path (m l l l h, as pdf-lib draws one) is a flat area; a curve is not', () => {
  const rect = Lx.lex('q 1 0 0 rg 1 0 0 1 0 0 cm 0 0 m 0 100 l 100 100 l 100 0 l h f Q');
  assert.deepEqual(Fi.under(rect, { x0: 10, y0: 10, x1: 20, y1: 20 }), [1, 0, 0]);
  const blob = Lx.lex('0 0 1 rg 0 0 m 0 100 l 50 150 100 150 100 100 c 100 0 l h f');
  assert.equal(Fi.under(blob, { x0: 10, y0: 10, x1: 20, y1: 20 }), null);
  const slant = Lx.lex('0 g 0 0 m 10 100 l 110 100 l 100 0 l h f');
  assert.equal(Fi.under(slant, { x0: 40, y0: 40, x1: 50, y1: 50 }), null);
});
