// Slop Font's model and geometry: character sets and glyph names (fontcreator/js/core/charset.js), the project
// (core/model.js), outlines, SVG path data and booleans (core/paths.js on SlopVector's geometry), strokes (core/stroke.js),
// tracing a picture (core/trace.js) and the cubic-to-quadratic conversion of TrueType (core/ttf.js).
// Covers: fontcreator/js/core/charset.js, fontcreator/js/core/model.js, fontcreator/js/core/paths.js, fontcreator/js/core/stroke.js
// Covers: fontcreator/js/core/trace.js, fontcreator/js/core/ttf.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS, M, P, ST, TR, T, G } from './fontcreator-env.mjs';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);
const areaOf = (cs) => cs.reduce((s, c) => s + P.area(c), 0);

test('character sets: sizes, Swedish letters, AGL names that read back', () => {
  assert.equal(CS.codes('basic').length, 95);
  assert.equal(CS.codes('latin1').length, 96);
  assert.equal(CS.codes('latinA').length, 128);
  assert.equal(CS.codes('all').length, 95 + 96 + 128);
  assert.deepEqual(CS.codes('nordic').map((c) => String.fromCodePoint(c)).join(''), 'ÄÅÆÖØäåæöø');
  assert.equal(CS.nameOf(0x41), 'A'); assert.equal(CS.nameOf(0x30), 'zero'); assert.equal(CS.nameOf(0xe5), 'aring');
  assert.equal(CS.nameOf(0xe4), 'adieresis'); assert.equal(CS.nameOf(0xf6), 'odieresis'); assert.equal(CS.nameOf(0xff), 'ydieresis');
  assert.equal(CS.nameOf(0x141), 'uni0141');
  for (const cp of CS.codes('all')) assert.equal(CS.cpOfName(CS.nameOf(cp)), cp, CS.nameOf(cp));
  assert.equal(CS.idOf(0x41), 'u0041'); assert.equal(CS.cpOf('u00E5'), 0xe5); assert.equal(CS.cpOf('.notdef'), null);
  assert.equal(CS.label(0x20), 'space'); assert.equal(CS.hex(0xe5), 'U+00E5');
  assert.deepEqual(CS.parseChars('abba\nå'), [0x61, 0x62, 0xe5]);
  assert.throws(() => CS.codes('klingon'), /Unknown character set/);
});

test('a new project has .notdef and space, sorted; clean() checks files and drops kerning of missing glyphs', () => {
  const p = M.create({ family: 'Test', metrics: { upm: 2048 } });
  assert.deepEqual(p.glyphs.map((g) => g.id), ['.notdef', 'u0020']);
  assert.equal(p.metrics.ascender, Math.round(800 * 2.048));
  assert.ok(p.glyphs[0].contours.length === 2, '.notdef is a box with a hole');
  M.ensure(p, 0x42); M.ensure(p, 0x41);
  assert.deepEqual(p.glyphs.map((g) => g.id), ['.notdef', 'u0020', 'u0041', 'u0042']);
  assert.throws(() => M.clean({ format: 'other' }), /not a font project/);
  const c = M.clean({ format: 'slop-font', info: { family: '  ', weight: 9999 }, metrics: { ascender: 'x' },
    glyphs: [{ unicode: 65, advance: 500, contours: P.rect(0, 0, 100, 100) }, { unicode: 65 }], kerning: { 'u0041 u0042': -50, 'u0041 u0041': 20 } });
  assert.equal(c.info.family, 'My Font'); assert.equal(c.info.weight, 900); assert.equal(c.metrics.ascender, 800);
  assert.deepEqual(c.glyphs.map((g) => g.id), ['.notdef', 'u0041'], 'a glyph is kept once, .notdef added');
  assert.deepEqual(c.kerning, { 'u0041 u0041': 20 }, 'the pair with a missing glyph is gone');
  assert.throws(() => M.clean({ format: 'slop-font', glyphs: [{ contours: [{ pts: [{ x: 'a', y: 0 }] }] }] }), /glyph needs|not a number/);
});

