// How good a decoded Whisper window is, and where the next one starts (aitools/workers/whisper-quality.js): the gzip
// compression ratio, the fallback and no-speech decisions, the loop guard, the seek to the last complete segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { S, ts } from './whisper-fake.mjs';

const require = createRequire(import.meta.url);
const Q = require('../../aitools/workers/whisper-quality.js');

test('compression ratio: a loop compresses far better than speech (above 2.4), ordinary text does not', async () => {
  const loop = Array(12).fill('Ja, det är så här.').join(' - ');
  const speech = 'Det var en gång en man och en hustru som hade fullt upp av allt gott, gårdar och gruvor och rykande smedjor.';
  assert.ok((await Q.compressionRatio(loop)) > 2.4, 'the reported loop');
  assert.ok((await Q.compressionRatio(speech)) < 2.4, 'a real sentence');
  assert.equal(await Q.compressionRatio(''), 0);
});

test('fallback: too repetitive, too unsure or a cut loop decodes again; a clean window does not', () => {
  assert.equal(Q.needsFallback({ compressionRatio: 3.1, avgLogprob: -0.2 }), true);
  assert.equal(Q.needsFallback({ compressionRatio: 1.5, avgLogprob: -1.4 }), true);
  assert.equal(Q.needsFallback({ compressionRatio: 1.5, avgLogprob: -0.4, looped: true }), true);
  assert.equal(Q.needsFallback({ compressionRatio: 1.5, avgLogprob: -0.4 }), false);
  assert.equal(Q.needsFallback({ compressionRatio: 2.0, avgLogprob: -0.4 }, { compressionRatio: 1.8 }), true);
});

test('no speech: skipped only when <|nospeech|> is above 0.6 and the text was unsure', () => {
  assert.equal(Q.isSilent({ noSpeechProb: 0.9, avgLogprob: -1.5 }), true);
  assert.equal(Q.isSilent({ noSpeechProb: 0.9, avgLogprob: -0.3 }), false, 'sure text wins over the no-speech guess');
  assert.equal(Q.isSilent({ noSpeechProb: 0.4, avgLogprob: -2 }), false);
});

test('the loop guard finds a block repeated three times back to back, and leaves short repeats ("ja, ja, ja") alone', () => {
  const block = [1, 2, 3, 4, 5];
  assert.equal(Q.loopAt([7, 8, ...block, ...block, ...block]), 7, 'keep up to the first copy');
  assert.equal(Q.loopAt([7, 8, ...block, ...block]), -1, 'twice is not a loop');
  assert.equal(Q.loopAt([1, 1, 1, 6]), -1);
  assert.equal(Q.loopAt([2, 1, 1, 1]), -1, 'a word three times is speech');
  assert.equal(Q.loopAt(Array(14).fill(4)), 6, 'one token over and over is (cut after its first 12-token block)');
});

test('seek: after the last complete segment when the text runs on; the whole window when it ended on a timestamp', () => {
  // <0.00> a b <2.00><2.00> c d <5.00><5.00> e f (cut by the window edge)
  const runOn = [ts(0), 1, 2, ts(2), ts(2), 3, 4, ts(5), ts(5), 5, 6];
  const a = Q.split(runOn, S, 3000);
  assert.deepEqual(a.segments.map((s) => [s.start, s.end, s.tokens]), [[0, 2, [1, 2]], [2, 5, [3, 4]]]);
  assert.equal(a.seek, 500, 'the next window starts at 5.00 s (500 frames), so "e f" is read again whole');
  // a window that ends with a single timestamp: every segment is complete, seek past the whole window
  const clean = [ts(0), 1, 2, ts(2), ts(2), 3, 4, ts(5)];
  const b = Q.split(clean, S, 3000);
  assert.equal(b.segments.length, 2);
  assert.equal(b.seek, 3000);
  // no pair at all: one segment to the last timestamp, seek the whole (shorter) window
  const c = Q.split([ts(0.5), 1, 2, ts(4)], S, 1200);
  assert.deepEqual(c.segments.map((s) => [s.start, s.end]), [[0.5, 4]]);
  assert.equal(c.seek, 1200);
});

test('the same line three times in a row is kept once more at most (a loop the windows carried on)', () => {
  const segs = ['Ja, det är så här.', 'Ja, det är så här.', 'ja det är så här', 'Ja, det är så här.', 'Nej.'].map((text, i) => ({ start: i, end: i + 1, text }));
  assert.deepEqual(Q.dropRepeats(segs).map((s) => s.text), ['Ja, det är så här.', 'Ja, det är så här.', 'Nej.']);
});
