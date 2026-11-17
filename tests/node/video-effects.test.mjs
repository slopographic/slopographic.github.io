// Node tests for the random effect layer (shared/video/effects.js) and its place in the plan: the same seed gives the
// same effects, Random picks from the effect list, the change option, and effects never change the cuts.
// Pure, loaded in a vm context with the video core. Run with: node tests/run.mjs video
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'shared', 'video');
const CORE = ['seed.js', 'presets.js', 'grid.js', 'templates.js', 'layout.js', 'segments.js', 'timing.js', 'locks.js', 'audio.js', 'orient.js', 'clipset.js'];
/** A fresh video-core context; withEffects false leaves effects.js out (as SlopCut does). */
function load(withEffects = true) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = withEffects ? [...CORE, 'effects.js', 'random-edit.js'] : [...CORE, 'random-edit.js'];
  for (const f of files) vm.runInContext(readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopVideo;
}
const SV = load();
const FX = SV.effects;
const still = (i) => ({ id: 'm' + i, name: 'm' + i, kind: 'image', dur: Infinity, w: 1600, h: 900 });
const media = [1, 2, 3, 4, 5, 6].map(still);
const base = { target: 40, pace: 'fast', size: { w: 1920, h: 1080 }, tpl: 'grid-2x2' };
const json = (x) => JSON.stringify(x);
const cutsOf = (p) => json(p.cuts);

test('effects default to none: no picks, and the cuts are as before', () => {
  const p = SV.random.plan({ ...base, seed: 5 }, media);
  assert.equal(p.effect.kind, 'none');
  assert.equal(p.effect.picks.length, 0);
  assert.equal(FX.at(p.effect, 0), null);
});

test('norm checks the options: unknown kinds and changes fall back, intensity is clamped to 0 to 1', () => {
  assert.equal(FX.norm({ kind: 'nope' }).kind, 'none');
  assert.equal(FX.norm(null).intensity, 0.5);
  assert.equal(FX.norm({ intensity: 3 }).intensity, 1);
  assert.equal(FX.norm({ intensity: -1 }).intensity, 0);
  assert.equal(FX.norm({ intensity: 0.333 }).intensity, 0.33);
  assert.equal(FX.norm({ change: 'often' }).change, 'cut');
});

test('a fixed effect gives every cut that effect', () => {
  const p = SV.random.plan({ ...base, seed: 9, effect: { kind: 'glitch', intensity: 0.7, change: 'cut' } }, media);
  assert.equal(p.effect.picks.length, p.cuts.length);
  assert.ok(p.effect.picks.every((x) => x.kind === 'glitch'));
  assert.equal(p.effect.intensity, 0.7);
});

test('Random picks only from the effect list, and changes at each cut when change is cut', () => {
  const p = SV.random.plan({ ...base, seed: 77, effect: { kind: 'random', change: 'cut' } }, media);
  assert.ok(p.cuts.length >= 20, 'enough cuts to see the choice vary');
  const kinds = new Set(p.effect.picks.map((x) => x.kind));
  assert.ok(p.effect.picks.every((x) => FX.PICKS.includes(x.kind)));
  assert.ok(kinds.size >= 3, `expected several effects over ${p.cuts.length} cuts, got ${[...kinds]}`);
});

test('Random with change reel picks one effect for the whole reel', () => {
  const p = SV.random.plan({ ...base, seed: 77, effect: { kind: 'random', change: 'reel' } }, media);
  const kinds = new Set(p.effect.picks.map((x) => x.kind));
  assert.equal(kinds.size, 1);
  assert.ok(FX.PICKS.includes([...kinds][0]));
});

test('the same seed gives the same effects, and another seed gives other ones', () => {
  const o = { ...base, effect: { kind: 'random', change: 'cut', intensity: 0.6 } };
  const a = SV.random.plan({ ...o, seed: 0xabc123 }, media);
  const b = SV.random.plan({ ...o, seed: 0xabc123 }, media);
  assert.equal(json(a.effect), json(b.effect));
  const c = SV.random.plan({ ...o, seed: 0x5150 }, media);
  assert.notEqual(json(a.effect.picks), json(c.effect.picks));
});

test('the seed alone decides the picks: the same effect options give the same picks for the same seed', () => {
  const picks = (seed, o) => json(FX.plan(o, Array.from({ length: 12 }), seed).picks);
  assert.equal(picks(42, { kind: 'random', change: 'cut' }), picks(42, { kind: 'random', change: 'cut' }));
  assert.equal(picks(42, { kind: 'random', change: 'cut' }), picks(42, { kind: 'random', change: 'cut', intensity: 0.1 }));
  assert.notEqual(picks(42, { kind: 'random', change: 'cut' }), picks(43, { kind: 'random', change: 'cut' }));
});

test('effect options never change the cuts of a plan', () => {
  const plain = SV.random.plan({ ...base, seed: 314 }, media);
  for (const effect of [{ kind: 'random', change: 'cut' }, { kind: 'zoom', intensity: 1 }, { kind: 'random', change: 'reel', intensity: 0 }]) {
    const p = SV.random.plan({ ...base, seed: 314, effect }, media);
    assert.equal(cutsOf(p), cutsOf(plain), `cuts changed for ${json(effect)}`);
    assert.equal(p.seedHex, plain.seedHex);
  }
});

test('a plan without the effects module has no effect block and still plans', () => {
  const bare = load(false);
  const p = bare.random.plan({ ...base, seed: 314 }, media);
  assert.equal(p.effect, null);
  assert.equal(cutsOf(p), cutsOf(SV.random.plan({ ...base, seed: 314 }, media)));
});

test('each cut keeps its pick when there are fewer cuts than before (a prefix of the same picks)', () => {
  const long = FX.plan({ kind: 'random', change: 'cut' }, Array.from({ length: 10 }), 99).picks;
  const short = FX.plan({ kind: 'random', change: 'cut' }, Array.from({ length: 6 }), 99).picks;
  assert.equal(json(short), json(long.slice(0, 6)));
});

test('the effect and change lists keep their ids and read Swedish from shared/i18n/ui/sv/video.js', async () => {
  const { context, plain } = await import('./ui-tables-env.mjs');
  const sv = context(CORE.concat(['effects.js', 'random-edit.js']).map((f) => 'shared/video/' + f), 'sv').SlopVideo.effects;
  assert.deepEqual(plain(sv.KINDS).map((k) => k[0]), plain(FX.KINDS).map((k) => k[0]));
  assert.equal(sv.name('vignette'), 'Vinjett');
  assert.equal(plain(sv.CHANGE).find((c) => c[0] === 'reel')[1], 'En gång för hela reelen');
  assert.equal(sv.norm({ kind: 'glitch', change: 'reel' }).kind, 'glitch', 'norm checks ids, not labels');
});
