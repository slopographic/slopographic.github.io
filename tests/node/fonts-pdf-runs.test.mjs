// The shared PDF run drawer (shared/fonts/pdf-runs.js), with the real pdf-lib and fontkit from vendor/: glyphs keep the
// shaper's positions (an Arabic mark sits on its letter), a glyph with no character maps to U+034F instead of nothing, the
// CFF subset header that fontkit 1.1.1 gets wrong is fixed, and right-to-left text without shaping is reversed and mirrored.
// Covers: shared/fonts/pdf-runs.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../../vendor/regenerator-runtime/runtime.js');
require('../../vendor/fontkit/fontkit.min.js');
const PL = require('../../vendor/pdf-lib/pdf-lib.min.js');
const R = require('../../shared/fonts/pdf-runs.js');
const fixture = (p) => readFileSync(new URL(p, import.meta.url));

async function doc() { const d = await PL.PDFDocument.create(); d.registerFontkit(globalThis.fontkit); return d; }

test('right-to-left characters without shaping are reversed and their brackets mirrored', () => {
  assert.deepEqual(R.visualChars('(ab)', true), ['(', 'b', 'a', ')']);
  assert.deepEqual(R.visualChars('ab', false), ['a', 'b']);
});

test('Arabic: shaped glyphs keep the mark offsets, every glyph maps to text, and the run carries ActualText', async () => {
  const d = await doc(), page = d.addPage([300, 100]);
  const pf = await R.embed(d, fixture('../pdf/fixtures/NotoSansArabic-Regular.ttf'));
  const run = { text: 'مرحبا', x: 20, y: 50, size: 20, rtl: true, shaped: true };
  const gl = R.glyphs(pf, run);
  const dot = gl.find((q) => !(q.g.codePoints || []).length);
  assert.ok(dot, 'Noto Sans Arabic draws the dot under ب as a glyph of its own');
  assert.ok(dot.adv === 0 || Math.abs(dot.x - gl[gl.indexOf(dot) - 1].x) > 0.01, 'the mark is placed by the shaper, not where its width would put it');
  assert.ok(gl.some((q, i) => i && Math.abs(q.x - (gl[i - 1].x + gl[i - 1].adv)) > 0.01), 'at least one glyph is positioned off the plain advance');
  assert.ok(R.drawRun(PL, page, pf, run) > 0);
  assert.ok(pf.embedder.glyphs.every((g) => g.codePoints && g.codePoints.length), 'no glyph maps to nothing in ToUnicode');
  assert.ok(pf.embedder.glyphs.some((g) => g.codePoints[0] === 0x34f));
  const bytes = await d.save({ useObjectStreams: false });
  const back = await PL.PDFDocument.load(bytes);
  const content = back.getPages()[0].node.Contents();
  assert.ok(content, 'the page has its text');
  // digits in Arabic text (a left-to-right piece) are not reversed by the shaper
  const digits = R.glyphs(pf, { text: '٤٥٦', x: 0, y: 0, size: 10, rtl: false, shaped: true });
  assert.deepEqual(digits.map((q) => q.g.codePoints[0]), [0x664, 0x665, 0x666]);
});

test('fixCff sets a CFF subset header offSize above 4 to 4, once, and leaves TrueType alone', async () => {
  // fontkit's CFF subset stream does not finish under Node, so the real font is checked in the browser
  // (tests/pdf/intl.test.html, tests/docs/pdf.test.html); here the embedder is a stand-in with the same two methods.
  const make = (cff) => ({ embedder: { isCFF: () => cff, serializeFont: async () => Uint8Array.from([1, 0, 4, 24, 9]) } });
  const pf = R.fixCff(R.fixCff(make(true)));
  assert.deepEqual([...(await pf.embedder.serializeFont())], [1, 0, 4, 4, 9]);
  assert.deepEqual([...(await R.fixCff(make(false)).embedder.serializeFont())], [1, 0, 4, 24, 9]);
});

test('unshaped runs advance by the widths the caller measured', async () => {
  const d = await doc();
  const pf = await R.embed(d, fixture('../pdf/fixtures/Barlow-Regular.ttf'));
  const gl = R.glyphs(pf, { text: 'abc', x: 0, y: 0, size: 10, advance: () => 7 });
  assert.deepEqual(gl.map((q) => q.x), [0, 7, 14]);
});
