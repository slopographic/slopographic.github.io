// Node tests for SlopCut's selection rules (slopcut/js/core/pick.js), picture placement maths (slopcut/js/core/fit.js)
// and moving several clips at once (slopcut/js/core/edit.js E.move keeps their relative timing). Loaded in a vm context
// so the browser files run unchanged. Covers: slopcut/js/core/pick.js, slopcut/js/core/fit.js
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
for (const f of ['shared/video/presets.js', 'slopcut/js/core/util.js', 'slopcut/js/core/model.js', 'slopcut/js/core/edit.js', 'slopcut/js/core/pick.js', 'slopcut/js/core/fit.js']) {
  vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const { SE } = ctx, P = SE.pick, F = SE.fit, M = SE.model, E = SE.edit;
const ids = (a) => JSON.parse(JSON.stringify(a)).sort(); // arrays from the vm realm, compared by value
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('a plain click selects the clip alone; Shift adds; Ctrl/Cmd toggles; Select mode toggles without a key', () => {
  assert.deepEqual(ids(P.click(['a', 'b'], ['c'])), ['c']);
  assert.deepEqual(ids(P.click(['a'], ['c'], { shift: true })), ['a', 'c']);
  assert.deepEqual(ids(P.click(['a', 'c'], ['c'], { shift: true })), ['a', 'c']);
  assert.deepEqual(ids(P.click(['a', 'c'], ['c'], { ctrl: true })), ['a']);
  assert.deepEqual(ids(P.click(['a'], ['c'], { ctrl: true })), ['a', 'c']);
  assert.deepEqual(ids(P.click(['a'], ['c'], { multi: true })), ['a', 'c']);
  assert.deepEqual(ids(P.click(['a', 'c'], ['c'], { multi: true })), ['a']);
});

test('a linked group (video and its sound) is selected and toggled as one', () => {
  assert.deepEqual(ids(P.click([], ['v', 's'])), ['s', 'v']);
  assert.deepEqual(ids(P.click(['v', 's', 'x'], ['v', 's'], { ctrl: true })), ['x']);
  assert.deepEqual(ids(P.click(['v', 'x'], ['v', 's'], { ctrl: true })), ['s', 'v', 'x']); // half selected: the toggle adds the rest
});

test('a plain press on a clip of a multi-selection keeps it for a drag (the tap-to-select-one happens on lift)', () => {
  assert.equal(P.keepsForDrag(['a', 'b'], ['b']), true);
  assert.equal(P.keepsForDrag(['a'], ['b']), false);
  assert.equal(P.keepsForDrag(['a', 'b'], ['b'], { shift: true }), false);
});

test('a selection box takes every clip it touches, across tracks, and adds to a base', () => {
  const rects = [{ id: 'v1', x: 0, y: 40, w: 100, h: 50 }, { id: 'v2', x: 120, y: 40, w: 100, h: 50 }, { id: 'a1', x: 50, y: 100, w: 100, h: 40 }, { id: 'far', x: 400, y: 40, w: 50, h: 50 }];
  const b = P.box({ x: 90, y: 120 }, { x: 130, y: 60 });
  assert.deepEqual(JSON.parse(JSON.stringify(b)), { x: 90, y: 60, w: 40, h: 60 });
  assert.deepEqual(ids(P.inBox(rects, b)), ['a1', 'v1', 'v2']);
  assert.deepEqual(ids(P.marquee(['far'], rects, P.box({ x: 0, y: 0 }, { x: 10, y: 50 }))), ['far', 'v1']);
  assert.deepEqual(ids(P.inBox(rects, P.box({ x: 230, y: 0 }, { x: 390, y: 200 }))), []); // between clips: none
});

test('Fill frame covers the frame exactly, aspect kept; Fit frame contains it', () => {
  const frame = { w: 1920, h: 1080 }, portrait = { w: 1080, h: 1920 };
  const fill = F.frame(frame, portrait, {}, 'fill');
  const base = Math.min(1920 / 1080, 1080 / 1920); // scale 1: the whole picture fits
  const s = base * fill.scale;                     // output px per source px
  assert.ok(near(1080 * s, 1920, 1e-3), 'the picture is exactly as wide as the frame');
  assert.ok(1920 * s >= 1080, 'and at least as tall');
  assert.ok(near(fill.scale, (1920 / 1080) / (1080 / 1920), 1e-5));
  assert.equal(fill.x, 0); assert.equal(fill.y, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(F.frame(frame, portrait, {}, 'fit'))), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(F.frame(frame, { w: 3840, h: 2160 }, {}, 'fill'))), { scale: 1, x: 0, y: 0 }); // same ratio
});

