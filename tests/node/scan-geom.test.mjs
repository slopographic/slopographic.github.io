// Slop Scan, the pure parts without pictures: the homography, corner order, hulls and the largest quad, page sizes and
// margins, the file size estimate and the list of pages. Run: node --test tests/node/scan-geom.test.mjs
// Covers: scan/js/core/geom.js, scan/js/core/page.js, scan/js/core/pages.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, P, L } from './scan-env.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const RECT = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }];
const QUAD = [{ x: 12, y: 30 }, { x: 180, y: 8 }, { x: 205, y: 260 }, { x: 3, y: 240 }];

test('the homography takes the four corners where they go, and its inverse brings them back', () => {
  const H = G.homography(RECT, QUAD), Hi = G.invert(H);
  RECT.forEach((p, i) => { const q = G.apply(H, p.x, p.y); near(q.x, QUAD[i].x); near(q.y, QUAD[i].y); });
  QUAD.forEach((p, i) => { const q = G.apply(Hi, p.x, p.y); near(q.x, RECT[i].x, 1e-6); near(q.y, RECT[i].y, 1e-6); });
  // straight lines stay straight: the middle of a side maps onto the line between its corners
  const m = G.apply(H, 50, 0), a = QUAD[0], b = QUAD[1];
  near((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x), 0, 1e-6);
});
test('the identity, and a degenerate set of corners gives no homography', () => {
  const H = G.homography(RECT, RECT);
  assert.deepEqual(H.map((v) => Math.round(v * 1e9) / 1e9), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(G.homography(RECT, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]), null);
});
test('order puts any four corners as top-left, top-right, bottom-right, bottom-left', () => {
  const shuffled = [QUAD[2], QUAD[0], QUAD[3], QUAD[1]];
  assert.deepEqual(G.order(shuffled), QUAD);
  // a page turned 45°: the corner with the smallest x + y leads
  const diamond = [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }];
  assert.deepEqual(G.order(diamond.slice().reverse()), [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }]);
});
test('area and convexity; a folded (crossed) quad is not convex', () => {
  assert.equal(G.area(RECT), 14000);
  assert.ok(G.convex(QUAD));
  assert.ok(!G.convex([QUAD[0], QUAD[2], QUAD[1], QUAD[3]]));
});
test('outSize: the mean of opposite sides, the long side capped', () => {
  assert.deepEqual(G.outSize(RECT), { w: 100, h: 140 });
  assert.deepEqual(G.outSize(RECT, 70), { w: 50, h: 70 });
});
test('the hull of a cloud, cut down, still holds its four corners; maxQuad finds the page in it', () => {
  const pts = [];
  for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push({ x: 10 + 80 * t, y: 5 + 2 * Math.sin(t * 9) }, { x: 10 + 80 * t, y: 120 }, { x: 10, y: 5 + 115 * t }, { x: 90, y: 5 + 115 * t }); }
  for (let i = 0; i < 200; i++) pts.push({ x: 30 + (i % 40), y: 30 + (i % 50) });
  const hl = G.hull(pts);
  assert.ok(hl.length >= 4);
  const q = G.maxQuad(G.simplify(hl, 12));
  assert.deepEqual(q.map((p) => [Math.round(p.x), Math.round(p.y)]), [[10, 5], [90, 5], [90, 120], [10, 120]]);
  assert.equal(G.maxQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), null);
});
test('norm, denorm and turn keep a quad with its photo', () => {
  const n = G.norm(QUAD, 210, 270);
  assert.deepEqual(G.denorm(n, 210, 270).map((p) => [Math.round(p.x), Math.round(p.y)]), QUAD.map((p) => [p.x, p.y]));
  const full = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }];
  assert.deepEqual(G.turn(full, 1).map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)]), [[0.2, 0.1], [0.8, 0.1], [0.8, 0.9], [0.2, 0.9]]);
  assert.deepEqual(G.turn(full, 4), full);
});

