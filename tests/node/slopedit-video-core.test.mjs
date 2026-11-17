// Node tests for shared/video (window.SlopVideo): grids, templates, presets, segments and the pure random-edit plan.
// Loaded in a vm context so the browser files run unchanged. Run with: node tests/run.mjs slopedit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'shared', 'video');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['seed.js', 'presets.js', 'grid.js', 'templates.js', 'layout.js', 'segments.js', 'timing.js', 'locks.js', 'audio.js', 'clipset.js', 'orient.js', 'random-edit.js']) {
  vm.runInContext(readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
}
const SV = ctx.SlopVideo;
const still = (id) => ({ id, name: id, kind: 'image', dur: Infinity, hasAudio: false });
const video = (id, dur) => ({ id, name: id, kind: 'video', dur, hasAudio: true });
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('grid 1x3 is three equal columns that cover the frame with no overlap', () => {
  const g = SV.grid.grid(1, 3);
  assert.equal(g.length, 3);
  for (const r of g) { assert.ok(near(r.w, 1 / 3)); assert.ok(near(r.h, 1)); assert.ok(near(r.y, 0)); }
  assert.ok(near(g[0].x, 0) && near(g[1].x, 1 / 3) && near(g[2].x, 2 / 3));
  const area = g.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(near(area, 1));
  assert.ok(SV.templates.tiles({ slots: g }));
});
test('grid 4x4 gives 16 regions; 3x1 stacks three rows', () => {
  assert.equal(SV.grid.grid(4, 4).length, 16);
  const rows = SV.grid.grid(3, 1);
  assert.equal(rows.length, 3);
  assert.ok(near(rows[2].y, 2 / 3));
});
test('grid with a gap and a border stays inside the frame and does not overlap', () => {
  const g = SV.grid.grid(2, 3, { gap: 0.02, border: 0.05 });
  assert.equal(g.length, 6);
  for (const r of g) assert.ok(r.x >= 0.05 - 1e-9 && r.x + r.w <= 0.95 + 1e-9 && r.y + r.h <= 0.95 + 1e-9);
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(!(ox > 1e-9 && oy > 1e-9));
  }
});
test('a custom 2x3 grid fills six slots (rows x columns)', () => {
  const t = SV.templates.get('grid-2x3');
  assert.equal(t.slots.length, 6);
  const media = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(still);
  const p = SV.random.plan({ seed: 5, target: 9, pace: 'medium', tpl: 'grid-2x3' }, media);
  assert.equal(p.slots, 6);
  for (const beat of p.cuts) same(beat.map((x) => x.slot), [0, 1, 2, 3, 4, 5]);
});
test('named templates keep their ids; grid ids resolve', () => {
  same(SV.templates.list.map((t) => t.id), ['single', 'split-h', 'split-v', 'pip', 'grid2', 'grid3', 'three-up', 'reel', 'title-two']);
  assert.equal(SV.templates.get('grid-1x2').slots.length, 2);
  assert.equal(SV.templates.get('2x2').id, 'grid-2x2');
  assert.equal(SV.templates.get('grid-9x9'), null);
});
test('presets: 1920x1080 is 16:9 and 1080x1920 is 9:16; the named list is complete', () => {
  const P = SV.presets;
  const land = P.LIST.find((x) => x.w === 1920 && x.h === 1080), phone = P.LIST.find((x) => x.w === 1080 && x.h === 1920);
  assert.ok(near(land.w / land.h, 16 / 9));
  assert.ok(near(phone.w / phone.h, 9 / 16));
  same(P.LIST.map((x) => [x.w, x.h]), [[1080, 1920], [1080, 1080], [1920, 1080], [3840, 2160], [1080, 1350]]);
  same(P.size('custom', 641, 481), { w: 642, h: 482 });
  assert.equal(P.aspectSize('9:16').w, 1080);
  assert.equal(P.idFor(3840, 2160), '4k');
});
test('the same seed gives the same plan; another seed another order', () => {
  const media = ['a', 'b', 'c', 'd', 'e'].map(still);
  const a = SV.random.plan({ seed: 7, target: 20, pace: 'medium' }, media);
  const b = SV.random.plan({ seed: 7, target: 20, pace: 'medium' }, media);
  assert.equal(JSON.stringify(a.cuts), JSON.stringify(b.cuts));
  assert.equal(a.seedHex, '00000007');
  const c = SV.random.plan({ seed: 8, target: 20, pace: 'medium' }, media);
  assert.notEqual(JSON.stringify(c.cuts), JSON.stringify(a.cuts));
});
test('plan length is the target and no clip repeats while there are enough clips', () => {
  const media = ['a', 'b', 'c', 'd', 'e'].map(still);
  for (let seed = 1; seed <= 10; seed++) {
    const p = SV.random.plan({ seed, target: 10, pace: 'slow' }, media);
    assert.ok(near(p.total, 10, 0.011));
    const ids = p.cuts.flat().map((x) => x.media);
    assert.equal(new Set(ids).size, ids.length);
  }
  const v = SV.random.plan({ seed: 3, target: 61.3, pace: 'medium' }, [still('a'), video('v', 40)]);
  assert.ok(near(v.total, 61.3, 0.011));
});
test('1x1 then 1x3 switch: one clip in the first segment, three in the second', () => {
  const media = ['a', 'b', 'c', 'd', 'e', 'f'].map(still);
  const p = SV.random.plan({ seed: 11, target: 10, pace: 'medium', segments: [{ start: 0, layout: 'grid-1x1' }, { start: 4, layout: 'grid-1x3' }] }, media);
  assert.equal(p.segments.length, 2);
  same([p.segments[0].start, p.segments[0].end, p.segments[1].start, p.segments[1].end], [0, 4, 4, 10]);
  const beats1 = p.cuts.filter((b) => b[0].start < 4 - 1e-9), beats2 = p.cuts.filter((b) => b[0].start >= 4 - 1e-9);
  assert.ok(beats1.length > 0 && beats2.length > 0);
  for (const b of beats1) assert.equal(b.length, 1);
  for (const b of beats2) assert.equal(b.length, 3);
  for (const b of p.cuts) assert.ok(b[0].start + b[0].dur <= (b[0].start < 4 ? 4 : 10) + 1e-6);
  assert.equal(SV.random.regionFor(p, p.cuts[0][0]).w, 1);
  const later = p.cuts.find((b) => b[0].start >= 4);
  assert.ok(near(SV.random.regionFor(p, later[2]).w, 1 / 3));
});
test('random switches draw from the layout list and cover the length', () => {
  const media = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(still);
  const p = SV.random.plan({ seed: 21, target: 40, pace: 'medium', switches: true, layouts: ['grid-1x2', 'grid-2x2', 'grid-1x3'] }, media);
  assert.ok(p.segments.length >= 3);
  for (const s of p.segments) assert.ok(['grid-1x2', 'grid-2x2', 'grid-1x3'].includes(s.layout));
  assert.ok(near(p.total, 40, 0.011));
  const again = SV.random.plan({ seed: 21, target: 40, pace: 'medium', switches: true, layouts: ['grid-1x2', 'grid-2x2', 'grid-1x3'] }, media);
  assert.equal(JSON.stringify(again.segments), JSON.stringify(p.segments));
});
test('switch list edits are pure: add, move, remove keep the list sorted', () => {
  let l = SV.segments.add([], 0, 'grid-1x1');
  l = SV.segments.add(l, 4, 'grid-1x3');
  l = SV.segments.add(l, 2, 'grid-2x2');
  same(l.map((s) => s.start), [0, 2, 4]);
  l = SV.segments.move(l, 1, 6);
  same(l.map((s) => [s.start, s.layout]), [[0, 'grid-1x1'], [4, 'grid-1x3'], [6, 'grid-2x2']]);
  l = SV.segments.remove(l, 1);
  same(l.map((s) => s.start), [0, 6]);
  assert.equal(SV.segments.add(l, 0, 'nope').length, 2);
});
test('fit letterboxes a 16:9 picture into a square region', () => {
  const t = SV.layout.fit({ w: 1000, h: 1000 }, { w: 1920, h: 1080 }, { x: 0, y: 0, w: 1, h: 1 });
  assert.ok(near(t.scale, 1, 1e-4)); // 1920x1080 in a 1000x1000 region fills its width exactly
  assert.equal(t.x, 0);
});

test('frame sizes and templates in Swedish (shared/i18n/ui/sv/video.js); the sizes keep their ids and pixels', async () => {
  const { context, plain } = await import('./ui-tables-env.mjs');
  const sv = context(['seed.js', 'presets.js', 'grid.js', 'templates.js'].map((f) => 'shared/video/' + f), 'sv').SlopVideo;
  same(plain(sv.presets.LIST).map((x) => [x.id, x.w, x.h]), plain(SV.presets.LIST).map((x) => [x.id, x.w, x.h]));
  assert.equal(sv.presets.get('phone').name, 'Mobil stående 1080×1920 (9:16)');
  assert.equal(plain(sv.presets.choices()).pop()[1], 'Egen bredd och höjd');
  assert.equal(sv.templates.get('three-up').name, 'Tre i rad');
  assert.equal(sv.templates.get('grid-2x2').desc, '4 rutor (2 × 2)');
  assert.equal(sv.templates.get('grid-1x1').desc, '1 ruta (1 × 1)');
});
