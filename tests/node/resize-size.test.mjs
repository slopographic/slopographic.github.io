// Slop Resize's size maths (resize/js/core/size.js) and names (resize/js/core/format.js): fit, cover, stretch, within,
// aspect ratio, percentage, long edge, even rounding for video, limits and presets. Runs the real scripts in a vm.
// Run: node tests/run.mjs resize   (or node --test tests/node/resize-size.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'resize', 'js', 'core');
for (const f of ['size.js', 'format.js']) vm.runInThisContext(readFileSync(path.join(root, f), 'utf8'), { filename: f });
const S = globalThis.SlopResize.size, F = globalThis.SlopResize.format;
const box = (w, h, extra = {}) => ({ mode: 'size', w, h, keepRatio: true, fill: 'fit', ...extra });

test('fit letterboxes a 1000×500 picture into a 500×500 box, centred', () => {
  const d = S.dims({ w: 1000, h: 500 }, box(500, 500));
  assert.deepEqual(d, { w: 500, h: 500, x: 0, y: 125, dw: 500, dh: 250, fill: 'fit' });
});

test('fit puts the letterbox where the anchor says', () => {
  const top = S.dims({ w: 1000, h: 500 }, box(500, 800, { anchor: 'top' }));
  const centre = S.dims({ w: 1000, h: 500 }, box(500, 800));
  assert.equal(top.y, 0);
  assert.equal(centre.y, 275);
  assert.equal(top.dh, 250);
});

test('cover fills a 500×500 box from a 1000×500 picture and crops the sides, centred', () => {
  const d = S.dims({ w: 1000, h: 500 }, box(500, 500, { fill: 'cover' }));
  assert.deepEqual(d, { w: 500, h: 500, x: -250, y: 0, dw: 1000, dh: 500, fill: 'cover' });
});

test('cover keeps the anchored side', () => {
  assert.equal(S.dims({ w: 1000, h: 500 }, box(500, 500, { fill: 'cover', anchor: 'left' })).x, 0);
  assert.equal(S.dims({ w: 1000, h: 500 }, box(500, 500, { fill: 'cover', anchor: 'right' })).x, -500);
  assert.equal(S.dims({ w: 1000, h: 500 }, box(500, 500, { fill: 'cover', anchor: 'bottom-left' })).y, 0);
});

test('cover of a tall picture crops top and bottom', () => {
  const d = S.dims({ w: 500, h: 1000 }, box(400, 300, { fill: 'cover' }));
  assert.equal(d.dw, 400);
  assert.equal(d.dh, 800);
  assert.equal(d.y, -250);
  assert.equal(d.x, 0);
});

test('stretch and keepRatio off both draw across the whole box and ignore the picture ratio', () => {
  for (const spec of [box(500, 500, { fill: 'stretch' }), box(500, 500, { keepRatio: false, fill: 'fit' })]) {
    const d = S.dims({ w: 1000, h: 500 }, spec);
    assert.deepEqual([d.w, d.h, d.x, d.y, d.dw, d.dh, d.fill], [500, 500, 0, 0, 500, 500, 'none']);
  }
  const d = S.dims({ w: 1000, h: 500 }, box(600, 200, { keepRatio: false }));
  assert.deepEqual([d.w, d.h], [600, 200]);
});

test('one side given: the other follows the picture ratio', () => {
  assert.deepEqual(S.dims({ w: 1000, h: 500 }, box(500, 0)), { w: 500, h: 250, x: 0, y: 0, dw: 500, dh: 250, fill: 'none' });
  assert.deepEqual([S.dims({ w: 1000, h: 500 }, box(0, 250)).w, S.dims({ w: 1000, h: 500 }, box(0, 250)).h], [500, 250]);
});

test('one side given with keepRatio off keeps the other side from the picture', () => {
  const d = S.dims({ w: 1000, h: 500 }, box(300, 0, { keepRatio: false }));
  assert.deepEqual([d.w, d.h], [300, 500]);
});

test('within shrinks to the picture inside the box, with no padding', () => {
  const d = S.dims({ w: 1000, h: 500 }, box(500, 500, { fill: 'within' }));
  assert.deepEqual([d.w, d.h, d.fill], [500, 250, 'none']);
  assert.deepEqual([d.dw, d.dh, d.x, d.y], [500, 250, 0, 0]);
});

