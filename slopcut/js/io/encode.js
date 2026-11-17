/* SlopCut: WebCodecs export. Renders every frame with the compositor (frame-accurate sources from
   frames.js), encodes with VideoEncoder (H.264 → VP9 → AV1) and AudioEncoder (AAC → Opus) and muxes
   to MP4 (mp4-muxer) or WebM (webm-muxer). Audio is rendered offline and interleaved with video.
   SE.encode.run(opts) → { blob, info } ; opts: { format, w, h, fps, quality, a, b, audio, progress, signal } */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const X = SE.encode = {};
  X.QUALITY = { low: 0.05, medium: 0.1, high: 0.17, max: 0.28 }; // bits per pixel per frame

  X.bitrate = (w, h, fps, q) => Math.round(U.clamp(w * h * fps * (X.QUALITY[q] || 0.1), 5e5, 1.2e8));
  /** H.264 level that fits the frame size and rate. */
  X.avcCodec = function (w, h, fps) {
    const mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * fps;
    const levels = [[108000, '1f'], [216000, '20'], [245760, '28'], [522240, '2a'], [589824, '32'], [983040, '33'], [2073600, '34']];
    const lvl = (levels.find(([m]) => mbps <= m) || [0, '34'])[1];
    return ['avc1.6400' + lvl, 'avc1.4d00' + lvl, 'avc1.4200' + lvl];
  };
  /** Pick encoders for a container. Returns { video: {codec, mux, cfg}, audio } or throws. */
  X.pick = async function (format, w, h, fps, bitrate, withAudio) {
    if (typeof VideoEncoder !== 'function') throw new Error('WebCodecs is not available in this browser');
    const order = format === 'webm' ? [['vp9', 'vp09.00.40.08', 'V_VP9'], ['vp9', 'vp09.00.10.08', 'V_VP9'], ['vp8', 'vp8', 'V_VP8'], ['av1', 'av01.0.08M.08', 'V_AV1']]
      : X.avcCodec(w, h, fps).map((c) => ['avc', c]).concat([['vp9', 'vp09.00.40.08'], ['vp9', 'vp09.00.10.08'], ['av1', 'av01.0.08M.08']]);
    let video = null;
    for (const [mux, codec, mkv] of order) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
      if (mux === 'avc') cfg.avc = { format: 'avc' };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) { video = { mux: mkv || mux, codec, cfg: r.config || cfg, h264: mux === 'avc' }; break; } } catch (e) { /* try next */ }
    }
    if (!video) throw new Error('No video encoder for ' + format.toUpperCase() + ' at ' + w + '×' + h);
    let audio = null;
    if (withAudio && typeof AudioEncoder === 'function') {
      const a = await SE.synth.pickAudioCodec(48000, 2, format === 'webm' ? ['opus'] : ['aac', 'opus']);
      if (a) audio = { mux: format === 'webm' ? 'A_OPUS' : a.mux, codec: a.codec, cfg: a.cfg };
    }
    return { video, audio };
  };
  function makeMuxer(format, sel, w, h, fps) {
    if (format === 'webm') {
      const target = new WebMMuxer.ArrayBufferTarget();
      const muxer = new WebMMuxer.Muxer({ target, video: { codec: sel.video.mux, width: w, height: h, frameRate: fps }, audio: sel.audio ? { codec: sel.audio.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined, firstTimestampBehavior: 'offset' });
      return { muxer, target, type: 'video/webm' };
    }
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({ target, fastStart: 'in-memory', video: { codec: sel.video.mux, width: w, height: h, frameRate: fps }, audio: sel.audio ? { codec: sel.audio.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined, firstTimestampBehavior: 'offset' });
    return { muxer, target, type: 'video/mp4' };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  X.run = async function (o) {
    const p = SE.doc, { format = 'mp4', fps = p.fps } = o;
    const w = o.w + (o.w % 2), h = o.h + (o.h % 2);
    const a = o.a || 0, b = o.b, frames = Math.max(1, Math.round((b - a) * fps));
    const progress = o.progress || (() => {}), signal = o.signal || {};
    const bitrate = o.bitrate || X.bitrate(w, h, fps, o.quality);
    const wantAudio = o.audio !== false && SE.audiomix.hasAudio(p, a, b);
    const sel = await X.pick(format, w, h, fps, bitrate, wantAudio);
    const { muxer, target, type } = makeMuxer(format, sel, w, h, fps);
    let err = null;
    const venc = new VideoEncoder({ output: (c, m) => { try { muxer.addVideoChunk(c, m); } catch (e) { err = e; } }, error: (e) => { err = e; } });
    venc.configure(sel.video.cfg);
    // audio: render the mix offline, then feed it in step with the video
    let aenc = null, chans = null, aPos = 0;
    const SR = 48000;
    if (sel.audio) {
      progress(0, U.t('slopedit.io.mixing_audio'));
      const buf = await SE.audiomix.render(p, a, a + frames / fps, SR);
      chans = [buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)];
      aenc = new AudioEncoder({ output: (c, m) => { try { muxer.addAudioChunk(c, m); } catch (e) { err = e; } }, error: (e) => { err = e; } });
      aenc.configure(sel.audio.cfg);
    }
    function feedAudio(untilSec) {
      if (!aenc) return;
      const end = Math.min(chans[0].length, Math.round(untilSec * SR));
      while (aPos < end) {
        const len = Math.min(4096, end - aPos), data = new Float32Array(len * 2);
        data.set(chans[0].subarray(aPos, aPos + len), 0); data.set(chans[1].subarray(aPos, aPos + len), len);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((aPos / SR) * 1e6), data });
        aenc.encode(ad); ad.close();
        aPos += len;
      }
    }
    await SE.text.ready(p);
    if (SE.watermark) await SE.watermark.ready(p);
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : U.canvas(w, h);
    const g = cv.getContext('2d', { alpha: false });
    const src = SE.frames.exporter(p, { forceSeek: !!o.forceSeek });
    const t0 = performance.now();
    try {
      for (let i = 0; i < frames; i++) {
        if (signal.cancelled) throw new DOMException('Export cancelled', 'AbortError'); // i18n-ignore: an error for the code (the dialog shows its own words)
        if (err) throw err;
        const t = a + i / fps;
        await src.prepare(t);
        SE.compositor.render(g, p, t, { W: w, H: h, source: src.get });
        const vf = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: i % Math.round(fps * 2) === 0 });
        vf.close();
        feedAudio((i + 1) / fps);
        while (venc.encodeQueueSize > 4 || (aenc && aenc.encodeQueueSize > 16)) { await tick(); if (err) throw err; }
        if (i % 3 === 0) {
          const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
          progress((i + 1) / frames, U.t('slopedit.io.frame_of', { n: i + 1, of: frames }) + ' · ' + rate.toFixed(1) + ' fps · ' + U.t('slopedit.io.s_left', { s: Math.max(0, Math.round((frames - i - 1) / rate)) }));
          await tick();
        }
      }
      feedAudio(frames / fps + 1);
      progress(1, U.t('slopedit.io.finishing'));
      await venc.flush();
      if (aenc) await aenc.flush();
      if (err) throw err;
      muxer.finalize();
    } finally {
      src.close();
      try { venc.close(); } catch (e) { /* closed */ }
      if (aenc) try { aenc.close(); } catch (e) { /* closed */ }
    }
    const blob = new Blob([target.buffer], { type });
    return { blob, info: { frames, fps, w, h, codec: sel.video.codec, audio: sel.audio ? sel.audio.codec : null, h264: sel.video.h264, mode: src.mode, seconds: (performance.now() - t0) / 1000 } };
  };
})();
