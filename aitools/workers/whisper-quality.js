/* Slop AI Tools: how good one decoded Whisper window is, and where the next window starts. Pure functions (no runtime),
 * so Node tests load it (module.exports) and the worker gets self.SlopWhisperQuality. Classic script.
 *   compressionRatio(text)  bytes / zlib-compressed bytes: above 2.4 the text repeats itself (openai/whisper's check)
 *   needsFallback(r, opt)   decode again at a higher temperature: too repetitive, too unsure, or a loop was cut
 *   isSilent(r, opt)        <|nospeech|> above 0.6 and an unsure decode: the window is silence or music, no text
 *   loopAt(seq, opt)        where a block of tokens starts repeating itself back to back (the loop guard)
 *   split(tokens, S, frames) the timed segments of a window and how far to seek (to the last complete segment)
 *   dropRepeats(segments)   the same line three times in a row is a loop: keep it once */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopWhisperQuality = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const DEFAULTS = { compressionRatio: 2.4, logprob: -1.0, noSpeech: 0.6, loopTimes: 3, loopMaxLen: 40, loopMinCover: 12 };
  const TS_FRAMES = 2;   // one timestamp step (0.02 s) is two mel frames (10 ms each)

  /** UTF-8 length over zlib (deflate) length, as zlib.compress in openai/whisper. CompressionStream is in browsers, workers
   *  and Node 18+. Empty text is 0. */
  async function compressionRatio(text) {
    const bytes = new TextEncoder().encode(text || '');
    if (!bytes.length) return 0;
    const cs = new CompressionStream('deflate');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(cs));
    const z = new Uint8Array(await out.arrayBuffer());
    return bytes.length / z.length;
  }

  /** r: { compressionRatio, avgLogprob, looped }. True when the window should be decoded again, hotter. */
  function needsFallback(r, opt = {}) {
    const o = { ...DEFAULTS, ...opt };
    if (r.looped) return true;
    if (r.compressionRatio > o.compressionRatio) return true;
    if (r.avgLogprob < o.logprob) return true;
    return false;
  }
  /** r: { noSpeechProb, avgLogprob }. Whisper's no-speech skip: the model says no speech and was not sure of its text. */
  function isSilent(r, opt = {}) {
    const o = { ...DEFAULTS, ...opt };
    return r.noSpeechProb > o.noSpeech && r.avgLogprob < o.logprob;
  }

  /** The loop guard. seq: the text tokens of a window so far. If its end is one block (1 to loopMaxLen tokens) repeated
   *  loopTimes times back to back, covering at least loopMinCover tokens, returns the index where the first repeat starts
   *  (keep seq.slice(0, index): the block once); otherwise -1. "ja, ja, ja" (short) is speech; a sentence three times is not. */
  function loopAt(seq, opt = {}) {
    const o = { ...DEFAULTS, ...opt }, n = seq.length;
    for (let len = 1; len <= o.loopMaxLen && len * o.loopTimes <= n; len++) {
      if (len * o.loopTimes < o.loopMinCover) continue;
      let ok = true;
      for (let k = 1; k < o.loopTimes && ok; k++) {
        for (let i = 0; i < len; i++) if (seq[n - 1 - i] !== seq[n - 1 - i - k * len]) { ok = false; break; }
      }
      if (ok) return n - (o.loopTimes - 1) * len;
    }
    return -1;
  }

  /**
   * The segments of one decoded window and how far to move on, as openai/whisper's transcribe() does.
   * tokens: the sampled tokens (no prompt, no end-of-text). S.ts0: the first timestamp token. frames: mel frames of audio
   * in this window (at most 3000). Returns { segments: [{ start, end, tokens }] (seconds from the window start), seek }
   * where seek is in frames: the end of the last complete segment, or the whole window when the text ended cleanly.
   */
  function split(tokens, S, frames) {
    const isTs = (t) => t >= S.ts0;
    const n = tokens.length, out = [];
    const singleEnd = n >= 2 && !isTs(tokens[n - 2]) && isTs(tokens[n - 1]);
    const cuts = [];
    for (let i = 1; i < n; i++) if (isTs(tokens[i]) && isTs(tokens[i - 1])) cuts.push(i);
    const time = (t) => (t - S.ts0) * 0.02;
    const add = (slice) => {
      const text = slice.filter((t) => !isTs(t));
      if (!text.length) return;
      const s = isTs(slice[0]) ? time(slice[0]) : 0, e = isTs(slice[slice.length - 1]) ? time(slice[slice.length - 1]) : frames / 100;
      out.push({ start: s, end: Math.max(e, s), tokens: text });
    };
    if (cuts.length) {
      const ends = singleEnd ? cuts.concat([n]) : cuts;
      let last = 0;
      for (const c of ends) { add(tokens.slice(last, c)); last = c; }
      if (singleEnd) return { segments: out, seek: frames };
      // the text after the last pair is unfinished: the next window starts where the last complete segment ended
      const endTs = tokens[last - 1];
      return { segments: out, seek: Math.min(frames, Math.max(1, (endTs - S.ts0) * TS_FRAMES)) };
    }
    // no pair: one segment for the window; a final timestamp, if any, gives its end
    let endT = null;
    for (let i = n - 1; i >= 0; i--) if (isTs(tokens[i])) { endT = tokens[i]; break; }
    if (endT !== null && endT > S.ts0) {
      const startT = isTs(tokens[0]) ? tokens[0] : S.ts0;
      const text = tokens.filter((t) => !isTs(t));
      if (text.length) out.push({ start: time(startT), end: time(endT), tokens: text });
    } else add(tokens);
    return { segments: out, seek: frames };
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
  /** Keeps a line at most twice in a row (a third copy is a loop the windows carried on). Segments: [{ text, ... }]. */
  function dropRepeats(segments, times = 2) {
    const out = [];
    for (const s of segments) {
      const k = norm(s.text);
      let same = 0;
      for (let i = out.length - 1; i >= 0 && norm(out[i].text) === k; i--) same++;
      if (k && same >= times) continue;
      out.push(s);
    }
    return out;
  }

  return { DEFAULTS, compressionRatio, needsFallback, isSilent, loopAt, split, dropRepeats };
});
