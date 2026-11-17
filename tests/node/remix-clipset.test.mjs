// Node tests for Reel Remix's clip settings (shared/video, SlopVideo.clipset): a photo with a random range stays in
// its range, photo windows and edges, video modes, and per-clip overrides. Run with: node tests/run.mjs remix
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
const SV = ctx.SlopVideo, CS = SV.clipset;
const FRAME = { w: 1920, h: 1080 };
const still = (i) => ({ id: 'm' + i, name: 'm' + i, kind: 'image', dur: Infinity, w: 1600, h: 900 });
const video = (i, dur) => ({ id: 'v' + i, name: 'v' + i, kind: 'video', dur, w: 1600, h: 900 });
const photos = [1, 2, 3, 4, 5, 6].map(still);
const base = { target: 20, pace: 'medium', size: FRAME, tpl: 'grid-2x2' };

test('a photo slot with a random range stays within the range, and varies', () => {
  for (const seed of [1, 2, 3, 99]) {
    const p = SV.random.plan({ ...base, seed, photo: { show: 'range', min: 2, max: 3 } }, photos);
    const shows = p.cuts.flat().map((it) => it.dur);
    assert.ok(shows.every((d) => d >= 2 - 1e-9 && d <= 3 + 1e-9), 'seed ' + seed + ': ' + shows.join(','));
    assert.ok(new Set(shows).size > 1, 'the range is drawn, not fixed');
  }
});

test('a random range is deterministic for a seed', () => {
  const o = { ...base, seed: 7, photo: { show: 'range', min: 1, max: 4 } };
  assert.equal(JSON.stringify(SV.random.plan(o, photos).cuts), JSON.stringify(SV.random.plan(o, photos).cuts));
});

test('a fixed photo time sets each photo window', () => {
  const p = SV.random.plan({ ...base, seed: 4, photo: { show: 'fixed', sec: 1.5 } }, photos);
  assert.ok(p.cuts.flat().every((it) => it.dur === 1.5));
});

test('photo window and edges are kept on the item', () => {
  const p = SV.random.plan({ ...base, seed: 5, photo: { from: 2, to: 9, enter: 'fade', exit: 'slide' } }, photos);
  for (const it of p.cuts.flat()) {
    assert.equal(it.from, 2);
    assert.equal(it.to, 9);
    assert.equal(it.enter, 'fade');
    assert.equal(it.exit, 'slide');
  }
});

test('video modes: full, trim (start to stop), speed, and loop', () => {
  assert.equal(CS.videoTime({ mode: 'full' }, 3, 10), 3);
  assert.equal(CS.videoTime({ mode: 'full' }, 12, 10), 10);
  assert.equal(CS.videoTime({ mode: 'trim', start: 2, stop: 5 }, 1, 10), 3);
  assert.equal(CS.videoTime({ mode: 'trim', start: 2, stop: 5 }, 9, 10), 5);
  assert.equal(CS.videoTime({ mode: 'speed', speed: 2 }, 3, 10), 6);
  assert.equal(CS.videoTime({ mode: 'loop' }, 12, 10), 2);
});

test('an override on a clip replaces the defaults for that clip only', () => {
  const vids = [video(1, 30), video(2, 30)];
  const p = SV.random.plan({ ...base, seed: 6, clipVideo: { mode: 'full' }, overrides: { 'm:v1': { video: { mode: 'loop' } } } }, vids);
  for (const it of p.cuts.flat()) assert.equal(it.vset.mode, it.media === 'v1' ? 'loop' : 'full');
});

test('the clip setting lists read Swedish (shared/i18n/ui/sv/video.js) and keep their ids', async () => {
  const { context, plain } = await import('./ui-tables-env.mjs');
  const sv = context(['seed.js', 'presets.js', 'grid.js', 'templates.js', 'layout.js', 'segments.js', 'timing.js', 'locks.js', 'audio.js', 'clipset.js', 'orient.js', 'random-edit.js'].map((f) => 'shared/video/' + f), 'sv').SlopVideo;
  assert.deepEqual(plain(sv.clipset.VMODE).map((v) => v[0]), ['full', 'trim', 'speed', 'loop']);
  assert.equal(plain(sv.clipset.VMODE)[3][1], 'Upprepa tills platsen tar slut');
  assert.equal(plain(sv.clipset.EDGE)[1][1], 'Tona');
  assert.equal(plain(sv.timing.MODES)[1][1], 'Förskjutet (varje plats i sin egen takt)');
  assert.equal(plain(sv.audio.MODES)[0][1], 'Av');
  assert.equal(plain(sv.random.PACES)[2][1], 'Långsamt (klipp på 3–6 s)');
});
