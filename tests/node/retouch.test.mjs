// Auto retouch's pure maths (shared/retouch): levels and white balance, the skin model and spot detection on a synthetic
// face-coloured image, frequency-separation smoothing, PatchMatch on a synthetic texture, the horizon angle, and the
// Workflows operations' mapping to PhotoSlop's commands.
// Run: node --test tests/node/retouch.test.mjs
// Covers: shared/retouch/core.js, shared/retouch/skin.js, shared/retouch/tone.js, shared/retouch/horizon.js
// Covers: shared/retouch/patchmatch.js, shared/retouch/portrait.js, shared/ops/retouch.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../../shared/retouch/core.js');
const Skin = require('../../shared/retouch/skin.js');
const Tone = require('../../shared/retouch/tone.js');
const Hz = require('../../shared/retouch/horizon.js');
const PM = require('../../shared/retouch/patchmatch.js');
const Por = require('../../shared/retouch/portrait.js');

const rnd = Core.rng(11);
/** w × h RGBA from f(x, y) → [r, g, b]. */
function image(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y), i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return d;
}
const at = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('box blur keeps a flat field and the mean; normalised blur ignores pixels outside the weight', () => {
  const a = new Float32Array(50 * 40).fill(7);
  Core.boxBlur(a, 50, 40, 4);
  assert.ok(a.every((v) => Math.abs(v - 7) < 1e-4));
  const v = new Float32Array(20 * 10), wt = new Float32Array(20 * 10);
  for (let i = 0; i < v.length; i++) { const x = i % 20; v[i] = x < 10 ? 100 : 0; wt[i] = x < 10 ? 1 : 0; }
  const [o] = Core.normBlur([v], wt, 20, 10, 3);
  assert.ok(Math.abs(o[5 * 20 + 9] - 100) < 1e-3, 'the edge of the weighted half keeps its value');
});

test('levels: the 0.5 and 99.5 percentiles become black and white, at least 16 levels apart', () => {
  const d = image(200, 20, (x) => { const v = 90 + (x / 199) * 60; return [v, v, v]; });
  const L = Tone.levelsOf(d);
  assert.ok(Math.abs(L.lo - 90) <= 2 && Math.abs(L.hi - 150) <= 2, JSON.stringify(L));
  const flat = image(20, 20, () => [128, 128, 128]);
  const F = Tone.levelsOf(flat);
  assert.equal(F.hi - F.lo, 16);
  const lut = Tone.levelsLut(L.lo, L.hi);
  assert.equal(lut[L.lo], 0); assert.equal(lut[L.hi], 255);
});

test('white balance: a blue cast is neutralised (a grey patch ends within 4 levels of grey), a neutral picture is left alone', () => {
  // a scene of greys and a few colours, under a blue cast (R × 0.78, B × 1.18)
  const cast = (r, g, b) => [r * 0.78, g, Math.min(255, b * 1.18)];
  const d = image(120, 80, (x, y) => {
    if (x < 40) return cast(120, 120, 120);
    if (x < 70) return cast(200, 200, 200);
    if (y < 40) return cast(180, 60, 50);
    return cast(60, 140, 70 + (x % 7));
  });
  const v = Tone.analyse(d, 120, 80), out = Tone.apply(d, 120, 80, v);
  const [r, g, b] = at(out, 120, 20, 40);
  assert.ok(Math.max(Math.abs(r - g), Math.abs(b - g), Math.abs(r - b)) <= 4, `grey patch after: ${r}, ${g}, ${b} (gains ${v.wr} ${v.wg} ${v.wb})`);
  assert.ok(v.wr > 1.1 && v.wb < 0.95);
  const n = image(60, 40, (x) => [80 + x, 80 + x, 80 + x]), nv = Tone.analyse(n, 60, 40);
  assert.equal(nv.wr, 1); assert.equal(nv.wg, 1); assert.equal(nv.wb, 1);
});

test('white balance guard: no gain pushes a channel’s 99.5th percentile past white', () => {
  const d = image(100, 50, (x) => (x < 90 ? [90, 120, 160] : [235, 250, 250]));
  const g = Tone.whiteBalance(d);
  assert.ok(g.wr * 235 <= 255 * 1.03 && g.wb * 250 <= 255 * 1.03, JSON.stringify(g));
});

