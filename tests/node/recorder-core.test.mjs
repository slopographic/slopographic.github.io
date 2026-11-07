// Slop Recorder's pure parts: the state machine (recorder/js/core/state.js), the plan (recorder/js/core/plan.js) and what a
// browser can record (recorder/js/core/support.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../../recorder/js/core/state.js');
const P = require('../../recorder/js/core/plan.js');
const B = require('../../recorder/js/core/support.js');

test('state: idle → countdown → recording ⇄ paused → review, with the countdown counted down', () => {
  const m = S.create(), seen = [];
  m.on((s, prev) => seen.push(`${prev}>${s}`));
  assert.equal(m.arm(3, 1000), 'countdown');
  assert.equal(m.left(1000), 3);
  assert.equal(m.left(2500), 2);
  assert.equal(m.due(3999), false);
  assert.equal(m.due(4000), true);
  m.go(4000);
  assert.equal(m.state, 'recording');
  assert.equal(m.elapsed(6000), 2000);
  m.pause(6000);
  assert.equal(m.elapsed(9000), 2000, 'a pause does not count');
  m.resume(9000);
  assert.equal(m.elapsed(10000), 3000);
  m.pause(10500); m.stop(12000);
  assert.equal(m.state, 'review');
  assert.equal(m.elapsed(99999), 3500, 'stopped while paused: the pause is left out');
  assert.deepEqual(seen, ['idle>countdown', 'countdown>recording', 'recording>paused', 'paused>recording', 'recording>paused', 'paused>review']);
});

test('state: no countdown starts at once; review can discard or record again; cancel ends a countdown', () => {
  const m = S.create();
  assert.equal(m.arm(0, 0), 'recording');
  m.stop(1500);
  assert.equal(m.elapsed(5000), 1500);
  assert.equal(m.arm(5, 2000), 'countdown');
  assert.equal(m.elapsed(2000), 0, 'a new recording starts from nothing');
  m.cancel(2100);
  assert.equal(m.state, 'idle');
  m.arm(0, 3000); m.stop(3100); m.discard(3200);
  assert.equal(m.state, 'idle');
});

test('state: pause accounting: several pauses add up, the timer stands still while paused, a new recording starts at 0', () => {
  const m = S.create();
  m.arm(0, 100);   // the time MediaRecorder.start was called
  assert.equal(m.paused(100), 0);
  m.pause(1100);
  assert.equal(m.elapsed(1100), 1000);
  assert.equal(m.elapsed(1800), 1000, 'the timer stands still while paused');
  assert.equal(m.paused(1800), 700, 'the pause going on counts');
  m.resume(1800);
  assert.equal(m.paused(5000), 700, 'a pause that is over stays as long as it was');
  m.pause(2300); m.resume(2400);
  assert.equal(m.paused(2400), 800);
  assert.equal(m.elapsed(2800), 1900, '2.7 s since the start, 0.8 s of it paused');
  m.pause(3000); m.stop(3500);
  assert.equal(m.elapsed(9999), 2100);
  assert.equal(m.paused(9999), 1300, 'stopped while paused: that pause ends at Stop');
  assert.equal(m.elapsed(9999) + m.paused(9999), 3500 - 100, 'recorded and paused together are the whole time');
  m.arm(0, 10000);
  assert.equal(m.paused(10500), 0); assert.equal(m.elapsed(10500), 500);
});

test('state: the countdown is not recorded; the time counts from go (the start call), even when go comes later', () => {
  const m = S.create();
  m.arm(3, 0);
  assert.equal(m.elapsed(2000), 0);
  assert.equal(m.paused(2000), 0);
  m.go(3000);   // the recorder was started at 3000; its start event came at 4900 (a busy machine), the page moves now
  assert.equal(m.elapsed(4900), 1900, 'the time before the start event is in the file, so it is in the timer too');
  m.pause(5000); m.resume(4990);
  assert.equal(m.paused(6000), 0, 'a clock that went backwards adds no pause');
  assert.equal(m.elapsed(6000), 3000);
});

test('state: actions that do not fit the state are refused with the reason', () => {
  const m = S.create();
  assert.throws(() => m.pause(0), /Cannot pause while idle/);
  assert.throws(() => m.stop(0), /Cannot stop while idle/);
  m.arm(3, 0);
  assert.throws(() => m.arm(3, 0), /Cannot arm while counting down/);
  assert.throws(() => m.resume(0), /Cannot resume while counting down/);
  m.go(3000);
  assert.throws(() => m.resume(3000), /Cannot resume while recording/);
  assert.throws(() => m.go(3000), /Cannot go while recording/);
  assert.equal(m.can('pause'), true);
  assert.equal(m.can('discard'), false);
  assert.throws(() => m.pause('soon'), /time in ms/);
});

test('plan: settings are checked, formats follow the source, needs say what to ask for', () => {
  assert.deepEqual(P.clean({ source: 'nope', countdown: 7, pipSize: 'big', corner: 'xx' }),
    Object.assign({}, P.DEFAULTS));
  assert.equal(P.clean({ source: 'mic', format: 'gif' }).format, 'webm');
  assert.equal(P.clean({ source: 'mic', format: 'wav' }).format, 'wav');
  assert.equal(P.clean({ source: 'camera', format: 'wav' }).format, 'webm');
  assert.deepEqual(P.formatsFor('pip'), ['webm', 'mp4', 'gif']);
  assert.deepEqual(P.needs({ source: 'pip', systemAudio: true, mic: false }), { display: true, camera: true, mic: false, systemAudio: true });
  assert.deepEqual(P.needs({ source: 'camera', systemAudio: true, mic: true }), { display: false, camera: true, mic: true, systemAudio: false });
  assert.deepEqual(P.needs({ source: 'mic', mic: false }), { display: false, camera: false, mic: true, systemAudio: false });
});

