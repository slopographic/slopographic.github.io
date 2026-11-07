// The paragraph frame layout of Slop PDF Edit text ▸ Paragraphs (pdf/js/editor/para-layout.js): wrapping to the frame,
// alignment, justified word spacing, line breaks, right-to-left lines, font pieces, ToUnicode and W parsing.
// Run with: node --test tests/node/pdf-para-layout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../../pdf/js/editor/para-layout.js');
const measure = (t) => Array.from(t).length * 5, space = () => 3;
const text = (line) => line.segs.map((s) => s.t).join(' ');
const lay = (str, width, align = 'left', o = {}) => P.layout([[{ t: str, s: 0 }]], Object.assign({ width, align, measure, space }, o));

test('words wrap at the frame width and every line fits', () => {
  const ls = lay('one two three four five six seven', 61);
  assert.deepEqual(ls.map(text), ['one two three', 'four five six', 'seven']);
  ls.forEach((l) => l.segs.forEach((s) => assert.ok(s.x >= 0 && s.x + s.w <= 61.01)));
  assert.equal(lay('one two three four five six seven', 30).length > ls.length, true, 'a narrower frame makes more lines');
});

test('right and centre alignment', () => {
  const r = lay('ab cd', 100, 'right')[0], c = lay('ab cd', 100, 'center')[0];
  assert.equal(r.segs[1].x + r.segs[1].w, 100);
  assert.equal(c.segs[0].x, (100 - 23) / 2);
});

test('justified lines reach both edges, the last line does not', () => {
  const ls = lay('aa bb cc dd ee ff gg', 40, 'justify');
  assert.ok(ls.length > 1);
  ls.slice(0, -1).forEach((l) => { const s = l.segs[l.segs.length - 1]; assert.ok(Math.abs(s.x + s.w - 40) < 1e-9); assert.equal(l.segs[0].x, 0); });
  const last = ls[ls.length - 1], end = last.segs[last.segs.length - 1];
  assert.ok(end.x + end.w < 40);
});

test('a line break and a new paragraph start new lines; styles stay on their words', () => {
  const ls = P.layout([[{ t: 'one ', s: 0 }, { t: 'bold', s: 1 }, { t: '\ntwo', s: 0 }], [{ t: 'new para', s: 0 }]], { width: 200, align: 'justify', measure, space });
  assert.deepEqual(ls.map(text), ['one bold', 'two', 'new para']);
  assert.equal(ls[0].segs[1].s, 1);
  assert.equal(ls[0].segs[1].x, 18, 'a line before a break is not spread');
});

test('a word wider than the frame is cut by characters', () => {
  const ls = lay('abcdefghij', 22);
  assert.deepEqual(ls.map(text), ['abcd', 'efgh', 'ij']);
});

test('right-to-left lines are laid out from the right, runs kept whole', () => {
  const ls = lay('אב גד הו', 100, 'right', { rtl: true });
  assert.equal(ls.length, 1);
  assert.equal(ls[0].segs.length, 1);
  assert.equal(ls[0].segs[0].rtl, true);
  assert.equal(ls[0].segs[0].x + ls[0].segs[0].w, 100);
});

test('pieces: characters the document font lacks are set in the substitute font', () => {
  const ps = P.pieces({ x: 10, t: 'aöb', s: 0 }, (ch) => ch !== 'ö', (t, s, fb) => t.length * (fb ? 7 : 5));
  assert.deepEqual(ps.map((p) => [p.t, p.fb, p.x]), [['a', false, 10], ['ö', true, 15], ['b', false, 22]]);
});

test('ToUnicode maps: bfchar and bfrange, two-byte codes; the reverse map takes single characters', () => {
  const cmap = '1 begincodespacerange <0000> <FFFF> endcodespacerange\n2 beginbfchar\n<0003> <0020>\n<0011> <00E5>\nendbfchar\n' +
    '1 beginbfrange\n<0020> <0022> <0061>\nendbfrange\n1 beginbfrange\n<0030> <0031> [<0066006C> <0078>]\nendbfrange';
  const t = P.parseToUnicode(cmap);
  assert.equal(t.bytes, 2);
  assert.equal(t.map.get('0011'), 'å');
  assert.equal(t.map.get('0022'), 'c');
  assert.equal(t.map.get('0030'), 'fl');
  const r = P.reverseMap(t.map);
  assert.equal(r.get('b'), '0021');
  assert.equal(r.get(' '), '0003');
  assert.equal(r.has('fl'), false);
  assert.equal(r.get('x'), '0031');
});

test('W arrays and the WinAnsi table', () => {
  const w = P.parseW([3, [250, 300], 10, 12, 500]);
  assert.deepEqual([w.get(3), w.get(4), w.get(10), w.get(12), w.get(13)], [250, 300, 500, 500, undefined]);
  assert.equal(P.WIN_ANSI.get(0xe5), 'å');
  assert.equal(P.WIN_ANSI.get(0x80), '€');
  assert.equal(P.WIN_ANSI.has(0x81), false);
});

test('a first-line indent and a hanging indent take room on their lines; end marks a paragraph\'s last line', () => {
  const ls = P.layout([[{ t: 'aa bb cc dd ee ff', s: 0 }], [{ t: 'gg', s: 0 }]], { width: 40, align: 'left', first: 10, rest: 0, measure, space });
  assert.equal(ls[0].segs[0].x, 10);
  assert.equal(ls[1].segs[0].x, 0);
  ls.forEach((l) => l.segs.forEach((s) => assert.ok(s.x + s.w <= 40.01)));
  assert.deepEqual(ls.map((l) => l.end), ls.map((l, i) => i === ls.length - 1 || i === ls.length - 2));
  const hang = P.layout([[{ t: '• aa bb cc dd', s: 0 }]], { width: 30, align: 'left', first: 0, rest: 8, measure, space });
  assert.equal(hang[0].segs[0].x, 0);
  assert.equal(hang[1].segs[0].x, 8);
});
