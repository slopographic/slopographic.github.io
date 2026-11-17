/* SlopCut: media analysis. Reads duration/size with <video>/<audio>/<img>, decodes audio with
   WebAudio (for playback, export and waveforms) and grabs filmstrip thumbnails. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const A = SE.analyze = {};
  A.SR = 48000;
  A.PEAKS_PER_SEC = 100;

  A.kindOf = function (file) {
    const t = file.type || '', e = U.ext(file.name);
    if (t.startsWith('video/') || /^(mp4|m4v|mov|webm|mkv|ogv)$/.test(e)) return 'video';
    if (t.startsWith('audio/') || /^(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/.test(e)) return 'audio';
    if (t.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(e)) return 'image';
    return null;
  };
  function waitEvent(el, ok, ms = 15000) {
    return new Promise((res, rej) => {
      const done = (f, v) => { clearTimeout(t); el.removeEventListener(ok, onOk); el.removeEventListener('error', onErr); f(v); };
      const onOk = () => done(res); const onErr = () => done(rej, new Error('This file could not be decoded by your browser'));
      const t = setTimeout(() => done(rej, new Error('Timed out reading media')), ms);
      el.addEventListener(ok, onOk); el.addEventListener('error', onErr);
    });
  }
  A.waitEvent = waitEvent;
  /** A muted, inline <video> for a blob URL. */
  A.videoEl = function (url) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.setAttribute('playsinline', ''); v.src = url;
    return v;
  };
  /** Seek a video element and wait until the frame is ready. */
  A.seek = async function (v, t) {
    t = Math.max(0, Math.min(t, (v.duration || 0) - 0.001));
    if (Math.abs(v.currentTime - t) < 0.0005 && v.readyState >= 2) return;
    const p = waitEvent(v, 'seeked', 8000);
    v.currentTime = t;
    await p;
    if (v.requestVideoFrameCallback && v.readyState < 2) await new Promise((r) => { v.requestVideoFrameCallback(() => r()); setTimeout(r, 200); });
  };
  /** Duration, size and a <video> element ready for thumbnails. Handles WebM files without a duration. */
  A.probeVideo = async function (url) {
    const v = A.videoEl(url);
    await waitEvent(v, 'loadedmetadata');
    if (!isFinite(v.duration)) { // MediaRecorder WebM: seek far to learn the duration
      const p = waitEvent(v, 'durationchange', 8000).catch(() => null);
      v.currentTime = 1e7; await p;
      if (!isFinite(v.duration)) await U.sleep(200);
      v.currentTime = 0;
    }
    if (v.readyState < 2) await waitEvent(v, 'loadeddata', 8000).catch(() => null);
    return { el: v, dur: v.duration, w: v.videoWidth, h: v.videoHeight };
  };
  A.probeAudio = async function (url) {
    const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url;
    await waitEvent(a, 'loadedmetadata');
    return { dur: a.duration };
  };
  A.probeImage = async function (blob) {
    const bmp = await createImageBitmap(blob);
    return { bmp, w: bmp.width, h: bmp.height };
  };
  /** Decode the whole audio track into an AudioBuffer (or null when there is no sound). */
  A.decodeAudio = async function (blob) {
    try {
      const buf = await blob.arrayBuffer();
      const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, A.SR);
      return await new Promise((res, rej) => { const r = ctx.decodeAudioData(buf, res, rej); if (r && r.then) r.then(res, rej); });
    } catch (e) { return null; }
  };
  /** Max-abs peaks of the mono mix, PEAKS_PER_SEC buckets per second. */
  A.peaks = function (ab) {
    const n = Math.max(1, Math.ceil(ab.duration * A.PEAKS_PER_SEC)), out = new Float32Array(n);
    const step = ab.sampleRate / A.PEAKS_PER_SEC, chs = [];
    for (let c = 0; c < ab.numberOfChannels; c++) chs.push(ab.getChannelData(c));
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step), b = Math.min(ab.length, Math.floor((i + 1) * step));
      let m = 0;
      for (let j = a; j < b; j += 4) for (const ch of chs) { const v = Math.abs(ch[j]); if (v > m) m = v; }
      out[i] = m;
    }
    return out;
  };
  /** Filmstrip thumbnails: [{ t, c: canvas }]. Height th px. */
  A.thumbs = async function (v, dur, count, th = 72) {
    const w = Math.max(1, Math.round(th * (v.videoWidth / Math.max(1, v.videoHeight)))), out = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? Math.min(0.5, dur / 2) : (dur * (i + 0.5)) / count;
      try { await A.seek(v, t); } catch (e) { break; }
      const c = U.canvas(w, th);
      c.getContext('2d').drawImage(v, 0, 0, w, th);
      out.push({ t, c });
    }
    return out;
  };
  /** One thumbnail of a still image. */
  A.imageThumb = function (bmp, th = 90) {
    const c = U.canvas(Math.max(1, Math.round(th * bmp.width / bmp.height)), th);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return [{ t: 0, c }];
  };
  /** Little waveform picture for the bin. */
  A.waveThumb = function (peaks, w = 160, h = 90, color = '#5fd4a0') {
    const c = U.canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#10241c'; g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * peaks.length), b = Math.max(a + 1, Math.floor(((x + 1) / w) * peaks.length));
      let m = 0; for (let i = a; i < b; i++) m = Math.max(m, peaks[i]);
      const hh = Math.max(1, m * h * 0.9);
      g.fillRect(x, (h - hh) / 2, 1, hh);
    }
    return c;
  };
})();
