// Slop PDF extract assets, as data (pdf/js/io/assets-model.js): how each image is saved or skipped, PNG predictors,
// pixels from samples, the dialog's list rows, font extensions, and the zip order (images first).
// Run with: node --test tests/node/pdf-assets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'pdf', 'js', 'io', 'assets-model.js'), 'utf8'), ctx, { filename: 'assets-model.js' });
const M = ctx.SlopPdfAssets;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('a DCTDecode image is kept as JPEG (its bytes are written as they are)', () => {
  assert.deepEqual(plain(M.imageKind({ filters: ['DCTDecode'], bpc: 8, colorSpace: 'DeviceRGB', comps: 3 })), { kind: 'jpeg', ext: 'jpg' });
});

test('8-bit Flate gray and RGB images are decoded to PNG', () => {
  assert.deepEqual(plain(M.imageKind({ filters: ['FlateDecode'], bpc: 8, colorSpace: 'DeviceRGB', comps: 3 })), { kind: 'raw', ext: 'png', comps: 3 });
  assert.deepEqual(plain(M.imageKind({ filters: ['FlateDecode'], bpc: 8, colorSpace: 'ICCBased', comps: 1 })), { kind: 'raw', ext: 'png', comps: 1 });
  assert.deepEqual(plain(M.imageKind({ filters: [], bpc: 8, colorSpace: 'DeviceGray', comps: 1 })), { kind: 'raw', ext: 'png', comps: 1 });
});

test('palette images in RGB are decoded, the rest is skipped with a reason', () => {
  assert.equal(M.imageKind({ filters: ['FlateDecode'], bpc: 8, colorSpace: 'Indexed', base: 'DeviceRGB' }).kind, 'raw');
  const jpx = M.imageKind({ filters: ['JPXDecode'], bpc: 8, colorSpace: 'DeviceRGB', comps: 3 });
  assert.equal(jpx.kind, 'skip');
  assert.match(jpx.reason, /JPEG 2000/);
  const cmyk = M.imageKind({ filters: ['FlateDecode'], bpc: 8, colorSpace: 'DeviceCMYK', comps: 4 });
  assert.equal(cmyk.kind, 'skip');
  assert.match(cmyk.reason, /DeviceCMYK/);
  assert.match(M.imageKind({ filters: ['FlateDecode'], bpc: 1, colorSpace: 'DeviceGray', comps: 1 }).reason, /1-bit/);
  assert.match(M.imageKind({ filters: ['CCITTFaxDecode'], bpc: 1, colorSpace: 'DeviceGray', comps: 1 }).reason, /CCITT/);
  assert.match(M.imageKind({ imageMask: true, filters: ['FlateDecode'], bpc: 1 }).reason, /Stencil/);
  assert.match(M.imageKind({ filters: ['DCTDecode', 'FlateDecode'], bpc: 8, colorSpace: 'DeviceRGB', comps: 3 }).reason, /Filter/);
});

test('the PNG predictors (Up, Sub, Average, Paeth) are reversed', () => {
  // 3 rows of 3 bytes, one colour, 8 bits: filter type byte then the filtered bytes
  const rows = [[10, 20, 30], [11, 22, 33], [9, 18, 40]];
  // encode with the Up filter (type 2), then decode
  const up = [];
  let prev = [0, 0, 0];
  for (const r of rows) { up.push(2, ...r.map((v, i) => (v - prev[i]) & 255)); prev = r; }
  const decoded = Array.from(M.unpredict(Uint8Array.from(up), { Predictor: 15, Colors: 1, BitsPerComponent: 8, Columns: 3 }));
  assert.deepEqual(decoded, rows.flat());
  // Sub filter (type 1) with 3 bytes per pixel
  const sub = [1, 10, 20, 30, 5, 5, 5, 5, 5, 5];
  const d2 = Array.from(M.unpredict(Uint8Array.from(sub), { Predictor: 11, Colors: 3, BitsPerComponent: 8, Columns: 1 }));
  assert.deepEqual(d2, [10, 20, 30, 15, 25, 35]);
  // no predictor: the bytes are unchanged
  assert.deepEqual(Array.from(M.unpredict(Uint8Array.from([1, 2, 3]), {})), [1, 2, 3]);
});

test('pixels come from gray, RGB and palette samples', () => {
  assert.deepEqual(Array.from(M.toRGBA(Uint8Array.from([7, 200]), 2, 1, 1)), [7, 7, 7, 255, 200, 200, 200, 255]);
  assert.deepEqual(Array.from(M.toRGBA(Uint8Array.from([1, 2, 3, 4, 5, 6]), 2, 1, 3)), [1, 2, 3, 255, 4, 5, 6, 255]);
  const palette = Uint8Array.from([255, 0, 0, 0, 0, 255]);
  assert.deepEqual(Array.from(M.toRGBA(Uint8Array.from([1, 0]), 2, 1, 1, palette)), [0, 0, 255, 255, 255, 0, 0, 255]);
});

