/* SlopIsolate video — frame source. CO.video.open(file) → Promise<src> where
 *   src = { w, h (source), out: {w, h} (≤720p), duration, fps, count, mode: 'webcodecs'|'element', each(fn, {signal}), close() }
 *   each(fn) calls fn(canvas, i, t) for frame i at t = i / fps (canvas is the out.w × out.h frame, reused).
 *   fn may be async; each() waits for it. signal (AbortSignal) stops the loop between frames.
 * WebCodecs path: MP4/MOV is demuxed with Slop Cut's ISO-BMFF reader (slopcut/js/media/demux.js, loaded on first use)
 * and decoded with VideoDecoder. Anything else, or a browser without WebCodecs, uses a <video> element and seeks. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video || (CO.video = {}), U = CO.util, L = V.limits;
  const HERE = document.currentScript && document.currentScript.src || location.href; // .../slopisolate/js/video/source.js
  const DEMUX = new URL('../../../slopcut/js/media/demux.js', HERE).href;
  let demuxP = null;

  /** Load Cut's demuxer once (it expects window.SE to exist). */
  function loadDemux() {
    if (window.SE && window.SE.demux) return Promise.resolve(window.SE.demux);
    if (!demuxP) demuxP = new Promise((res, rej) => {
      window.SE = window.SE || {};
      const s = document.createElement('script');
      s.src = DEMUX;
      s.onload = () => (window.SE.demux ? res(window.SE.demux) : rej(new Error('demux missing')));
      s.onerror = () => { demuxP = null; rej(new Error('Could not load the MP4 reader')); };
      document.head.append(s);
    });
    return demuxP;
  }
  const tick = () => new Promise((r) => setTimeout(r, 2));

  /** Probe a file: size, duration, fps. Resolves { w, h, duration, fps, mp4Track } (mp4Track only for WebCodecs). */
  async function probe(file, url) {
    const el = document.createElement('video');
    el.preload = 'auto'; el.muted = true; el.playsInline = true; el.src = url;
    await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error(CO.util.t('cutout.video.err_format'))); });
    const info = { w: el.videoWidth, h: el.videoHeight, duration: el.duration || 0, fps: 30, el };
    return info;
  }

  /** Drops a <video> element's source and decoder (an element keeps one decoder alive while it has a source). */
  function releaseEl(el) {
    if (!el) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* already released */ }
  }

  /** Open a video file for frame access. */
  V.open = async function (file) {
    const url = URL.createObjectURL(file);
    let info;
    try { info = await probe(file, url); } catch (e) { URL.revokeObjectURL(url); throw e; }
    const support = L.support();
    let track = null, duration = info.duration;
    const mp4Like = /mp4|quicktime|mov/i.test(file.type || '') || /\.(mp4|m4v|mov)$/i.test(file.name || '');
    if (support.decode === 'webcodecs' && mp4Like) {
      try { track = await mp4Track(file); } catch (e) { track = null; }
      if (track) duration = track.duration || duration;
    }
    if (track) { releaseEl(info.el); info.el = null; }   // WebCodecs decodes; the probe element is not needed
    const maxSec = Math.min(duration || L.maxSec(), L.maxSec());
    const fps = Math.min(L.MAX_FPS, track ? track.fps : 30);
    const count = Math.max(1, Math.floor(maxSec * fps + 1e-6));
    const out = L.outSize(info.w, info.h);
    const src = {
      w: info.w, h: info.h, out, duration: maxSec, fps, count, mode: track ? 'webcodecs' : 'element', file,
      each: (fn, opts = {}) => (track ? eachDecoded(file, track, src, fn, opts) : eachSeek(info.el, src, fn, opts)),
      close() { releaseEl(info.el); info.el = null; URL.revokeObjectURL(url); },
    };
    if (info.el) info.el.muted = true;
    src.url = url;
    return src;
  };

  /** Demux the MP4 video track and check the decoder accepts it (null if not usable). */
  async function mp4Track(file) {
    const D = await loadDemux();
    if (!(await D.isMp4(file))) return null;
    const d = await D.mp4(file);
    const t = d && d.tracks.find((x) => x.type === 'video' && x.samples.length && x.codec);
    if (!t) return null;
    const cfg = { codec: t.codec, codedWidth: t.width, codedHeight: t.height };
    if (t.description) cfg.description = t.description;
    const s = await VideoDecoder.isConfigSupported(cfg);
    if (!s.supported) return null;
    t.config = cfg;
    t.duration = d.duration;
    t.fps = t.samples.length / Math.max(0.001, t.samples[t.samples.length - 1].pts + t.samples[t.samples.length - 1].dur - t.samples[0].pts);
    return t;
  }

  /** Decode the track sequentially (decode order) and emit frames in presentation order at src.fps. */
  function eachDecoded(file, track, src, fn, { signal } = {}) {
    return new Promise((resolve, reject) => {
      const D = window.SE.demux, read = D.reader(file);
      const h = 0.5 / src.fps;
      const pending = [];
      let notify = null, done = false, failure = null, prev = null, i = 0;
      const wake = () => { if (notify) { const n = notify; notify = null; n(); } };
      const dec = new VideoDecoder({
        output: (f) => { pending.push(f); wake(); },
        error: (e) => { failure = e; done = true; wake(); },
      });
      dec.configure(track.config);
      const emit = async (f) => {
        const c = src.canvas || (src.canvas = U.canvas(src.out.w, src.out.h));
        c.getContext('2d').drawImage(f, 0, 0, c.width, c.height);
        await fn(c, i, i / src.fps);
        i++;
      };
      const stopped = () => signal && signal.aborted;
      const consume = async () => {
        for (;;) {
          if (!pending.length) {
            if (done || stopped() || i >= src.count) break;
            await new Promise((r) => { notify = r; });
            continue;
          }
          const f = pending.shift(), t = f.timestamp / 1e6;
          while (i < src.count && i / src.fps < t - h) { if (stopped()) break; await emit(prev || f); }
          if (prev) prev.close();
          prev = f;
          if (i >= src.count) break;
        }
        while (prev && i < src.count && !stopped()) await emit(prev);
        if (prev) prev.close();
        for (const f of pending) f.close();
        pending.length = 0;
      };
      const produce = async () => {
        const samples = track.samples.map((s, k) => k).sort((a, b) => track.samples[a].dts - track.samples[b].dts);
        const limit = src.duration + 0.5;
        for (const k of samples) {
          if (stopped() || i >= src.count || failure) break;
          const s = track.samples[k];
          if (s.pts > limit && s.key) break;
          const data = await read(s.offset, s.size);
          dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.pts * 1e6), duration: Math.round(s.dur * 1e6), data: data.slice() }));
          while (dec.decodeQueueSize > 4 && !failure) await tick();
        }
        if (dec.state === 'configured') await dec.flush();
        done = true; wake();
      };
      Promise.all([produce(), consume()]).then(() => { dec.close(); if (failure) reject(failure); else resolve(); }, (e) => { try { dec.close(); } catch (x) { /* closed */ } reject(e); });
    });
  }

  /** Seek a <video> element to each frame time (fallback path, also used when the file is not an MP4). */
  async function eachSeek(el, src, fn, { signal } = {}) {
    const c = src.canvas || (src.canvas = U.canvas(src.out.w, src.out.h));
    const g = c.getContext('2d');
    for (let i = 0; i < src.count; i++) {
      if (signal && signal.aborted) break;
      const t = Math.min(i / src.fps, Math.max(0, el.duration - 0.01));
      if (Math.abs(el.currentTime - t) > 1e-4 || el.readyState < 2) {
        await new Promise((res) => { const on = () => { el.removeEventListener('seeked', on); res(); }; el.addEventListener('seeked', on); el.currentTime = t; });
      }
      g.drawImage(el, 0, 0, c.width, c.height);
      await fn(c, i, i / src.fps);
    }
  }
})();
