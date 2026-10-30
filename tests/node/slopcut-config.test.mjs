// SlopCut's 'project' config kind (app slopedit): the real shared/config scripts and SlopCut's config-map.js and config.js
// run in one vm context, with a stub store and stub undo. Export, validate, import gives the same timeline; refusals; missing
// media. Run: node tests/run.mjs slopcut   (or node --test tests/node/slopcut-config.test.mjs)
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

/** A fresh context with the shared config, the video presets, SlopCut's model and the two config files. */
function cutEnv() {
  let n = 0;
  const SE = {
    util: { uid: (p) => (p || 'x') + (++n), lerp: (a, b, t) => a + (b - a) * t, clamp: (v, a, b) => Math.min(b, Math.max(a, v)), t: (k) => k },
    media: {
      items: new Map(),
      get(id) { return this.items.get(id); },
      addMissing(meta) { this.items.set(meta.id, { id: meta.id, status: 'missing', meta }); },
    },
    change(label, fn) { return fn(SE.doc); },
    app: { select() {} },
  };
  const ctx = { console, Blob, File, TextEncoder, SE, SlopI18n: globalThis.SlopI18n };
  ctx.window = ctx;
  vm.createContext(ctx);
  SE.doc = null;
  for (const f of [
    'shared/config/schema.js', 'shared/config/validate.js', 'shared/config/io.js', 'shared/config/prompt.js',
    'shared/config/dialog.js', 'shared/video/presets.js', 'slopcut/js/core/model.js',
    'slopcut/js/io/config-map.js', 'slopcut/js/io/config.js',
  ]) vm.runInContext(src(f), ctx, { filename: f });
  ctx.SE = SE;
  SE.doc = ctx.SE.model.newProject({ w: 1280, h: 720, fps: 25 });
  const M = SE.model;
  return { ctx, SE, M, C: ctx.SlopConfig, CM: SE.configMap };
}

/** A project with every kind of clip the format carries, plus a title that the format leaves out. */
function sampleProject(env) {
  const { SE, M } = env;
  const p = SE.doc;
  p.media.push(
    { id: 'm1', name: 'intro.mp4', kind: 'video', type: 'video/mp4', size: 3000000, dur: 12, hasAudio: true },
    { id: 'm2', name: 'music.mp3', kind: 'audio', type: 'audio/mpeg', size: 500000, dur: 60, hasAudio: true },
    { id: 'm3', name: 'photo.jpg', kind: 'image', type: 'image/jpeg', size: 90000, dur: Infinity, hasAudio: false });
  const [v1, v2] = p.tracks.filter((t) => t.kind === 'video');
  const a1 = p.tracks.find((t) => t.kind === 'audio');
  v2.lock = true;
  p.clips.push(
    M.newClip({ kind: 'video', track: v1.id, media: 'm1', name: 'Intro', start: 0, dur: 4, in: 1, speed: 1, x: 10, y: -5, scale: 1.2, rot: 15, opacity: 0.8,
      anim: { x: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 50, ease: 'easeInOutCubic' }] }, bright: 20, temp: -10, fadeIn: 0.5, link: 'pair' }),
    M.newClip({ kind: 'video', track: v1.id, media: 'm1', start: 4, dur: 2, in: 5, speed: 2 }),
    M.newClip({ kind: 'image', track: v2.id, media: 'm3', start: 4, dur: 3, in: 0 }),
    M.newClip({ kind: 'color', track: v2.id, color: '#336699', start: 7, dur: 2, in: 0, scale: 1 }),
    M.newClip({ kind: 'audio', track: a1.id, media: 'm2', start: 0, dur: 6, in: 3, vol: 0.5, keys: [{ t: 0, v: 0 }, { t: 5, v: 1 }], afIn: 1, afOut: 1, link: 'pair' }),
    M.newClip({ kind: 'title', track: v2.id, start: 9, dur: 2, in: 0, text: { str: 'Not in the format' } }));
  p.markers.push({ id: 'k1', t: 2.5, name: 'Beat', color: '#ffc94a' });
  return p;
}