test('the list rows show size, colour space and page; skipped and not embedded items cannot be selected', () => {
  const images = [
    { id: 'img1', name: 'Im1', page: 1, pageText: 'page 1', width: 640, height: 480, colorSpace: 'DeviceRGB', bpc: 8, filterText: 'DCTDecode', size: 84 * 1024, kind: 'jpeg', ext: 'jpg' },
    { id: 'img2', name: 'Im2', page: 3, pageText: 'pages 2, 3', width: 100, height: 100, colorSpace: 'DeviceCMYK', bpc: 8, filterText: 'FlateDecode', size: 900, kind: 'skip', reason: 'Colour space DeviceCMYK is not decoded', mask: true }
  ];
  const fonts = [
    { id: 'font1', name: 'ABCDEF+Helvetica', type: 'Type 1', embedded: true, size: 2048, subset: true },
    { id: 'font2', name: 'Arial', type: 'not embedded', embedded: false, size: 0, subset: false }
  ];
  const rows = M.rows(images, fonts);
  assert.equal(rows.counts.images, 2);
  assert.equal(rows.counts.fonts, 2);
  assert.equal(rows.counts.selectable, 2);
  assert.deepEqual(rows.images[0].checked, true);
  assert.deepEqual(rows.images[1].disabled, true);
  assert.match(rows.images[1].reason, /CMYK/);
  assert.ok(rows.images[0].meta.includes('640×480'));
  assert.ok(rows.images[0].meta.includes('DeviceRGB'));
  assert.ok(rows.images[0].meta.includes('84 KB'));
  assert.ok(rows.images[0].meta.includes('page 1'));
  assert.ok(rows.images[1].meta.includes('mask not included'));
  assert.ok(rows.fonts[0].meta.some((m) => /subset/.test(m)));
  assert.equal(rows.fonts[1].disabled, true);
  assert.match(rows.fonts[1].reason, /Not embedded/);
});

test('font files get the extension of their kind; Type 1 keeps .pfb for binary segments', () => {
  assert.equal(M.fontKind({ key: 'FontFile2', firstByte: 0 }).ext, 'ttf');
  assert.equal(M.fontKind({ key: 'FontFile', firstByte: 0x80 }).ext, 'pfb');
  assert.equal(M.fontKind({ key: 'FontFile', firstByte: 0x25 }).ext, 'pfa');
  assert.equal(M.fontKind({ key: 'FontFile3', subtype: 'OpenType', firstByte: 0 }).ext, 'otf');
  assert.equal(M.fontKind({ key: 'FontFile3', subtype: 'Type1C', firstByte: 1 }).ext, 'cff');
  assert.equal(M.fontKind({ key: null }).ext, null);
  assert.equal(M.subsetOf('ABCDEF+Helvetica'), true);
  assert.equal(M.subsetOf('Helvetica'), false);
});

test('the zip plan puts images first, so a JPEG or PNG is the first entry', () => {
  const plan = M.planEntries([
    { group: 'font', path: 'fonts/Arial.ttf', data: 1 },
    { group: 'image', path: 'images/p1-Im1.jpg', data: 2 },
    { group: 'image', path: 'images/p2-Im2.png', data: 3 }
  ]);
  assert.deepEqual(plan.map((e) => e.path), ['images/p1-Im1.jpg', 'images/p2-Im2.png', 'fonts/Arial.ttf']);
});

test('names are unique and safe; sizes read well', () => {
  assert.deepEqual(M.uniquify(['p1-Im1.jpg', 'p1-Im1.jpg', 'p1-Im1.jpg']), ['p1-Im1.jpg', 'p1-Im1-2.jpg', 'p1-Im1-3.jpg']);
  assert.equal(M.safePart('My image (2)/x', 'image'), 'My_image_2_x');
  assert.equal(M.safePart('', 'image'), 'image');
  assert.equal(M.sizeText(512), '512 B');
  assert.equal(M.sizeText(84 * 1024), '84 KB');
  assert.equal(M.sizeText(3.2 * 1024 * 1024), '3.2 MB');
});

test('embedded files are rows with their type, size, where they are attached and the e-invoice mark', () => {
  const rows = plain(M.attachmentRows([
    { id: 'att1', name: 'factur-x.xml', mime: 'text/xml', size: 2048, from: 'document', einvoice: true, rel: 'Alternative', bytes: [1] },
    { id: 'att2', name: 'notes.txt', mime: 'text/plain', size: 10, from: 'annotation', page: 2, bytes: null, reason: 'not decoded' }]));
  assert.equal(rows[0].checked, true);
  assert.ok(rows[0].meta.includes('e-invoice (ZUGFeRD / Factur-X)'));
  assert.ok(rows[0].meta.includes('2 KB'));
  assert.equal(rows[1].disabled, true);
  assert.ok(rows[1].meta.includes('attached on page 2'));
});

test('a page\'s text: lines, a paragraph break at a big gap, and a Markdown version with a heading', () => {
  const it = (str, y, eol = true) => ({ str, hasEOL: eol, transform: [12, 0, 0, 12, 72, y] });
  const t = M.pageText([it('First line', 700), it('second line', 686), it('After a gap', 600), it('*star*', 586)], 3);
  assert.equal(t.txt, 'First line\nsecond line\n\nAfter a gap\n*star*\n');
  assert.equal(t.md, '## Page 3\n\nFirst line second line\n\nAfter a gap \\*star\\*\n');
});

test('zip order: images, attachments, fonts, text, pages', () => {
  const out = M.planEntries([{ group: 'page' }, { group: 'text' }, { group: 'font' }, { group: 'attachment' }, { group: 'image' }]);
  assert.deepEqual(out.map((e) => e.group), ['image', 'attachment', 'font', 'text', 'page']);
});
