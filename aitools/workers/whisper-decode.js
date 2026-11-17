/* Slop AI Tools: decoding one 30-second Whisper window with openai/whisper's quality fallback. No runtime of its own: the
 * model is a "runner" passed in, so Node tests drive it with fake logits (module.exports); the worker gets
 * self.SlopWhisperDecode. Classic script; needs whisper-logits.js and whisper-quality.js.
 *   runner: { begin(prompt) -> Promise<{ rows(i) -> Float32Array, last: Float32Array }>, next(token) -> Promise<Float32Array> }
 *     begin reads the whole prompt and gives the logits of every prompt position (rows) and of the last (last);
 *     next adds one token and gives the logits after it. A fresh runner per attempt: makeRunner().
 *   decodeWindow(makeRunner, prompt, ctx, opt) -> { tokens, text, avgLogprob, compressionRatio, noSpeechProb, temperature,
 *     looped, silent, attempts }
 * ctx: the logit rules' context (whisper-logits.js) plus sotIndex (the position of <|startoftranscript|> in the prompt) and
 * decodeText(tokens) -> string. opt: { temperatures: [0, .2, .4, .6, .8, 1], maxTokens: 224, seed, thresholds }. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopWhisperDecode = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  const L = () => root.SlopWhisperLogits || require('./whisper-logits.js');
  const Q = () => root.SlopWhisperQuality || require('./whisper-quality.js');
  const TEMPERATURES = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const MAX_TOKENS = 224;   // Whisper's sample_len: half its 448-token context

  /** One attempt at one temperature. */
  async function once(runner, prompt, ctx, temperature, random, maxTokens, opt) {
    const lg = L(), q = Q(), S = ctx.S;
    const first = await runner.begin(prompt);
    const noSpeechProb = S.noSpeech != null ? lg.probOf(first.rows(ctx.sotIndex || 0), S.noSpeech) : 0;
    const seq = [];
    let row = first.last, sum = 0, looped = false, ended = false;
    for (let n = 0; n < maxTokens; n++) {
      const proc = lg.applyRules(row, seq, ctx);
      const tok = lg.pick(proc, temperature, random);
      if (tok < 0) break;
      sum += lg.logSoftmax(proc)[tok];
      if (tok === S.eot) { ended = true; break; }
      seq.push(tok);
      // the loop guard: on text tokens only, so the timestamps between repeats do not hide them
      const text = seq.filter((t) => t < S.eot);
      const at = q.loopAt(text, opt.loop);
      if (at >= 0) {
        looped = true;
        let kept = 0, cut = seq.length;
        for (let i = 0; i < seq.length; i++) if (seq[i] < S.eot && ++kept > at) { cut = i; break; }
        seq.length = cut;
        break;
      }
      if (n + 1 < maxTokens) row = await runner.next(tok);
    }
    const avgLogprob = sum / (seq.length + 1);
    const text = ctx.decodeText(seq.filter((t) => t < S.eot));
    return { tokens: seq, text, avgLogprob, noSpeechProb, temperature, looped, ended, compressionRatio: await q.compressionRatio(text) };
  }

  /** Decodes a window, hotter each time the result is repetitive, unsure or looping; stops early on silence. */
  async function decodeWindow(makeRunner, prompt, ctx, opt = {}) {
    const q = Q(), temps = opt.temperatures || TEMPERATURES, maxTokens = opt.maxTokens || MAX_TOKENS;
    const random = L().rng(opt.seed == null ? 1234 : opt.seed);
    let r = null, passed = false;
    const tries = [];
    for (const t of temps) {
      r = await once(makeRunner(), prompt, ctx, t, random, maxTokens, opt);
      tries.push(r);
      // silence: no fallback (whisper: a confident no-speech overrides the logprob check)
      if (q.isSilent(r, opt.thresholds)) break;
      if (!q.needsFallback(r, opt.thresholds)) { passed = true; break; }
    }
    // every temperature failed: the surest attempt that neither repeats nor loops, else the surest of all (a loop in it is
    // already cut to one copy)
    if (!passed && !q.isSilent(r, opt.thresholds)) {
      const lim = { ...q.DEFAULTS, ...(opt.thresholds || {}) }.compressionRatio;
      const ok = tries.filter((x) => !x.looped && x.compressionRatio <= lim);
      r = (ok.length ? ok : tries).slice().sort((a, b) => b.avgLogprob - a.avgLogprob)[0];
    }
    r.attempts = tries.map((x) => ({ temperature: x.temperature, avgLogprob: x.avgLogprob, compressionRatio: x.compressionRatio, looped: x.looped }));
    r.passed = passed;
    r.silent = q.isSilent(r, opt.thresholds);
    return r;
  }

  return { decodeWindow, once, TEMPERATURES, MAX_TOKENS };
});
