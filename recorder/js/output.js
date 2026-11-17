/* Slop Recorder: the file to save from a recording: trimmed, and as WebM, MP4, GIF or WAV. Classic script: SlopRec.output.
 *   make(rec, { format, trim, opts, progress, signal })  → { blob, name, type }
 *     rec: { blob, ext, ms, audioOnly }; trim: { start, end } in seconds (or null)
 *     WebM: as recorded, or the kept part played once in real time and recorded again (playTrim), with its length written
 *     in (core/webm.js); where the browser cannot capture a playing video, the video engine cuts it.
 *     MP4 and GIF: the video engine (convert/js/core/ffmpeg-engine.js, ffmpeg.wasm, downloaded once after its notice),
 *     the range cut frame-accurately (core/plan.js ffmpegArgs). WAV: decoded and written on this device (convert's audio.js).
 *   playTrim(blob, start, end, { progress, signal }) → Blob   (exported for the tests) */
(function (g) {
  'use strict';
  const R = (g.SlopRec = g.SlopRec || {});
  const ROOT = new URL('../../', document.currentScript ? document.currentScript.src : g.location.href).href;
  const engine = () => import(new URL('convert/js/core/ffmpeg-engine.js', ROOT).href);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const aborted = () => new DOMException('Cancelled', 'AbortError');

  function once(el, ev) { return new Promise((res, rej) => { el.addEventListener(ev, res, { once: true }); el.addEventListener('error', () => rej(new Error(t('recorder.err.no_playback'))), { once: true }); }); }

  async function playTrim(blob, start, end, { progress, signal } = {}) {
    const v = document.createElement('video'), url = URL.createObjectURL(blob);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.append(v);
    try {
      await once(v, 'loadedmetadata');
      v.currentTime = start;
      await once(v, 'seeked');
      const cap = v.captureStream ? v.captureStream() : v.mozCaptureStream();
      const P = R.plan, mime = P.pickMime((type) => MediaRecorder.isTypeSupported(type), !cap.getVideoTracks().length && !v.videoWidth);
      const rec = new MediaRecorder(cap, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined), parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const stopped = new Promise((res) => { rec.onstop = res; });
      await v.play();
      rec.start(500);
      const t0 = g.performance.now(), len = (end - start) * 1000;
      await new Promise((res, rej) => {
        const check = () => {
          if (signal && signal.aborted) { rej(aborted()); return; }
          const done = v.currentTime >= end - 0.02 || v.ended || g.performance.now() - t0 >= len + 1500;
          if (progress) progress(Math.min(1, (v.currentTime - start) / Math.max(0.1, end - start)));
          if (done) res(); else setTimeout(check, 15);
        };
        check();
      });
      v.pause();
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      cap.getTracks().forEach((track) => track.stop());
      const out = new Blob(parts, { type: (rec.mimeType || 'video/webm').split(';')[0] });
      const bytes = new Uint8Array(await out.arrayBuffer());
      const ms = R.webm.measure(bytes) || (end - start) * 1000;
      return new Blob([R.webm.setDuration(bytes, ms)], { type: out.type });
    } finally { v.remove(); URL.revokeObjectURL(url); }
  }

  async function viaEngine(rec, format, trim, opts, o) {
    const E = await engine();
    if (!(await E.firstUseGate())) throw aborted();
    const file = new File([rec.blob], 'recording.' + rec.ext, { type: rec.blob.type });
    const job = () => E.convertVideo(file, { name: 'recording', output: format, args: R.plan.ffmpegArgs(format, trim, opts), progress: o.progress, signal: o.signal });
    let r = await job();
    if (!r.blob.size) { console.warn('recorder: empty ' + format + ', once more'); r = await job(); }   // a run can come back empty: try once more
    if (!r.blob.size) throw new Error(t('recorder.err.empty_file'));
    return r.blob;
  }
  async function toWav(blob, trim) {
    const A = await import(new URL('convert/js/core/audio.js', ROOT).href);
    const buf = await A.decodeAudio(new Uint8Array(await blob.arrayBuffer()));
    let chans = A.channelsOf(buf);
    if (trim) { const a = Math.round(trim.start * buf.sampleRate), b = Math.round(trim.end * buf.sampleRate); chans = chans.map((c) => c.subarray(a, b)); }
    return new Blob([A.encodeWav(chans, buf.sampleRate)], { type: 'audio/wav' });
  }

  async function make(rec, { format = 'webm', trim = null, opts = {}, progress, signal, name } = {}) {
    const P = R.plan, dur = rec.ms / 1000, cut = trim && P.isTrimmed(trim, dur) ? P.clampTrim(trim.start, trim.end, dur) : null;
    const fmt = P.formatsFor(rec.audioOnly ? 'mic' : 'screen').includes(format) ? format : 'webm';
    const base = (name || P.fileName(new Date(), 'x')).replace(/\.[^.]+$/, '');
    const same = !cut && (rec.ext === fmt || (fmt === 'webm' && rec.ext !== 'webm'));   // nothing to do: keep the recording
    const ext = same ? rec.ext : fmt;
    let blob;
    if (same) blob = rec.blob;
    else if (fmt === 'wav') blob = await toWav(rec.blob, cut);
    else if (fmt === 'webm' && rec.ext === 'webm' && R.capture.caps().mediaStream) blob = await playTrim(rec.blob, cut.start, cut.end, { progress, signal });
    else blob = await viaEngine(rec, fmt, cut, opts, { progress, signal });
    return { blob, name: `${base}.${ext}`, type: blob.type || 'application/octet-stream' };
  }
  R.output = { make, playTrim };
})(typeof window !== 'undefined' ? window : globalThis);