test('exposure: a dark picture gets a midtone lift that cannot clip (black and white stay put)', () => {
  const d = image(80, 60, (x, y) => { if (y < 12) return [200, 200, 200]; const v = 20 + ((x + y) % 40); return [v, v, v]; });
  const v = Tone.analyse(d, 80, 60);
  assert.ok(v.ev > 0.3 && v.ev <= 0.6, 'ev ' + v.ev);
  const lut = Tone.channelLut(1, 0, 255, v.ev);
  assert.equal(lut[0], 0); assert.equal(lut[255], 255); assert.ok(lut[64] > 90);
  const out = Tone.apply(d, 80, 60, v), lum = [], lum0 = [];
  for (let i = 0; i < out.length; i += 4) { lum.push(Core.luma(out[i], out[i + 1], out[i + 2])); lum0.push(Core.luma(d[i], d[i + 1], d[i + 2])); }
  assert.ok(mean(lum) > mean(lum0) + 15, `brighter: ${mean(lum0)} → ${mean(lum)}`);
  const none = Tone.apply(d, 80, 60, Object.assign({}, v, { strength: 0 }));
  assert.deepEqual([...none.slice(0, 40)], [...d.slice(0, 40)], 'strength 0 changes nothing');
});

test('skin weight: skin tones count, grey, saturated red, blue and green do not', () => {
  for (const c of [[224, 172, 140], [198, 134, 103], [141, 85, 62]]) assert.ok(Skin.skinWeight(...c) > 0.5, 'skin ' + c);
  for (const c of [[128, 128, 128], [220, 20, 20], [40, 80, 200], [60, 160, 60], [250, 250, 250]]) assert.ok(Skin.skinWeight(...c) < 0.1, 'not skin ' + c);
});

/** A 200 × 160 skin-coloured patch with noise, a dark "eyebrow" line and six round spots. */
function face() {
  const w = 200, h = 160, spots = [[40, 40], [90, 50], [150, 45], [60, 110], [120, 120], [165, 100]];
  const d = image(w, h, (x, y) => {
    let r = 222, g = 170, b = 140;
    const n = (rnd() - 0.5) * 8; r += n; g += n; b += n;
    if (y >= 78 && y < 82 && x >= 50 && x < 150) { r = 90; g = 60; b = 50; }               // a line: not a spot
    for (const [sx, sy] of spots) if (Math.hypot(x - sx, y - sy) <= 3) { r -= 45; g -= 60; b -= 55; }
    return [r, g, b];
  });
  return { d, w, h, spots };
}
test('skin mask covers a skin-coloured picture; spots are found, the line is not', () => {
  const { d, w, h, spots } = face();
  const m = Skin.skinMask(d, w, h);
  assert.ok(m[30 * w + 100] > 200 && m[140 * w + 20] > 200);
  const found = Skin.findSpots(d, w, h, new Uint8Array(w * h).fill(255), { maxR: 5 });
  for (const [sx, sy] of spots) assert.ok(found.some((s) => Math.hypot(s.x - sx, s.y - sy) < 2.5), `spot at ${sx}, ${sy}: ${JSON.stringify(found)}`);
  assert.ok(!found.some((s) => s.y > 76 && s.y < 84 && s.x > 52 && s.x < 148), 'the line is not a spot');
  assert.ok(found.length <= spots.length + 1, 'no noise counted: ' + found.length);
});

test('face landmarks give eye, brow and mouth regions that the skin mask leaves out', () => {
  const f = { x: 40, y: 20, w: 120, h: 140, kps: [[75, 70], [125, 70], [100, 95], [80, 120], [120, 120]] };
  const R = Skin.featureRegions(f);
  assert.equal(R.eyes.length, 2);
  assert.ok(Skin.inEllipse(R.mouth, 100, 120) > 0.9 && Skin.inEllipse(R.mouth, 100, 60) === 0);
  const { d, w, h } = face(), m = Skin.skinMask(d, w, h, { faces: [f] });
  assert.ok(m[70 * w + 75] < 40, 'an eye is not skin'); assert.ok(m[140 * w + 100] > 150, 'the chin is');
});

test('frequency separation smooths blotches but keeps fine texture and strong edges', () => {
  const w = 160, h = 120;
  const d = image(w, h, (x, y) => {
    const blotch = 18 * Math.sin(x / 6) * Math.sin(y / 7), pore = (x + y) % 2 ? 4 : -4, edge = x > 120 ? -90 : 0;
    const v = 170 + blotch + pore + edge; return [v + 40, v, v - 20];
  });
  const out = Por.smoothSkin(d, w, h, new Uint8Array(w * h).fill(255), { strength: 100, radius: 8 });
  const varOf = (a, x0, x1) => { const v = []; for (let y = 20; y < 100; y++) for (let x = x0; x < x1; x++) v.push(a[(y * w + x) * 4 + 1]); const m = mean(v); return mean(v.map((q) => (q - m) ** 2)); };
  assert.ok(varOf(out, 20, 100) < varOf(d, 20, 100) * 0.5, 'blotches reduced');
  const fine = (a) => Math.abs(a[(60 * w + 60) * 4 + 1] - a[(60 * w + 61) * 4 + 1]);
  assert.ok(fine(out) >= 4, 'pores kept: ' + fine(out));
  assert.ok(out[(60 * w + 140) * 4 + 1] < 110, 'the dark side of the edge stays dark');
  const none = Por.smoothSkin(d, w, h, new Uint8Array(w * h), { strength: 100 });
  assert.deepEqual([...none.slice(0, 64)], [...d.slice(0, 64)], 'outside the mask nothing changes');
});