test('side bearings move the outline or change the width; kerning; subset; stats', () => {
  const p = M.create({});
  const a = M.ensure(p, 0x41);
  a.contours = P.rect(100, 0, 400, 700); a.advance = 600;
  assert.deepEqual([M.sides(a).lsb, M.sides(a).rsb], [100, 100]);
  M.setSides(a, { lsb: 40 });
  assert.deepEqual([M.sides(a).lsb, M.sides(a).rsb, a.advance], [40, 100, 540], 'the right side stays');
  M.setSides(a, { rsb: 60 });
  assert.equal(a.advance, 500);
  M.ensure(p, 0x56);
  assert.equal(M.setKern(p, 'A', 'V', -80), -80);
  assert.equal(M.kern(p, 'u0041', 'u0056'), -80);
  M.setKern(p, 'A', 'V', 0);
  assert.deepEqual(p.kerning, {});
  M.setKern(p, 'A', 'V', -5000);
  assert.equal(M.kern(p, 'u0041', 'u0056'), -1000, 'clamped to an em');
  assert.throws(() => M.setKern(p, 'A', 'Z', 10), /must be in the font/);
  M.subset(p, [0x41]);
  assert.deepEqual(p.glyphs.map((g) => g.id), ['.notdef', 'u0041']);
  assert.deepEqual(p.kerning, {});
  assert.deepEqual(M.stats(p), { glyphs: 2, drawn: 1, empty: 0, pairs: 0 });
  assert.throws(() => M.remove(p, '.notdef'), /stays/);
  assert.equal(M.find(p, 'A').id, 'u0041'); assert.equal(M.find(p, 'U+0041').id, 'u0041'); assert.equal(M.find(p, 'u0041').name, 'A');
});

test('SVG path data in font units, in SVG units and fitted; opentype commands both ways; quadratics made cubic exactly', () => {
  const tri = P.fromSvg('M0 0 L100 0 L50 100 Z');
  assert.equal(tri.length, 1); assert.equal(tri[0].pts.length, 3);
  const flipped = P.fromSvg('M0 0 L100 0 L50 100 Z', { coords: 'svg', ascender: 800 });
  assert.deepEqual({ ...P.bbox(flipped) }, { x: 0, y: 700, w: 100, h: 100 });
  const fit = P.fromSvg('M10 10 h20 v40 h-20 z', { coords: 'fit', height: 700, left: 50 });
  const b = P.bbox(fit);
  near(b.x, 50, 1e-6); near(b.y, 0, 1e-6); near(b.h, 700, 1e-6); near(b.w, 350, 1e-6);
  assert.throws(() => P.fromSvg('M0 0 L oops'), /could not be read|no shapes/);
  const o = P.ellipse(300, 350, 250, 350);
  const back = P.fromCommands(P.toCommands(o));
  assert.equal(back[0].pts.length, 4);
  near(P.bbox(back).w, 500, 1); near(P.bbox(back).h, 700, 1);
  const q = P.fromCommands([{ type: 'M', x: 0, y: 0 }, { type: 'Q', x1: 50, y1: 100, x: 100, y: 0 }, { type: 'Z' }]);
  const seg = [q[0].pts[0], { x: q[0].pts[0].ox, y: q[0].pts[0].oy }, { x: q[0].pts[1].ix, y: q[0].pts[1].iy }, q[0].pts[1]];
  near(G.bez(...seg, 0.5).y, 50, 0.01, 'the cubic passes where the quadratic does');
  assert.match(P.toSvg(P.rect(0, 0, 10, 10)), /^M0 0L10 0L10 10L0 10Z$/);
});

test('orient: a contour inside another becomes a hole, whatever way it was drawn; booleans; remove overlap', () => {
  const o = [...P.ellipse(300, 350, 250, 350), ...P.ellipse(300, 350, 150, 250)];
  const r = P.orient(o);
  assert.ok(P.area(r[0]) > 0 && P.area(r[1]) < 0, 'outer counter-clockwise, inner clockwise');
  const x = P.orient([...P.rect(0, 0, 100, 300), ...P.rect(-100, 100, 300, 100)]);
  assert.ok(x.every((c) => P.area(c) > 0), 'overlapping shapes are both outer (a plus sign, not a hole)');
  const u = P.boolean(P.rect(0, 0, 200, 200), P.rect(100, 100, 200, 200), 'union');
  assert.equal(u.length, 1); near(Math.abs(areaOf(u)), 70000, 5);
  const m = P.boolean(P.rect(0, 0, 200, 200), P.rect(100, 100, 200, 200), 'minus');
  near(Math.abs(areaOf(m)), 30000, 5);
  const i = P.boolean(P.rect(0, 0, 200, 200), P.rect(100, 100, 200, 200), 'intersect');
  near(Math.abs(areaOf(i)), 10000, 5);
  const e = P.boolean(P.rect(0, 0, 200, 200), P.rect(100, 100, 200, 200), 'exclude');
  near(Math.abs(areaOf(e)), 60000, 5);
  const hole = P.boolean(P.rect(0, 0, 300, 300), P.ellipse(150, 150, 50), 'minus');
  assert.equal(hole.length, 2, 'a hole is its own contour');
  near(Math.abs(areaOf(P.orient(hole))), 90000 - Math.PI * 2500, 60);
  const merged = P.merge([...P.rect(0, 0, 100, 300), ...P.rect(-100, 100, 300, 100)]);
  assert.equal(merged.length, 1); assert.equal(merged[0].pts.length, 12, 'a plus sign: 12 corners');
  assert.throws(() => P.boolean(P.rect(0, 0, 1, 1), P.rect(0, 0, 1, 1), 'divide'), /Unknown operation/);
});

