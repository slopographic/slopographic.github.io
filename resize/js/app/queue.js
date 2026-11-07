/* Slop Resize: the batch queue. Holds the files (picked, dropped, or from Slop Drive), runs them one at a time with a
 * snapshot of the settings taken when the run starts, reports progress, and can cancel. Classic script; exposes
 * window.SlopResize.queue.
 *   add(file, { name, drive })   Promise<item>   reads the picture size; status 'waiting', or 'error' when unreadable
 *   items() / busy()             the list (in order) / whether a run is going
 *   remove(id) / clear()         not while a run is going
 *   run(opt)                     Promise   opt = { spec, image: { mime, quality }, video: { format, fps, quality, audio } }
 *   cancel()                     stops after the current step; the items not yet started become 'cancelled'
 *   on(fn)                       fn(items) after each change (progress is throttled)
 * An item: { id, name, file, kind, status, src, progress, msg, note, err, out, outName, drive, thumb }
 *   status  loading | waiting | working | done | error | cancelled */
(function (g) {
  'use strict';
  const NS = g.SlopResize, Q = (NS.queue = {}), tr = (k, en, v) => NS.tr(k, en, v);
  const subs = new Set();
  let seq = 0, list = [], busy = false, sig = null, lastEmit = 0;

  function emit() {
    lastEmit = Date.now();
    for (const fn of subs) { try { fn(list); } catch (e) { console.warn(e); } }
  }
  Q.on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  Q.items = () => list;
  Q.busy = () => busy;

  /** Add one file. Pictures get a thumbnail; a file that cannot be read is kept and marked as an error. */
  Q.add = async function (file, o = {}) {
    const kind = NS.format.kind(file);
    const it = { id: ++seq, name: o.name || file.name || 'Untitled', file, kind, status: 'loading', src: null, progress: 0, msg: '', note: '', err: '', out: null, outName: '', drive: o.drive || null, thumb: '' };
    if (kind === 'image') it.thumb = URL.createObjectURL(file);
    list.push(it);
    emit();
    try {
      if (!kind) throw new Error(tr('resize.err.not_media', 'Not a picture or a video'));
      it.src = kind === 'video' ? await NS.video.probe(file) : await NS.image.probe(file);
      if (it.src.thumb) { URL.revokeObjectURL(it.thumb); it.thumb = it.src.thumb; }   // a camera RAW file: its preview
      it.status = 'waiting';
    } catch (e) {
      it.status = 'error';
      it.err = (e && e.message) || tr('resize.err.unreadable', 'Could not read this file');
    }
    emit();
    return it;
  };

  Q.remove = function (id) {
    if (busy) return false;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const [it] = list.splice(i, 1);
    if (it.thumb) URL.revokeObjectURL(it.thumb);
    emit();
    return true;
  };

  Q.clear = function () {
    if (busy) return;
    for (const it of list) if (it.thumb) URL.revokeObjectURL(it.thumb);
    list = [];
    emit();
  };

  Q.cancel = function () { if (sig) sig.cancelled = true; };

  /** Resize every item that has been read (re-running the done ones too), one after another. */
  Q.run = async function (opt) {
    if (busy) return;
    busy = true;
    sig = { cancelled: false };
    emit();
    try {
      for (const it of list.slice()) {
        if (!it.src) continue; // unreadable: nothing to resize
        if (sig.cancelled) { it.status = 'cancelled'; emit(); continue; }
        await one(it, opt);
      }
    } finally {
      busy = false;
      sig = null;
      emit();
    }
  };

  async function one(it, opt) {
    it.status = 'working';
    it.progress = 0; it.msg = ''; it.note = ''; it.err = ''; it.out = null; it.outName = ''; it.drive = null;
    emit();
    try {
      const progress = (p, msg) => {
        it.progress = p;
        it.msg = msg;
        if (Date.now() - lastEmit > 120) emit();
      };
      const out = it.kind === 'video'
        ? await NS.video.run(it.file, opt.spec, { format: opt.video.format, fps: opt.video.fps, quality: opt.video.quality, audio: opt.video.audio, signal: sig, progress })
        : await NS.image.run(it.file, opt.spec, { mime: opt.image.mime, quality: opt.image.quality, maxBytes: opt.spec.mode === 'bytes' ? opt.spec.maxBytes : 0 });
      it.out = { blob: out.blob, w: out.w, h: out.h, size: out.blob.size, ext: out.ext };
      it.outName = NS.format.outName(it.name, out.w, out.h, out.ext);
      it.note = out.note || '';
      it.progress = 1;
      it.status = 'done';
    } catch (e) {
      if (e && e.name === 'AbortError') { it.status = 'cancelled'; }
      else { it.status = 'error'; it.err = (e && e.message) || tr('resize.err.failed', 'Could not resize this file'); }
    }
    emit();
  }
})(typeof window !== 'undefined' ? window : globalThis);
