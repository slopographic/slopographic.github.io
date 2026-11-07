// Slop Docs: the pure parts of the page features. Headers and footers as text with page fields (model/hf.js), their Word
// parts (io/docx-hf.js), right-to-left and mixed lines (layout/bidi.js, with shared/fonts/bidi.js), and drawing order
// (layout/runs.js). The browser tests (tests/docs/pdf.test.html, tests/docs/hf.test.html) run the same code on real pages.
// Covers: docs/js/model/hf.js, docs/js/io/docx-hf.js, docs/js/layout/bidi.js, docs/js/layout/runs.js, docs/js/fonts/registry.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../../shared/fonts/scripts.js');
require('../../shared/fonts/bidi.js'); // sets globalThis.SlopBidi, which layout/bidi.js reads
require('../../shared/fonts/pdf-runs.js'); // sets globalThis.SlopPdfRuns, which layout/runs.js reads
const { hfText, hfBlocks, applyHF, hasHF } = await import('../../docs/js/model/hf.js');
const { newDoc, OBJ } = await import('../../docs/js/model/doc.js');
const { hfParts } = await import('../../docs/js/io/docx-hf.js');
const { bidiLine, paraRtl, hasRtl } = await import('../../docs/js/layout/bidi.js');
const { visualChars, fragRuns } = await import('../../docs/js/layout/runs.js');
const { fontRuns, textWidth } = await import('../../docs/js/fonts/registry.js');

test('header and footer text: fields become field runs, lines become paragraphs, and back', () => {
  const blocks = hfBlocks('Page {page} of {pages}', { align: 'center' });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].props.align, 'center');
  assert.deepEqual(blocks[0].runs.map((r) => (r.obj ? `[${r.f}]` : r.text)), ['Page ', '[page]', ' of ', '[pages]']);
  assert.equal(blocks[0].runs[1].text, OBJ);
  assert.deepEqual(hfText(blocks), { text: 'Page {page} of {pages}', align: 'center' });
  const two = hfBlocks('Acme Ltd\nConfidential', { align: 'right' });
  assert.equal(two.length, 2);
  assert.deepEqual(hfText(two), { text: 'Acme Ltd\nConfidential', align: 'right' });
  assert.deepEqual(hfBlocks('   '), []);
  assert.deepEqual(hfText([]), { text: '', align: 'center' });
});

test('applyHF sets each area, the first page and the distances, and keeps formatting it did not change', () => {
  let d = newDoc();
  assert.equal(hasHF(d), false);
  d = applyHF(d, { header: { text: 'Report', align: 'left' }, footer: { text: '{page}', align: 'center' }, differentFirst: true, headerFirst: { text: 'Cover', align: 'center' }, headerGap: 30, footerGap: 24 });
  assert.equal(hasHF(d), true);
  assert.deepEqual([hfText(d.header.default).text, hfText(d.footer.default).text, hfText(d.header.first).text, hfText(d.footer.first).text], ['Report', '{page}', 'Cover', '']);
  assert.deepEqual([d.section.differentFirst, d.section.margin.header, d.section.margin.footer], [true, 30, 24]);
  // a bold header whose text is not edited keeps its runs; an edited one keeps the first run's marks
  d.header.default[0].runs[0].b = true;
  const kept = applyHF(d, { header: { text: 'Report', align: 'left' } });
  assert.equal(kept.header.default, d.header.default);
  const edited = applyHF(d, { header: { text: 'Report 2', align: 'left' } });
  assert.equal(edited.header.default[0].runs[0].b, true);
  assert.equal(applyHF(d, { differentFirst: false }).section.differentFirst, false);
});

