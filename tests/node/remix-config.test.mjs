// Reel Remix's 'project' config kind (app remix): the real shared/config and shared/video scripts, Remix's core, config-map.js
// and config.js in one vm context. Export, validate, import gives the same plan; missing clips; refusals.
// Run: node tests/run.mjs remix   (or node --test tests/node/remix-config.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import './ui-i18n-en.mjs';   // the config's words (shared/i18n/ui), handed to the vm as a page has them
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const CREATED = '2026-10-11T09:00:00Z';
const FILES = [
  'shared/motion/easing.js', 'shared/motion/track.js',
  'shared/config/schema.js', 'shared/config/validate.js', 'shared/config/io.js', 'shared/config/prompt.js', 'shared/config/dialog.js',
  'shared/video/seed.js', 'shared/video/presets.js', 'shared/video/grid.js', 'shared/video/templates.js', 'shared/video/layout.js',
  'shared/video/segments.js', 'shared/video/timing.js', 'shared/video/locks.js', 'shared/video/audio.js', 'shared/video/clipset.js', 'shared/video/orient.js',
  'shared/video/random-edit.js', 'shared/video/effects.js', 'shared/video/keys.js',
  'remix/js/core.js', 'remix/js/config-map.js', 'remix/js/config.js',
];

function remixEnv() {
  const ctx = { console, Blob, File, TextEncoder, URL: { revokeObjectURL() {} }, SlopI18n: globalThis.SlopI18n };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(src(f), ctx, { filename: f });
  return { ctx, RM: ctx.RM, C: ctx.SlopConfig, CM: ctx.RM.config, SV: ctx.SlopVideo };
}

/** Four clips: two videos and two photos, with the sizes the file names them by. */
const bin = () => [
  { id: 'v1', name: 'beach.mp4', kind: 'video', dur: 9.5, w: 1920, h: 1080, file: { size: 4000 }, url: null, el: null },
  { id: 'v2', name: 'walk.mp4', kind: 'video', dur: 7, w: 1080, h: 1920, file: { size: 2500 }, url: null, el: null },
  { id: 'p1', name: 'sunset.jpg', kind: 'image', dur: Infinity, w: 3000, h: 2000, file: { size: 800 }, url: null, el: null },
  { id: 'p2', name: 'portrait.jpg', kind: 'image', dur: Infinity, w: 1200, h: 1600, file: { size: 700 }, url: null, el: null },
];

test('export, validate and import give back the same plan, locks, keys and lane', async () => {
  const env = remixEnv();
  const { RM, C, CM, SV } = env;
  RM.resetAll();
  RM.state.items = bin();
  Object.assign(RM.state, { target: 12, pace: 'fast', preset: 'phone', random: true, fill: 'cover', timing: 'stagger', stagger: 1, video: 'random', audioMode: 'music', audioTrack: 'v1', seed: 0x2a2b2c2d });
  const plan = RM.remix();
  assert.ok(plan && plan.cuts.length > 1, 'the reel plans cuts');
  assert.ok(RM.toggleLock(0, 0), 'a slot can be locked');
  RM.state.keys = SV.keys.put(RM.state.keys, 0, 0, [
    { t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 1, ease: 'linear' },
    { t: 0.5, x: 0.2, y: 0, scale: 1, rot: 0, opacity: 0.5, ease: 'easeOut' },
  ]);
  RM.remix();

  const before = plain({ cuts: RM.state.plan.cuts, locks: RM.state.locks, keys: RM.state.keys, lane: RM.state.lane, seed: RM.state.seed });
  const data = CM.toData(RM.state, RM.size());
  const file = C.exportFile('project', 'remix', 'Reel test', data, { created: CREATED });
  const r = C.validate(await file.text(), { app: 'remix' });
  assert.equal(r.ok, true, C.errorText(r.errors));

  RM.resetAll();
  RM.state.items = bin(); // the same files, loaded again
  const applied = await C.applyValue(r.value, { app: 'remix' });
  assert.equal(applied.ok, true, C.errorText(applied.errors));
  const after = plain({ cuts: RM.state.plan.cuts, locks: RM.state.locks, keys: RM.state.keys, lane: RM.state.lane, seed: RM.state.seed });
  assert.deepEqual(after.cuts, before.cuts, 'the same seed and options plan the same cuts');
  assert.deepEqual(after.locks, before.locks);
  assert.deepEqual(after.keys, before.keys);
  assert.deepEqual(after.lane, before.lane);
  assert.equal(after.seed, before.seed);
  assert.deepEqual(plain(CM.toData(RM.state, RM.size())), plain(data), 'the file is the same after an import');
  assert.equal(RM.state.audioTrack, RM.state.items[0].id, 'the music clip is matched by name');
});