test('whitening lightens yellowish teeth inside the region and leaves red lips alone', () => {
  const w = 40, h = 20, d = image(w, h, (x) => (x < 20 ? [215, 200, 150] : [190, 60, 70]));
  const region = new Float32Array(w * h).fill(1), r = Por.whiten(d, w, h, region, 100, 'teeth');
  const [tr, tg, tb] = at(r.data, w, 5, 5);
  assert.ok(tb > 150 + 25 && Math.abs(tr - tb) < 50, `teeth ${tr} ${tg} ${tb}`);
  assert.deepEqual(at(r.data, w, 30, 5), [190, 60, 70]);
  assert.ok(r.mask[5 * w + 5] > 200 && r.mask[5 * w + 30] === 0);
});

test('PatchMatch fills a hole in a checker texture from its surroundings: no object colour left, close to the truth', () => {
  const w = 160, h = 120, truth = image(w, h, (x, y) => {
    const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 200 : 60, n = (rnd() - 0.5) * 16;
    return [v + n, v * 0.8 + n, v * 0.5 + n];
  });
  const d = new Uint8ClampedArray(truth), hole = new Uint8Array(w * h);
  for (let y = 45; y < 75; y++) for (let x = 60; x < 95; x++) { hole[y * w + x] = 1; d.set([255, 0, 0], (y * w + x) * 4); }
  const out = PM.inpaint(d, w, h, hole);
  let err = 0, n = 0, red = 0;
  for (let i = 0; i < w * h; i++) {
    if (!hole[i]) { assert.equal(out[i * 4], d[i * 4]); continue; }
    err += Math.abs(out[i * 4] - truth[i * 4]); n++;
    if (out[i * 4] > 180 && out[i * 4 + 1] < 90) red++;
  }
  assert.equal(red, 0, 'no red residue');
  assert.ok(err / n < 25, 'mean error ' + (err / n));
});

/** Luma of a sky-over-ground picture whose horizon is tilted by deg (anti-aliased). */
function horizon(deg, w = 240, h = 160) {
  const L = new Float32Array(w * h), t = Math.tan((deg * Math.PI) / 180);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let cov = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (y + (sy + 0.5) / 4 > h / 2 + t * (x + (sx + 0.5) / 4 - w / 2)) cov++;
    L[y * w + x] = 200 - (cov / 16) * 130 + (rnd() - 0.5) * 6;
  }
  return L;
}
test('horizon angle: a tilted horizon is measured within 0.4°, a level one reads about 0', () => {
  for (const deg of [3, -5, 8]) {
    const r = Hz.detectTilt(horizon(deg), 240, 160);
    assert.ok(r && Math.abs(r.angle - deg) <= 0.4, `${deg}°: ${JSON.stringify(r)}`);
    assert.equal(r.kind, 'horizon');
  }
  const z = Hz.detectTilt(horizon(0), 240, 160);
  assert.ok(Math.abs(z.angle) <= 0.3 && z.confidence > 0.5);
  assert.equal(Hz.detectTilt(new Float32Array(100 * 80).fill(90), 100, 80), null, 'no edges, no answer');
  const b = Hz.straightenBox(400, 300, 5);
  assert.ok(b.w < 400 && b.w > 340 && Math.abs(b.w / b.h - 4 / 3) < 0.02);
});

test('the Workflows operations map their options to PhotoSlop’s commands', async () => {
  const R = await import('../../shared/ops/all.js'), { toArgs } = await import('../../shared/ops/retouch.js');
  for (const id of ['photoslop.auto-enhance', 'photoslop.portrait']) assert.equal(R.byId(id).app, 'photoslop');
  const [cmd, args] = toArgs('photoslop.auto-enhance', R.validateOptions(R.byId('photoslop.auto-enhance'), { strength: '80%', denoise: 'Light' }).options);
  assert.equal(cmd, 'ps.retouch.auto-enhance'); assert.equal(args.strength, 80); assert.equal(args.denoise, 'light');
  const [pc, pa] = toArgs('photoslop.portrait', {});
  assert.equal(pc, 'ps.retouch.portrait'); assert.equal(pa.smoothing, 45); assert.equal(pa.subject, false);
  assert.equal(R.outOf(R.byId('photoslop.portrait'), 'jpg', { format: 'same' }), 'jpg');
});
