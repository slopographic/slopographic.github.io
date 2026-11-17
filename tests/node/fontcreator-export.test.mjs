// Slop Font's files: a project exported as TTF, OTF, WOFF and WOFF2 (fontcreator/js/core/build.js, ttf.js, sfnt.js and
// vendor/woff2) and read back with the same library (opentype.js) and with the app's own importer (core/import.js): the
// glyph count, metrics, names, kerning and outlines come back equal. An OFL font is opened, subset and written again.
// The handwriting sheet's layout, corner squares and homography (core/sheet.js).
// Covers: fontcreator/js/core/build.js, fontcreator/js/core/ttf.js, fontcreator/js/core/sfnt.js, fontcreator/js/core/import.js
// Covers: fontcreator/js/core/sheet.js, fontcreator/js/core/model.js, fontcreator/js/core/paths.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { M, P, S, B, I, SH, CS, parse, font, deflate, inflate } from './fontcreator-env.mjs';

const require = createRequire(import.meta.url);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);
const box = (b) => [b.x1, b.y1, b.x2, b.y2].map(Math.round);

function sample() {
  const p = M.create({ info: { family: 'Round Trip Sans', style: 'Bold', designer: 'Ada Glyph', version: '2.500', license: 'SIL Open Font License 1.1', weight: 700 },
    metrics: { ascender: 760, descender: -240, capHeight: 680, xHeight: 470, lineGap: 90 } });
  const add = (ch, contours, advance) => { const g = M.ensure(p, ch.codePointAt(0)); g.contours = contours; g.advance = advance; return g; };
  add('A', P.fromSvg('M0 0 L250 680 L350 680 L600 0 L500 0 L300 560 L100 0 Z'), 600);
  add('V', P.fromSvg('M0 680 L250 0 L350 0 L600 680 L500 680 L300 120 L100 680 Z'), 600);
  add('O', [...P.ellipse(330, 340, 280, 350), ...P.ellipse(330, 340, 170, 240)], 660);
  add('å', [...P.ellipse(280, 230, 220, 240), ...P.ellipse(280, 230, 110, 140), ...P.ellipse(280, 600, 70, 70), ...P.ellipse(280, 600, 35, 35)], 560);
  M.ensure(p, 0x2e);   // an empty glyph (a full stop not drawn yet)
  M.setKern(p, 'A', 'V', -80); M.setKern(p, 'V', 'A', -70); M.setKern(p, 'O', 'A', -15);
  return M.clean(p);
}

test('TTF and OTF read back with opentype.js: glyphs, metrics, names, kerning, outlines', () => {
  const p = sample();
  for (const [kind, bytes] of [['ttf', B.ttf(p)], ['otf', B.otf(p)]]) {
    assert.equal(S.sniff(bytes), kind);
    const f = parse(bytes);
    assert.equal(f.outlinesFormat, kind === 'ttf' ? 'truetype' : 'cff');
    assert.equal(f.numGlyphs, p.glyphs.length, kind + ' glyph count');
    assert.equal(f.unitsPerEm, 1000);
    assert.equal(f.ascender, 760); assert.equal(f.descender, -240);
    assert.equal(f.tables.os2.sCapHeight, 680); assert.equal(f.tables.os2.sxHeight, 470); assert.equal(f.tables.os2.usWeightClass, 700);
    assert.equal(f.tables.hhea.lineGap, 90);
    assert.equal(f.getEnglishName('fontFamily'), 'Round Trip Sans'); assert.equal(f.getEnglishName('fontSubfamily'), 'Bold');
    assert.equal(f.getEnglishName('designer'), 'Ada Glyph'); assert.equal(f.getEnglishName('license'), 'SIL Open Font License 1.1');
    assert.equal(f.getEnglishName('version'), 'Version 2.500');
    const A = f.charToGlyph('A'), V = f.charToGlyph('V'), O = f.charToGlyph('O');
    assert.equal(f.getKerningValue(A, V), -80, kind + ' kerning AV'); assert.equal(f.getKerningValue(V, A), -70); assert.equal(f.getKerningValue(O, A), -15);
    assert.equal(A.advanceWidth, 600); assert.equal(f.charToGlyph('å').advanceWidth, 560); assert.equal(f.charToGlyph('.').advanceWidth, 600);
    assert.deepEqual(box(O.getBoundingBox()), [50, -10, 610, 690], kind + ' O box');
    assert.deepEqual(box(A.getBoundingBox()), [0, 0, 600, 680]);
  }
});