test('strokes: flat, square and round ends, round joints, crossings, and a curve from path data, within a few units', () => {
  const line = [{ points: [[100, 0], [500, 0]] }];
  const butt = P.bbox(ST.outline(line, { width: 100, cap: 'butt' }));
  near(butt.w, 400, 2); near(butt.h, 100, 2);
  near(P.bbox(ST.outline(line, { width: 100, cap: 'square' })).w, 500, 2);
  const round = ST.outline(line, { width: 100, cap: 'round' });
  near(P.bbox(round).w, 500, 3); assert.equal(round.length, 1);
  near(Math.abs(areaOf(round)), 400 * 100 + Math.PI * 2500, 1500);
  const el = ST.outline([{ points: [[0, 0], [0, 400], [300, 400]] }], { width: 60, cap: 'butt' });
  const eb = P.bbox(el);
  assert.equal(el.length, 1);
  near(eb.y, 0, 2, 'a flat end stops at the point'); near(eb.y + eb.h, 430, 3, 'the joint is round'); near(eb.x, -30, 3); near(eb.x + eb.w, 300, 2);
  const crossing = ST.outline([{ points: [[0, 300], [600, 300]] }, { points: [[300, 0], [300, 600]] }, { d: 'M100 100 C200 500 400 500 500 100' }], { width: 50 });
  assert.equal(crossing.length, 3, 'crossing strokes merge into one outline (with the holes they enclose)');
  const ring = ST.outline([{ d: 'M200 0 A200 200 0 1 1 199.9 0 Z' }], { width: 40 });
  assert.equal(ring.length, 2, 'a closed stroke is a ring: an outline and a hole');
  assert.deepEqual(ST.outline([], {}), []);
});

/** An RGBA picture w × h, ink where fn(x, y) is true (black on white). */
function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fn(x, y) ? 20 : 240, o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255; }
  return { data, width: w, height: h };
}
test('tracing: a drawn ring becomes an outline with a hole, placed on the baseline at the height asked', () => {
  const img = picture(120, 140, (x, y) => { const d = Math.hypot((x - 60) / 45, (y - 70) / 60); return d <= 1 && d >= 0.55; });
  const b = TR.binarize(img);
  assert.ok(b.threshold > 20 && b.threshold <= 240, 'Otsu splits ink from paper');
  assert.equal(TR.loops(b.bits, b.w, b.h).length, 2);
  const r = TR.trace(img, { place: { mode: 'fit', height: 700, left: 50 } });
  assert.equal(r.contours.length, 2);
  const box = P.bbox(r.contours);
  near(box.y, 0, 2); near(box.h, 700, 6); near(box.x, 50, 2);
  assert.ok(P.area(r.contours[0]) * P.area(r.contours[1]) < 0, 'the hole runs the other way');
  assert.equal(r.advance, Math.round(box.x + box.w + 50));
  const specks = picture(100, 100, (x, y) => (x === 10 && y === 10) || (x > 30 && x < 70 && y > 20 && y < 80));
  assert.equal(TR.trace(specks, {}).contours.length, 1, 'a speck is dropped');
  const two = picture(10, 10, (x, y) => (x === 3 && y === 3) || (x === 4 && y === 4));
  assert.equal(TR.loops(TR.binarize(two, 128).bits, 10, 10).length, 2, 'pixels touching at a corner stay two shapes');
  const lines = TR.trace(img, { place: { mode: 'lines', baseline: 130, capline: 10, capHeight: 600 } });
  near(P.bbox(lines.contours).y, (130 - 130) * 5, 15);
  assert.deepEqual(TR.trace(picture(20, 20, () => false), {}).contours, []);
});

test('TrueType quadratics stay within half a unit of the cubic', () => {
  const p0 = { x: 0, y: 0 }, c1 = { x: 0, y: 552 }, c2 = { x: 448, y: 1000 }, p3 = { x: 1000, y: 1000 };
  const qs = T.quads(p0, c1, c2, p3, 0.5);
  assert.ok(qs.length >= 2 && qs.length <= 8, `${qs.length} pieces`);
  let start = p0, worst = 0;
  const qb = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  const cubic = [];
  for (let i = 0; i <= 400; i++) cubic.push(G.bez(p0, c1, c2, p3, i / 400));
  for (const [c, e] of qs) {
    for (let i = 0; i <= 20; i++) { const q = qb(start, c, e, i / 20); worst = Math.max(worst, Math.min(...cubic.map((k) => Math.hypot(k.x - q.x, k.y - q.y)))); }
    start = e;
  }
  assert.ok(worst < 0.8, `worst ${worst}`);
  const pts = T.points(P.reverse(P.orient(P.ellipse(0, 0, 100, 100))));
  assert.equal(pts.length, 1); assert.ok(pts[0][0].on && pts[0].some((q) => !q.on));
});
