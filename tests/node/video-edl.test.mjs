// Node tests for the edit decision list and the video tools' schemas: shared/video/edl.js (validate, cover, corner,
// duckKeys, cuesOf), the json argument type (shared/commands/args.js), macros keeping a json argument
// (shared/macros/core.js), the video operations' steps and options (shared/ops/video.js) and the command tools'
// readOnly / sends / media handling (shared/ai/cmdtools.js).
// Covers: shared/video/edl.js, shared/commands/args.js, shared/macros/core.js, shared/ops/video.js, shared/ai/cmdtools.js, shared/ops/speech.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
// SlopI18n with the English words of the questions (shared/i18n/ui/en/ai*.js), so they read as on a page
for (const f of ['shared/i18n/i18n.js', 'shared/i18n/ui/en/ai.js', 'shared/i18n/ui/en/ai2.js', 'shared/video/presets.js', 'shared/video/edl.js', 'shared/commands/args.js', 'shared/ai/cmdtools.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const E = ctx.SlopVideo.edl, A = ctx.SlopCmdArgs, K = ctx.SlopAIKit;
const require = createRequire(import.meta.url);
const opts = { transitions: ['cross', 'wipe', 'black'], fonts: ['Archivo'] };

test('a good edit list is normalised: out → dur, speed, defaults, transitions, titles, music, reframe', () => {
  const r = E.validate(JSON.stringify({ aspect: '9:16', fps: 30, clips: [{ source: 'a.mp4', in: 1, out: 5 }, { source: 'b.mp4', in: 0, out: 4, speed: 2, transition: { type: 'cross', dur: 0.5 } }, 'c.mp4'],
    titles: [{ text: 'Hello', start: 0.5, dur: 2, position: 'bottom', animation: 'pop' }], music: { source: 'song.mp3' }, reframe: { aspect: '9:16', focus: 0.3 }, markers: [{ t: 2, name: 'x' }, 4] }), opts);
  assert.equal(r.ok, true, r.errors.join('; '));
  const [a, b, c] = r.edl.clips;
  assert.equal(a.dur, 4); assert.equal(a.track, 1); assert.equal(a.volume, 1);
  assert.equal(b.dur, 2, 'a 4 s span at 2× is 2 s on the timeline');
  assert.deepEqual(JSON.parse(JSON.stringify(b.transition)), { type: 'cross', dur: 0.5 });
  assert.equal(c.source, 'c.mp4'); assert.equal(c.dur, undefined);
  assert.equal(r.edl.titles[0].position, 'bottom');
  assert.equal(r.edl.music.duck, 0.3); assert.equal(r.edl.music.volume, 0.6);
  assert.equal(r.edl.reframe.focus, 0.3);
  assert.equal(r.edl.markers.length, 2);
});

test('bad edit lists say what is wrong, and clamped values are noted', () => {
  assert.equal(E.validate('{nope', opts).ok, false);
  assert.match(E.validate({}, opts).errors[0], /at least one clip/);
  const r = E.validate({ clips: [{ in: 2 }, { source: 'a', in: 5, out: 3 }, { source: 'b', transition: 'spiral' }], titles: [{ text: 'x' }], aspect: '3:2' }, opts);
  assert.equal(r.ok, false);
  const all = r.errors.join(' | ');
  for (const re of [/clip 1: source is missing/, /clip 2: out \(3\) must be after in \(5\)/, /clip 3: transition must be one of cross, wipe, black/, /title 1: start is missing/, /aspect must be one of/]) assert.match(all, re);
  const n = E.validate({ clips: [{ source: 'a', speed: 40, volume: -1, wobble: 1 }] }, opts);
  assert.equal(n.ok, true);
  assert.equal(n.edl.clips[0].speed, 16);
  assert.ok(n.notes.some((x) => /speed 40 was changed to 16/.test(x)) && n.notes.some((x) => /ignored wobble/.test(x)));
});

test('cover fills the new frame around the focus point and never shows an edge', () => {
  const src = { w: 1920, h: 1080 }, frame = { w: 1080, h: 1920 };
  const c = E.cover(src, frame);
  assert.ok(Math.abs(c.scale - 1920 / 1080 * (1920 / 1080)) < 0.01, 'from fitted width to filled height');
  assert.equal(c.x, 0);
  const left = E.cover(src, frame, { x: 0 }), w = 1920 * (1920 / 1080);
  assert.equal(left.x, Math.round((w - 1080) / 2), 'the left edge stays at the frame edge');
  assert.ok(E.cover(src, frame, { x: 0.25 }).x > 0 && E.cover(src, frame, { x: 0.25 }).x < left.x);
  const pip = E.corner({ w: 1920, h: 1080 }, 'br', 0.25, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(pip)), { scale: 0.25, x: 720, y: 405 });
});

test('ducking keys dip under each span of speech and merge close spans', () => {
  const keys = E.duckKeys({ start: 0, dur: 20 }, [{ a: 2, b: 4 }, { a: 4.3, b: 6 }, { a: 12, b: 14 }], { level: 0.2, ramp: 0.25 });
  assert.deepEqual(JSON.parse(JSON.stringify(keys)), [{ t: 1.75, v: 1 }, { t: 2, v: 0.2 }, { t: 6, v: 0.2 }, { t: 6.25, v: 1 }, { t: 11.75, v: 1 }, { t: 12, v: 0.2 }, { t: 14, v: 0.2 }, { t: 14.25, v: 1 }]);
  assert.equal(E.duckKeys({ start: 30, dur: 5 }, [{ a: 0, b: 10 }]).length, 0);
});

test('caption cues from Whisper segments (seconds) or parsed subtitles (ms)', () => {
  const a = E.cuesOf([{ start: 2, end: 3, text: ' b ' }, { start: 0, end: 1, text: 'a' }, { start: 4, end: 4, text: 'zero' }, { start: 5, end: 6, text: '  ' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), [{ start: 0, end: 1, text: 'a' }, { start: 2, end: 3, text: 'b' }]);
  assert.equal(E.cuesOf([{ start: 1500, end: 2500, text: 'x' }], { ms: true })[0].start, 1.5);
});

test('the json argument type takes an object or its text, checks its size and makes a schema', () => {
  const schema = [{ name: 'edit_list', type: 'json', required: true, maxLength: 50, schema: { type: 'object', properties: { clips: { type: 'array' } } } }];
  assert.deepEqual(JSON.parse(JSON.stringify(A.validate(schema, { edit_list: '{"clips":[]}' }).args.edit_list)), { clips: [] });
  assert.equal(A.validate(schema, { edit_list: { clips: [] } }).ok, true);
  assert.match(A.validate(schema, { edit_list: '{oops' }).errors[0], /must be JSON/);
  assert.match(A.validate(schema, { edit_list: { clips: 'x'.repeat(80) } }).errors[0], /longer than 50/);
  const js = A.jsonSchema(schema);
  assert.equal(js.properties.edit_list.type, 'object');
  assert.ok(js.properties.edit_list.properties.clips);
  const M = require('../../shared/macros/core.js');
  assert.deepEqual(M.cleanArgs({ edit_list: { clips: [{ source: 'a' }] }, f: () => 1 }), { edit_list: { clips: [{ source: 'a' }] } });
});

test('command tools: read-only and sending commands, media results, the run\'s signal', async () => {
  const seen = [];
  const cmds = [
    { id: 'cut.list', tool: 'list_clips', title: 'List', args: [], readOnly: true },
    { id: 'cut.look', tool: 'look_at_frame', title: 'Look at a frame', args: [{ name: 'time', type: 'number' }], sends: true },
    { id: 'cut.delete', tool: 'delete_clips', title: 'Delete clips', args: [{ name: 'clips', type: 'string' }], destructive: true },
  ];
  const cmd = { list: () => cmds, run: () => true, exec: async (id, args, c) => { seen.push([id, c.signal]); return id === 'cut.look' ? { ok: true, args, value: { text: 'frame', media: [{ mime: 'image/jpeg', data: 'AA' }] } } : { ok: true, args, value: 'ok' }; } };
  const tools = K.cmdTools.build(cmd, { label: 'SlopCut', who: 'Anthropic', look: true });
  const by = (n) => tools.find((t) => t.name === n);
  assert.equal(by('list_clips').destructive(), false);
  assert.equal(by('look_at_frame').destructive(), true, 'a sending command is asked every time');
  assert.equal(by('look_at_frame').confirmTitle(), 'Send a copy to Anthropic?');
  assert.equal(by('delete_clips').destructive(), true);
  const sig = { aborted: false };
  const r = await by('look_at_frame').run({ time: 1 }, { signal: sig });
  assert.equal(r.media[0].mime, 'image/jpeg'); assert.match(r.text, /frame/);
  assert.equal(seen[0][1], sig, 'the run\'s signal reaches the command');
  const specs = K.cmdTools.specs(cmd, { who: 'Anthropic' });
  assert.equal(specs.find((s) => s.name === 'list_clips').readOnly, true);
  assert.equal(specs.find((s) => s.name === 'look_at_frame').sends, true);
  assert.equal(specs.find((s) => s.name === 'look_at_frame').mayDestroy, false);
  assert.ok(!K.cmdTools.build(cmd, { look: false }).some((t) => t.name === 'look_at_frame'), 'a model that cannot see gets no picture tool');
});

test('video operations: registered with options, and the SlopCut steps they replay', async () => {
  const R = await import('../../shared/ops/all.js');
  const V = await import('../../shared/ops/video.js');
  for (const id of ['slopedit.edl', 'slopedit.reframe', 'slopedit.captions', 'slopedit.reel', 'transcribe.text']) assert.ok(R.byId(id), id);
  assert.ok(R.byId('video-trim'), 'trimming stays File convert\'s');
  assert.ok(R.accepts(R.byId('slopedit.edl'), 'mp4') && R.accepts(R.byId('slopedit.edl'), 'json'));
  assert.equal(R.outOf(R.byId('transcribe.text'), 'mp4', { format: 'vtt' }), 'vtt');
  assert.equal(R.outOf(R.byId('slopedit.reframe'), 'mp4', { format: 'webm' }), 'webm');
  assert.deepEqual(V.hostSteps('slopedit.reframe', { aspect: '9:16', focus: 30 }).map((s) => [s.cmd, s.args]), [['cut.reframe', { aspect: '9:16', focus_x: 0.3 }]]);
  const reel = V.hostSteps('slopedit.reel', { target: 15, pace: 'fast', aspect: '9:16', seed: 'abc' }, { listen: true });
  assert.deepEqual(reel.map((s) => s.cmd), ['cut.randomEdit', 'cut.captions']);
  assert.equal(reel[1].args.transcribe, 'timeline');
  assert.equal(V.hostSteps('slopedit.captions', {}, { srt: '1\n00:00:00,000 --> 00:00:01,000\nhi\n' })[0].args.srt.startsWith('1\n'), true);
  assert.deepEqual(V.saveOptions({ aspect: '9:16', width: 0, height: 0, fps: 0 }), { format: 'mp4', quality: 'high', aspect: '9:16' });
  assert.deepEqual(V.saveOptions({ width: 360, height: 640, fps: 10 }), { format: 'mp4', quality: 'high', width: 360, height: 640, fps: 10 });
  const v = R.validateOptions(R.byId('slopedit.reel'), { target: '15 s', captions: 'Transcribe' });
  assert.equal(v.options.target, 15); assert.equal(v.options.captions, 'transcribe');
});
