/* Slop Resize: the video pipeline. It reads the picture frame by frame (seek, then draw the frame at the size and
 * placement the spec gives), encodes each frame with WebCodecs and writes MP4 or WebM, keeping the audio track
 * where the browser can decode it. Classic script; adds V.run to window.SlopResize.video.
 *   V.run(blob, spec, o) → Promise<{ blob, w, h, ext, note }>
 *   o = { format: 'mp4' | 'webm', fps, quality: 'low' | 'medium' | 'high', audio: bool, signal: { cancelled }, progress(p, msg) }
 * Sides are rounded to even numbers. Cancelling rejects with an AbortError and frees the encoders. */
(function (g) {
  'use strict';
  const NS = g.SlopResize, V = NS.video, tr = (k, en, v) => NS.tr(k, en, v);
  const SR = 48000;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  V.run = async function (blob, spec, o) {
    const sup = await V.support();
    if (!sup.ok) throw new Error(sup.reason);
    if (!sup.formats[o.format]) throw new Error(tr('resize.err.no_format', 'This browser cannot encode {format}. Choose the other format.', { format: o.format.toUpperCase() }));
    const el = V.element(blob), v = el.v;
    const progress = o.progress || (() => {}), signal = o.signal || {};
    const t0 = performance.now();
    let venc = null, aenc = null, err = null;
    try {
      await el.ready;
      const sw = v.videoWidth, sh = v.videoHeight, dur = v.duration;
      if (!sw || !sh) throw new Error(tr('resize.err.no_track', 'This file has no picture track'));
      if (!(dur > 0)) throw new Error(tr('resize.err.no_length', 'This video has no length'));
      const fps = o.fps || 30;
      const d = NS.size.dims({ w: sw, h: sh }, spec, { even: true, max: 8192 });
      const W = d.w, H = d.h;
      const frames = Math.max(1, Math.floor(dur * fps + 1e-6));

      const sel = { video: await V.pick(o.format, W, H, fps, V.bitrate(W, H, fps, o.quality)) };
      let pcm = null, note = '';
      if (o.audio !== false) {
        progress(0, tr('resize.status.audio', 'Reading the audio…'));
        pcm = await V.audio(blob, dur, SR);
        if (pcm) sel.audio = await V.pickAudio(o.format);
        if (!pcm) note = tr('resize.note.no_audio', 'The output has no sound: the audio could not be read, or there is none.');
        else if (!sel.audio) { pcm = null; note = tr('resize.note.no_audio_enc', 'The output has no sound: this browser cannot encode the audio.'); }
      }
      const m = V.makeMuxer(o.format, sel.video, sel.audio || null, W, H, fps);
      const onErr = (e) => { err = err || e; };
      venc = new g.VideoEncoder({ output: (c, meta) => { try { m.muxer.addVideoChunk(c, meta); } catch (e) { onErr(e); } }, error: onErr });
      venc.configure(sel.video.cfg);
      let feed = () => {};
      if (pcm) {
        aenc = new g.AudioEncoder({ output: (c, meta) => { try { m.muxer.addAudioChunk(c, meta); } catch (e) { onErr(e); } }, error: onErr });
        aenc.configure(sel.audio.cfg);
        feed = V.audioFeeder(aenc, pcm, SR);
      }

      const cv = typeof g.OffscreenCanvas === 'function' ? new g.OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      const cx = cv.getContext('2d', { alpha: false });
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = 'high';
      const bg = spec.bg && spec.bg !== 'transparent' ? spec.bg : '#000000'; // video has no alpha: transparent becomes black

      for (let i = 0; i < frames; i++) {
        if (signal.cancelled) throw new DOMException('Cancelled', 'AbortError');
        if (err) throw err;
        await V.seek(v, Math.min(i / fps, Math.max(0, dur - 0.05)));
        cx.fillStyle = bg;
        cx.fillRect(0, 0, W, H);
        cx.drawImage(v, d.x, d.y, d.dw, d.dh);
        const vf = new g.VideoFrame(cv, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
        vf.close();
        feed((i + 1) / fps);
        while (venc.encodeQueueSize > 4 || (aenc && aenc.encodeQueueSize > 16)) { await tick(); if (err) throw err; }
        if (i % 3 === 0 || i === frames - 1) {
          const rate = (i + 1) / Math.max(0.001, (performance.now() - t0) / 1000);
          progress((i + 1) / frames, tr('resize.status.frame', 'Frame {i} of {n} · {fps} fps · {s} s left', { i: String(i + 1), n: String(frames), fps: rate.toFixed(1), s: String(Math.max(0, Math.round((frames - i - 1) / rate))) }));
          await tick();
        }
      }
      feed(frames / fps);
      progress(1, tr('resize.status.finishing', 'Finishing…'));
      await venc.flush();
      if (aenc) await aenc.flush();
      if (err) throw err;
      m.muxer.finalize();
      return { blob: new Blob([m.target.buffer], { type: m.type }), w: W, h: H, ext: m.ext, note };
    } finally {
      try { venc && venc.close(); } catch (e) { /* already closed */ }
      try { aenc && aenc.close(); } catch (e) { /* already closed */ }
      el.dispose();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
