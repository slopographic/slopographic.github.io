/* SlopIsolate video — encoders. Each walks the frames of a finished matte: res = { masks, mw, mh } from analyze.js.
 *   V.enc.alphaWebm(src, res, o)  → { blob, kind: 'webm' }  VP9 with alpha (VideoEncoder alpha: 'keep') in WebM.
 *   V.enc.pngZip(src, res, o)     → { blob, kind: 'zip', frames } fallback: one PNG per frame in a store-only zip.
 *   V.enc.mp4(src, res, o)        → { blob, kind: 'mp4' }  the cut-out over o.bg (a colour), H.264 or VP9 in MP4.
 *   V.enc.matteMp4(src, res, o)   → the matte as a grey video (the matte half of a Slop Cut pair).
 *   V.enc.colourMp4(src, res, o)  → the original frames (the colour half of a pair).
 * o: { signal, onProgress(done, total), bg, bitrate }. A cancelled run rejects with AbortError. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video, MT = V.matte, L = V.limits;
  const E = V.enc = {};

  const checkAbort = (signal) => { if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const frameUs = (i, fps) => Math.round((i * 1e6) / fps);
  const room = async (enc) => { while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2)); };

  /** Frame loop: for each frame i < masks.length, draw(frame, i) → canvas, then encode it. sink gets the chunks. */
  async function encodeLoop(src, res, o, config, sink, draw) {
    let fail = null;
    const enc = new VideoEncoder({ output: (c, m) => sink(c, m), error: (e) => { fail = e; } });
    enc.configure(config);
    const n = res.masks.length, fps = src.fps;
    try {
      await src.each(async (frame, i) => {
        checkAbort(o.signal);
        if (fail) throw fail;
        if (i >= n) return;
        const c = draw(frame, i, res);
        const vf = new VideoFrame(c, { timestamp: frameUs(i, fps), duration: frameUs(1, fps) });
        enc.encode(vf, { keyFrame: i % Math.max(1, Math.round(fps)) === 0 });
        vf.close();
        await room(enc);
        if (o.onProgress) o.onProgress(i + 1, n);
      }, { signal: o.signal });
      checkAbort(o.signal);
      if (fail) throw fail;
      await enc.flush();
    } finally {
      try { enc.close(); } catch (e) { /* already closed */ }
    }
  }

  E.alphaWebm = async function (src, res, o) {
    const S = await L.probe();
    if (!S.alphaWebm) throw new Error(CO.util.t('cutout.video.err_alpha'));
    const { w, h } = src.out, writer = V.webm.writer({ w, h, fps: src.fps });
    const cfg = { codec: 'vp09.00.10.08', width: w, height: h, alpha: 'keep', bitrate: o.bitrate || 4e6, framerate: src.fps };
    await encodeLoop(src, res, o, cfg, (chunk, meta) => writer.add(chunk, meta && meta.alphaSideData ? meta.alphaSideData : null, chunk.timestamp),
      (frame, i, r) => MT.frame(frame, r.masks[i], r.mw, r.mh, w, h, null));
    return { blob: writer.finish(), kind: 'webm' };
  };

  /** One PNG per frame (frame-0001.png …) in a store-only zip. About 1 MB per frame at 720p, so long clips are big. */
  E.pngZip = async function (src, res, o) {
    const { w, h } = src.out, entries = [], n = res.masks.length;
    await src.each(async (frame, i) => {
      checkAbort(o.signal);
      if (i >= n) return;
      const c = MT.frame(frame, res.masks[i], res.mw, res.mh, w, h, null);
      const blob = await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('PNG encoding failed'))), 'image/png'));
      entries.push({ name: 'frame-' + String(i + 1).padStart(4, '0') + '.png', blob });
      if (o.onProgress) o.onProgress(i + 1, n);
    }, { signal: o.signal });
    checkAbort(o.signal);
    return { blob: await CO.zip(entries), kind: 'zip', frames: entries.length };
  };

  /** Generic MP4: H.264 when the browser encodes it, else VP9 in MP4. */
  async function mp4(src, res, o, draw) {
    const S = await L.probe();
    if (!S.mp4Codec) throw new Error(CO.util.t('cutout.video.err_mp4'));
    const { w, h } = src.out, isAvc = S.mp4Codec.startsWith('avc');
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: isAvc ? 'avc' : 'vp9', width: w, height: h },
      fastStart: 'in-memory',
    });
    await encodeLoop(src, res, o, { codec: S.mp4Codec, width: w, height: h, bitrate: o.bitrate || 4e6, framerate: src.fps },
      (chunk, meta) => muxer.addVideoChunk(chunk, meta), draw);
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), kind: 'mp4' };
  }
  E.mp4 = (src, res, o) => mp4(src, res, o, (frame, i, r) => MT.frame(frame, r.masks[i], r.mw, r.mh, src.out.w, src.out.h, o.bg || '#ffffff'));
  E.matteMp4 = (src, res, o) => mp4(src, res, o, (frame, i, r) => MT.grey(r.masks[i], r.mw, r.mh, src.out.w, src.out.h));
  E.colourMp4 = (src, res, o) => mp4(src, res, o, (frame) => MT.plain(frame, src.out.w, src.out.h));
})();
