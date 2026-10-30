/* Slop AI Tools: Whisper's per-step logit rules, as openai/whisper (decoding.py) and transformers (WhisperForConditionalGeneration)
 * apply them. Pure functions on one row of logits (Float32Array of the vocabulary size), no runtime, so Node tests load it
 * (module.exports) and the worker gets self.SlopWhisperLogits. Classic script.
 *   S: the special token ids (speech-engine.js specials()): { eot, sot, noTimestamps, ts0, noSpeech, ... }
 *   ctx: { S, suppress: number[], beginSuppress: number[], maxInitialTs: 50 (= 1.0 s) }
 * The rules, in order (applyRules):
 *   1. suppress_tokens from generation_config.json, and every special token that is not end-of-text or a timestamp
 *      (start, language, task, <|notimestamps|>, <|nospeech|> ...): those never belong in a transcript;
 *   2. begin_suppress (a lone space, end-of-text) on the first sampled token: a window does not start empty;
 *   3. timestamps: they come in pairs (a segment ends with one and the next one starts with one), never go backwards,
 *      the first token is a timestamp no later than max_initial_timestamp (1.0 s), and when the timestamps together are more
 *      likely than the best text token, a timestamp is forced. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopWhisperLogits = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const NEG = -Infinity;

  /** log-softmax of a row, as a new Float64Array (no change to the row). */
  function logSoftmax(row) {
    let mx = NEG;
    for (let i = 0; i < row.length; i++) if (row[i] > mx) mx = row[i];
    const out = new Float64Array(row.length);
    if (mx === NEG) { out.fill(NEG); return out; }
    let s = 0;
    for (let i = 0; i < row.length; i++) s += Math.exp(row[i] - mx);
    const lse = mx + Math.log(s);
    for (let i = 0; i < row.length; i++) out[i] = row[i] - lse;
    return out;
  }
  /** log(sum(exp(lp[a..b)))). */
  function logSumExp(lp, a, b) {
    let mx = NEG;
    for (let i = a; i < b; i++) if (lp[i] > mx) mx = lp[i];
    if (mx === NEG) return NEG;
    let s = 0;
    for (let i = a; i < b; i++) s += Math.exp(lp[i] - mx);
    return mx + Math.log(s);
  }
  const fill = (row, a, b) => { for (let i = Math.max(0, a); i < Math.min(row.length, b); i++) row[i] = NEG; };

  /** Rule 1 and 2. seq: the tokens sampled so far in this window (not the prompt). */
  function suppress(row, seq, ctx) {
    const S = ctx.S;
    for (const t of ctx.suppress || []) if (t >= 0 && t < row.length) row[t] = NEG;
    fill(row, S.eot + 1, S.ts0);   // specials between end-of-text and the first timestamp
    if (!seq.length) for (const t of ctx.beginSuppress || []) if (t >= 0 && t < row.length) row[t] = NEG;
  }

  /** Rule 3 (ApplyTimestampRules). Changes row in place. */
  function timestampRules(row, seq, ctx) {
    const S = ctx.S, ts0 = S.ts0;
    row[S.noTimestamps] = NEG;
    const n = seq.length;
    const lastTs = n >= 1 && seq[n - 1] >= ts0;
    const penultTs = n < 2 || seq[n - 2] >= ts0;
    if (lastTs) {
      if (penultTs) fill(row, ts0, row.length);   // a pair just closed (or this is the first): text or end comes next
      else fill(row, 0, S.eot);                     // a segment just ended: its partner timestamp or end-of-text
    }
    // timestamps never go backwards; after a closing timestamp the next one may repeat it, otherwise it must move on
    let lastT = -1;
    for (let i = n - 1; i >= 0; i--) if (seq[i] >= ts0) { lastT = seq[i]; break; }
    if (lastT >= 0) fill(row, ts0, lastTs && !penultTs ? lastT : lastT + 1);
    if (n === 0) {
      fill(row, 0, ts0);   // the first token is a timestamp
      if (ctx.maxInitialTs != null) fill(row, ts0 + ctx.maxInitialTs + 1, row.length);
    }
    // if the timestamps together are more likely than any one text token, the next token is a timestamp
    const lp = logSoftmax(row);
    const tsLp = logSumExp(lp, ts0, row.length);
    let maxText = NEG;
    for (let i = 0; i < ts0; i++) if (lp[i] > maxText) maxText = lp[i];
    if (tsLp > maxText) fill(row, 0, ts0);
  }

  /** Every rule on a copy of the row. Returns the processed Float32Array. */
  function applyRules(raw, seq, ctx) {
    const row = Float32Array.from(raw);
    suppress(row, seq, ctx);
    if (ctx.timestamps !== false) timestampRules(row, seq, ctx);
    else row[ctx.S.noTimestamps] = NEG;
    return row;
  }

  /** A small seeded generator (mulberry32): the same seed gives the same samples, so tests can check sampling. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The next token: the most likely (temperature 0) or a sample from softmax(row / temperature). */
  function pick(row, temperature, random) {
    let best = -1, bv = NEG;
    for (let i = 0; i < row.length; i++) if (row[i] > bv) { bv = row[i]; best = i; }
    if (!(temperature > 0) || best < 0) return best;
    let s = 0;
    const p = new Float64Array(row.length);
    for (let i = 0; i < row.length; i++) { p[i] = row[i] === NEG ? 0 : Math.exp((row[i] - bv) / temperature); s += p[i]; }
    let r = random() * s;
    for (let i = 0; i < row.length; i++) { r -= p[i]; if (r <= 0 && p[i] > 0) return i; }
    return best;
  }

  /** Probability of one token in a raw row (no rules): <|nospeech|> at the start position, for the silence check. */
  function probOf(raw, id) {
    if (id == null || id < 0) return 0;
    const lp = logSoftmax(raw);
    return Math.exp(lp[id]);
  }

  /** Language probabilities from the row after <|startoftranscript|>, over the language tokens only (as detect_language).
   *  langs: [{ code, id }]. Returns [{ code, id, p }] sorted most likely first. */
  function languageProbs(raw, langs) {
    let mx = NEG;
    for (const l of langs) if (raw[l.id] > mx) mx = raw[l.id];
    let s = 0;
    const e = langs.map((l) => { const v = Math.exp(raw[l.id] - mx); s += v; return v; });
    return langs.map((l, i) => ({ code: l.code, id: l.id, p: e[i] / s })).sort((a, b) => b.p - a.p);
  }

  return { logSoftmax, logSumExp, suppress, timestampRules, applyRules, rng, pick, probOf, languageProbs };
});