test('the importer reads the exported fonts back to an equal project', () => {
  const p = sample();
  for (const bytes of [B.ttf(p), B.otf(p)]) {
    const q = I.fromBytes(bytes).project;
    assert.deepEqual(q.glyphs.map((g) => g.id), p.glyphs.map((g) => g.id));
    assert.deepEqual(q.kerning, p.kerning);
    assert.deepEqual(q.metrics, p.metrics);
    assert.equal(q.info.family, 'Round Trip Sans'); assert.equal(q.info.version, '2.500'); assert.equal(q.info.weight, 700);
    for (const g of p.glyphs) {
      const h = M.find(q, g.id);
      assert.equal(h.advance, g.advance, g.id);
      assert.equal(h.contours.length, g.contours.length, g.id + ' contours');
      const a = P.bbox(g.contours), b = P.bbox(h.contours);
      if (a) { near(b.x, a.x, 1); near(b.y, a.y, 1); near(b.w, a.w, 1.5); near(b.h, a.h, 1.5); }
    }
  }
});

test('WOFF wraps the TTF losslessly; WOFF2 (Google\'s encoder in wasm) packs and unpacks it', async () => {
  const p = sample(), ttf = B.ttf(p);
  const woff = await S.woff(ttf, deflate);   // the same TTF (each build stamps the head table with the time)
  assert.equal(S.sniff(await B.woff(p, deflate)), 'woff');
  assert.equal(S.sniff(woff), 'woff');
  assert.ok(woff.length < ttf.length, 'smaller');
  assert.equal(parse(woff).numGlyphs, p.glyphs.length);
  assert.deepEqual(await S.unwoff(woff, inflate), ttf, 'unwrapped byte for byte');
  const C = require('../../vendor/woff2/compress_binding.js'), D = require('../../vendor/woff2/decompress_binding.js');
  await Promise.all([C, D].map((m) => new Promise((r) => { if (m.calledRun) r(); else m.onRuntimeInitialized = r; })));
  const w2 = new Uint8Array(C.compress(ttf));
  assert.equal(S.sniff(w2), 'woff2');
  const back = new Uint8Array(D.decompress(w2)), f = parse(back);
  assert.equal(f.numGlyphs, p.glyphs.length);
  assert.equal(f.getKerningValue(f.charToGlyph('A'), f.charToGlyph('V')), -80);
  assert.deepEqual(I.fromBytes(back).project.kerning, p.kerning);
});

test('every table is check-summed, and the file sums to the magic number', () => {
  const bytes = B.ttf(sample()), { tables } = S.read(bytes);
  assert.deepEqual(Object.keys(tables).filter((t) => t !== 'ltag').sort(), ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'kern', 'loca', 'maxp', 'name', 'post'], 'no CFF in a .ttf');
  assert.equal(S.checksum(bytes), 0xb1b0afba);
  const dv = S.view(bytes);
  for (let i = 0; i < dv.getUint16(4); i++) {
    const at = 12 + i * 16, t = S.tag(dv, at), data = tables[t].slice();
    if (t === 'head') S.view(data).setUint32(8, 0);
    assert.equal(dv.getUint32(at + 4), S.checksum(data), t);
  }
  assert.equal(S.kern([]), null);
  assert.equal(S.sniff(new Uint8Array(20)), null);
});

test('an OFL font opened, subset and written again keeps its outlines, names and licence', () => {
  const r = I.fromBytes(font('shared/fonts/archivo/ttf/Archivo-Regular.ttf')), p = r.project;
  assert.match(p.info.license, /Open Font License/);
  assert.ok(p.glyphs.length > 200, `${p.glyphs.length} glyphs`);
  const A0 = M.find(p, 'A');
  M.subset(p, CS.parseChars('ABC åäö'));
  assert.deepEqual(p.glyphs.map((g) => g.unicode).filter((c) => c != null), [0x20, 0x41, 0x42, 0x43, 0xe4, 0xe5, 0xf6]);
  const f = parse(B.ttf(p));
  assert.equal(f.numGlyphs, 8);
  assert.equal(f.charToGlyph('A').advanceWidth, A0.advance);
  const a = P.bbox(A0.contours), b = f.charToGlyph('A').getBoundingBox();
  near(b.x1, a.x, 1); near(b.y2, a.y + a.h, 1);
  assert.match(f.getEnglishName('license'), /Open Font License/);
});

