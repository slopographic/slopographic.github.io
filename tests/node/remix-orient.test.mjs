// Node tests for the orientation choice in shared/video (SlopVideo.orient): clip orientation, grids that suit the
// clips, the order of clips in cells, the fill mode, and the plan that uses them. Loaded in a vm context.
// Run with: node tests/run.mjs remix
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
const SV = ctx.SlopVideo, O = SV.orient;
const LAND = { id: 'L', name: 'L', kind: 'image', dur: Infinity, w: 1600, h: 900 };   // 16:9
const PORT = { id: 'P', name: 'P', kind: 'image', dur: Infinity, w: 900, h: 1200 };   // 3:4
const SQ = { id: 'S', name: 'S', kind: 'image', dur: Infinity, w: 1000, h: 1000 };
const FRAME = { w: 1920, h: 1080 };
const GRIDS = ['grid-1x2', 'grid-2x2', 'grid-1x3', 'grid-2x3', 'grid-3x3'];
// vm arrays and objects come from another realm, so compare them as JSON.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('orientation: landscape, portrait and square from the size; unknown sizes are null', () => {
  assert.equal(O.of(LAND), 'landscape');
  assert.equal(O.of(PORT), 'portrait');
  assert.equal(O.of(SQ), 'square');
  assert.equal(O.of({ w: 1000, h: 1050 }), 'square');
  assert.equal(O.of({ w: 0, h: 0 }), null);
  assert.equal(O.of({ kind: 'video', dur: 4 }), null);
});

test('mixed is true only when more than one orientation is present', () => {
  assert.equal(O.mixed([LAND, LAND]), false);
  assert.equal(O.mixed([LAND, PORT]), true);
  assert.equal(O.mixed([{ dur: 1 }, LAND]), false);
});

test('prefer: portrait clips in a landscape frame keep the narrow grids (1x3 and 1x2), not the 2x2 or 3x3', () => {
  const kept = O.prefer(GRIDS, FRAME, [PORT, PORT]);
  assert.ok(kept.includes('grid-1x3'));
  assert.ok(kept.includes('grid-1x2'));
  assert.ok(!kept.includes('grid-2x2'));
  assert.ok(!kept.includes('grid-3x3'));
});

test('prefer: landscape clips keep the wide-celled grids (2x2 and 3x3)', () => {
  const kept = O.prefer(GRIDS, FRAME, [LAND, LAND, LAND]);
  same(kept, ['grid-2x2', 'grid-3x3']);
});

test('prefer: no sized clips or no frame size leaves the list as it was', () => {
  same(O.prefer(GRIDS, FRAME, [{ dur: 2 }]), GRIDS);
  same(O.prefer(GRIDS, null, [LAND]), GRIDS);
  same(O.prefer(GRIDS, FRAME, []), GRIDS);
});

test('assign: each clip goes to the cell whose shape it suits, and unknown clips keep their order', () => {
  const tall = { w: 900, h: 1600 }, wide = { w: 1600, h: 900 };
  same(O.assign([tall, wide], [1.78, 0.4]), [wide, tall]);
  same(O.assign([{ dur: 1 }, { dur: 2 }], [1, 1]), [{ dur: 1 }, { dur: 2 }]);
});

test('fill: auto is cover for one orientation and blur when orientations mix; explicit modes win', () => {
  assert.equal(O.resolve('auto', false), 'cover');
  assert.equal(O.resolve('auto', true), 'blur');
  assert.equal(O.resolve('fit', true), 'fit');
  assert.equal(O.resolve('stretch', false), 'stretch');
  assert.equal(O.resolve(undefined, true), 'blur');
});

test('the plan with portrait clips draws only the narrow grids, and is deterministic for a seed', () => {
  const media = [1, 2, 3, 4].map((i) => ({ ...PORT, id: 'p' + i, name: 'p' + i }));
  const opts = { seed: 7, target: 30, pace: 'medium', size: FRAME, switches: true, layouts: GRIDS };
  const a = SV.random.plan(opts, media), b = SV.random.plan(opts, media);
  assert.equal(JSON.stringify(a.cuts), JSON.stringify(b.cuts));
  assert.ok(a.segments.length >= 2);
  for (const s of a.segments) assert.ok(['grid-1x2', 'grid-1x3'].includes(s.layout), 'layout ' + s.layout);
  assert.equal(a.mixed, false);
  assert.equal(a.fill, 'auto');
});

test('the plan records the fill and whether the clips are mixed; the fill option is kept', () => {
  const media = [LAND, PORT, SQ].map((m, i) => ({ ...m, id: 'm' + i, name: 'm' + i }));
  const plan = SV.random.plan({ seed: 3, target: 10, pace: 'medium', size: FRAME, tpl: 'grid-2x2', fill: 'fit' }, media);
  assert.equal(plan.mixed, true);
  assert.equal(plan.fill, 'fit');
});
