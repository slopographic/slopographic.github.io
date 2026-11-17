// Slop Slides: the PDF writer's maths (slides/js/io/pdf-math.js) in Node: page, image and text matrices, where cropped and
// "cover" pictures land, dashes, gradient stops, the TJ plan for shaped glyphs, and runs of one font and one direction.
// Covers: slides/js/io/pdf-math.js
// Run: node --test tests/node/slides-pdf-math.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadSlides } from './slides-env.mjs';

const require = createRequire(import.meta.url);
const Bidi = require('../../shared/fonts/bidi.js');
const SS = loadSlides(['slides/js/io/pdf-math.js']);
const P = SS.pdfMath;
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

test('the page matrix turns slide points (y down) into PDF points (y up)', () => {
  const m = P.pageMatrix(540);
  assert.deepEqual(apply(m, 0, 0), [0, 540]);
  assert.deepEqual(apply(m, 960, 540), [960, 0]);
});

test('an image is placed on its box with its top row at the top', () => {
  const m = P.imageMatrix({ x: 10, y: 20, w: 100, h: 50 });
  assert.deepEqual(apply(m, 0, 1), [10, 20]);     // image space (0,1) is its top-left corner
  assert.deepEqual(apply(m, 1, 0), [110, 70]);
});

test('text space is upright and a synthetic italic leans right', () => {
  const m = P.textMatrix(5, 100, 0.2);
  assert.deepEqual(apply(m, 0, 0), [5, 100]);
  const top = apply(m, 0, 10);
  assert.ok(top[1] < 100 && top[0] > 5);
});

test('a cropped picture is drawn larger and shifted, clipped to its box; cover fills the box, centred', () => {
  const n = { x: 100, y: 50, w: 80, h: 40, crop: { l: 0.2, t: 0, r: 0.2, b: 0.5 } };
  const a = P.imagePlace(n, 1000, 1000);
  assert.deepEqual(a.clip, { x: 100, y: 50, w: 80, h: 40 });
  const want = { x: 100 - 0.2 * (80 / 0.6), y: 50, w: 80 / 0.6, h: 80 };
  for (const k of Object.keys(want)) assert.ok(Math.abs(a.img[k] - want[k]) < 1e-9, k);
  const c = P.imagePlace({ x: 0, y: 0, w: 200, h: 100, cover: true }, 100, 100);
  assert.deepEqual(c.img, { x: 0, y: -50, w: 200, h: 200 });
});

test('colours, dashes and gradient stops', () => {
  assert.deepEqual(P.rgb('#ff8000'), [1, 128 / 255, 0]);
  assert.deepEqual(P.rgb('#fff'), [1, 1, 1]);
  assert.deepEqual(P.dash('dash', 2), [8, 5]);
  assert.deepEqual(P.dash('dot', 2), [0, 4]);
  assert.deepEqual(P.dash('solid', 2), []);
  const s = P.stops([[0, '#000000'], [0.5, '#ffffff'], [1, '#ff0000']]);
  assert.equal(s.pieces.length, 2);
  assert.deepEqual(s.bounds, [0.5]);
  assert.deepEqual(s.encode, [0, 1, 0, 1]);
  assert.equal(P.stops([[0, '#123456']]).pieces.length, 1);
});

test('the TJ plan keeps the shaper\'s advances, mark offsets and rise', () => {
  // three glyphs at 1000 units per em: a kerned pair (advance 600 drawn as 550) and a mark with an offset and a rise
  const glyphs = [{ advanceWidth: 600 }, { advanceWidth: 500 }, { advanceWidth: 0 }];
  const pos = [{ xAdvance: 550, xOffset: 0, yOffset: 0 }, { xAdvance: 500, xOffset: 0, yOffset: 0 }, { xAdvance: 0, xOffset: -120, yOffset: 200 }];
  const plan = P.glyphPlan(glyphs, pos, 1000, 20);
  assert.equal(plan.width, (550 + 500) * 20 / 1000);
  assert.equal(plan.groups.length, 2);
  assert.deepEqual(plan.groups[0], { rise: 0, parts: [{ g: 0 }, 50, { g: 1 }] });
  assert.deepEqual(plan.groups[1], { rise: 4, parts: [120, { g: 2 }, -120] });
});

test('runs: each piece has one font and one direction, in visual order', () => {
  const latin = (cp) => cp < 0x250;
  const o = { face: 'inter', bidi: Bidi, has: (f, cp) => (f === 'inter' ? latin(cp) : f === 'noto-hebrew' ? (cp >= 0x590 && cp <= 0x5ff) || cp === 32 : f === 'noto-sc' ? cp >= 0x4e00 : false),
    packOf: (cp) => (cp >= 0x590 && cp <= 0x5ff ? 'noto-hebrew' : cp >= 0x4e00 ? 'noto-sc' : null) };
  assert.deepEqual(P.runs('Hi שלום עולם!', o).map((r) => [r.text, r.font, r.rtl]),
    [['Hi ', 'inter', false], ['עולם', 'noto-hebrew', true], [' ', 'inter', true], ['שלום', 'noto-hebrew', true], ['!', 'inter', false]]);
  assert.deepEqual(P.runs('你好 ok', o).map((r) => [r.text, r.font]), [['你好', 'noto-sc'], [' ok', 'inter']]);
  assert.deepEqual(P.runs('', o), []);
  assert.equal(P.joiner(0x200d), true);
});
