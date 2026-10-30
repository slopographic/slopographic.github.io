// The pure side of the Slop PDF text selection bar (pdf/js/editor/sel-geom.js): per-line quads, the characters a
// selection rectangle covers, the redaction boxes for Remove, and the underline / strike lines. The quads must equal the
// text highlight's (texthl.js) for the same selection. Run with: node --test tests/node/pdf-sel-geom.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fake = { measureText: (s) => ({ width: s.length * 5 }) }; // 5 units per character: the fractions are exact
const ctx = {
  console, SP: { util: { round: (v, d) => Math.round(v * 10 ** d) / 10 ** d }, engine: {}, editor: { _: {} } },
  document: { createElement: () => ({ getContext: () => fake }) },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['editor/sel-geom.js', 'editor/texthl.js']) vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', f), 'utf8'), ctx, { filename: f });
const G = ctx.SlopPdfSel, E = ctx.SP.engine;
const plain = (v) => JSON.parse(JSON.stringify(v));

/** One line of chars: n characters of 5 units from x, the line band from y-7 to y+2 (a 10 pt font). */
function line(str, x, y) {
  return { top: y - 7, bottom: y + 2, mid: y - 2.5, chars: [...str].map((ch, k) => ({ ch, x0: x + 5 * k, x1: x + 5 * k + 5, top: y - 7, bottom: y + 2 })) };
}

test('a line quad runs top-left, top-right, bottom-right, bottom-left, rounded to 2 places', () => {
  const ln = { top: 10.123, bottom: 20.456 };
  assert.deepEqual(plain(G.lineQuad(ln, 1.005, 30)), [[1, 10.12], [30, 10.12], [30, 20.46], [1, 20.46]]);
});

test('a rectangle selects the characters whose centres lie inside it; blanks do not widen the span', () => {
  const lines = [line('ab cd', 0, 50)]; // centres at 2.5, 7.5, 12.5 (blank), 17.5, 22.5
  const spans = plain(G.selectedSpans(lines, [{ x0: 5, y0: 40, x1: 20, y1: 60 }]));
  assert.equal(spans.length, 1);
  assert.equal(spans[0].x0, 5, 'the first selected centre is 7.5, so the span starts at its left edge');
  assert.equal(spans[0].x1, 20, 'the last selected centre is 17.5, so the span ends at its right edge');
  // a rectangle over only the blank selects nothing
  assert.deepEqual(plain(G.selectedSpans(lines, [{ x0: 10, y0: 40, x1: 15, y1: 60 }])), []);
});

test('a rectangle that misses the line vertically selects nothing', () => {
  assert.deepEqual(plain(G.selectedSpans([line('abc', 0, 50)], [{ x0: 0, y0: 100, x1: 99, y1: 120 }])), []);
});

test('two selected lines give eight points in line order; partly covered lines keep only the covered characters', () => {
  const lines = [line('abcdef', 0, 50), line('ghijkl', 0, 70)];
  const quads = plain(G.selectionQuads(lines, [{ x0: 12, y0: 40, x1: 34, y1: 60 }, { x0: 0, y0: 60, x1: 9, y1: 80 }]));
  assert.equal(quads.length, 8);
  assert.deepEqual(quads[0], [10, 43], 'the first covered centre (12.5 is in 10..15) starts at x 10');
  assert.deepEqual(quads[1], [30, 43], 'the last covered centre on line one is 27.5, the right edge is 30');
  assert.deepEqual(quads[4], [0, 63], 'the second line starts at its first character');
  assert.deepEqual(quads[5], [10, 63], 'and ends at the right edge of the character centred at 7.5');
});

test('the redaction boxes for Remove are one box per selected line, padded', () => {
  const boxes = plain(G.selectionBoxes([line('abcdef', 0, 50)], [{ x0: 12, y0: 40, x1: 34, y1: 60 }], 1));
  assert.deepEqual(boxes, [{ x: 9, y: 42, w: 22, h: 11 }]);
});

test('an underline sits on the bottom edge, a strike through the middle, both about 7% of the line height', () => {
  const q = plain(G.lineQuad({ top: 40, bottom: 50 }, 10, 60));
  const u = plain(G.markLine(q, 'underline')), s = plain(G.markLine(q, 'strike'));
  assert.equal(u.x0, 10); assert.equal(u.x1, 60);
  assert.equal(u.w, 0.8, 'the width is 7% of 10 points, floored at 0.8');
  assert.equal(u.y, 49.6, 'bottom minus half the width');
  assert.equal(s.y, 45, 'the middle of the line');
});

test('the selection quads equal the text highlight quads for the same drag, on one line and across two', () => {
  const tc = {
    items: [
      { str: 'hello world', width: 55, transform: [10, 0, 0, 10, 50, 100], fontName: 'f1', hasEOL: true },
      { str: 'second line', width: 55, transform: [10, 0, 0, 10, 50, 120], fontName: 'f1', hasEOL: true },
    ],
    styles: { f1: { fontFamily: 'Helvetica' } },
  };
  const lines = E.textLinesFrom(tc, [0, 0, 612, 792]);
  assert.equal(lines.length, 2);
  // one line: a drag from x 52 to x 80 on the first line
  const ym = (lines[0].top + lines[0].bottom) / 2;
  const oneHl = plain(E.textHighlightPts(lines, [52, ym], [80, ym]));
  const oneSel = plain(G.selectionQuads(lines, [{ x0: 52, y0: lines[0].top, x1: 80, y1: lines[0].bottom }]));
  assert.deepEqual(oneSel, oneHl);
  assert.equal(oneHl.length, 4);
  // two lines: from x 52 on line one to x 80 on line two (the rectangles a browser selection gives)
  const y2 = (lines[1].top + lines[1].bottom) / 2;
  const twoHl = plain(E.textHighlightPts(lines, [52, ym], [80, y2]));
  const twoSel = plain(G.selectionQuads(lines, [
    { x0: 52, y0: lines[0].top, x1: 1e6, y1: lines[0].bottom },
    { x0: -1e6, y0: lines[1].top, x1: 80, y1: lines[1].bottom },
  ]));
  assert.deepEqual(twoSel, twoHl);
  assert.equal(twoHl.length, 8);
});