const envelope = (C, data, over = {}) => C.envelope('project', 'slopedit', 'Cut test', data, { created: CREATED, ...over });

test('export writes a file that validates, and import gives the same timeline back', async () => {
  const env = cutEnv();
  const { SE, C, CM, M } = env;
  sampleProject(env);
  const { data, skipped } = CM.toData(SE.doc);
  assert.equal(skipped, 1, 'the title clip is left out and counted');
  const file = C.exportFile('project', 'slopedit', 'Cut test', data, { created: CREATED });
  assert.equal(file.name, 'Cut test.slop.json');
  const text = await file.text();

  const r = C.validate(text, { app: 'slopedit' });
  assert.equal(r.ok, true, C.errorText(r.errors));

  const before = plain(SE.doc.clips.filter((c) => c.kind !== 'title').map((c) => ({ kind: c.kind, start: c.start, dur: c.dur, in: c.in, speed: c.speed })));
  SE.doc = M.newProject({ w: 320, h: 240, fps: 10 }); // an empty sequence, so the import has to build everything
  const applied = await C.applyValue(r.value, { app: 'slopedit' });
  assert.equal(applied.ok, true, C.errorText(applied.errors));

  const again = CM.toData(SE.doc).data;
  assert.deepEqual(plain(again), plain(data), 'the exported data is the same after an import');
  const after = plain(SE.doc.clips.map((c) => ({ kind: c.kind, start: c.start, dur: c.dur, in: c.in, speed: c.speed })));
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    for (const k of ['start', 'dur', 'in', 'speed']) assert.ok(Math.abs(after[i][k] - before[i][k]) < 1e-9, `${k} of clip ${i}`);
  }
  assert.equal(SE.doc.w, 1280);
  assert.equal(SE.doc.fps, 25);
  assert.equal(SE.doc.markers.length, 1);
  assert.equal(SE.doc.tracks.filter((t) => t.kind === 'video').length, 2);
  const v2 = SE.doc.tracks.find((t) => t.name === 'V2');
  assert.equal(v2.lock, true, 'track locks come back');
});

test('clips keep their links, keyframes, effects and fades through a round trip', async () => {
  const env = cutEnv();
  const { SE, C, CM } = env;
  sampleProject(env);
  const data = CM.toData(SE.doc).data;
  const r = C.validate(C.envelope('project', 'slopedit', 'Round', data, { created: CREATED }), { app: 'slopedit' });
  assert.equal(r.ok, true, C.errorText(r.errors));
  await C.applyValue(r.value, { app: 'slopedit' });
  const intro = SE.doc.clips.find((c) => c.name === 'Intro');
  assert.equal(intro.rot, 15);
  assert.equal(intro.anim.x[1].value, 50);
  assert.equal(intro.bright, 20);
  assert.equal(intro.fadeIn, 0.5);
  const sound = SE.doc.clips.find((c) => c.kind === 'audio');
  assert.equal(sound.vol, 0.5);
  assert.equal(sound.afOut, 1);
  assert.equal(sound.keys[1].v, 1);
  assert.equal(sound.link, intro.link, 'the picture and its sound stay linked');
});

test('an import lists the media the bin does not hold, as missing records to add by name', async () => {
  const env = cutEnv();
  const { SE, C, CM } = env;
  sampleProject(env);
  const r = C.validate(envelope(C, CM.toData(SE.doc).data), { app: 'slopedit' });
  assert.equal(r.ok, true, C.errorText(r.errors));
  SE.doc = env.M.newProject();
  const res = await C.applyValue(r.value, { app: 'slopedit' });
  assert.equal(res.ok, true, C.errorText(res.errors));
  const names = plain(SE.doc.media.map((m) => m.name).sort());
  assert.deepEqual(names, ['intro.mp4', 'music.mp3', 'photo.jpg']);
  for (const m of SE.doc.media) assert.equal(SE.media.get(m.id).status, 'missing', m.name);
  assert.ok(SE.doc.clips.filter((c) => c.media).every((c) => SE.media.get(c.media)), 'every clip points at a record');
});

