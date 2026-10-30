/* Slop Resize: reading videos and checking what this browser can encode. Classic script; exposes
 * window.SlopResize.video (with run.js, encode.js and audio.js adding to it).
 *   support()        Promise<{ ok, reason, formats: { mp4, webm } }>  WebCodecs and both muxers, probed for real
 *   probe(blob)      Promise<{ w, h, duration }>  picture size and length, read in the browser (nothing uploaded)
 *   element(blob)    { v, ready, dispose() }  a muted <video> on an object URL, ready once its first frame is decoded
 *   seek(v, t)       Promise  moves the element to time t and waits for that frame ('seeked', with a timeout) */
(function (g) {
  'use strict';
  const NS = (g.SlopResize = g.SlopResize || {});
  const V = (NS.video = NS.video || {});
  const tr = (k, en, v) => NS.tr(k, en, v);

  let supportP = null;
  V.support = function () {
    if (!supportP) supportP = (async () => {
      if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') return { ok: false, reason: tr('resize.err.no_webcodecs', 'This browser has no WebCodecs, so video cannot be encoded here. Images still work. Try a recent Chrome, Edge or Safari.'), formats: { mp4: false, webm: false } };
      if (!g.Mp4Muxer || !g.WebMMuxer) return { ok: false, reason: tr('resize.err.no_muxers', 'The MP4 and WebM muxers did not load, so video cannot be written.'), formats: { mp4: false, webm: false } };
      const can = async (cfg) => { try { return !!(await VideoEncoder.isConfigSupported(cfg)).supported; } catch (e) { return false; } };
      const mp4 = await can({ codec: 'avc1.42001f', width: 640, height: 480, bitrate: 1e6, framerate: 30, avc: { format: 'avc' } });
      const webm = await can({ codec: 'vp09.00.10.08', width: 640, height: 480, bitrate: 1e6, framerate: 30 })
        || await can({ codec: 'vp8', width: 640, height: 480, bitrate: 1e6, framerate: 30 });
      const ok = mp4 || webm;
      return { ok, reason: ok ? '' : tr('resize.err.no_codec', 'This browser cannot encode H.264 or VP8/VP9 video, so video cannot be written.'), formats: { mp4, webm } };
    })();
    return supportP;
  };

  /** A muted, off-screen <video> on an object URL. ready resolves after the first frame is decoded. */
  V.element = function (blob) {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const ready = new Promise((res, rej) => {
      v.addEventListener('loadeddata', () => res(), { once: true });
      v.addEventListener('error', () => rej(new Error(tr('resize.err.no_decode', 'The browser cannot decode this video'))), { once: true });
    }).then(() => ensureDuration(v));
    return {
      v, ready,
      dispose() { v.removeAttribute('src'); try { v.load(); } catch (e) { /* gone */ } URL.revokeObjectURL(url); },
    };
  };

  /** WebM files written by some recorders report Infinity: seek past the end to make the browser find the length. */
  async function ensureDuration(v) {
    if (Number.isFinite(v.duration)) return;
    await new Promise((res) => {
      const done = () => { v.removeEventListener('durationchange', done); v.removeEventListener('seeked', done); res(); };
      v.addEventListener('durationchange', done);
      v.addEventListener('seeked', done);
      setTimeout(done, 4000);
      v.currentTime = 1e101;
    });
    await V.seek(v, 0);
  }

  /** Move to time t and wait for the frame. Resolves even if the browser never reports 'seeked' (a 4 s limit). */
  V.seek = function (v, t) {
    return new Promise((res) => {
      if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) { res(); return; }
      let done = false;
      const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); clearTimeout(timer); res(); };
      const timer = setTimeout(fin, 4000);
      v.addEventListener('seeked', fin);
      v.currentTime = t;
    });
  };

  /** Picture size and length of a video, read in the browser. */
  V.probe = async function (blob) {
    const el = V.element(blob);
    try {
      await el.ready;
      const w = el.v.videoWidth, h = el.v.videoHeight;
      if (!w || !h) throw new Error(tr('resize.err.no_track', 'This file has no picture track'));
      return { w, h, duration: el.v.duration };
    } finally { el.dispose(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