test('a fit or cover output keeps the picture proportions (aspect)', () => {
  for (const [sw, sh, bw, bh] of [[1920, 1080, 500, 500], [640, 480, 1080, 1920], [3000, 2000, 333, 777], [1, 9, 300, 200]]) {
    for (const fill of ['fit', 'cover']) {
      const d = S.dims({ w: sw, h: sh }, box(bw, bh, { fill }));
      assert.ok(Math.abs(d.dw / d.dh - sw / sh) < 0.01, `${fill} ${sw}x${sh} into ${bw}x${bh}`);
    }
  }
});

test('percentage and long edge keep the ratio', () => {
  assert.deepEqual([S.dims({ w: 1000, h: 500 }, { mode: 'scale', scale: 50 }).w, S.dims({ w: 1000, h: 500 }, { mode: 'scale', scale: 50 }).h], [500, 250]);
  const p = S.dims({ w: 1001, h: 333 }, { mode: 'scale', scale: 25 });
  assert.deepEqual([p.w, p.h], [250, 83]);
  const l = S.dims({ w: 4000, h: 3000 }, { mode: 'long', long: 1920 });
  assert.deepEqual([l.w, l.h], [1920, 1440]);
  const up = S.dims({ w: 100, h: 50 }, { mode: 'long', long: 400 });
  assert.deepEqual([up.w, up.h], [400, 200]);
});

test('no box at all keeps the source size', () => {
  const d = S.dims({ w: 640, h: 480 }, { mode: 'size', w: 0, h: 0 });
  assert.deepEqual([d.w, d.h, d.fill], [640, 480, 'none']);
});

test('the bytes mode uses the same box as size (the file limit is applied by the encoder)', () => {
  const a = S.dims({ w: 1000, h: 500 }, { mode: 'bytes', w: 500, h: 500, fill: 'cover', maxBytes: 102400 });
  const b = S.dims({ w: 1000, h: 500 }, { mode: 'size', w: 500, h: 500, fill: 'cover' });
  assert.deepEqual(a, b);
  assert.equal(S.normalize({ mode: 'bytes', maxBytes: 102400 }).maxBytes, 102400);
});

test('video rounds both sides to even numbers when asked (opts.even or spec.even)', () => {
  const odd = S.dims({ w: 1001, h: 563 }, { mode: 'scale', scale: 100 });
  assert.deepEqual([odd.w, odd.h], [1001, 563]);
  const even = S.dims({ w: 1001, h: 563 }, { mode: 'scale', scale: 100 }, { even: true });
  assert.deepEqual([even.w, even.h], [1002, 564]);
  const viaSpec = S.dims({ w: 1001, h: 563 }, { mode: 'scale', scale: 100, even: true });
  assert.deepEqual([viaSpec.w, viaSpec.h], [1002, 564]);
  const cover = S.dims({ w: 1000, h: 500 }, box(333, 333, { fill: 'cover' }), { even: true });
  assert.deepEqual([cover.w, cover.h], [334, 334]);
  assert.equal(S.even(1), 2);
  assert.equal(S.even(3), 4);
});

test('within with even rounding never grows past the box (it rounds down)', () => {
  const d = S.dims({ w: 1000, h: 500 }, box(501, 501, { fill: 'within' }), { even: true });
  assert.ok(d.w <= 501 && d.h <= 501);
  assert.deepEqual([d.w, d.h], [500, 250]);
});

test('sizes that cannot be made are refused, and a picture with no size is refused', () => {
  assert.throws(() => S.dims({ w: 1, h: 1 }, box(20000, 20000, { keepRatio: false })), /too large/);
  assert.throws(() => S.dims({ w: 1, h: 1 }, box(9000, 9000, { keepRatio: false }), { max: 8192 }), /too large/);
  assert.throws(() => S.dims({ w: 0, h: 10 }, box(5, 5)), /no size/);
});

test('normalize fills in defaults and drops values it does not know', () => {
  const n = S.normalize({ mode: 'nope', fill: 'blur', anchor: 'middle', bg: '#ABC', scale: 0, w: '640', h: -3 });
  assert.equal(n.mode, 'size');
  assert.equal(n.fill, 'fit');
  assert.equal(n.anchor, 'center');
  assert.equal(n.bg, 'transparent');
  assert.equal(n.scale, 1);
  assert.equal(n.w, 640);
  assert.equal(n.h, 0);
  assert.equal(S.normalize({ bg: '#A1B2C3' }).bg, '#a1b2c3');
});

