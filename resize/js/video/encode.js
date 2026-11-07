/* Slop Resize: encoder and muxer setup for video. Picks a WebCodecs video encoder for the container (H.264 for MP4, then
 * VP9 or VP8 for WebM; VP9 and AV1 as fallbacks), an audio encoder (AAC or Opus), and writes the file with the vendored
 * mp4-muxer or webm-muxer (vendor/). Classic script; adds to window.SlopResize.video.
 *   bitrate(w, h, fps, quality)          bits per second for low | medium | high
 *   pick(format, w, h, fps, bitrate)     Promise<{ mux, codec, cfg }>   (throws when nothing encodes)
 *   pickAudio(format)                    Promise<{ mux, codec, cfg } | null>
 *   makeMuxer(format, v, a, w, h, fps)   { muxer, target, type, ext }
 *   audioFeeder(aenc, pcm, sampleRate)   feed(t) encodes the planar stereo PCM up to t seconds */
(function (g) {
  'use strict';
  const V = g.SlopResize.video;
  const BPP = { low: 0.05, medium: 0.1, high: 0.17 };

  V.bitrate = (w, h, fps, q) => Math.round(Math.min(1.2e8, Math.max(5e5, w * h * fps * (BPP[q] || BPP.medium))));

  /** H.264 level codecs that fit the frame size and rate (macroblocks per second, from the H.264 level table). */
  V.avcCodecs = function (w, h, fps) {
    const mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * fps;
    const levels = [[108000, '1f'], [216000, '20'], [245760, '28'], [522240, '2a'], [589824, '32'], [983040, '33'], [2073600, '34']];
    const lvl = (levels.find(([m]) => mbps <= m) || [0, '34'])[1];
    return ['avc1.6400' + lvl, 'avc1.4d00' + lvl, 'avc1.4200' + lvl];
  };

  /** The first video encoder the browser says it supports. mux is the muxer's codec name. */
  V.pick = async function (format, w, h, fps, bitrate) {
    const order = format === 'webm'
      ? [['V_VP9', 'vp09.00.40.08'], ['V_VP9', 'vp09.00.10.08'], ['V_VP8', 'vp8'], ['V_AV1', 'av01.0.08M.08']]
          .map(([mux, codec]) => ({ mux, codec }))
      : V.avcCodecs(w, h, fps).map((codec) => ({ mux: 'avc', codec, avc: true }))
          .concat([{ mux: 'vp9', codec: 'vp09.00.40.08' }, { mux: 'av1', codec: 'av01.0.08M.08' }]);
    for (const o of order) {
      const cfg = { codec: o.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
      if (o.avc) cfg.avc = { format: 'avc' };
      try {
        const r = await g.VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return { mux: o.mux, codec: o.codec, cfg: r.config || cfg };
      } catch (e) { /* try the next one */ }
    }
    throw new Error(g.SlopResize.tr('resize.err.no_encoder', 'No video encoder for {format} at {w} × {h} in this browser', { format: format.toUpperCase(), w: String(w), h: String(h) }));
  };

  /** AAC for MP4 (Opus when AAC is missing), Opus for WebM. Null when WebCodecs has no audio encoder. */
  V.pickAudio = async function (format) {
    if (typeof g.AudioEncoder !== 'function' || typeof g.AudioData !== 'function') return null;
    const opts = format === 'webm' ? [['opus', 'A_OPUS']] : [['mp4a.40.2', 'aac'], ['opus', 'opus']];
    for (const [codec, mux] of opts) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
      try {
        const r = await g.AudioEncoder.isConfigSupported(cfg);
        if (r.supported) return { mux, codec, cfg: r.config || cfg };
      } catch (e) { /* next */ }
    }
    return null;
  };

  V.makeMuxer = function (format, v, a, w, h, fps) {
    const common = {
      video: { codec: v.mux, width: w, height: h, frameRate: fps },
      audio: a ? { codec: a.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined,
      firstTimestampBehavior: 'offset',
    };
    if (format === 'webm') {
      const target = new g.WebMMuxer.ArrayBufferTarget();
      return { muxer: new g.WebMMuxer.Muxer({ target, ...common }), target, type: 'video/webm', ext: 'webm' };
    }
    const target = new g.Mp4Muxer.ArrayBufferTarget();
    return { muxer: new g.Mp4Muxer.Muxer({ target, fastStart: 'in-memory', ...common }), target, type: 'video/mp4', ext: 'mp4' };
  };

  /** Feeds planar stereo PCM (two Float32Arrays) to an AudioEncoder in step with the video. */
  V.audioFeeder = function (aenc, pcm, sr) {
    const [L, R] = pcm;
    let pos = 0;
    return (untilSec) => {
      const end = Math.min(L.length, Math.round(untilSec * sr));
      while (pos < end) {
        const n = Math.min(4096, end - pos), data = new Float32Array(n * 2);
        data.set(L.subarray(pos, pos + n), 0);
        data.set(R.subarray(pos, pos + n), n);
        const ad = new g.AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((pos / sr) * 1e6), data });
        aenc.encode(ad);
        ad.close();
        pos += n;
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
