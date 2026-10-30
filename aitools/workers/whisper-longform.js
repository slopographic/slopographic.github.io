/* Slop AI Tools: Whisper's long-form transcription loop (openai/whisper transcribe(), transformers' long-form generate).
 * No runtime of its own: the model is passed in as two functions, so Node tests drive it with fakes (module.exports);
 * the worker gets self.SlopWhisperLongform. Classic script; needs whisper-decode.js and whisper-quality.js.
 *   run(model, samples, opt, progress) -> { segments: [{ start, end, text }], language, windows, skipped }
 *   model: { S, ctx, decodeText(tokens), encode(fromSample) -> Promise<enc>, makeRunner(enc) -> runner,
 *            detect(enc) -> Promise<[{ code, p }]> (most likely first) }
 *   opt: { language: 'auto' | code, conditionPrevious: false, seed, temperatures, thresholds }
 * Each window is 30 s from the current position (seek). After it is decoded, the position moves to the end of the last
 * complete timestamped segment, so a word cut by the window edge is read again whole in the next window. A window that is
 * silence (no-speech check) is skipped whole. The previous window's text is not used as a prompt unless
 * conditionPrevious is set, and then only after a window that decoded cleanly (temperature below 0.5): a bad window
 * passed on as the prompt is how one loop becomes many. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopWhisperLongform = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  const D = () => root.SlopWhisperDecode || require('./whisper-decode.js');
  const Q = () => root.SlopWhisperQuality || require('./whisper-quality.js');
  const SR = 16000, HOP = 160, WINDOW = 3000, PROMPT_MAX = 223;

  /** The prompt of one window: optional previous text, then start, language and task (English-only models: start only). */
  function promptOf(S, languageId, prev) {
    const base = S.multilingual ? [S.sot, languageId, S.transcribe] : [S.sot];
    if (!prev || !prev.length || S.sotPrev == null) return { prompt: base, sotIndex: 0 };
    const p = [S.sotPrev, ...prev.slice(-PROMPT_MAX)];
    return { prompt: p.concat(base), sotIndex: p.length };
  }

  async function run(model, samples, opt = {}, progress = () => {}) {
    const S = model.S, q = Q();
    const total = Math.ceil(samples.length / HOP), seconds = samples.length / SR;
    const segs = [];
    let seek = 0, windows = 0, skipped = 0, language = null, languages = null, prev = null;
    if (opt.language && opt.language !== 'auto') {
      language = S.langs.find((l) => l.code === opt.language) || S.langs.find((l) => l.code === 'en') || null;
    }
    while (seek < total) {
      const frames = Math.min(WINDOW, total - seek);
      if (windows > 0 && frames < 100 * 0.5) break;   // under half a second left: nothing to read
      progress({ done: seek / 100, total: seconds, window: windows + 1 });
      const enc = await model.encode(seek * HOP);
      windows++;
      if (S.multilingual && !language) {
        languages = await model.detect(enc);
        language = S.langs.find((l) => l.code === languages[0].code);
      }
      const { prompt, sotIndex } = promptOf(S, language && language.id, opt.conditionPrevious ? prev : null);
      const ctx = { ...model.ctx, sotIndex, decodeText: model.decodeText };
      const r = await D().decodeWindow(() => model.makeRunner(enc), prompt, ctx, opt);
      if (r.silent) { skipped++; seek += frames; prev = null; continue; }
      const cut = q.split(r.tokens, S, frames), offset = seek / 100;
      for (const s of cut.segments) {
        const text = model.decodeText(s.tokens).trim();
        if (!text || s.end <= s.start && s.tokens.length < 2) continue;
        segs.push({ start: offset + s.start, end: offset + Math.max(s.end, s.start + 0.2), text });
      }
      seek += Math.max(1, cut.seek);
      prev = r.temperature < 0.5 && r.passed ? r.tokens.filter((t) => t < S.eot) : null;
    }
    progress({ done: seconds, total: seconds, window: windows });
    const code = language ? language.code : S.multilingual ? 'en' : 'en';
    return { segments: q.dropRepeats(segs), language: code, languages: languages ? languages.slice(0, 5) : null, windows, skipped };
  }

  return { run, promptOf, WINDOW };
});
