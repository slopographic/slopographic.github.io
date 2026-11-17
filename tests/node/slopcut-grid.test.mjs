// Node tests for the layout grid (shared/video grid.js, templates.js, slots.js): slot rectangles for each template,
// fill, swap, free, cell hit tests. Loaded in a vm context so the browser files run unchanged.
// Run with: node tests/run.mjs slopcut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['shared/video/seed.js', 'shared/video/presets.js', 'shared/video/grid.js', 'shared/video/templates.js', 'shared/video/slots.js']) {
  vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const SV = ctx.SlopVideo, T = SV.templates, S = SV.slots;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
// Values from the vm context are another realm's arrays: compare as JSON.
const rect = (x, y, w, h) => ({ x, y, w, h });
const closeRect = (a, b) => ['x', 'y', 'w', 'h'].every((k) => near(a[k], b[k]));

test('three-up is three equal columns; 1x3 (grid-3x1) is three full-width rows', () => {
  const cols = S.rects('three-up');
  assert.equal(cols.length, 3);
  [rect(0, 0, 1 / 3, 1), rect(1 / 3, 0, 1 / 3, 1), rect(2 / 3, 0, 1 / 3, 1)].forEach((r, i) => assert.ok(closeRect(cols[i], r), 'column ' + i));
  const rows = S.rects('grid-3x1');
  assert.equal(rows.length, 3);
  [rect(0, 0, 1, 1 / 3), rect(0, 1 / 3, 1, 1 / 3), rect(0, 2 / 3, 1, 1 / 3)].forEach((r, i) => assert.ok(closeRect(rows[i], r), 'row ' + i));
});
test('2x1 (split-h) and 1x2 (split-v) pick columns and rows the same way', () => {
  const h2 = S.rects('split-h'), v2 = S.rects('split-v');
  assert.ok(closeRect(h2[1], rect(0.5, 0, 0.5, 1)));
  assert.ok(closeRect(v2[1], rect(0, 0.5, 1, 0.5)));
});
test('2x2 and 3x3 grids have 4 and 9 cells that tile the frame', () => {
  assert.equal(S.count('grid2'), 4);
  assert.equal(S.count('grid3'), 9);
  assert.ok(T.tiles(T.get('grid2')) && T.tiles(T.get('grid3')));
  assert.ok(closeRect(S.rects('grid3')[4], rect(1 / 3, 1 / 3, 1 / 3, 1 / 3)));
});
test('picture-in-picture: full frame, then a small corner on top', () => {
  const r = S.rects('pip');
  assert.equal(r.length, 2);
  assert.ok(closeRect(r[0], rect(0, 0, 1, 1)));
  assert.ok(r[1].x + r[1].w <= 1 && r[1].y + r[1].h <= 1 && r[1].w < 0.5);
});
test('title-plus-two: a title band across the top, two clips side by side below it', () => {
  const r = S.rects('title-two');
  assert.equal(r.length, 3);
  assert.ok(closeRect(r[0], rect(0, 0, 1, 0.28)));
  assert.ok(closeRect(r[1], rect(0, 0.28, 0.5, 0.72)) && closeRect(r[2], rect(0.5, 0.28, 0.5, 0.72)));
  assert.ok(T.tiles(T.get('title-two')));
});
test('unknown template ids have no slots and an empty layout is all null', () => {
  same(S.rects('nope'), []);
  assert.equal(S.count('nope'), 0);
  same(S.empty('three-up'), [null, null, null]);
});
test('cellAt: the cell under a point; layered templates pick the top-most slot; outside gives null', () => {
  assert.equal(S.cellAt('three-up', 0.1, 0.5), 0);
  assert.equal(S.cellAt('three-up', 0.5, 0.5), 1);
  assert.equal(S.cellAt('three-up', 0.9, 0.2), 2);
  assert.equal(S.cellAt('grid-3x1', 0.5, 0.9), 2);
  assert.equal(S.cellAt('pip', 0.2, 0.2), 0);
  assert.equal(S.cellAt('pip', 0.8, 0.8), 1);
  assert.equal(S.cellAt('three-up', 1.2, 0.5), null);
  assert.equal(S.cellAt('title-two', 0.25, 0.1), 0);
  assert.equal(S.cellAt('title-two', 0.75, 0.9), 2);
});
test('fill puts a clip in an empty slot and leaves the others alone (input is not changed)', () => {
  const before = [null, null, null];
  const after = S.fill(before, 1, 'a');
  same(after, [null, 'a', null]);
  same(before, [null, null, null]);
});
test('fill on a clip already in another slot swaps the two, so a clip is never in two slots', () => {
  const s = ['a', 'b', null];
  same(S.fill(s, 2, 'a'), [null, 'b', 'a']);
  same(S.fill(s, 0, 'b'), ['b', 'a', null]);
  same(S.fill(s, 0, 'a'), s.slice(), 'filling a slot with its own clip changes nothing');
});
test('fill with an out-of-range slot or a null clip (a clear) is safe', () => {
  same(S.fill(['a'], 4, 'b'), ['a']);
  same(S.fill(['a', 'b'], 0, null), [null, 'b']);
});
test('swap exchanges two slots (reorder); same or out-of-range indices change nothing', () => {
  same(S.swap(['a', 'b', 'c'], 0, 2), ['c', 'b', 'a']);
  same(S.swap(['a', null], 0, 1), [null, 'a']);
  same(S.swap(['a', 'b'], 1, 1), ['a', 'b']);
  same(S.swap(['a', 'b'], 0, 9), ['a', 'b']);
});
test('free empties one slot and keeps the rest; resize pads or truncates to a template size', () => {
  same(S.free(['a', 'b', 'c'], 1), ['a', null, 'c']);
  same(S.resize(['a', 'b', 'c'], 2), ['a', 'b']);
  same(S.resize(['a'], 3), ['a', null, null]);
  same(S.filled(['a', null, 'c']), [{ slot: 0, id: 'a' }, { slot: 2, id: 'c' }]);
});
test('a 2x2 template and a custom 1x3 grid resolve by id, so picker and random edit share them', () => {
  assert.equal(T.get('grid-2x2').slots.length, 4);
  assert.equal(T.get('2x2').slots.length, 4, 'bare RxC resolves to the same grid');
  assert.equal(T.get('grid-1x3').slots.length, 3);
});
test('shared graphics: every shape has stroke paths and an SVG string with the colour', () => {
  const G = readFileSync(path.join(ROOT, 'shared/graphics/icons.js'), 'utf8');
  vm.runInContext(G, ctx, { filename: 'icons.js' });
  const list = ctx.SlopGraphics.list();
  same(list.map((s) => s.id).sort(), ['arrow', 'box', 'burst', 'check', 'circle', 'counter', 'speech', 'underline']);
  for (const s of list) {
    assert.ok(s.paths.length >= 1, s.id);
    for (const d of s.paths) assert.match(d, /^M-?[\d.]+ -?[\d.]+/, s.id);
  }
  assert.equal(ctx.SlopGraphics.get('burst').paths.length, 8);
  assert.equal(ctx.SlopGraphics.get('nope'), null);
  const svg = ctx.SlopGraphics.svg('check', { color: '#d4ff3a', size: 32 });
  assert.ok(svg.startsWith('<svg') && svg.includes('stroke="#d4ff3a"') && svg.includes('viewBox="0 0 100 100"'));
  same(ctx.SlopGraphics.ANIMS.map((a) => a[0]), ['draw', 'pulse', 'bounce', 'pop', 'none']);
});

test('shared graphics in Swedish: names, groups and motions from shared/i18n/ui/sv/graphics.js', async () => {
  const { context, plain } = await import('./ui-tables-env.mjs');
  const G = context(['shared/graphics/icons.js'], 'sv').SlopGraphics;
  assert.equal(G.get('speech').name, 'Pratbubbla');
  assert.equal(G.get('arrow').group, 'Pekare');
  assert.equal(G.get('arrow').groupId, 'pointers');
  assert.equal(plain(G.ANIMS).find((a) => a[0] === 'bounce')[1], 'Studs');
  assert.equal(T.get('grid-1x3').slots.length, 3);
});
