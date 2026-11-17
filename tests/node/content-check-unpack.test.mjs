// Covers: tools/content-check/spelled.mjs, tools/content-check/unpack.mjs, tools/content-check/pdf.mjs, tools/content-check/pdf-worker.mjs
// What the content checks read besides a file's plain text and bytes, on made-up inputs and a made-up word: words spelled
// so a plain search misses them (joined pieces, escapes, entities, character codes) and the ordinary text that must not
// read as one; a PDF's text, information and metadata (made here with the vendored pdf-lib, so the word is not in its
// bytes); a PDF that cannot be read; a PNG's compressed text chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spelledMatches, spellings, unescapeJs } from '../../tools/content-check/spelled.mjs';
import { unpack, views, readings, isPdf, pngTexts } from '../../tools/content-check/unpack.mjs';
import { findWords } from '../../tools/content-check/words.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const find = (s) => findWords(s, ['acme'], ['acmeology']);
const spelled = (s) => spelledMatches(s, find).map((m) => m.word);

test('spelled words: joined pieces, escapes, entities and character codes', () => {
  assert.deepEqual(spelled("const w = ['a', 'c', 'm', 'e'].join('');"), ['acme']);
  assert.deepEqual(spelled('const w = ["ac", "me"];'), ['acme'], 'pieces of one or two characters');
  assert.deepEqual(spelled("const w = ['the', 'ac', 'me', 'end'];"), ['acme'], 'a stretch of short pieces in a longer list');
  assert.deepEqual(spelled("const w = ['tac', 'meal'].join('');"), ['tacmeal'], 'any pieces when the list is joined');
  assert.deepEqual(spelled("const w = 'made by ac' +\n  'me';"), ['acme']);
  assert.deepEqual(spelled('const a = "\\x61cme", b = \'\\u0041cme\', c = `\\u{61}cme`;'), ['acme', 'Acme', 'acme']);
  assert.deepEqual(spelled('var \\u0061cme = 1;'), ['acme'], 'an escape in a name');
  assert.deepEqual(spelled('.logo::after { content: "\\61 cme"; }'), ['acme']);
  assert.deepEqual(spelled('<p>Made by &#65;cme and &#x61;&#x63;me</p>'), ['Acme', 'acme']);
  assert.deepEqual(spelled('String.fromCharCode(97, 99, 109, 101)'), ['acme']);
  assert.deepEqual(spelled('const k = [0x61, 0x63, 0x6d, 0x65].map((c) => String.fromCharCode(c));'), ['acme']);
  assert.equal(unescapeJs('\\x61\\u0063\\u{6d}e\\n\\\'q'), "acme\n'q");
  assert.deepEqual(spelled("'menu.x': 'A&CME', 'menu.y': 'A&amp;CMEIFY',"), ['ACME', 'ACMEIFY'], 'a menu-key mark inside the word');
  assert.deepEqual(spelled('<p><b>A</b>CME and a\u00adc\u200bme</p>'), ['ACME', 'acme'], 'a tag, a soft hyphen, an invisible character');
  assert.ok(spellings("x = ['a', 'b']").every((v) => typeof v.index === 'number' && v.end > v.index));
});

test('ordinary text is not read as a spelling', () => {
  assert.deepEqual(spelled("const cities = ['Tac', 'meal', 'Paris'];"), [], 'a list of words is not joined');
  assert.deepEqual(spelled('<b>ac</b> <i>me</i> R&D'), [], 'a space between the pieces keeps them apart');
  assert.deepEqual(spelled("log('made by acme' + suffix); x = 'acme' + 'x';"), [], 'a word the text shows plainly is found plainly');
  assert.deepEqual(spelled("const w = 'acme' + 'ology';"), [], 'a keep word stays allowed');
  assert.deepEqual(spelled('const r = "emca"; // emca'), [], 'no reversed text');
  assert.deepEqual(spelled('YWNtZQ== is base64'), [], 'no base64');
  assert.deepEqual(spelled('const t = [97, 99, 109, 1000];'), [], 'codes outside printable ASCII are numbers');
  assert.deepEqual(spelled('/\\d+\\bacme\\b/.test(s); a = "\\0"'), [], 'escapes that spell nothing new');
});