test('a file that lists clips the page does not hold still opens, and the clips are missing', async () => {
  const env = remixEnv();
  const { RM, C, CM } = env;
  RM.resetAll();
  RM.state.items = bin();
  RM.state.seed = 0x11223344;
  RM.remix();
  const data = CM.toData(RM.state, RM.size());
  RM.resetAll();
  RM.state.items = [];
  const r = C.validate(C.envelope('project', 'remix', 'Missing', data, { created: CREATED }), { app: 'remix' });
  assert.equal(r.ok, true, C.errorText(r.errors));
  const res = await C.applyValue(r.value, { app: 'remix' });
  assert.equal(res.ok, true, C.errorText(res.errors));
  assert.deepEqual(plain(RM.state.items.map((m) => m.name)), ['beach.mp4', 'walk.mp4', 'sunset.jpg', 'portrait.jpg']);
  assert.ok(RM.state.items.every((m) => m.missing === true), 'every clip is listed as missing');
  assert.equal(RM.media().length, 0, 'missing clips are not planned');
  assert.equal(RM.replaceSlot(0, 0, 'v1'), false, 'a missing clip cannot be dropped into a slot');
});

test('a file added later with the same name fills the missing clip by its id (the match is by name)', () => {
  const env = remixEnv();
  const { CM } = env;
  const clips = [{ file: { name: 'beach.mp4', size: 999 }, kind: 'video', dur: 4 }];
  const bin0 = [{ id: 'keep', name: 'beach.mp4', kind: 'video', dur: 9, file: { size: 1 } }];
  assert.equal(CM.resolveItems(clips, bin0)[0].id, 'keep', 'a loaded clip with the same name is reused');
  const missing = CM.resolveItems(clips, [])[0];
  assert.equal(missing.missing, true);
  assert.equal(missing.dur, 4);
});

test('a file that does not match the format is refused, with the path of each problem', async () => {
  const env = remixEnv();
  const { RM, C, CM } = env;
  RM.resetAll();
  RM.state.items = bin();
  RM.state.seed = 0x0badf00d;
  RM.remix();
  const good = plain(CM.toData(RM.state, RM.size()));
  const env2 = (d, over = {}) => ({ ...C.envelope('project', 'remix', 'Bad', d, { created: CREATED }), ...over });

  const pace = plain(good); pace.plan.pace = 'glacial';
  assert.ok(C.validate(env2(pace), { app: 'remix' }).errors.some((e) => e.path === 'data.plan.pace'));

  const seed = plain(good); seed.plan.seed = 'xyz';
  assert.ok(C.validate(env2(seed), { app: 'remix' }).errors.some((e) => e.path === 'data.plan.seed'));

  const noDur = plain(good); delete noDur.clips[0].dur;
  assert.ok(C.validate(env2(noDur), { app: 'remix' }).errors.some((e) => /needs its length/.test(e.message)));

  const lock = plain(good); lock.locks = [{ cut: 0, slot: 0, clip: 99, in: 0, fill: 'auto' }];
  assert.ok(C.validate(env2(lock), { app: 'remix' }).errors.some((e) => e.path === 'data.locks[0].clip'));

  const extra = plain(good); extra.plan.crop = true;
  assert.ok(C.validate(env2(extra), { app: 'remix' }).errors.some((e) => e.path === 'data.plan.crop' && /not a known key/.test(e.message)));

  const other = C.validate(env2(good, { app: 'slopedit' }), { app: 'remix' });
  assert.equal(other.ok, false, 'a SlopCut file is not a Remix file');

  const before = JSON.stringify(RM.state.items);
  const res = await C.importText(JSON.stringify(env2(pace)), { app: 'remix' });
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(RM.state.items), before, 'nothing changed in the reel');
});

test('the Config menu and the palette commands are the same four actions', () => {
  const env = remixEnv();
  const { RM, ctx } = env;
  assert.deepEqual(plain(RM.configCommands.map((c) => c.id)), ['remix.config.export', 'remix.config.template', 'remix.config.import', 'remix.config.ai']);
  assert.equal(plain(ctx.SlopConfigDialog.menuItems({ app: 'remix' })).length, 4);
  assert.ok(env.C.getKind('project', 'remix'));
});
