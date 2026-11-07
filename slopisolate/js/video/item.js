/* SlopIsolate video — video items in the queue. A video item has kind 'video', a poster thumbnail (url), the probed
 * source (it.vid.src, see source.js) and, after the matte pass, it.vid.res = { masks, mw, mh }. The matte pass
 * (V.run) and the exports (V.saveWebm, V.saveMp4) are the only places that run the model or the encoders for video.
 * The player on the stage is in player.js. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video, U = CO.util, S = CO.state, t = U.t;

  V.isVideo = (f) => /^video\//.test(f.type || '') || /\.(mp4|m4v|mov|webm)$/i.test(f.name || '');

  /** A poster frame (the first picture) as an object URL, for the queue tile. */
  async function poster(file, src) {
    const el = document.createElement('video');
    try {
      el.muted = true; el.playsInline = true; el.src = src.url;
      await new Promise((ok, no) => { el.onloadeddata = ok; el.onerror = no; });
      const c = U.canvas(160, Math.round(160 * src.h / src.w)), g = c.getContext('2d');
      g.drawImage(el, 0, 0, c.width, c.height);
      return URL.createObjectURL(await new Promise((ok) => c.toBlob(ok, 'image/png')));
    } catch (e) { return ''; } finally { el.removeAttribute('src'); el.load(); }   // release the decoder on every path
  }

  /** Add one video to the queue: probe it, check the limits, select it when nothing is selected. */
  V.addItem = async function (file, opts = {}) {
    const it = S.createItem(file);
    it.kind = 'video'; it.status = 'ready'; it.error = '';
    it.vid = { src: null, res: null, ac: null };
    if (opts.driveId) it.driveOriginId = opts.driveId;
    if (opts.origin) it.origin = opts.origin;
    S.items.push(it);
    CO.emit('list', S.items);
    try {
      it.vid.src = await V.open(file);
      it.w = it.vid.src.w; it.h = it.vid.src.h;
      it.vid.lim = V.limits.check({ duration: it.vid.src.duration, w: it.w, h: it.h });
      if (!it.vid.lim.ok) throw new Error(it.vid.lim.msg);
      it.url = await poster(file, it.vid.src);
    } catch (e) {
      S.setStatus(it, 'error', { error: e.message || String(e) });
    }
    if (!S.activeId) S.activeId = it.id;
    CO.emit('list', S.items);
    CO.emit('activeItem', S.current());
    return it;
  };

  /** The matte pass for one video. Progress goes to the busy bar; Cancel stops between frames (no partial result). */
  V.run = async function (it) {
    if (!it || it.kind !== 'video' || it.status === 'working' || !it.vid.src) return;
    const ac = new AbortController(), t0 = performance.now();
    it.vid.ac = ac;
    S.setStatus(it, 'working', { progress: 0, error: '' });
    CO.emit('busy', { on: true, msg: t('cutout.video.cutting'), progress: 0 });
    try {
      const res = await V.analyze(it.vid.src, {
        model: S.modelOf(it), signal: ac.signal,
        onProgress: (p) => { if (p.phase === 'frame') { it.progress = p.i / p.n; CO.emit('busy', { on: true, msg: t('cutout.video.frame', { i: p.i, n: p.n, ms: Math.round(p.ms / p.i) }), progress: p.i / p.n }); CO.emit('item', it); } },
      });
      if (res.cancelled) { S.setStatus(it, 'ready', { progress: null }); CO.emit('toast', t('cutout.video.cancelled')); return; }
      it.vid.res = res;
      it.timings = { total: performance.now() - t0 };
      S.setStatus(it, 'done', { progress: null });
      if (CO.drive && CO.drive.ready()) CO.drive.saveVideo(it, it.vid.src, res);
    } catch (e) {
      S.setStatus(it, 'error', { error: e.message || String(e), progress: null });
    } finally {
      it.vid.ac = null;
      CO.emit('busy', { on: false });
    }
  };
  V.cancel = function (it) { if (it && it.vid && it.vid.ac) it.vid.ac.abort(); };

  /** Export the cut-out video: WebM with alpha, or a PNG sequence where the browser cannot write alpha. */
  V.saveWebm = async function (it) {
    const lim = await V.limits.probe();
    const base = U.baseName(it.name);
    const alpha = lim.alphaWebm;
    return runExport(it, t(alpha ? 'cutout.video.writing_webm' : 'cutout.video.writing_png'), async (o) => {
      const out = alpha ? await V.enc.alphaWebm(it.vid.src, it.vid.res, o) : await V.enc.pngZip(it.vid.src, it.vid.res, o);
      const name = base + (alpha ? '-cutout.webm' : '-cutout-frames.zip');
      SlopUI.download(out.blob, name);
      SlopSupport.afterExport('slopisolate');
      if (CO.drive && CO.drive.ready()) CO.drive.saveResult(it, out.blob, name);
      return out.kind === 'zip' ? t('cutout.video.saved_frames', { n: out.frames }) : t('cutout.video.saved_webm');
    });
  };
  V.saveMp4 = async function (it, bg) {
    const base = U.baseName(it.name), name = base + '-cutout-' + bg.slice(1) + '.mp4';
    return runExport(it, t('cutout.video.writing_mp4'), async (o) => {
      const out = await V.enc.mp4(it.vid.src, it.vid.res, Object.assign({ bg }, o));
      SlopUI.download(out.blob, name);
      SlopSupport.afterExport('slopisolate');
      if (CO.drive && CO.drive.ready()) CO.drive.saveResult(it, out.blob, name);
      return t('cutout.video.saved', { name });
    });
  };
  /** Shared export shell: busy bar with progress and Cancel, toast on success or failure. */
  async function runExport(it, msg, fn) {
    if (!it.vid.res) return null;
    const ac = new AbortController();
    it.vid.ac = ac;
    CO.emit('busy', { on: true, msg, progress: 0 });
    try {
      const done = await fn({ signal: ac.signal, onProgress: (i, n) => CO.emit('busy', { on: true, msg: t('cutout.video.progress', { msg, i, n }), progress: i / n }) });
      CO.emit('toast', done);
      return done;
    } catch (e) {
      CO.emit('toast', e.name === 'AbortError' ? t('cutout.video.export_cancelled') : t('cutout.export.failed', { error: String(e.message || e) }));
      return null;
    } finally { it.vid.ac = null; CO.emit('busy', { on: false }); }
  }
})();
