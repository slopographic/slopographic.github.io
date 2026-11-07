// Decoding Whisper windows with the quality fallback (aitools/workers/whisper-decode.js) and the long-form loop
// (aitools/workers/whisper-longform.js), on a fake model: temperature fallback on a loop or an unsure window, the loop
// guard, the no-speech skip, the seek to the last complete segment, and no previous-text prompt unless asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { S, V, ts, ctx, row, scripted, says } from './whisper-fake.mjs';

const require = createRequire(import.meta.url);
const D = require('../../aitools/workers/whisper-decode.js');
const LF = require('../../aitools/workers/whisper-longform.js');
const PROMPT = [S.sot, 12, S.transcribe];
const loop = [ts(0), ...Array(60).fill([1, 2, 3, 4, 5]).flat()];
/** A row the model is unsure of: the token only just ahead of the other text tokens. */
const unsure = (tok) => { const r = new Float32Array(V).fill(-6); for (let i = 0; i < 10; i++) r[i] = 1.9; r[tok] = 2; return r; };

test('a clean window decodes once, greedily', async () => {
  const make = scripted(says([ts(0), 1, 2, ts(1.5)]));
  const r = await D.decodeWindow(make, PROMPT, ctx(), {});
  assert.deepEqual(r.tokens, [ts(0), 1, 2, ts(1.5)]);
  assert.deepEqual(r.attempts.map((a) => a.temperature), [0]);
  assert.equal(r.passed, true);
  assert.equal(r.silent, false);
  assert.ok(r.avgLogprob > -0.1);
});

test('a loop is cut by the guard and decoded again hotter; the first clean attempt is kept', async () => {
  const make = scripted((seq, attempt) => (attempt === 0 ? says(loop)(seq) : says([ts(0), 6, 7, ts(2)])(seq)));
  const r = await D.decodeWindow(make, PROMPT, ctx(), {});
  assert.equal(r.attempts[0].looped, true);
  assert.deepEqual(r.attempts.map((a) => a.temperature), [0, 0.2]);
  assert.deepEqual(r.tokens, [ts(0), 6, 7, ts(2)]);
});

test('when every temperature loops, the output keeps the repeated block once: a loop never fills the window', async () => {
  const make = scripted(says(loop));
  const r = await D.decodeWindow(make, PROMPT, ctx(), {});
  assert.deepEqual(r.attempts.map((a) => a.temperature), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  const text = r.tokens.filter((t) => t < S.eot);
  assert.ok(text.length < 25, `kept ${text.length} of the 300 tokens the model would say`);
  assert.deepEqual(r.tokens.slice(0, 6), [ts(0), 1, 2, 3, 4, 5], 'the surest attempt (greedy) is the one kept');
});

test('an unsure window (average log-probability under -1) falls back; sampling is seeded, so the result repeats', async () => {
  const script = (seq, attempt) => (attempt < 2 ? unsure(seq.length === 0 ? ts(0) : seq.length < 4 ? 3 : S.eot) : says([ts(0), 8, ts(1)])(seq));
  const a = await D.decodeWindow(scripted(script), PROMPT, ctx(), { seed: 5 });
  const b = await D.decodeWindow(scripted(script), PROMPT, ctx(), { seed: 5 });
  assert.ok(a.attempts[0].avgLogprob < -1, `first attempt ${a.attempts[0].avgLogprob}`);
  assert.equal(a.attempts.length, 3);
  assert.deepEqual(a.tokens, [ts(0), 8, ts(1)]);
  assert.deepEqual(a.attempts, b.attempts);
});

test('silence: <|nospeech|> above 0.6 with unsure text is skipped at once; sure text is kept even then', async () => {
  const quiet = scripted((seq) => unsure(seq.length === 0 ? ts(0) : seq.length < 3 ? 3 : S.eot), { noSpeech: 30 });
  const r = await D.decodeWindow(quiet, PROMPT, ctx(), {});
  assert.equal(r.silent, true);
  assert.equal(quiet.attempts(), 1, 'no fallback for silence');
  assert.ok(r.noSpeechProb > 0.6);
  const sure = await D.decodeWindow(scripted(says([ts(0), 1, ts(1)]), { noSpeech: 30 }), PROMPT, ctx(), {});
  assert.equal(sure.silent, false);
});

/** A fake model for the long-form loop: one script per window start (in samples). */
function fakeModel(byStart, { noSpeechAt = [] } = {}) {
  const starts = [];
  const makers = {};
  return {
    starts, makers, S, ctx: ctx(), decodeText: (t) => t.map((x) => 'w' + x).join(' '),
    encode: async (from) => { starts.push(from); return { from }; },
    detect: async () => [{ code: 'en', p: 0.93 }],
    makeRunner: (enc) => {
      if (!makers[enc.from]) makers[enc.from] = scripted(byStart(enc.from), { noSpeech: noSpeechAt.includes(enc.from) ? 30 : -10 });
      return makers[enc.from]();
    },
  };
}

test('long form: the next window starts at the end of the last complete segment, not 30 s on', async () => {
  const m = fakeModel((from) => (from === 0 ? says([ts(0), 1, ts(2), ts(2), 2, ts(25), ts(25), 3]) : says([ts(0), 4, ts(3)])));
  const r = await LF.run(m, new Float32Array(50 * 16000), { language: 'auto' });
  assert.deepEqual(m.starts, [0, 25 * 16000]);
  assert.deepEqual(r.segments.map((s) => [s.start, s.end, s.text]), [[0, 2, 'w1'], [2, 25, 'w2'], [25, 28, 'w4']]);
  assert.equal(r.language, 'en');
  assert.equal(r.languages[0].p, 0.93);
});

test('long form: a silent window gives no text and the loop moves a whole window on', async () => {
  const m = fakeModel((from) => (from === 0 ? (seq) => unsure(seq.length === 0 ? ts(0) : seq.length < 3 ? 3 : S.eot) : says([ts(0), 4, ts(2)])), { noSpeechAt: [0] });
  const r = await LF.run(m, new Float32Array(45 * 16000), { language: 'en' });
  assert.deepEqual(m.starts, [0, 30 * 16000]);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.segments.map((s) => s.text), ['w4']);
});

test('long form: no previous-text prompt by default; with conditionPrevious, only after a clean window', async () => {
  const script = (from) => says([ts(0), from ? 5 : 4, ts(10)]);
  const plain = fakeModel(script);
  await LF.run(plain, new Float32Array(50 * 16000), { language: 'en' });
  for (const k of Object.keys(plain.makers)) for (const p of plain.makers[k].prompts) assert.equal(p[0], S.sot);
  const cond = fakeModel(script);
  await LF.run(cond, new Float32Array(50 * 16000), { language: 'en', conditionPrevious: true });
  const second = cond.makers[30 * 16000].prompts[0];
  assert.deepEqual(second, [S.sotPrev, 4, S.sot, 12, S.transcribe]);
});

test('long form: the same line window after window is kept at most twice', async () => {
  const m = fakeModel(() => says([ts(0), 7, ts(29.9)]));
  const r = await LF.run(m, new Float32Array(150 * 16000), { language: 'en' });
  assert.equal(m.starts.length, 5);
  assert.deepEqual(r.segments.map((s) => s.text), ['w7', 'w7']);
});