test('plan: the webcam corner keeps its shape and a margin', () => {
  assert.deepEqual(P.pipRect(1920, 1080, 1280, 720, 'br', 25), { x: 1920 - 480 - 32, y: 1080 - 270 - 32, w: 480, h: 270 });
  assert.deepEqual(P.pipRect(1000, 1000, 640, 480, 'tl', 20), { x: 30, y: 30, w: 200, h: 150 });
  assert.equal(P.pipRect(1000, 500, 0, 0, 'tr', 99).w, 500, 'at most half the width');
});

test('plan: trim ranges stay inside the recording and at least 0.1 s long', () => {
  assert.deepEqual(P.clampTrim(-2, 99, 10), { start: 0, end: 10 });
  assert.deepEqual(P.clampTrim(4, 2, 10), { start: 4, end: 4.1 });
  assert.deepEqual(P.clampTrim(10, 10, 10), { start: 9.9, end: 10 });
  assert.deepEqual(P.clampTrim(1.23456, '', 5), { start: 1.235, end: 5 });
  assert.equal(P.isTrimmed({ start: 0, end: 10 }, 10), false);
  assert.equal(P.isTrimmed({ start: 0.5, end: 10 }, 10), true);
  assert.equal(P.isTrimmed({ start: 0, end: 9 }, 10), true);
});

test('plan: ffmpeg cuts the range after the input and encodes MP4, GIF and WebM', () => {
  const t = { start: 1.5, end: 4 };
  const mp4 = P.ffmpegArgs('mp4', t)('in.webm', 'out.mp4');
  assert.deepEqual(mp4.slice(0, 6), ['-i', 'in.webm', '-ss', '1.5', '-t', '2.5']);
  assert.ok(mp4.includes('libx264') && mp4.includes('+faststart') && mp4[mp4.length - 1] === 'out.mp4');
  const gif = P.ffmpegArgs('gif', null, { gifWidth: 320, gifFps: 12 })('a', 'b');
  assert.deepEqual(gif, ['-i', 'a', '-vf', 'fps=12,scale=320:-2:flags=lanczos', '-loop', '0', 'b']);
  assert.ok(P.ffmpegArgs('webm', t)('a', 'b').includes('libvpx'));
});

test('plan: the recording type, names and clocks', () => {
  const only = (list) => (t) => list.includes(t);
  assert.equal(P.pickMime(only(['video/webm', 'video/mp4'])), 'video/webm');
  assert.equal(P.pickMime(only(['video/mp4'])), 'video/mp4');
  assert.equal(P.pickMime(only(['audio/webm;codecs=opus']), true), 'audio/webm;codecs=opus');
  assert.equal(P.pickMime(() => { throw new Error('x'); }), '');
  assert.equal(P.fileName(new Date(2026, 9, 24, 21, 5, 9), 'webm'), 'Recording 2026-10-24 21-05-09.webm');
  assert.equal(P.clock(3723999), '01:02:03');
  assert.equal(P.seconds(62.46), '1:02.5');
  assert.equal(P.seconds(3), '0:03.0');
  assert.equal(P.extOf('video/webm;codecs=vp9'), 'webm');
  assert.equal(P.extOf('audio/mp4'), 'm4a');
  assert.equal(P.extOf('video/mp4'), 'mp4');
});

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
const ALL = { display: true, user: true, recorder: true, canvasStream: true, mediaStream: true, types: ['video/webm', 'video/mp4'] };
const row = (caps, ua, id) => B.rows(caps, ua).find((r) => r.id === id);

test('support: browsers and systems are told apart', () => {
  assert.deepEqual(B.browserOf(UA.edge), { name: 'edge', os: 'windows', mobile: false, label: 'Edge on Windows' });
  assert.equal(B.browserOf(UA.chromeMac).label, 'Chrome on macOS');
  assert.equal(B.browserOf(UA.firefox).name, 'firefox');
  assert.equal(B.browserOf(UA.safari).name, 'safari');
  assert.equal(B.browserOf(UA.iphone).mobile, true);
});

test('support: sound from the screen is Chromium only, the whole screen only on Windows and ChromeOS', () => {
  assert.equal(row(ALL, UA.chromeWin, 'system').status, 'yes');
  assert.equal(row(ALL, UA.chromeMac, 'system').status, 'partial');
  assert.equal(row(ALL, UA.firefox, 'system').status, 'no');
  assert.equal(row(ALL, UA.safari, 'system').status, 'no');
  assert.deepEqual(B.systemAudio(B.browserOf(UA.chromeWin)), { tab: 'yes', screen: 'yes', window: 'no' });
});

test('support: a phone has no screen capture; the rows say what is missing', () => {
  const phone = Object.assign({}, ALL, { display: false, mediaStream: false, types: ['video/mp4'] });
  assert.equal(row(phone, UA.iphone, 'screen').status, 'no');
  assert.match(row(phone, UA.iphone, 'screen').note, /Phones and tablets/);
  assert.equal(row(phone, UA.iphone, 'camera').status, 'yes');
  assert.equal(row(phone, UA.iphone, 'pip').status, 'no');
  assert.equal(row(phone, UA.iphone, 'trim').status, 'partial');
  assert.match(row(phone, UA.iphone, 'format').note, /^MP4/);
  assert.equal(row({}, '', 'format').status, 'no');
  assert.equal(B.TABLE.length, 5);
});