test('a WOFF2 with GPOS pair kerning comes in with its kerning, and goes out with it in the kern table', async () => {
  const D = require('../../vendor/woff2/decompress_binding.js');
  await new Promise((r) => { if (D.calledRun) r(); else D.onRuntimeInitialized = r; });
  const r = I.fromBytes(new Uint8Array(D.decompress(font('shared/fonts/archivo/archivo-var-normal-latin.woff2'))));
  const pairs = M.pairs(r.project);
  assert.ok(pairs.length > 100, `${pairs.length} pairs`);
  const [a, b, v] = pairs[0], f = parse(B.ttf(r.project));
  const ga = f.charToGlyph(String.fromCodePoint(CS.cpOf(a))), gb = f.charToGlyph(String.fromCodePoint(CS.cpOf(b)));
  assert.equal(f.getKerningValue(ga, gb), v);
});

test('the CSS rule names the family, the weight and the files', () => {
  const css = B.css(sample(), { woff2: 'RoundTripSans-Bold.woff2', ttf: 'RoundTripSans-Bold.ttf' });
  assert.match(css, /font-family: "Round Trip Sans";/);
  assert.match(css, /url\("RoundTripSans-Bold.woff2"\) format\("woff2"\),\n\s+url\("RoundTripSans-Bold.ttf"\) format\("truetype"\)/);
  assert.match(css, /font-weight: 700;/);
  assert.equal(B.fileBase(sample()), 'RoundTripSans-Bold');
});

test('the handwriting sheet: boxes on pages with their guide lines, the corner squares found, the page mapped onto a photo', () => {
  const m = M.METRICS, L = SH.layout(CS.codes('upper'), m, { page: 'a4' });
  assert.equal(L.pages.length, 1); assert.equal(L.pages[0].cells.length, 26);
  const c = L.pages[0].cells[0];
  assert.equal(c.label, 'A');
  assert.ok(c.lines.asc < c.lines.cap && c.lines.cap < c.lines.x && c.lines.x < c.lines.base && c.lines.base < c.lines.desc);
  near((c.lines.base - c.lines.cap) / (c.lines.base - c.lines.asc), m.capHeight / m.ascender, 0.02);
  assert.equal(SH.layout(CS.codes('basic').slice(1), m).pages.length, 3);
  const from = L.markers.map((k) => ({ x: k.cx, y: k.cy })), to = [{ x: 10, y: 20 }, { x: 600, y: 5 }, { x: 640, y: 880 }, { x: 0, y: 860 }];
  const H = SH.homography(from, to);
  from.forEach((q, i) => { const t = SH.apply(H, q.x, q.y); near(t.x, to[i].x, 1e-6); near(t.y, to[i].y, 1e-6); });
  const w = 400, h = 560, bits = new Uint8Array(w * h);
  for (const [x0, y0] of [[10, 12], [370, 10], [372, 530], [12, 528]]) for (let y = y0; y < y0 + 18; y++) for (let x = x0; x < x0 + 18; x++) bits[y * w + x] = 1;
  for (let x = 100; x < 300; x++) bits[200 * w + x] = 1;   // a line is not a square
  const found = SH.findMarkers(bits, w, h);
  assert.deepEqual(found.map((f) => [Math.round(f.x), Math.round(f.y)]), [[19, 21], [379, 19], [381, 539], [21, 537]]);
  assert.equal(SH.findMarkers(new Uint8Array(w * h), w, h), null);
  const img = { data: new Uint8ClampedArray(20 * 20 * 4).fill(200), width: 20, height: 20 };
  const cut = SH.cut(img, [1, 0, 0, 0, 1, 0, 0, 0, 1], { x: 2, y: 2, w: 10, h: 6 });
  assert.equal(cut.width, 10); assert.equal(cut.height, 6); assert.equal(cut.data[0], 200);
});
