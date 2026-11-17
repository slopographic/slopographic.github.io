/* Slop Resize: the audio track of a video, kept where the browser can decode it. Classic script; adds to
 * window.SlopResize.video.
 *   audio(blob, seconds, sampleRate)  Promise<[Float32Array L, Float32Array R] | null>
 * The browser's own decoder reads the first audio track (AAC, Opus, MP3 and so on), and an OfflineAudioContext resamples
 * it to stereo at the output rate, cut to the video's length. Resolves null when there is no audio or it cannot be decoded. */
(function (g) {
  'use strict';
  const V = g.SlopResize.video;

  V.audio = async function (blob, seconds, sampleRate = 48000) {
    const AC = g.AudioContext || g.webkitAudioContext;
    if (!AC || typeof g.OfflineAudioContext !== 'function') return null;
    let buf = null;
    try {
      const ctx = new AC();
      try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close().catch(() => {}); }
    } catch (e) { return null; }
    if (!buf || !buf.length || !buf.numberOfChannels) return null;
    const len = Math.max(1, Math.min(Math.ceil(seconds * sampleRate), Math.ceil(buf.duration * sampleRate)));
    const off = new g.OfflineAudioContext(2, len, sampleRate);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(0);
    const out = await off.startRendering();
    return [out.getChannelData(0), out.getChannelData(1)];
  };
})(typeof window !== 'undefined' ? window : globalThis);