test('page sizes: A4 and Letter in points, turned for a wide scan; auto keeps the scan\'s shape', () => {
  const a4 = P.layout(1000, 1414, { size: 'a4', margin: 'none' });
  assert.deepEqual([a4.pageW, a4.pageH], [595.28, 841.89]);
  assert.ok(Math.abs(a4.width - 595.28) < 1 && a4.x < 1);
  const wide = P.layout(1600, 1000, { size: 'letter', margin: 'none' });
  assert.deepEqual([wide.pageW, wide.pageH], [792, 612]);
  const auto = P.layout(800, 1200, { size: 'auto', margin: 'none' });
  assert.equal(auto.pageW, 595.28);
  near(auto.pageH, 595.28 * 1.5, 0.02);
  assert.deepEqual([auto.x, auto.y], [0, 0]);
  const autoWide = P.layout(1200, 800, { size: 'auto' });
  assert.equal(autoWide.pageW, 841.89);
});
test('margins in millimetres; the scan fits inside them and is centred', () => {
  near(P.mm(25.4), 72);
  const L1 = P.layout(1000, 1000, { size: 'a4', margin: 'medium' }), m = P.mm(12);
  near(L1.width, 595.28 - 2 * m, 0.02);
  near(L1.x, m, 0.02);
  near(L1.y, (841.89 - L1.height) / 2, 0.02);
  const auto = P.layout(1000, 2000, { size: 'auto', margin: 'small' });
  near(auto.x, P.mm(6), 0.02); near(auto.y, P.mm(6), 0.02);
  assert.equal(P.dpiOf(1654, 2339, { width: 595.28 }), 200);
});
test('the size estimate scales a sample JPEG by pixels and adds the PDF\'s own bytes', () => {
  const one = P.estimate([{ px: 4e6, sampleBytes: 50000, samplePx: 1e6 }], 0.8);
  assert.equal(one, 1200 + 600 + 200000);
  assert.ok(P.estimate([{ px: 1e6 }], 0.9) > P.estimate([{ px: 1e6 }], 0.4));
});
test('file names: the date when there is no name, .pdf once, no path characters', () => {
  assert.equal(P.fileName('', new Date(2026, 9, 28, 14, 5)), 'Scan 2026-10-28 14.05.pdf');
  assert.equal(P.fileName('Receipts/Oct.pdf'), 'Receipts-Oct.pdf');
});

test('the list of pages: add, the look carried over, move, remove, select, apply to all', () => {
  const list = L.create(), seen = [];
  list.on((e) => seen.push(e.type));
  const a = list.add({}, { name: 'a.jpg' }), b = list.add({}, { name: 'b.jpg' });
  assert.equal(a.style, 'color');
  list.set(b.id, { style: 'bw', contrast: 250 });
  assert.equal(list.get(b.id).contrast, 100);
  const c = list.add({}, { name: 'c.jpg' });
  assert.equal(c.style, 'bw', 'a new page takes the look chosen last');
  assert.equal(list.current().id, c.id);
  assert.ok(list.move(c.id, 0));
  assert.deepEqual(list.all().map((p) => p.name), ['c.jpg', 'a.jpg', 'b.jpg']);
  assert.equal(list.applyAll(c.id), 1);
  assert.equal(list.get(a.id).style, 'bw');
  list.set(a.id, { turn: -1 });
  assert.equal(list.get(a.id).turn, 3);
  list.select(a.id);
  list.remove(a.id);
  assert.equal(list.current().id, b.id, 'removing the page shown shows the next one');
  assert.deepEqual(seen, ['add', 'add', 'set', 'add', 'move', 'set', 'set', 'select', 'remove']);
});
test('a retake keeps the page\'s place and look; the document settings are clamped', () => {
  const list = L.create();
  const a = list.add({ n: 1 }, { name: 'a.jpg' });
  list.add({ n: 2 }, { name: 'b.jpg' });
  list.set(a.id, { style: 'gray', brightness: 20 });
  const v = list.get(a.id).v;
  list.replace(a.id, { n: 3 }, { name: 'a2.jpg', found: true, quad: [] });
  const r = list.get(a.id);
  assert.deepEqual([r.photo.n, r.name, r.style, r.brightness, list.index(a.id)], [3, 'a2.jpg', 'gray', 20, 0]);
  assert.ok(r.v > v);
  assert.equal(list.setDoc({ quality: 3 }).quality, 0.95);
  assert.equal(list.setDoc({ size: 'letter' }).size, 'letter');
});
