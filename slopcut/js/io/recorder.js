/* SlopCut: real-time WebM export for browsers without WebCodecs (older Firefox/Safari).
   Plays the range with the normal player, draws each frame at export size onto a canvas captured with
   captureStream(), routes the mix to a MediaStreamDestination and records both with MediaRecorder. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const R = SE.recorder = {};
  R.supported = () => typeof MediaRecorder === 'function' && !!HTMLCanvasElement.prototype.captureStream;
  R.mime = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';

  R.run = async function (o) {
    if (!R.supported()) throw new Error('This browser can neither encode (WebCodecs) nor record (MediaRecorder) video');
    const p = SE.doc, P = SE.player, { w, h, fps, a, b } = o;
    const progress = o.progress || (() => {}), signal = o.signal || {};
    const cv = U.canvas(w, h), g = cv.getContext('2d');
    const stream = cv.captureStream(fps);
    const ctx = P.audioContext();
    let dest = null, master = null;
    if (ctx && SE.audiomix.hasAudio(p, a, b)) {
      dest = ctx.createMediaStreamDestination();
      master = ctx.createGain(); master.connect(dest); master.connect(ctx.destination);
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    }
    const mime = R.mime();
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: o.bitrate || SE.encode.bitrate(w, h, fps, o.quality) });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    // prime the first frame, then run in real time on the audio clock
    if (SE.watermark) await SE.watermark.ready(p);
    P.pause(); P.seek(a);
    await U.sleep(300);
    SE.compositor.render(g, p, a, { W: w, H: h, source: SE.preview.source });
    let nodes = [];
    const c0 = ctx ? ctx.currentTime + 0.15 : 0, perf0 = performance.now() + 150;
    if (master) nodes = SE.audiomix.schedule(ctx, master, p, a, c0);
    rec.start(500);
    const was = P.loop; P.loop = false;
    await new Promise((res) => {
      const step = () => {
        const t = a + (ctx ? Math.max(0, ctx.currentTime - c0) : Math.max(0, performance.now() - perf0) / 1000);
        if (signal.cancelled || t >= b) { res(); return; }
        P.time = t; P.playing = true; P.rate = 1; // let the <video> pool run in sync
        SE.compositor.render(g, p, t, { W: w, H: h, source: SE.preview.source });
        progress((t - a) / (b - a), U.t('slopedit.io.recording', { at: U.timecode(t - a, fps), of: U.timecode(b - a, fps) }));
        requestAnimationFrame(step);
      };
      step();
    });
    P.playing = false; P.rate = 0; P.loop = was;
    SE.vpool.pauseAll();
    SE.audiomix.stop(nodes);
    rec.stop(); await stopped;
    stream.getTracks().forEach((t) => t.stop());
    if (master) master.disconnect();
    if (signal.cancelled) throw new DOMException('Export cancelled', 'AbortError'); // i18n-ignore: an error for the code
    P.seek(a);
    return { blob: new Blob(parts, { type: (mime || 'video/webm').split(';')[0] }), info: { w, h, fps, codec: mime || 'webm', mode: 'recorder' } };
  };
})();
