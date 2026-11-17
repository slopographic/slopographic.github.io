/* The watermark on every frame of a video (MP4, MOV, M4V, WebM) or an animated GIF, with the sound kept. The canvas engine
 * (core.js) paints the spec once at the video's own size onto a see-through picture (one per time range), and the site's
 * one video engine (convert/js/core/ffmpeg-engine.js, ffmpeg.wasm, downloaded once after its notice) lays it over every
 * frame: so a video looks exactly like a picture with the same spec. A layer with a time range shows only then.
 * MP4 and MOV are written as H.264 (MOV stays MOV), WebM as VP8; the sound is copied as it is (re-encoded only when the
 * container cannot hold it). Classic script, loaded by apply.js: SlopWatermark.applyVideo(file, spec, opts) → Blob.
 *   SlopWatermark.videoPlan(spec, W, H) → [{ from, to, layers }]   the overlays, one per time range (pure, for tests)
 *   SlopWatermark.filterOf(plan, mode) → the ffmpeg filter graph; mode 'gif' (a palette for GIF), 'even' (H.264 needs an
 *        even width and height: an odd one loses its last pixel row or column) or '' */
(function () {
  'use strict';
  const WM = window.SlopWatermark, S = window.SlopWatermarkSpec;
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  const ENGINE = new URL('convert/js/core/ffmpeg-engine.js', WM.ROOT).href;
  const MIME = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' };

  /** The video's frame size (as it is shown, rotation applied) and its length, from the browser's own reader. */
  function probe(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      const done = (fn, x) => { clearTimeout(t); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); fn(x); };
      const t = setTimeout(() => done(reject, new Error(tr('ui.wm.video_unread'))), 20000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => (v.videoWidth > 0 ? done(resolve, { w: v.videoWidth, h: v.videoHeight, duration: v.duration }) : done(reject, new Error(tr('ui.wm.video_no_track'))));
      v.onerror = () => done(reject, new Error(tr('ui.wm.video_unread_try')));
      v.src = url;
    });
  }
  async function gifSize(file) {
    const b = await createImageBitmap(file);
    const out = { w: b.width, h: b.height, duration: 0 };
    b.close();
    return out;
  }

  function videoPlan(spec) {
    const groups = new Map();
    for (const L of S.visible(spec)) {
      const key = L.from + '|' + L.to;
      if (!groups.has(key)) groups.set(key, { from: L.from, to: L.to, layers: [] });
      groups.get(key).layers.push(L);
    }
    return [...groups.values()];
  }
  const sec = (n) => String(Math.round(n * 1000) / 1000);
  function filterOf(plan, mode = '') {
    const parts = [];
    let cur = '[0:v]';
    plan.forEach((g, i) => {
      const en = g.to > 0 ? `:enable='between(t,${sec(g.from)},${sec(g.to)})'` : g.from > 0 ? `:enable='gte(t,${sec(g.from)})'` : '';
      const out = i === plan.length - 1 && !mode ? '[v]' : `[o${i}]`;
      parts.push(`${cur}[${i + 1}:v]overlay=0:0${en}${out}`);
      cur = out;
    });
    if (mode === 'gif') parts.push(`${cur}split[a][b];[a]palettegen[p];[b][p]paletteuse[v]`);
    if (mode === 'even') parts.push(`${cur}crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0[v]`);
    return parts.join(';');
  }
  async function overlay(layers, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    WM.draw(c.getContext('2d'), W, H, { layers: layers.map((L) => Object.assign({}, L, { from: 0, to: 0 })) });
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function applyVideo(file, spec, opts = {}) {
    const type = WM.typeOf(file), gif = type === 'image/gif';
    const out = gif ? 'gif' : type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4';
    const size = gif ? await gifSize(file) : await probe(file);
    const engine = await import(ENGINE);
    if (!(await engine.firstUseGate())) throw new DOMException('Cancelled', 'AbortError');
    await WM.ready(spec);
    const plan = videoPlan(spec), W = size.w, H = size.h;
    const inputs = [];
    for (let i = 0; i < plan.length; i++) inputs.push({ name: `wm${i}.png`, data: await overlay(plan[i].layers, W, H) });
    const fc = filterOf(plan, gif ? 'gif' : out === 'webm' ? '' : 'even'), more = inputs.flatMap((x) => ['-i', x.name]);
    const video = out === 'webm' ? ['-c:v', 'libvpx', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
    const head = (i) => ['-i', i, ...more, '-filter_complex', fc, '-map', '[v]'];
    const tail = out === 'mp4' ? ['-movflags', '+faststart'] : out === 'mov' ? ['-f', 'mov'] : [];
    const args = gif ? (i, o) => [...head(i), '-loop', '0', o] : (i, o) => [...head(i), '-map', '0:a?', ...video, '-c:a', 'copy', ...tail, o];
    const fallback = gif ? null : (i, o) => [...head(i), '-map', '0:a?', ...video, ...(out === 'webm' ? ['-c:a', 'libvorbis', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '160k']), ...tail, o];
    const r = await engine.convertVideo(file, { name: 'watermarked', output: out, args, fallback, inputs, progress: opts.progress, signal: opts.signal });
    return r.blob.type === MIME[out] ? r.blob : new Blob([r.blob], { type: MIME[out] });
  }

  Object.assign(WM, { applyVideo, videoPlan, filterOf });
})();