test('size presets are unique, positive, and follow a side when the height is 0', () => {
  const ids = new Set();
  for (const p of S.PRESETS) {
    assert.ok(!ids.has(p.id), 'duplicate id ' + p.id);
    ids.add(p.id);
    assert.ok(Number.isInteger(p.w) && p.w > 0, p.id);
    assert.ok(Number.isInteger(p.h) && p.h >= 0, p.id);
  }
  for (const id of ['sq1080', 'story', 'fhd', 'uhd', 'og', 'icon', 'email-banner']) assert.ok(S.presetById(id), id);
  assert.equal(S.presetById('email-width').h, 0);
  const d = S.dims({ w: 1200, h: 800 }, S.applyPreset(S.presetById('email-width')));
  assert.deepEqual([d.w, d.h], [600, 400]);
});

test('output names and sizes read clearly', () => {
  assert.equal(F.outName('holiday.photo.jpg', 500, 500, 'webp'), 'holiday.photo-500x500.webp');
  assert.equal(F.outName('.hidden', 2, 2, 'png'), '.hidden-2x2.png');
  assert.equal(F.kind({ type: 'image/png', name: 'a.png' }), 'image');
  assert.equal(F.kind({ type: '', name: 'clip.MOV' }), 'video');
  assert.equal(F.kind({ type: 'text/plain', name: 'a.txt' }), null);
  assert.equal(F.bytes(512), '512 B');
  assert.equal(F.bytes(2048), '2 KB');
  assert.equal(F.bytes(5 * 1048576), '5.00 MB');
  assert.equal(F.bytes(20 * 1048576), '20.0 MB');
});

test('the keep-ratio lock derives the other side from the typed value only, and even rounds it', () => {
  const r = 2; // a 1000 × 500 picture
  assert.equal(S.lockSide('w', 500, r, false), 250);
  assert.equal(S.lockSide('h', 333, r, false), 666);
  assert.equal(S.lockSide('w', 1001, r, false), 501); // 500.5 rounds up, once
  assert.equal(S.lockSide('w', 1001, r, true), 500); // even: 500 (not 501)
  assert.equal(S.lockSide('w', 0, r, false), 0); // nothing typed: nothing to derive
  assert.equal(S.lockSide('w', 500, 0, false), 0); // no picture: no ratio
});

test('resample is best by default, and nearest only when asked', () => {
  assert.equal(S.normalize({}).resample, 'best');
  assert.equal(S.normalize({ resample: 'nearest' }).resample, 'nearest');
  assert.equal(S.normalize({ resample: 'bogus' }).resample, 'best');
});

test('the aspect lock leaves a Fit or Cover box alone and follows the picture for Fit inside and Stretch', () => {
  assert.equal(S.locksBox('fit'), false);
  assert.equal(S.locksBox('cover'), false);
  assert.equal(S.locksBox('within'), true);
  assert.equal(S.locksBox('stretch'), true);
});

test('the Square 1080 preset makes exactly 1080 × 1080 from a landscape photo: fit letterboxes, cover crops', () => {
  const sq = S.applyPreset(S.presetById('sq1080'));
  const fit = S.dims({ w: 1500, h: 1000 }, sq);
  assert.deepEqual(fit, { w: 1080, h: 1080, x: 0, y: 180, dw: 1080, dh: 720, fill: 'fit' });
  const cover = S.dims({ w: 1500, h: 1000 }, { ...sq, fill: 'cover' });
  assert.deepEqual(cover, { w: 1080, h: 1080, x: -270, y: 0, dw: 1620, dh: 1080, fill: 'cover' });
  const portrait = S.dims({ w: 1000, h: 1500 }, { ...S.applyPreset(S.presetById('fhd')), fill: 'cover', anchor: 'top' });
  assert.deepEqual([portrait.w, portrait.h, portrait.y, portrait.dw], [1920, 1080, 0, 1920]);
});

test('plain keep aspect still scales: one side at 0 follows the picture, Fit inside shrinks to its shape', () => {
  assert.deepEqual([S.dims({ w: 1500, h: 1000 }, box(750, 0)).w, S.dims({ w: 1500, h: 1000 }, box(750, 0)).h], [750, 500]);
  assert.deepEqual([S.dims({ w: 1500, h: 1000 }, box(0, 400)).w, S.dims({ w: 1500, h: 1000 }, box(0, 400)).h], [600, 400]);
  const w = S.dims({ w: 1500, h: 1000 }, box(1080, 1080, { fill: 'within' }));
  assert.deepEqual([w.w, w.h, w.fill], [1080, 720, 'none']);
});
