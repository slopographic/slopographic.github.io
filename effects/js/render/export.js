// Slop Effects render: a PNG sequence (zipped, at the composition size) or a video (WebM, or MP4 where the browser can
// record it). Both draw every frame through draw.drawFrame, the same function as the preview, after media.prepare has
// seeked the video layers to that frame. The PNG sequence runs as fast as it can draw. A video is recorded in real time
// (MediaRecorder paces the frames), so a 10 s comp takes about 10 s. The zip uses shared/office/zip.js. Browser only.
// Classic script: window.SlopEffects.render.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || g.location && g.location.href;
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

  /** The formats this browser can render, in menu order. */
  function formats() {
    const out = [{ id: 'png', label: 'PNG sequence (zip, with transparency)', video: false }]; // i18n-ignore: English fallback (render-dialog.js shows effects.render.*)
    if (typeof MediaRecorder !== 'undefined') {
      if (videoType('webm')) out.push({ id: 'webm', label: 'WebM video (real time)', video: true }); // i18n-ignore: English fallback (render-dialog.js shows effects.render.*)
      if (videoType('mp4')) out.push({ id: 'mp4', label: 'MP4 video (real time)', video: true }); // i18n-ignore: English fallback (render-dialog.js shows effects.render.*)
    }
    return out;
  }
  /** The MediaRecorder type for a container, or null when the browser cannot record it. */
  function videoType(id) {
    if (typeof MediaRecorder === 'undefined') return null;
    const list = id === 'mp4' ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  }

  /** Frame indices to render: the whole composition, or the play range [in, out) in seconds. */
  function frameRange(doc, range) {
    const fps = doc.comp.fps, total = Math.max(1, Math.round(doc.comp.duration * fps));
    if (!range) return { from: 0, to: total };
    const from = Math.max(0, Math.round(range.in * fps)), to = Math.min(total, Math.max(from + 1, Math.round(range.out * fps)));
    return { from, to };
  }

  /** A canvas at the composition size. */
  function canvasFor(doc) {
    const c = document.createElement('canvas');
    c.width = doc.comp.width; c.height = doc.comp.height;
    return c;
  }

  /** Renders a PNG sequence into a zip Blob. opts: { media, range, onProgress(fraction), cancel: () => bool }. */
  async function renderPng(doc, opts = {}) {
    const Z = await import(new URL('../../../shared/office/zip.js', BASE).href);
    const draw = ns.draw, media = opts.media;
    const { from, to } = frameRange(doc, opts.range);
    const canvas = canvasFor(doc), ctx = canvas.getContext('2d');
    const digits = Math.max(4, String(to - from).length);
    const entries = [];
    for (let i = from; i < to; i++) {
      if (opts.cancel && opts.cancel()) throw new Error('cancelled');
      const t = i / doc.comp.fps;
      await media.prepare(doc, t);
      draw.drawFrame(ctx, doc, t, { media });
      const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
      entries.push({ path: `frame-${String(i - from + 1).padStart(digits, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()), store: true });
      if (opts.onProgress) opts.onProgress((i - from + 1) / (to - from));
    }
    return Z.writeZip(entries, { compress: false });
  }

  /** Records a video into a Blob in real time. opts as renderPng, plus format ('webm' or 'mp4'). */
  async function renderVideo(doc, opts = {}) {
    const type = videoType(opts.format || 'webm');
    if (!type) throw new Error(`this browser cannot record ${opts.format}`);
    const draw = ns.draw, media = opts.media;
    const { from, to } = frameRange(doc, opts.range);
    const canvas = canvasFor(doc), ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12000000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });
    const frameMs = 1000 / doc.comp.fps;
    rec.start();
    const t0 = performance.now();
    try {
      for (let i = from; i < to; i++) {
        if (opts.cancel && opts.cancel()) throw new Error('cancelled');
        const t = i / doc.comp.fps;
        await media.prepare(doc, t);
        draw.drawFrame(ctx, doc, t, { media });
        if (track.requestFrame) track.requestFrame();
        const k = i - from + 1;
        await sleep(t0 + k * frameMs - performance.now());
        if (opts.onProgress) opts.onProgress(k / (to - from));
      }
    } finally {
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      track.stop();
    }
    return new Blob(chunks, { type: type.split(';')[0] });
  }

  /** Saves a Blob as a download. */
  /** Saves a file: SlopUI.download (shared/slopui.js), the one copy. */
  function download(blob, name) {
    window.SlopUI.download(blob, name);
  }

  ns.render = { formats, videoType, frameRange, renderPng, renderVideo, download };
})(typeof window !== 'undefined' ? window : globalThis);
