// The invisible text of a searchable PDF (shared/ocr/text-layer.js), shared by Slop OCR and Slop Scan: each line sits on
// its box, mapped from the picture's pixels to the page's points with an offset (Slop Scan's margins), sized to fit the
// box, invisible; characters the font cannot draw are left out. Run: node --test tests/node/ocr-text-layer.test.mjs
// Covers: shared/ocr/text-layer.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawTextLayer, drawable } from '../../shared/ocr/text-layer.js';

/** A stand-in for pdf-lib's Helvetica: half an em per character, and no characters beyond Latin-1. */
const font = { widthOfTextAtSize(t, size) { if ([...t].some((c) => c.codePointAt(0) > 255)) throw new Error('cannot encode'); return t.length * 0.5 * size; } };
const page = () => { const calls = []; return { calls, drawText: (text, o) => calls.push({ text, ...o }) }; };

test('a line on its box: 72 dpi pixels are points, the top of the page at the top of the picture', () => {
  const p = page();
  const n = drawTextLayer(p, font, [{ text: 'Hello world', box: { x: 10, y: 20, w: 200, h: 20 } }], { k: 1, x: 0, top: 800 });
  assert.equal(n, 1);
  const c = p.calls[0];
  assert.equal(c.text, 'Hello world');
  assert.equal(c.opacity, 0);
  assert.equal(c.x, 10);
  assert.equal(c.y, 800 - (20 + 16));
  assert.equal(c.size, Math.min(20 * 0.85, 200 / (11 * 0.5)));
});
test('a scan placed inside margins: the offset and the scale carry the boxes onto the page', () => {
  const p = page();
  drawTextLayer(p, font, [{ text: 'Total 12.50', box: { x: 100, y: 50, w: 400, h: 40 } }], { k: 0.25, x: 34, top: 700 });
  assert.equal(p.calls[0].x, 34 + 25);
  assert.equal(p.calls[0].y, 700 - (50 + 32) * 0.25);
});
test('characters the font cannot draw are left out; empty lines, no box and tiny boxes are skipped', () => {
  const p = page();
  const n = drawTextLayer(p, font, [
    { text: 'Smörgås 東京', box: { x: 0, y: 0, w: 300, h: 30 } },
    { text: '東京', box: { x: 0, y: 40, w: 100, h: 30 } },
    { text: 'no box' },
    { text: 'tiny', box: { x: 0, y: 0, w: 0.5, h: 0.4 } },
  ], { k: 1, top: 500 });
  assert.equal(n, 1);
  assert.equal(p.calls[0].text, 'Smörgås');
  const ok = drawable(font);
  assert.equal(ok('å'), true);
  assert.equal(ok('東'), false);
});
