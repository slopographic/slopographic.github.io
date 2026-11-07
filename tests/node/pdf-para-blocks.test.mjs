// Paragraph blocks for Slop PDF Edit text ▸ Paragraphs (pdf/js/editor/para-blocks.js): lines grouped into blocks on
// synthetic pages (two paragraphs, a heading, a bulleted list, two columns, centred, justified and right-to-left text).
// Run with: node --test tests/node/pdf-para-blocks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const B = require('../../pdf/js/editor/para-blocks.js');

/** One run: characters half an em wide, the box from 0.8 em above the baseline to 0.25 em below. */
function run(str, x0, base, fs = 10, o = {}) {
  const w = o.w != null ? o.w : str.length * 0.5 * fs;
  return { str, x0, x1: x0 + w, base, top: base - 0.8 * fs, bottom: base + 0.25 * fs, fs, style: o.style || (o.bold ? 'B' : 'R'), family: o.family || 'Body', bold: !!o.bold, italic: !!o.italic };
}
/** Lines of text at x, from a baseline, one pitch apart; each line is one run (or w gives its width). */
function para(texts, x, base, pitch = 12, fs = 10, o = {}) {
  return texts.map((t, i) => run(t, Array.isArray(x) ? x[i] : x, base + i * pitch, fs, Object.assign({}, o, o.ws ? { w: o.ws[i] } : {})));
}
const blockTexts = (items) => B.detect(items).map((b) => b.lines.map((l) => l.text));

test('two paragraphs with a blank line between them are two blocks', () => {
  const items = para(['The first paragraph has', 'three lines of body', 'text in it.'], 50, 100)
    .concat(para(['The second one follows', 'after a gap.'], 50, 100 + 12 * 3 + 14));
  const bs = B.detect(items);
  assert.equal(bs.length, 2);
  assert.deepEqual(bs.map((b) => b.lines.length), [3, 2]);
  assert.equal(bs[0].align, 'left');
  assert.equal(Math.round(bs[0].lh), 12);
});

test('an indented first line starts a paragraph; the next indent starts the next one', () => {
  const items = para(['    Indented first line of one', 'paragraph that goes on and', 'ends here.', '    Next paragraph starts', 'here and ends.'], [70, 50, 50, 70, 50], 100);
  assert.deepEqual(blockTexts(items).map((b) => b.length), [3, 2]);
});

test('a heading in a larger or bolder font is its own block', () => {
  const items = [run('A heading', 50, 80, 16)].concat(para(['Body text under the heading', 'on two lines.'], 50, 100));
  assert.deepEqual(B.detect(items).map((b) => b.lines.length), [1, 2]);
  const bold = [run('Bold heading', 50, 88, 10, { bold: true })].concat(para(['Body text', 'more body'], 50, 100));
  assert.deepEqual(B.detect(bold).map((b) => b.lines.length), [1, 2]);
});

test('bold and italic runs inside a line stay in the block', () => {
  const items = [run('Some ', 50, 100), run('bold', 75, 100, 10, { bold: true, style: 'B' }), run(' words here.', 95, 100)]
    .concat(para(['and the next line of it', 'and the last.'], 50, 112));
  const bs = B.detect(items);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].lines[0].text, 'Some bold words here.');
  assert.deepEqual(B.runsOf(bs[0]).map((r) => r.style), ['R', 'B', 'R']);
});

test('each bullet of a list is its own block; a wrapped item keeps its hanging indent', () => {
  const items = para(['• First item that wraps', 'onto a second line', '• Second item', '- Third item', '1. Numbered one', '2) Numbered two'], [50, 60, 50, 50, 50, 50], 100);
  const bs = B.detect(items);
  assert.deepEqual(bs.map((b) => b.lines.length), [2, 1, 1, 1, 1]);
  assert.ok(bs.every((b) => b.kind === 'item'));
});

test('two columns are separate blocks, even with lines on the same baselines', () => {
  const left = para(['Left column line one', 'left column line two', 'left column end.'], 40, 100);
  const right = para(['Right column line one', 'right column line two', 'right end.'], 200, 100);
  const bs = B.detect(left.concat(right));
  assert.equal(bs.length, 2);
  assert.deepEqual(bs.map((b) => Math.round(b.x0)), [40, 200]);
  assert.ok(bs.every((b) => b.lines.length === 3));
});

test('centred lines make one centred block', () => {
  const texts = ['A centred title line', 'shorter one', 'and a longer closing line'];
  const items = texts.map((t, i) => run(t, 150 - t.length * 2.5, 100 + i * 12));
  const bs = B.detect(items);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].align, 'center');
});

test('justified lines (both edges even, the last one short) are justify', () => {
  const items = para(['Justified text fills', 'the column from edge', 'to edge, but not', 'the last.'], 50, 100, 12, 10, { ws: [150, 150, 150, 60] });
  const bs = B.detect(items);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].align, 'justify');
});

test('right-aligned lines are right', () => {
  const ws = [120, 80, 100];
  const items = ws.map((w, i) => run('right aligned', 300 - w, 100 + i * 12, 10, { w }));
  const bs = B.detect(items);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].align, 'right');
});

test('a larger gap ends a block; an even pitch keeps it', () => {
  const items = para(['one', 'two', 'three'], 50, 100).concat([run('far below', 50, 100 + 24 + 30)]);
  assert.deepEqual(B.detect(items).map((b) => b.lines.length), [3, 1]);
});

test('right-to-left lines start at the right: one block, right aligned, and a new right indent starts another', () => {
  const ws = [150, 150, 90];
  const items = ws.map((w, i) => run('مرحبا بالعالم', 300 - w, 100 + i * 12, 10, { w }));
  const bs = B.detect(items);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].rtl, true);
  assert.ok(bs[0].align === 'right' || bs[0].align === 'justify');
  const two = items.concat([run('שלום עולם', 300 - 20 - 100, 136, 10, { w: 100 }), run('שלום', 300 - 60, 148, 10, { w: 60 })]);
  assert.deepEqual(B.detect(two).map((b) => b.lines.length), [3, 2]);
  assert.equal(B.isRtl('Total מחיר מחיר'), true);
  assert.equal(B.isRtl('Total price מחיר'), false);
});

test('at finds the block under a point', () => {
  const bs = B.detect(para(['one line', 'two line'], 50, 100));
  assert.equal(B.at(bs, 55, 110), bs[0]);
  assert.equal(B.at(bs, 5, 5), null);
});
