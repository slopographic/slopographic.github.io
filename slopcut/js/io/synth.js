/* SlopCut: synthetic media generators (used by the sample project and the tests).
   SE.synth.video({ w, h, fps, dur, draw(ctx, t, i), tone }) → Blob (MP4 via WebCodecs, else WebM via MediaRecorder)
   SE.synth.wav(dur, fn(t) → [l, r], sampleRate) → Blob (16-bit PCM WAV)
   SE.synth.png(w, h, draw(ctx)) → Blob */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const Y = SE.synth = {};

  /** First encoder config this browser supports, as { codec, mux } for mp4-muxer. */
  Y.pickVideoCodec = async function (w, h, fps, bitrate, prefer = ['avc', 'vp9', 'av1']) {
    if (typeof VideoEncoder !== 'function') return null;
    const C = { avc: [w * h > 1920 * 1088 ? 'avc1.640033' : w * h > 1280 * 720 ? 'avc1.640028' : 'avc1.42001f', 'avc1.4d0028', 'avc1.42001f'], vp9: ['vp09.00.10.08', 'vp09.00.40.08'], av1: ['av01.0.04M.08', 'av01.0.08M.08'], vp8: ['vp8'] };
    for (const mux of prefer) for (const codec of C[mux] || []) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps };
      if (mux === 'avc') cfg.avc = { format: 'avc' };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { codec, mux, cfg: r.config || cfg }; } catch (e) { /* next */ }
    }
    return null;
  };
  Y.pickAudioCodec = async function (sampleRate, channels, prefer = ['aac', 'opus']) {
    if (typeof AudioEncoder !== 'function') return null;
    const C = { aac: 'mp4a.40.2', opus: 'opus' };
    for (const mux of prefer) {
      const cfg = { codec: C[mux], sampleRate, numberOfChannels: channels, bitrate: 128000 };
      try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { codec: C[mux], mux, cfg }; } catch (e) { /* next */ }
    }
    return null;
  };
  /** Encode planar float stereo (Float32Array[2]) with an AudioEncoder; chunks go to onChunk(chunk, meta). */
  Y.encodeAudio = async function (enc, chans, sampleRate, onProgress) {
    const n = chans[0].length, block = 1024 * 4;
    for (let i = 0; i < n; i += block) {
      const len = Math.min(block, n - i), buf = new Float32Array(len * chans.length);
      for (let c = 0; c < chans.length; c++) buf.set(chans[c].subarray(i, i + len), c * len);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: len, numberOfChannels: chans.length, timestamp: Math.round((i / sampleRate) * 1e6), data: buf });
      enc.encode(ad); ad.close();
      if (enc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 0));
      if (onProgress) onProgress(i / n);
    }
    await enc.flush();
  };

  async function webcodecsVideo(o) {
    const vc = await Y.pickVideoCodec(o.w, o.h, o.fps, o.bitrate || 2e6, o.prefer);
    if (!vc || !window.Mp4Muxer) return null;
    const sr = 48000, ac = o.tone ? await Y.pickAudioCodec(sr, 2) : null;
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({ target, fastStart: 'in-memory', video: { codec: vc.mux, width: o.w, height: o.h, frameRate: o.fps }, audio: ac ? { codec: ac.mux, sampleRate: sr, numberOfChannels: 2 } : undefined, firstTimestampBehavior: 'offset' });
    let err = null;
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { err = e; } });
    enc.configure(vc.cfg);
    const cv = U.canvas(o.w, o.h), g = cv.getContext('2d');
    const frames = Math.round(o.dur * o.fps);
    for (let i = 0; i < frames; i++) {
      o.draw(g, i / o.fps, i);
      const f = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
      enc.encode(f, { keyFrame: i % (o.fps * 2) === 0 }); f.close();
      if (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 0));
      if (err) throw err;
    }
    await enc.flush(); enc.close();
    if (ac) {
      const n = Math.round(o.dur * sr), L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) { const v = o.tone(i / sr); L[i] = v[0]; R[i] = v[1]; }
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { err = e; } });
      aenc.configure(ac.cfg);
      await Y.encodeAudio(aenc, [L, R], sr);
      aenc.close();
      if (err) throw err;
    }
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  }
  async function recorderVideo(o) {
    if (typeof MediaRecorder !== 'function') throw new Error('This browser cannot create video');
    const cv = U.canvas(o.w, o.h), g = cv.getContext('2d');
    o.draw(g, 0, 0);
    const stream = cv.captureStream(o.fps);
    let actx = null;
    if (o.tone) {
      actx = new AudioContext({ sampleRate: 48000 });
      const len = Math.round(o.dur * 48000) + 4800, buf = actx.createBuffer(2, len, 48000), L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let i = 0; i < len; i++) { const v = o.tone(i / 48000); L[i] = v[0]; R[i] = v[1]; }
      const src = actx.createBufferSource(), dst = actx.createMediaStreamDestination();
      src.buffer = buf; src.connect(dst); src.start();
      for (const t of dst.stream.getAudioTracks()) stream.addTrack(t);
    }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: o.bitrate || 2e6 } : undefined);
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        if (t >= o.dur) { res(); return; }
        o.draw(g, t, Math.floor(t * o.fps));
        requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop(); await stopped;
    stream.getTracks().forEach((t) => t.stop());
    if (actx) actx.close();
    return new Blob(parts, { type: 'video/webm' });
  }
  Y.video = async function (o) {
    o = Object.assign({ w: 640, h: 360, fps: 30, dur: 2 }, o);
    if (!o.forceRecorder) { try { const b = await webcodecsVideo(o); if (b) return b; } catch (e) { console.warn('SlopCut: WebCodecs synth failed, recording instead', e); } }
    return recorderVideo(o);
  };
  Y.wav = function (dur, fn, sr = 48000) {
    const n = Math.round(dur * sr), buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, sr, true);
    d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      const v = fn(i / sr);
      d.setInt16(44 + i * 4, U.clamp(v[0], -1, 1) * 32767, true);
      d.setInt16(46 + i * 4, U.clamp(v[1], -1, 1) * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  };
  Y.png = function (w, h, draw) {
    const c = U.canvas(w, h); draw(c.getContext('2d'), w, h);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  };
})();