test('a file that does not match the format is refused, with the path of each problem', async () => {
  const env = cutEnv();
  const { C, CM, SE } = env;
  sampleProject(env);
  const good = CM.toData(SE.doc).data;
  const clone = () => plain(good);

  const v = C.validate({ ...envelope(C, clone()), version: 2 }, { app: 'slopedit' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'version'), 'a wrong version is refused');

  const badOut = clone();
  badOut.tracks[0].clips[0].out = 0.5; // before in (1)
  const b = C.validate(envelope(C, badOut), { app: 'slopedit' });
  assert.ok(b.errors.some((e) => e.path === 'data.tracks[0].clips[0].out' && /later than in/.test(e.message)), JSON.stringify(b.errors));

  const badKind = clone();
  const video = badKind.tracks.find((t) => t.kind === 'video');
  const audioClip = badKind.tracks.find((t) => t.kind === 'audio').clips[0];
  video.clips.push(audioClip);
  const k = C.validate(envelope(C, badKind), { app: 'slopedit' });
  assert.ok(k.errors.some((e) => /audio clips go on an audio track/.test(e.message)), JSON.stringify(k.errors));

  const unknown = clone();
  unknown.tracks[0].clips[0].crop = { left: 0.1 };
  const u = C.validate(envelope(C, unknown), { app: 'slopedit' });
  assert.ok(u.errors.some((e) => e.path === 'data.tracks[0].clips[0].crop' && /not a known key/.test(e.message)), JSON.stringify(u.errors));

  const noFile = clone();
  delete noFile.tracks[0].clips[0].file;
  const f = C.validate(envelope(C, noFile), { app: 'slopedit' });
  assert.ok(f.errors.some((e) => /needs the file it uses/.test(e.message)), JSON.stringify(f.errors));

  const other = C.validate({ ...envelope(C, clone()), app: 'remix' }, { app: 'slopedit' });
  assert.equal(other.ok, false, 'a Remix file is not a SlopCut file');
  assert.ok(other.errors.some((e) => e.path === 'app'));

  const dup = clone();
  dup.tracks.push(plain(dup.tracks[0]));
  const d = C.validate(envelope(C, dup), { app: 'slopedit' });
  assert.ok(d.errors.some((e) => /already the name of another track/.test(e.message)), JSON.stringify(d.errors));

  const text = C.validate('{ not json', { app: 'slopedit' });
  assert.equal(text.ok, false);
  assert.match(text.errors[0].message, /not valid JSON/);
});

test('a refused file changes nothing in the project', async () => {
  const env = cutEnv();
  const { C, CM, SE } = env;
  sampleProject(env);
  const before = JSON.stringify(SE.doc);
  const bad = plain(CM.toData(SE.doc).data);
  bad.tracks[0].clips[0].out = -1;
  const res = await C.importText(JSON.stringify(envelope(C, bad)), { app: 'slopedit' });
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(SE.doc), before);
});

test('the Config commands and the menu are built from one list', () => {
  const env = cutEnv();
  const { ctx, C } = env;
  const dialog = ctx.SlopConfigDialog;
  const cmds = dialog.commands({ app: 'slopedit', prefix: 'slopedit' });
  assert.deepEqual(plain(cmds.map((c) => c.id)), ['slopedit.config.export', 'slopedit.config.template', 'slopedit.config.import', 'slopedit.config.ai']);
  assert.equal(dialog.menuItems({ app: 'slopedit' }).length, 4);
  assert.ok(C.getKind('project', 'slopedit'), 'the project kind is registered for SlopCut');
  assert.equal(C.getKind('project', 'remix'), null, 'and not for Reel Remix (its own kind)');
});

test('the plain template is a valid example file for the kind', async () => {
  const env = cutEnv();
  const { C } = env;
  const example = C.exampleValue('project', 'slopedit');
  const file = C.exportFile('project', 'slopedit', 'Template', example, { description: 'Template' });
  const r = C.validate(await file.text(), { app: 'slopedit' });
  assert.equal(r.ok, true, C.errorText(r.errors));
});
