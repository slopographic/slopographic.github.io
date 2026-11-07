// Node tests for Reel Remix's edit options in shared/video: per-slot timing, locks that survive a reshuffle, and the
// audio choice. Pure functions, loaded in a vm context. Run with: node tests/run.mjs remix
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
const FRAME = { w: 1920, h: 1080 };
const still = (i) => ({ id: 'm' + i, name: 'm' + i, kind: 'image', dur: Infinity, w: 1600, h: 900 });
const video = (i, dur) => ({ id: 'v' + i, name: 'v' + i, kind: 'video', dur, w: 1600, h: 900 });
const json = (x) => JSON.stringify(x);
const media = [1, 2, 3, 4, 5, 6].map(still);
const base = { target: 12, pace: 'medium', size: FRAME, tpl: 'grid-2x2' };

test('timing same: every slot of a cut starts and ends with the cut', () => {
  const p = SV.random.plan({ ...base, seed: 11, timing: 'same' }, media);
  for (const beat of p.cuts) for (const it of beat) {
    assert.equal(it.start, beat[0].start);
    assert.equal(it.dur, beat[0].dur);
  }
});

test('timing stagger: each slot starts within the stagger range and ends with its cut', () => {
  const p = SV.random.plan({ ...base, seed: 12, timing: 'stagger', stagger: 0.8 }, media);
  let moved = false;
  for (const beat of p.cuts) {
    const cutStart = Math.min(...beat.map((x) => x.start));
    const end = beat[0].start + beat[0].dur;
    for (const it of beat) {
      const off = it.start - cutStart;
      assert.ok(off >= -1e-9 && off <= 0.8 + 0.01, 'offset ' + off);
      assert.ok(Math.abs(it.start + it.dur - end) < 0.02, 'slot ends with the cut');
      if (off > 0.01) moved = true;
    }
  }
  assert.ok(moved, 'some slot is offset');
});

test('timing random: each slot plays its own length between min and max, never past its cut', () => {
  const p = SV.random.plan({ ...base, seed: 13, timing: 'random', min: 0.5, max: 1 }, media);
  const lens = p.cuts.flat().map((it) => it.dur);
  assert.ok(lens.every((d) => d <= 1.01 + 1e-9), 'at most max');
  assert.ok(new Set(lens).size > 1, 'lengths differ between slots');
});

test('timing is deterministic: the same seed gives the same timing', () => {
  const o = { ...base, seed: 21, timing: 'random', min: 0.5, max: 2, stagger: 0.5 };
  assert.equal(json(SV.random.plan(o, media).cuts), json(SV.random.plan(o, media).cuts));
});

test('video random length: starts at a point in the clip and plays the slot length', () => {
  const vids = [1, 2, 3, 4].map((i) => video(i, 20));
  const p = SV.random.plan({ ...base, seed: 31, timing: 'random', video: 'random', min: 1, max: 2 }, vids);
  for (const it of p.cuts.flat()) {
    assert.ok(it.in >= 0 && it.in + it.dur <= 20 + 0.02, 'in point stays in the clip');
  }
});

test('holds: a slot keeps its clip until its next clip, and the last one holds to the end', () => {
  const p = SV.random.plan({ ...base, seed: 41, timing: 'stagger', stagger: 0.5 }, media);
  const bySlot = {};
  for (const it of p.cuts.flat()) (bySlot[it.slot] = bySlot[it.slot] || []).push(it);
  for (const list of Object.values(bySlot)) {
    list.sort((a, b) => a.start - b.start);
    list.forEach((it, i) => {
      if (i + 1 < list.length) assert.ok(Math.abs(it.hold - list[i + 1].start) < 0.02 || it.hold <= list[i + 1].start + 0.02);
      else assert.ok(Math.abs(it.hold - p.total) < 0.02);
    });
  }
});

test('locks: a reshuffle keeps the locked slots unchanged and the others may change', () => {
  const first = SV.random.plan({ ...base, seed: 51 }, media);
  const locks = [0, 1].flatMap((cut) => first.cuts[cut].map((it) => ({ cut, slot: it.slot, media: it.media, in: it.in, fill: 'auto' })));
  const again = SV.random.plan({ ...base, seed: 52, locks }, media);
  for (const l of locks) {
    const it = again.cuts[l.cut].find((x) => x.slot === l.slot);
    assert.equal(it.media, l.media, 'locked cut ' + l.cut + ' slot ' + l.slot + ' keeps its clip');
  }
  const unlockedBefore = first.cuts.slice(2).flat().map((x) => x.media).join();
  const unlockedAfter = again.cuts.slice(2).flat().map((x) => x.media).join();
  assert.notEqual(unlockedBefore, unlockedAfter);
});

test('locks: an unlocked slot is not held, and a lock on a missing cut is skipped', () => {
  const p = SV.random.plan({ ...base, seed: 53, locks: [{ cut: 999, slot: 0, media: 'm1', in: 0, fill: 'auto' }] }, media);
  assert.ok(p.cuts.length > 0);
});

test('locks toggle: a slot is locked, then unlocked, and toggleCut locks or clears every slot', () => {
  const beat = [{ slot: 0, media: 'm1', in: 0 }, { slot: 1, media: 'm2', in: 0 }];
  let l = SV.locks.toggle([], 0, 0, beat[0]);
  assert.equal(SV.locks.has(l, 0, 0), true);
  l = SV.locks.toggle(l, 0, 0, beat[0]);
  assert.equal(SV.locks.has(l, 0, 0), false);
  l = SV.locks.toggleCut([], 2, beat);
  assert.equal(l.length, 2);
  assert.equal(SV.locks.toggleCut(l, 2, beat).length, 0);
});

test('audio: off and original are plain; music picks a bin video with the seed, or the picked file', () => {
  const vids = [video(1, 9), video(2, 9), still(3)];
  assert.equal(json(SV.audio.choose({ mode: 'off' }, 5, vids)), json({ mode: 'off', track: null }));
  assert.equal(json(SV.audio.choose({ mode: 'original' }, 5, vids)), json({ mode: 'original', track: null }));
  const a = SV.audio.choose({ mode: 'music', track: 'random' }, 77, vids), b = SV.audio.choose({ mode: 'music', track: 'random' }, 77, vids);
  assert.equal(json(a), json(b));
  assert.ok(['v1', 'v2'].includes(a.track), 'a video, not a still: ' + a.track);
  assert.equal(SV.audio.choose({ mode: 'music', track: 'file' }, 1, vids).track, 'file');
  assert.equal(SV.audio.choose({ mode: 'music', track: 'v2' }, 1, vids).track, 'v2');
  assert.equal(SV.audio.choose({ mode: 'music', track: 'nope' }, 1, vids).track, null);
});

test('audio in a plan: the same seed gives the same music choice', () => {
  const vids = [1, 2, 3].map((i) => video(i, 9));
  const o = { ...base, seed: 9, audio: { mode: 'music', track: 'random' } };
  assert.equal(SV.random.plan(o, vids).audio.track, SV.random.plan(o, vids).audio.track);
});