test('Fill frame with a crop fills with the visible part and centres it', () => {
  const frame = { w: 1000, h: 1000 }, src = { w: 1000, h: 1000 };
  const r = F.frame(frame, src, { l: 0.5 }, 'fill'); // only the right half shows: 500 × 1000 visible
  const s = Math.min(1, 1) * r.scale;
  assert.ok(near(500 * s, 1000), 'the visible half spans the frame width');
  assert.ok(near(r.x, -(0.5 / 2) * 1000 * s), 'and its centre is moved to the frame centre');
  assert.ok(near(r.x + (0.25 * 1000) * s, 0), 'the visible box centre lands at x 0');
});

test('SE.fit.clip places a clip (rotation reset); a clip without a picture size spans the frame at scale 1', () => {
  const p = { w: 1920, h: 1080 };
  const c = F.clip(p, { scale: 3, x: 5, y: 6, rot: 30, cropL: 0, cropT: 0, cropR: 0, cropB: 0 }, { w: 1080, h: 1080 }, 'fill');
  assert.ok(near(c.scale, 1920 / 1080, 1e-5)); assert.equal(c.rot, 0); assert.equal(c.x, 0);
  const t = F.clip(p, { scale: 3, x: 5, y: 6, rot: 30 }, null, 'fill');
  assert.equal(t.scale, 1); assert.equal(t.x, 0);
});

test('scale reaches 1000 % on the slider and 100 000 % in the field; the slider is logarithmic', () => {
  assert.equal(F.SCALE.max, 1000);
  assert.equal(F.clampScale(50), 50); assert.equal(F.clampScale(5000), 1000); assert.equal(F.clampScale(0), 1);
  assert.equal(F.toSlider(0.01), 0); assert.equal(F.toSlider(20), F.SCALE.steps); assert.equal(F.toSlider(500), F.SCALE.steps);
  assert.ok(near(F.fromSlider(F.toSlider(10)), 10, 0.15), '1000 % is on the track');
  assert.ok(near(F.fromSlider(F.toSlider(1)), 1, 0.02), '100 % too');
  assert.ok(F.toSlider(1) > F.SCALE.steps / 2 && F.toSlider(1) < F.SCALE.steps * 0.7, '100 % sits past the middle (log)');
  for (let i = 1; i <= F.SCALE.steps; i += 37) assert.ok(F.fromSlider(i) >= F.fromSlider(i - 37 > 0 ? i - 37 : 0));
});

test('moving several selected clips keeps their relative timing (and tracks)', () => {
  const p = M.newProject(), [v1, v2] = M.videoTracks(p).length > 1 ? M.videoTracks(p) : [M.videoTracks(p)[0], M.addTrack(p, 'video')];
  const a = E.addGenerated(p, 'color', v1.id, 1, 2), b = E.addGenerated(p, 'color', v2.id, 4, 1.5), c = E.addGenerated(p, 'color', v1.id, 6, 1);
  assert.equal(E.move(p, [a, b], 2.5), true);
  assert.ok(near(M.clip(p, a).start, 3.5)); assert.ok(near(M.clip(p, b).start, 6.5));
  assert.ok(near(M.clip(p, b).start - M.clip(p, a).start, 3), 'the gap between them is kept');
  assert.equal(M.clip(p, b).track, v2.id); assert.equal(M.clip(p, a).track, v1.id);
  // moving left past 0: the whole selection stops at 0 together
  E.move(p, [a, b], -10);
  assert.ok(near(M.clip(p, a).start, 0)); assert.ok(near(M.clip(p, b).start, 3));
  assert.ok(M.clip(p, c), 'the unselected clip is still there');
});
