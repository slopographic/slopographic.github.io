/* Slop AI Tools speech engine (classic script for infer.worker.js): any Whisper model exported to ONNX (tiny, base,
 * small, English-only, KB-Whisper, NB-Whisper), its sizes read from the model's config.json.
 * Pipeline: 30-second windows of 16 kHz mono audio → log-mel features (80 bins, Slaney filters, as Whisper) → encoder →
 * the decoder (the merged decoder with its key/value cache reads one new token per step; an older plain decoder reruns
 * on the growing token list) through Whisper's logit rules, quality fallback, no-speech skip and seek
 * (whisper-logits.js, whisper-quality.js, whisper-decode.js, whisper-longform.js). Byte-level BPE is decoded with
 * vocab.json and the GPT-2 byte map.
 * Exposes self.SlopAISpeech = { transcribe(model, samples, opts, progress), detect(model, samples), prepare(files) ... }. */
(function (root) {
  'use strict';
  const SR = 16000, N_FFT = 400, HOP = 160, N_MELS = 80, CHUNK = 30 * SR, FRAMES = 3000;

  /** Slaney-scale mel filterbank [N_MELS][N_FFT/2+1], normalised as librosa does for Whisper. */
  function melFilters() {
    const nb = N_FFT / 2 + 1, fmin = 0, fsp = 200 / 3, minLog = 1000, minLogMel = (minLog - fmin) / fsp, logstep = Math.log(6.4) / 27;
    const hz2mel = (f) => (f >= minLog ? minLogMel + Math.log(f / minLog) / logstep : (f - fmin) / fsp);
    const mel2hz = (m) => (m >= minLogMel ? minLog * Math.exp(logstep * (m - minLogMel)) : fmin + fsp * m);
    const lo = hz2mel(fmin), hi = hz2mel(SR / 2), pts = [];
    for (let i = 0; i < N_MELS + 2; i++) pts.push(mel2hz(lo + ((hi - lo) * i) / (N_MELS + 1)));
    const fftf = (i) => (SR / 2) * (i / (nb - 1));
    const w = [];
    for (let m = 0; m < N_MELS; m++) {
      const row = new Float32Array(nb), l = pts[m], c = pts[m + 1], r = pts[m + 2], enorm = 2 / (r - l);
      for (let k = 0; k < nb; k++) {
        const f = fftf(k), up = (f - l) / (c - l), down = (r - f) / (r - c);
        row[k] = Math.max(0, Math.min(up, down)) * enorm;
      }
      w.push(row);
    }
    return w;
  }
  let FILTERS = null, COS = null, SIN = null, WIN = null;
  function tables() {
    if (FILTERS) return;
    FILTERS = melFilters();
    WIN = new Float32Array(N_FFT);
    for (let n = 0; n < N_FFT; n++) WIN[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT);
    const nb = N_FFT / 2 + 1;
    COS = new Float32Array(nb * N_FFT); SIN = new Float32Array(nb * N_FFT);
    for (let k = 0; k < nb; k++) for (let n = 0; n < N_FFT; n++) { const a = (2 * Math.PI * k * n) / N_FFT; COS[k * N_FFT + n] = Math.cos(a); SIN[k * N_FFT + n] = Math.sin(a); }
  }
  /** Log-mel spectrogram of one window (padded to 30 s), as Float32Array [N_MELS * FRAMES] (row-major mel × frame). */
  function logMel(win) {
    tables();
    const pad = N_FFT / 2, len = CHUNK, x = new Float32Array(len + 2 * pad);
    x.set(win.subarray(0, Math.min(win.length, len)), pad);
    for (let i = 0; i < pad; i++) { x[pad - 1 - i] = x[pad + 1 + i]; x[pad + len + i] = x[pad + len - 2 - i]; } // reflect
    const nb = N_FFT / 2 + 1, mel = new Float32Array(N_MELS * FRAMES), frame = new Float32Array(N_FFT), pw = new Float32Array(nb);
    let mx = -Infinity;
    for (let f = 0; f < FRAMES; f++) {
      const s = f * HOP;
      for (let n = 0; n < N_FFT; n++) frame[n] = x[s + n] * WIN[n];
      for (let k = 0; k < nb; k++) {
        let re = 0, im = 0; const o = k * N_FFT;
        for (let n = 0; n < N_FFT; n++) { re += frame[n] * COS[o + n]; im -= frame[n] * SIN[o + n]; }
        pw[k] = re * re + im * im;
      }
      for (let m = 0; m < N_MELS; m++) {
        const row = FILTERS[m]; let acc = 0;
        for (let k = 0; k < nb; k++) acc += row[k] * pw[k];
        const v = Math.log10(Math.max(acc, 1e-10));
        mel[m * FRAMES + f] = v; if (v > mx) mx = v;
      }
    }
    for (let i = 0; i < mel.length; i++) mel[i] = (Math.max(mel[i], mx - 8) + 4) / 4;
    return mel;
  }

  /** Byte-level BPE decoding: GPT-2 maps each byte to one printable character. */
  function byteDecoder() {
    const bs = [], cs = [];
    for (let b = 33; b < 127; b++) bs.push(b); for (let b = 161; b < 173; b++) bs.push(b); for (let b = 174; b < 256; b++) bs.push(b);
    for (const b of bs) cs.push(b);
    let n = 0; for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
    const m = new Map(); bs.forEach((b, i) => m.set(String.fromCharCode(cs[i]), b));
    return m;
  }
  let BYTES = null;
  function decodeTokens(ids, vocab) {
    BYTES = BYTES || byteDecoder();
    const bytes = [];
    for (const id of ids) { const s = vocab[id]; if (s === undefined) continue; for (const ch of s) { const b = BYTES.get(ch); if (b !== undefined) bytes.push(b); } }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }

  /** The special token ids and the rules' settings, from added_tokens.json, vocab.json and generation_config.json. */
  function specials(added, vocab, gen = {}) {
    for (const k of ['<|startoftranscript|>', '<|notimestamps|>']) if (added[k] === undefined) throw new Error('Whisper tokens are missing ' + k);
    const eot = added['<|endoftext|>'] !== undefined ? added['<|endoftext|>'] : vocab.indexOf('<|endoftext|>');
    if (eot < 0) throw new Error('Whisper vocabulary is missing <|endoftext|>');
    const sot = added['<|startoftranscript|>'], transcribe = added['<|transcribe|>'];
    const multilingual = gen.is_multilingual !== undefined ? !!gen.is_multilingual : transcribe !== undefined;
    const langs = multilingual ? Object.entries(added).filter(([k, v]) => /^<\|[a-z]{2,3}\|>$/.test(k) && v > sot && v < transcribe).map(([k, v]) => ({ code: k.slice(2, -2), id: v })) : [];
    const noTimestamps = gen.no_timestamps_token_id !== undefined ? gen.no_timestamps_token_id : added['<|notimestamps|>'];
    const noSpeech = added['<|nospeech|>'] !== undefined ? added['<|nospeech|>'] : added['<|nocaptions|>'];
    return { sot, eot, transcribe, noTimestamps, ts0: noTimestamps + 1, noSpeech, sotPrev: added['<|startofprev|>'], langs, multilingual };
  }

  const isMerged = (decoder) => decoder.inputNames.includes('use_cache_branch');
  const ids = (ort, tokens) => new ort.Tensor('int64', BigInt64Array.from(tokens.map((t) => BigInt(t))), [1, tokens.length]);
  /** One merged-decoder pass. past: the cache from the last pass, or null for the first. Returns the logits of every
   *  position read in this pass and the cache to pass next time. dims: { heads, headDim } from config.json. */
  async function step(ort, m, tokens, enc, past) {
    const decoder = m.decoder, { heads, headDim } = m.dims;
    const feeds = { input_ids: ids(ort, tokens), encoder_hidden_states: enc, use_cache_branch: new ort.Tensor('bool', new Uint8Array([past ? 1 : 0]), [1]) };
    for (const n of decoder.inputNames) {
      // The first pass ignores the cache (use_cache_branch false), but the web runtime refuses an empty one: one zero step.
      if (n.startsWith('past_key_values.')) feeds[n] = past ? past[n] : new ort.Tensor('float32', new Float32Array(heads * headDim), [1, heads, 1, headDim]);
    }
    const out = await decoder.run(feeds);
    // The encoder's keys and values come out of the first pass only (a cached pass returns them empty): keep those.
    const next = {};
    for (const n of decoder.outputNames) {
      if (!n.startsWith('present.')) continue;
      const k = 'past_key_values.' + n.slice(8);
      next[k] = past && k.includes('.encoder.') ? past[k] : out[n];
    }
    return { logits: out.logits, past: next };
  }
  const rowsOf = (t) => { const V = t.dims[2], L = t.dims[1]; return { rows: (i) => t.data.subarray(i * V, (i + 1) * V), last: t.data.subarray((L - 1) * V, L * V) }; };
  /** A runner for whisper-decode.js: begin(prompt) then next(token), on the cache or (plain decoder) rerunning. */
  function runner(ort, m, enc) {
    if (isMerged(m.decoder)) {
      let past = null;
      return {
        begin: async (prompt) => { const r = await step(ort, m, prompt, enc, null); past = r.past; return rowsOf(r.logits); },
        next: async (tok) => { const r = await step(ort, m, [tok], enc, past); past = r.past; return rowsOf(r.logits).last; },
      };
    }
    const d = m.decoder, toks = [];
    const pass = async () => rowsOf((await d.run({ [d.inputNames[0]]: ids(ort, toks), [d.inputNames[1]]: enc }))[d.outputNames[0]]);
    return { begin: async (prompt) => { toks.push(...prompt); return pass(); }, next: async (tok) => { toks.push(tok); return (await pass()).last; } };
  }

  /** The heads and head size of the decoder's attention, from config.json (Whisper tiny: 6 × 64; base 8 × 64; small 12 × 64). */
  function dimsOf(config) {
    const heads = config.decoder_attention_heads, d = config.d_model;
    if (!heads || !d) throw new Error('The model config.json has no decoder_attention_heads or d_model');
    if (config.num_mel_bins && config.num_mel_bins !== N_MELS) throw new Error('This Whisper model needs ' + config.num_mel_bins + ' mel bins; only 80 are supported');
    return { heads, headDim: d / heads };
  }

  /** Everything the loop needs about one loaded model: special ids, rule settings, the encoder and the runner. */
  async function modelOf(m, samples) {
    const ort = await root.SlopAIOrt.get();
    const gen = m.generation || {};
    const S = specials(m.added, m.vocab, gen);
    m.dims = m.dims || dimsOf(m.config || { decoder_attention_heads: 6, d_model: 384 });
    const ctx = { S, suppress: gen.suppress_tokens || [], beginSuppress: gen.begin_suppress_tokens || [220, S.eot], maxInitialTs: Math.max(50, gen.max_initial_timestamp_index || 0) };   // 1.0 s at least (NB-Whisper ships 1, one step)
    const encode = async (from) => {
      const mel = logMel(samples.subarray(from, Math.min(samples.length, from + CHUNK)));
      const feats = new ort.Tensor('float32', mel, [1, N_MELS, FRAMES]);
      return (await m.encoder.run({ [m.encoder.inputNames[0]]: feats }))[m.encoder.outputNames[0]];
    };
    const detect = async (enc) => {
      if (!S.multilingual) return [{ code: 'en', p: 1 }];
      const r = await runner(ort, m, enc).begin([S.sot]);
      return root.SlopWhisperLogits.languageProbs(r.rows(0), S.langs).map(({ code, p }) => ({ code, p }));
    };
    return { S, ctx, encode, detect, makeRunner: (enc) => runner(ort, m, enc), decodeText: (t) => decodeTokens(t, m.vocab) };
  }

  /**
   * Transcribes samples (Float32Array, 16 kHz mono). opts: { language: 'auto' | code, conditionPrevious, seed }.
   * progress({ done, total, window }) in seconds. Resolves { segments: [{ start, end, text }], language, languages, windows, skipped }.
   */
  async function transcribe(m, samples, opts = {}, progress = () => {}) {
    return root.SlopWhisperLongform.run(await modelOf(m, samples), samples, opts, progress);
  }
  /** The spoken language of the first 30 seconds: [{ code, p }] most likely first (top 5). One encoder pass. */
  async function detect(m, samples) {
    const mo = await modelOf(m, samples);
    return (await mo.detect(await mo.encode(0))).slice(0, 5);
  }

  root.SlopAISpeech = { transcribe, detect, logMel, melFilters, decodeTokens, specials, dimsOf };
})(self);
