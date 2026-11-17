/* Slop Upscale video: frame by frame. Each frame is read by seeking a muted <video> element, upscaled by the same
 * pipeline as a picture, encoded with WebCodecs and muxed to MP4 (H.264) or WebM (VP9). Sound is not copied.
 * Needs WebCodecs (VideoEncoder, VideoFrame) and the vendored muxers; without them support() says why. Classic script;
 * adds SlopUpscale.video.
 *   MAX_SECONDS                       the longest clip accepted (the frames are slow, so clips are short)
 *   support()                         Promise<{ ok, reason }>
 *   run(file, o)                      Promise<{ blob, ext, w, h, frames }>
 *     o = { scale, model, bytes, fps: 24 | 30, signal: { cancelled }, progress(done, total) } */
(function (g) {
  'use strict';
  const U = (g.SlopUpscale = g.SlopUpscale || {}), V = (U.video = {});
  const P = () => g.SlopUpscalePipeline, t = (k, v) => (U.t ? U.t(k, v) : k);
  const AVC = ['avc1.640034', 'avc1.640028', 'avc1.42001f'];
  V.MAX_SECONDS = 15;
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  V.support = async function () {
    if (!g.VideoEncoder || !g.VideoFrame) return { ok: false, reason: t('upscale.video.no_webcodecs') };
    if (!g.Mp4Muxer || !g.WebMMuxer) return { ok: false, reason: t('upscale.video.no_muxers') };
    return { ok: true, reason: '' };
  };

  /** The first encoder setting the browser accepts at this size: MP4 with H.264, else WebM with VP9. */
  async function pick(W, H, fps) {
    const bitrate = Math.round(W * H * fps * 0.1);
    for (const codec of AVC) {
      const cfg = { codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
      try { const r = await g.VideoEncoder.isConfigSupported(cfg); if (r.supported) return { mux: 'mp4', cfg: r.config || cfg }; } catch (e) { /* next */ }
    }
    const cfg = { codec: 'vp09.00.10.08', width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' };
    try { const r = await g.VideoEncoder.isConfigSupported(cfg); if (r.supported) return { mux: 'webm', cfg: r.config || cfg }; } catch (e) { /* none */ }
    throw new Error(t('upscale.video.no_encoder', { w: String(W), h: String(H) }));
  }

  function muxer(kind, W, H, fps) {
    const target = kind === 'mp4' ? new g.Mp4Muxer.ArrayBufferTarget() : new g.WebMMuxer.ArrayBufferTarget();
    const video = kind === 'mp4' ? { codec: 'avc', width: W, height: H, frameRate: fps } : { codec: 'V_VP9', width: W, height: H, frameRate: fps };
    const m = kind === 'mp4'
      ? new g.Mp4Muxer.Muxer({ target, video, fastStart: 'in-memory' })
      : new g.WebMMuxer.Muxer({ target, video });
    return { m, target, type: kind === 'mp4' ? 'video/mp4' : 'video/webm', ext: kind === 'mp4' ? 'mp4' : 'webm' };
  }

  /** Resolves once the video shows the frame at t (a seek that the browser has finished). */
  function seek(video, at) {
    if (Math.abs(video.currentTime - at) < 1e-3 && video.readyState >= 2) return Promise.resolve();
    return new Promise((res, rej) => {
      const to = setTimeout(() => { video.removeEventListener('seeked', done); rej(new Error(t('upscale.video.stalled'))); }, 5000);
      const done = () => { clearTimeout(to); video.removeEventListener('seeked', done); res(); };
      video.addEventListener('seeked', done);
      video.currentTime = Math.min(at, Math.max(0, video.duration - 0.001));
    });
  }

  V.run = async function (file, o) {
    const sup = await V.support();
    if (!sup.ok) throw new Error(sup.reason);
    const fps = o.fps || 24, progress = o.progress || (() => {});
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;
    let enc = null, failure = null;
    try {
      await new Promise((res, rej) => {
        video.onloadeddata = () => res();
        video.onerror = () => rej(new Error(t('upscale.video.unreadable')));
      });
      const dur = video.duration;
      if (!(dur > 0)) throw new Error(t('upscale.video.no_length'));
      if (dur > V.MAX_SECONDS) throw new Error(t('upscale.video.too_long', { max: V.MAX_SECONDS, s: Math.round(dur) }));
      const sw = video.videoWidth & ~1, sh = video.videoHeight & ~1;
      if (!sw || !sh) throw new Error(t('upscale.video.no_track'));
      const why = P().check(sw, sh, o.scale);
      if (why) throw new Error(why);
      const W = sw * o.scale, H = sh * o.scale;
      const { mux, cfg } = await pick(W, H, fps);
      const out = muxer(mux, W, H, fps);
      enc = new g.VideoEncoder({
        output: (chunk, meta) => out.m.addVideoChunk(chunk, meta),
        error: (e) => { failure = e; },
      });
      enc.configure(cfg);
      const src = document.createElement('canvas');
      src.width = sw; src.height = sh;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      const total = Math.max(1, Math.floor(dur * fps - 1e-6) + 1);
      for (let i = 0; i < total; i++) {
        if (o.signal && o.signal.cancelled) throw new Error('Cancelled');
        if (failure) throw failure;
        await seek(video, i / fps);
        sctx.drawImage(video, 0, 0, sw, sh);
        const up = await P().run(src, { scale: o.scale, model: o.model || null, bytes: o.bytes || null, signal: o.signal });
        const frame = new g.VideoFrame(up, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        while (enc.encodeQueueSize > 2) await tick(10);
        enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        progress(i + 1, total);
      }
      await enc.flush();
      out.m.finalize();
      return { blob: new Blob([out.target.buffer], { type: out.type }), ext: out.ext, w: W, h: H, frames: total };
    } finally {
      URL.revokeObjectURL(url);
      if (enc && enc.state !== 'closed') enc.close();
      video.removeAttribute('src'); video.load();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