/** A two-page PDF made with the vendored pdf-lib (in its own realm, as a page loads it): a title and a line per page. */
function makePdf(title, lines) {
  const ctx = { console, title, lines };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'vendor/pdf-lib/pdf-lib.min.js'), 'utf8'), ctx);
  return vm.runInContext(`(async function () {
    var L = PDFLib, doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica);
    doc.setTitle(title);
    lines.forEach(function (line) { doc.addPage([300, 200]).drawText(line, { x: 20, y: 150, size: 12, font: font }); });
    return doc.save();
  })()`, ctx);
}

test('a PDF: the text of its pages, its information and metadata, though the bytes do not show them', async () => {
  const bytes = Buffer.from(await makePdf('Report by Acme', ['The first page', 'Made by ACME, in a stream']));
  for (const s of views(bytes)) assert.doesNotMatch(s, /acme/i, 'the word is not in the bytes');
  assert.ok(isPdf('', bytes) && isPdf('a.PDF', Buffer.from('x')));
  const parts = unpack('report.pdf', bytes), labels = parts.map((p) => p.label);
  assert.deepEqual(labels.filter((l) => /page/.test(l)), ['PDF page 1', 'PDF page 2']);
  assert.ok(labels.includes('PDF info'));
  const words = parts.flatMap((p) => readings(p).flatMap((s) => find(s).map((m) => `${p.label}: ${m.word}`)));
  assert.ok(words.includes('PDF info: Acme') && words.includes('PDF page 2: ACME'), words.join('; '));
  assert.ok(!words.some((w) => w.startsWith('PDF page 1')));
  // the same file without a name (a blob no path reaches): told by its header
  assert.ok(unpack('', bytes).some((p) => p.label === 'PDF page 2'));
});

test('a PDF that cannot be read is unreadable, never empty', () => {
  for (const [file, buf] of [['broken.pdf', Buffer.from('%PDF-1.7\nnot really a PDF\n%%EOF\n')], ['locked.pdf', readFileSync(path.join(ROOT, 'tests/pdf-crypto/fixtures/qpdf-aes256.pdf'))]]) {
    const parts = unpack(file, buf);
    assert.equal(parts.length, 1, file);
    assert.match(parts[0].unreadable, /^unreadable PDF: /, file);
    assert.deepEqual(readings(parts[0]), []);
  }
  assert.match(unpack('locked.pdf', readFileSync(path.join(ROOT, 'tests/pdf-crypto/fixtures/qpdf-aes256.pdf')))[0].unreadable, /password/);
  // an owner password only: it opens
  assert.ok(unpack('open.pdf', readFileSync(path.join(ROOT, 'tests/pdf-crypto/fixtures/qpdf-rc4-40.pdf'))).some((p) => /page 1/.test(p.label)));
});

/** A PNG chunk (the reader does not check the CRC). */
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); };

test('a PNG: its compressed text chunks, inflated', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)),
    chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(Buffer.from('made by Acme'))])),
    chunk('iTXt', Buffer.concat([Buffer.from('Author\0\x01\0en\0Author\0'), deflateSync(Buffer.from('Acme Ltd'))])),
    chunk('iTXt', Buffer.from('Plain\0\0\0\0\0visible text')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  for (const s of views(png)) assert.doesNotMatch(s, /acme/i);
  const parts = unpack('logo.png', png);
  assert.deepEqual(parts.map((p) => p.label), ['PNG zTXt', 'PNG iTXt']);
  assert.deepEqual(parts.flatMap((p) => readings(p).flatMap((s) => find(s).map((m) => m.word))), ['Acme', 'Acme']);
  assert.deepEqual(pngTexts(png.subarray(0, 8)), []);
});
