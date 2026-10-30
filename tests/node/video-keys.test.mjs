// Node tests for the keyframes of a slot (shared/video/keys.js): interpolation and easing through the shared motion
// engine, the pose hold at both ends, the key edits and the Animate in presets. Pure, loaded in a vm context.
// Run with: node tests/run.mjs video
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
const load = (file) => vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: path.basename(file) });
load(path.join(ROOT, 'shared', 'motion', 'easing.js'));
load(path.join(ROOT, 'shared', 'motion', 'track.js'));
load(path.join(ROOT, 'shared', 'video', 'seed.js'));
load(path.join(ROOT, 'shared', 'video', 'keys.js'));
const KF = ctx.SlopVideo.keys;
const M = ctx.SlopMotion.track;
const plain = (v) => JSON.parse(JSON.stringify(v));
const same = (actual, expected) => assert.deepStrictEqual(plain(actual), expected);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} to be ${b}`);
const key = (t, pose = {}, ease) => KF.make(t, pose, ease);

test('linear keys interpolate a value over time, and the end values hold outside the keys', () => {
  const keys = [key(0, { opacity: 0 }), key(1, { opacity: 1 })];
  near(KF.pose(keys, 0.5).opacity, 0.5);
  near(KF.pose(keys, 0.25).opacity, 0.25);
  near(KF.pose(keys, -3).opacity, 0);   // before the first key
  near(KF.pose(keys, 9).opacity, 1);    // after the last key
});

test('each easing shapes the segment that starts at its key, through the shared easing functions', () => {
  const mid = (ease) => KF.pose([key(0, { opacity: 0 }, ease), key(1, { opacity: 1 })], 0.5).opacity;
  near(mid('linear'), 0.5);
  near(mid('easeIn'), 0.25);      // quad in: t*t
  near(mid('easeOut'), 0.75);     // quad out: t*(2-t)
  near(mid('easeInOut'), 0.5);
  near(KF.pose([key(0, { opacity: 0 }, 'easeInOut'), key(1, { opacity: 1 })], 0.25).opacity, 0.125);
  // the same numbers as the shared engine's sampler
  const keys = [{ t: 0, value: 0, ease: 'easeOutQuad' }, { t: 1, value: 1 }];
  near(KF.pose([key(0, { opacity: 0 }, 'easeOut'), key(1, { opacity: 1 })], 0.3).opacity, M.sample(keys, 0.3));
});

test('the ease of a key belongs to the segment that starts at it, not the one that ends there', () => {
  const keys = [key(0, { x: 0 }, 'linear'), key(1, { x: 1 }, 'easeIn'), key(2, { x: 1 }, 'linear')];
  near(KF.pose(keys, 0.5).x, 0.5);            // first segment is linear
  near(KF.pose(keys, 1.5).x, 1);              // second segment is flat (same value)
  const back = [key(0, { x: 0 }, 'easeIn'), key(1, { x: 1 })];
  near(KF.pose(back, 0.5).x, 0.25);
});

test('the pose has all four properties, and a slot with no keys has no pose', () => {
  assert.equal(KF.pose([], 0.4), null);
  assert.equal(KF.pose(undefined, 0.4), null);
  const p = KF.pose([key(0, { x: -1, y: 2, scale: 2, rot: 90, opacity: 0.5 }), key(1)], 0);
  same(plain(p), { x: -1, y: 2, scale: 2, rot: 90, opacity: 0.5 });
  const mid = KF.pose([key(0, { x: -1, rot: 0 }), key(1, { x: 1, rot: 180 })], 0.5);
  near(mid.x, 0); near(mid.rot, 90);
});

test('keys are clamped to their limits and default the missing fields', () => {
  same(plain(KF.clampPose({ opacity: 3, scale: -1, x: 9 })), { x: 2, y: 0, scale: 0.1, rot: 0, opacity: 1 });
  same(plain(KF.clampPose({})), { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 });
  assert.equal(KF.make(-2, {}).t, 0);
  assert.equal(KF.make(1, {}, 'nonsense').ease, 'linear');
});

test('addAt puts a key in time order and replaces a key at the same time', () => {
  let keys = KF.addAt([], 1, { opacity: 0.2 }, 'easeIn');
  keys = KF.addAt(keys, 0.2, {}, 'linear');
  same(keys.map((k) => k.t), [0.2, 1]);
  keys = KF.addAt(keys, 1.0005, { opacity: 0.9 }, 'linear');
  assert.equal(keys.length, 2);
  near(keys[1].opacity, 0.9);
});

test('move keeps a key between its neighbours and inside the slot', () => {
  const keys = [key(0), key(0.5), key(1)];
  same(KF.move(keys, 1, 0.8, 1).map((k) => k.t), [0, 0.8, 1]);
  assert.equal(KF.move(keys, 1, 5, 1)[1].t, 0.99);  // capped by the next key (1) less a step
  assert.equal(KF.move(keys, 1, -1, 1)[1].t, 0.01); // floored by the previous key (0) plus a step
  assert.equal(KF.move([key(0.2), key(0.8)], 0, 0.9, 1)[0].t, 0.79);
});

test('remove and setEase change one key and leave the others', () => {
  const keys = [key(0), key(0.4), key(1)];
  same(KF.remove(keys, 1).map((k) => k.t), [0, 1]);
  assert.equal(KF.setEase(keys, 2, 'easeOut')[2].ease, 'easeOut');
  assert.equal(KF.setEase(keys, 2, 'bogus')[2].ease, 'linear');
  assert.equal(keys[2].ease, 'linear'); // the input is not changed
});

test('Animate in: fade, slides and zoom write keys over the first half second and keep later keys', () => {
  const fade = KF.animateIn([], 'fade', 4);
  same(fade.map((k) => k.t), [0, 0.5]);
  near(KF.pose(fade, 0).opacity, 0);
  near(KF.pose(fade, 0.25).opacity, 0.75); // ease out from the first key
  near(KF.pose(fade, 0.5).opacity, 1);
  near(KF.pose(fade, 3).opacity, 1);

  const left = KF.pose(KF.animateIn([], 'left', 4), 0);
  near(left.x, -1); near(KF.pose(KF.animateIn([], 'left', 4), 0.5).x, 0);
  near(KF.pose(KF.animateIn([], 'right', 4), 0).x, 1);
  near(KF.pose(KF.animateIn([], 'top', 4), 0).y, -1);
  near(KF.pose(KF.animateIn([], 'bottom', 4), 0).y, 1);
  near(KF.pose(KF.animateIn([], 'zoom', 4), 0).scale, 0.5);
  near(KF.pose(KF.animateIn([], 'zoom', 4), 0.5).scale, 1);

  const later = [key(1, { opacity: 0.3 })];
  const merged = KF.animateIn(later, 'fade', 4);
  same(merged.map((k) => k.t), [0, 0.5, 1]);
  near(KF.pose(merged, 2).opacity, 0.3);

  same(KF.animateIn([], 'fade', 0.3).map((k) => k.t), [0, 0.3]); // a short slot ends at its end
  same(KF.animateIn([], 'nope', 4), []);
});

test('the store: get, put and prune keep one entry per cut and slot', () => {
  let store = KF.put([], 1, 0, [key(0), key(1)]);
  assert.equal(KF.get(store, 1, 0).length, 2);
  same(KF.get(store, 0, 0), []);
  store = KF.put(store, 1, 0, []);
  assert.equal(store.length, 0);
  store = KF.put(KF.put([], 0, 1, [key(0)]), 3, 0, [key(0)]);
  same(KF.prune(store, 2).map((e) => [e.cut, e.slot]), [[0, 1]]);
});

test('the functions do not change their input', () => {
  const keys = [key(0, { x: 0 }), key(1, { x: 1 })];
  const before = JSON.stringify(keys);
  KF.move(keys, 0, 0.5, 1); KF.remove(keys, 0); KF.setEase(keys, 0, 'easeIn'); KF.addAt(keys, 0.5, {}, 'linear'); KF.animateIn(keys, 'fade', 2);
  assert.equal(JSON.stringify(keys), before);
});

test('the ease and Animate in lists: ids stay, labels come from the ui tables (Swedish too)', async () => {
  const { context, plain: copy } = await import('./ui-tables-env.mjs');
  same(KF.EASES.map((e) => e[0]), ['linear', 'easeIn', 'easeOut', 'easeInOut']);
  same(KF.ANIMATE.map((a) => a[0]), ['fade', 'left', 'right', 'top', 'bottom', 'zoom']);
  const sv = context(['shared/motion/easing.js', 'shared/motion/track.js', 'shared/video/seed.js', 'shared/video/keys.js'], 'sv').SlopVideo.keys;
  assert.equal(copy(sv.EASES).find((e) => e[0] === 'easeIn')[1], 'Mjuk in');
  assert.equal(copy(sv.ANIMATE).find((a) => a[0] === 'left')[1], 'Glid in från vänster');
  same(copy(sv.ANIMATE).find((a) => a[0] === 'zoom')[2], { scale: 0.5 });
});