test('Word parts: one part per area, header references before footer references, titlePg for a different first page', () => {
  let d = applyHF(newDoc(), { header: { text: 'Head' }, footer: { text: 'Page {page}' }, differentFirst: true, headerFirst: { text: 'First' } });
  const p = hfParts(d, (b) => `<w:p>${b.runs.map((r) => r.text).join('')}</w:p>`);
  assert.deepEqual(p.files.map((f) => f.path), ['word/header1.xml', 'word/footer1.xml', 'word/header2.xml', 'word/footer2.xml']);
  assert.ok(p.files[0].data.includes('<w:hdr') && p.files[1].data.includes('<w:ftr'));
  assert.ok(p.files[3].data.includes('<w:p/>'), 'an empty first-page footer is written, so Word does not repeat the default one');
  assert.ok(p.refs[0].includes('headerReference') && p.refs[1].includes('headerReference') && p.refs[2].includes('footerReference'));
  assert.ok(p.refs.some((r) => r.includes('w:type="first"')));
  assert.equal(p.titlePg, '<w:titlePg/>');
  assert.equal(p.types.length, 4);
  d = applyHF(newDoc(), { footer: { text: 'x' } });
  const q = hfParts(d, () => '<w:p/>');
  assert.deepEqual([q.files.map((f) => f.path), q.titlePg], [['word/footer1.xml'], '']);
});

/** A frag as lines.js makes it; with no face loaded every character is 5 pt wide at 10 pt. */
const frag = (text, start, x, kind = 'text') => ({ kind, text, start, end: start + text.length, x, w: text.length * 5, st: { face: null, size: 10, m: {} } });
const line = (frags, extra = {}) => ({ frags, left: 0, shift: 0, ...extra });
const view = (ln) => ln.frags.map((f) => [f.text, f.x, !!f.rtl]);

test('paragraph direction', () => {
  assert.equal(paraRtl('שלום world'), true);
  assert.equal(paraRtl('Hello שלום'), false);
  assert.equal(paraRtl('123 مرحبا'), true);
  assert.equal(hasRtl('abc'), false);
});

test('a right-to-left paragraph is laid out from the right, its numbers left to right', () => {
  const ln = bidiLine(line([frag('אב 12 גד', 0, 0)]), true, 100);
  assert.equal(ln.rtl, true);
  // logical: [אב ] [12] [ גד]  →  visual: [ גד] [12] [אב ], ending at the right edge
  assert.deepEqual(view(ln), [[' גד', 60, true], ['12', 75, false], ['אב ', 85, true]]);
  assert.deepEqual(ln.frags.map((f) => [f.start, f.end]), [[5, 8], [3, 5], [0, 3]]);
  const empty = bidiLine(line([], { left: 10 }), true, 100);
  assert.equal(empty.startX, 90);
});

test('Hebrew inside an English line keeps its place and reads right to left; tabs and labels split segments', () => {
  const ln = bidiLine(line([frag('abc אבג def', 0, 0)]), false, 200);
  assert.deepEqual(view(ln), [['abc ', 0, false], ['אבג', 20, true], [' def', 35, false]]);
  const plain = line([frag('just English', 0, 0)]);
  assert.equal(bidiLine(plain, false, 200).frags, plain.frags, 'a line with no right-to-left text is left as it is');
  const lab = bidiLine(line([{ ...frag('1.', 0, 0, 'label'), start: 0, end: 0 }, frag('שלום', 0, 18)]), true, 100);
  assert.deepEqual(view(lab), [['1.', 90, false], ['שלום', 62, true]]);
});

test('a bracket pair around right-to-left words stays with them (N0, from SlopBidi)', () => {
  const ln = bidiLine(line([frag('ab עב (גד) cd', 0, 0)]), false, 200);
  // the right-to-left piece holds both brackets: "עב (גד)" drawn right to left
  assert.deepEqual(ln.frags.map((f) => [f.text, !!f.rtl]), [['ab ', false], ['עב (גד)', true], [' cd', false]]);
});

test('drawing order: right-to-left characters reversed with brackets mirrored; font runs and widths', () => {
  assert.deepEqual(visualChars('(ab)', true), ['(', 'b', 'a', ')']);
  assert.deepEqual(visualChars('ab', false), ['a', 'b']);
  assert.deepEqual(fontRuns(null, 'abc'), [{ f: null, text: 'abc' }]);
  assert.equal(textWidth(null, 'abcd', 10), 20);
  const f = { kind: 'text', text: 'hi', w: 30, st: { face: null, size: 10 }, rtl: false };
  const runs = fragRuns(f);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].w, 30, 'a justified frag gives its extra width to its last run');
  assert.deepEqual(fragRuns({ kind: 'tab', text: '', st: {} }), []);
});
