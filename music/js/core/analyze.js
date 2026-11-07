/* Slop Music: track analysis. Reads ID3 tags (MP3) and Vorbis comments (FLAC, Ogg), the duration (WAV header, else one decode) and the
 * waveform peaks. Results are cached in the 'analysis' store, keyed by Drive id and size, so each file is
 * decoded once. Decoding runs one file at a time. Exposes window.SlopMusic.analyze(rec) -> Promise<analysis>. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const PEAKS = 1000, VERSION = 2;   // 2: FLAC and Ogg tags (Vorbis comments), track, year, genre
  const inflight = new Map();
  let chain = Promise.resolve();
  let ctx = null;
  const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  function audioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    return ctx;
  }
  /** Decodes a blob with the browser's decoder. Rejects for formats this browser cannot decode. */
  function decode(blob) {
    const c = audioCtx();
    if (!c) return Promise.reject(new Error('Audio decoding is unavailable'));
    return blob.arrayBuffer().then((buf) => new Promise((res, rej) => {
      const p = c.decodeAudioData(buf, res, rej);
      if (p && p.catch) p.catch(rej);
    }));
  }
  /** Max absolute sample per bucket, across channels: n values from 0 to 1. */
  function peaksOf(buf, n) {
    const len = buf.length, chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.floor((i * len) / n), e = Math.max(s + 1, Math.floor(((i + 1) * len) / n));
      let m = 0;
      for (const data of chans) for (let j = s; j < e && j < len; j++) { const v = Math.abs(data[j]); if (v > m) m = v; }
      out[i] = m;
    }
    return out;
  }
  async function compute(rec) {
    const tags = await M.id3.readTags(rec.blob);
    const out = { id: rec.id, rev: rec.size, v: VERSION, title: tags.title, artist: tags.artist, album: tags.album,
      track: tags.track, year: tags.year, genre: tags.genre, cover: tags.cover, tagVersion: tags.version, duration: null, rate: 0, channels: 0, peaks: null, error: '' };
    const wav = await M.id3.wavInfo(rec.blob).catch(() => null);
    if (wav) { out.duration = wav.duration; out.rate = wav.rate; out.channels = wav.channels; }
    try {
      const buf = await decode(rec.blob);
      if (!out.duration) out.duration = buf.duration;
      out.rate = buf.sampleRate; out.channels = buf.numberOfChannels;
      out.peaks = peaksOf(buf, PEAKS);
    } catch (e) { out.error = 'This browser cannot decode the audio in this file.'; }
    await M.store.putAnalysis(out);
    return out;
  }
  /** The analysis of a Drive record ({ id, size, blob }). Cached results return at once. */
  function analyze(rec) {
    if (inflight.has(rec.id)) return inflight.get(rec.id);
    const p = M.store.getAnalysis(rec.id).then((cached) => {
      if (cached && cached.rev === rec.size && cached.v === VERSION) return cached;
      return enqueue(() => compute(rec));
    }).finally(() => inflight.delete(rec.id));
    inflight.set(rec.id, p);
    return p;
  }
  M.analyze = analyze;
})();
