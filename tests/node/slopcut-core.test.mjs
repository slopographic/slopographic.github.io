// Node tests for SlopCut's pure core: keyframe interpolation and easing (js/core/anim.js, on shared/motion) and the
// seeded random effect choice (js/core/fx-random.js, on shared/video/seed.js). Loaded in a vm context so the
// browser files run unchanged. Run with: node tests/run.mjs slopcut
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
for (const f of ['shared/motion/easing.js', 'shared/motion/track.js', 'shared/video/seed.js', 'slopcut/js/core/anim.js', 'slopcut/js/core/fx-random.js']) {
  vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const { SE, SlopMotion, SlopVideo } = ctx;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays made in the vm context compare by value
const ALL = ['grain', 'colour', 'glitch', 'zoom', 'vignette'];
const clip = (o = {}) => Object.assign({ x: 0, y: 0, scale: 1, rot: 0, opacity: 1, dur: 2, anim: null }, o);

test('easing names map 0 to 0 and 1 to 1, and the four keyframe eases hit their midpoints', () => {
  for (const n of ['linear', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic']) {
    const f = SlopMotion.easing.resolve(n);
    assert.ok(near(f(0), 0) && near(f(1), 1), n);
  }
  const R = (n) => SlopMotion.easing.resolve(n)(0.5);
  assert.ok(near(R('linear'), 0.5));
  assert.ok(near(R('easeInCubic'), 0.125));
  assert.ok(near(R('easeOutCubic'), 0.875));
  assert.ok(near(R('easeInOutCubic'), 0.5));
  for (const [v] of SE.anim.EASES) assert.ok(SlopMotion.easing.isValid(v), v);
});

test('a property without keys is neutral; before the first key and after the last key the end values hold', () => {
  const c = clip();
  assert.equal(SE.anim.valueAt(c, 'scale', 1), 1);
  assert.equal(SE.anim.valueAt(c, 'x', 1), 0);
  c.anim = { x: [{ t: 0.5, value: 10, ease: 'linear' }, { t: 1.5, value: 30, ease: 'linear' }] };
  assert.equal(SE.anim.valueAt(c, 'x', 0), 10);
  assert.equal(SE.anim.valueAt(c, 'x', 2), 30);
  assert.ok(near(SE.anim.valueAt(c, 'x', 1), 20));
  assert.ok(near(SE.anim.valueAt(c, 'x', 0.75), 15));
});

test('each key sets the easing of the segment that starts at it', () => {
  const c = clip({ anim: { scale: [{ t: 0, value: 1, ease: 'easeInCubic' }, { t: 1, value: 3, ease: 'linear' }] } });
  assert.ok(near(SE.anim.valueAt(c, 'scale', 0.5), 1 + 2 * 0.125)); // ease in: 1.25
  c.anim.scale[0].ease = 'easeOutCubic';
  assert.ok(near(SE.anim.valueAt(c, 'scale', 0.5), 1 + 2 * 0.875)); // ease out: 2.75
  c.anim.scale[0].ease = 'linear';
  assert.ok(near(SE.anim.valueAt(c, 'scale', 0.5), 2));
});

test('combine adds x, y and rotation offsets and multiplies scale and opacity', () => {
  const c = clip({ x: 10, y: -4, scale: 2, rot: 15, opacity: 0.5, anim: {
    x: [{ t: 0, value: 5, ease: 'linear' }], y: [{ t: 0, value: 1, ease: 'linear' }],
    scale: [{ t: 0, value: 0.5, ease: 'linear' }], rot: [{ t: 0, value: 45, ease: 'linear' }], opacity: [{ t: 0, value: 0.5, ease: 'linear' }] } });
  const xf = SE.anim.combine(c, 1);
  assert.deepEqual([xf.x, xf.y, xf.scale, xf.rot, xf.opacity], [15, -3, 1, 60, 0.25]);
  const plain = SE.anim.combine(clip({ x: 3, scale: 1.5 }), 1);
  assert.deepEqual([plain.x, plain.scale, plain.opacity], [3, 1.5, 1]);
});

test('addKey keeps keys sorted, replaces a key at the same time and clamps to the clip', () => {
  const c = clip({ dur: 2 });
  SE.anim.addKey(c, 'x', 1, 5, 'linear');
  SE.anim.addKey(c, 'x', 0.25, 1, 'easeInCubic');
  assert.deepEqual(plain(c.anim.x.map((k) => k.t)), [0.25, 1]);
  const i = SE.anim.addKey(c, 'x', 1, 9, 'easeOutCubic');
  assert.equal(c.anim.x.length, 2);
  assert.equal(c.anim.x[i].value, 9);
  assert.equal(SE.anim.addKey(c, 'x', 5, 0, 'linear') , 2);
  assert.equal(c.anim.x[2].t, 2);
  for (const prop of Object.keys(c.anim)) assert.equal(SlopMotion.track.validateKeys(c.anim[prop], prop).length, 0);
});

test('moveKey never passes a neighbour key; removing the last key clears anim', () => {
  const c = clip({ dur: 3 });
  SE.anim.addKey(c, 'opacity', 0, 0, 'linear');
  SE.anim.addKey(c, 'opacity', 1, 1, 'linear');
  SE.anim.addKey(c, 'opacity', 2, 1, 'linear');
  SE.anim.moveKey(c, 'opacity', 1, 5);
  assert.equal(c.anim.opacity[1].t, 2 - 1e-3);
  SE.anim.moveKey(c, 'opacity', 1, -4);
  assert.equal(c.anim.opacity[1].t, 0 + 1e-3);
  SE.anim.removeKey(c, 'opacity', 0);
  SE.anim.removeKey(c, 'opacity', 0);
  SE.anim.removeKey(c, 'opacity', 0);
  assert.equal(c.anim, null);
});

test('animate-in presets write keys over the first 0.5 s and keep later keys', () => {
  const c = clip({ dur: 4, anim: { x: [{ t: 1, value: 7, ease: 'linear' }] } });
  assert.equal(SE.anim.applyPreset(c, 'slideL', 1920, 1080), true);
  assert.deepEqual(plain(c.anim.x.map((k) => [k.t, k.value])), [[0, -1920], [0.5, 0], [1, 7]]);
  assert.equal(c.anim.x[0].ease, 'easeOutCubic');
  SE.anim.applyPreset(c, 'fade', 1920, 1080);
  assert.deepEqual(plain(c.anim.opacity.map((k) => [k.t, k.value])), [[0, 0], [0.5, 1]]);
  SE.anim.applyPreset(c, 'slideT', 1920, 1080);
  assert.equal(c.anim.y[0].value, -1080);
  SE.anim.applyPreset(c, 'zoom', 1920, 1080);
  assert.ok(near(c.anim.scale[0].value, 0.4));
  assert.equal(SE.anim.applyPreset(c, 'nope', 1, 1), false);
  const short = clip({ dur: 0.3 });
  SE.anim.applyPreset(short, 'fade', 1, 1);
  assert.deepEqual(plain(short.anim.opacity.map((k) => k.t)), [0, 0.3]);
  for (const [, , prop] of SE.anim.PRESETS) assert.equal(SlopMotion.track.validateKeys(c.anim[prop] || [], prop).length, 0, prop);
  SE.anim.clear(c);
  assert.equal(c.anim, null);
});

test('the same seed, cut and settings always pick the same effect', () => {
  const a = SE.fx.pick(0xdeadbeef, 3, ['grain', 'colour', 'glitch', 'zoom', 'vignette'], 0.6);
  const b = SE.fx.pick(0xdeadbeef, 3, ['grain', 'colour', 'glitch', 'zoom', 'vignette'], 0.6);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(a.seed, 0xdeadbeef);
  const fx = { seed: 42, every: 1, intensity: 0.8, types: ['glitch', 'vignette'] };
  const run = () => plain([0, 1.2, 2.4, 3.7, 5.9].map((u) => SE.fx.stateAt(fx, u)));
  assert.deepEqual(run(), run());
  assert.notDeepEqual(run(), plain([0, 1.2, 2.4, 3.7, 5.9].map((u) => SE.fx.stateAt(Object.assign({}, fx, { seed: 43 }), u))));
});

test('another seed gives another run of effects; the types and intensity bound the choice', () => {
  const seq = (seed, types, level) => Array.from({ length: 200 }, (_, n) => SE.fx.pick(seed, n, types, level));
  const s1 = seq(1, ALL, 1).map((x) => x.type).join(), s2 = seq(2, ALL, 1).map((x) => x.type).join();
  assert.notEqual(s1, s2);
  const all = new Set(seq(7, ALL, 1).map((x) => x.type));
  assert.equal(all.size, 5);
  assert.ok(seq(9, ['zoom', 'glitch'], 1).every((x) => x.type === 'zoom' || x.type === 'glitch'));
  assert.equal(SE.fx.pick(3, 0, [], 1), null);
  assert.equal(SE.fx.pick(3, 0, ['grain'], 0), null);
  for (const x of seq(5, ['grain'], 0.4)) { assert.ok(x.amount > 0 && x.amount <= 0.4); assert.ok(x.k >= 0 && x.k < 1); }
});

test('how often the effect changes: cuts follow the interval, 0 means one cut for the whole layer', () => {
  assert.equal(SE.fx.cutIndex({ every: 1 }, 2.5), 2);
  assert.equal(SE.fx.cutIndex({ every: 0.5 }, 1.49), 2);
  assert.equal(SE.fx.cutIndex({ every: 0 }, 99), 0);
  const whole = { seed: 4, every: 0, intensity: 1, types: ['grain', 'zoom'] };
  assert.equal(SE.fx.stateAt(whole, 0).type, SE.fx.stateAt(whole, 9).type);
  const cuts = { seed: 4, every: 1, intensity: 1, types: ['grain', 'zoom'] };
  assert.equal(SE.fx.stateAt(cuts, 0.2).cut, 0);
  assert.equal(SE.fx.stateAt(cuts, 3.2).cut, 3);
  assert.equal(SE.fx.stateAt(null, 1), null);
  assert.equal(SlopVideo.seed.hex(SE.fx.pick(255, 0, ['grain'], 1).seed), '000000ff');
});
