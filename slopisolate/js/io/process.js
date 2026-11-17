/* SlopIsolate — the queue and the active image. Every image is segmented once (its base mask is kept on the item), in a
 * bounded pool: up to SlopCutout.poolSize() images at once (each in its own worker), the rest queued; the page stays
 * free to edit finished images meanwhile. A failed image does not stop the rest; removing or re-running an image that is
 * being cut out cancels it. The image on screen owns a worker job (CO.active): slider and brush changes re-run only the
 * cheap post-processing in the worker via SlopCutout.finish(), so the model never runs twice.
 * One model for every image: an image follows the app's model (S.modelOf) unless the settings panel, editing several
 * selected pictures, gave it its own (P.pin), so a batch gets exactly what one image at a time gets. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, C = CO.compose;
  const P = CO.process = { active: null };
  const queue = [], running = new Map(); // running: item -> AbortController of its model run
  let refreshSeq = 0;
  /** Images segmented at once (the engine decides from the backend, cores and memory; P.limit overrides it in tests). */
  const limit = () => P.limit || (SlopCutout.poolSize ? SlopCutout.poolSize() : 1);

  /** Turn a finished engine result into the record the view and export read. */
  function record(it, jobId, r, bitmap) {
    return {
      item: it, jobId, w: r.width, h: r.height, bitmap,
      mask: r.mask, cutout: r.cutout, cut: null, bbox: C.bbox(r.mask, r.width, r.height), rev: 0,
    };
  }
  function fill(act, r) {
    Object.assign(act, { mask: r.mask, cutout: r.cutout, bbox: C.bbox(r.mask, act.w, act.h) });
    C.touch(act, null);   // the whole cut-out, into the canvas it already has
  }

  /** Segment one item with the model. Resolves when it is done, failed or cancelled. */
  async function segment(it) {
    const ac = new AbortController();
    running.set(it, ac);
    it.modelRunning = S.modelOf(it);
    S.setStatus(it, 'working', { progress: 0, error: '' });
    try {
      const r = await SlopCutout.removeBackground(it.file, {
        model: it.modelRunning, ...it.s, signal: ac.signal,
        onProgress: (p) => { it.phase = p.phase; it.progress = p.total ? p.loaded / p.total : null; CO.emit('progress', { it, p }); },
      });
      if (ac.signal.aborted || !S.get(it.id)) return;
      it.base = r.base.slice(); it.w = r.width; it.h = r.height; it.manual = false;
      it.modelUsed = r.model; it.timings = r.timings; it.progress = null; it.phase = null;
      S.setStatus(it, 'done');
      if (r.asked && r.model !== r.asked) P.notice('smaller');
      if (CO.drive && CO.drive.ready()) CO.drive.saveImage(it, r);
      if (!P.active && S.activeId === it.id) P.select(it);
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e && (e.code === 'low-memory' || e.code === 'unavailable')) await manual(it, e);
      else S.setStatus(it, 'error', { error: e.message || String(e), progress: null });
    } finally {
      if (running.get(it) === ac) running.delete(it);
    }
  }
  /** The model cannot run here (too little memory, or ORT cannot start in this browser): the image is done without it. Its base keeps every pixel (alpha
   *  255), so Keep / Remove brushing, the look and export all work; the person is told once why, in their language. */
  async function manual(it, e) {
    try {
      const bmp = await U.decode(it.file), w = bmp.width, h = bmp.height, small = bmp.downscaled;
      if (bmp.close) bmp.close();
      if (small) throw e;   // over the pixel cap: the brush map could not match the full image
      if (!S.get(it.id)) return;
      const kind = e.code === 'unavailable' ? 'manual_unavailable' : 'manual';
      Object.assign(it, { base: new Uint8ClampedArray(w * h).fill(255), w, h, manual: kind, modelUsed: null, progress: null, phase: null });
      S.setStatus(it, 'done');
      P.notice(kind);
      if (!P.active && S.activeId === it.id) P.select(it);
    } catch (err) { S.setStatus(it, 'error', { error: e.message, progress: null }); }
  }
  const told = new Set();
  /** Tell the person about a fallback once per visit (SlopCutout's words: en, sv, else English). */
  P.notice = function (kind) {
    if (told.has(kind)) return;
    told.add(kind);
    const msg = SlopCutout.lowMemoryText ? SlopCutout.lowMemoryText(kind) : '';
    if (msg && window.SlopUI && SlopUI.toast) SlopUI.toast(msg);
  };
  /** Start queued items while there is room in the pool. */
  function pump() {
    while (queue.length && running.size < limit()) {
      const it = queue.shift();
      if (S.get(it.id)) segment(it).then(pump);
    }
  }
  /** Stop the model run of an item (its worker finishes the pass, the result is dropped). */
  function cancel(it) {
    const ac = running.get(it);
    if (ac) { running.delete(it); ac.abort(); }
    const i = queue.indexOf(it);
    if (i >= 0) queue.splice(i, 1);
  }

  /** The one way images enter the queue (CO.files.take calls it): new items, the first of them on screen, all queued.
   *  opts: driveId, origin (where the files came from). Videos go to CO.video.addItem. Returns the new image items, with
   *  .videos = a promise per video (of its item, once probed). */
  P.add = function (files, opts = {}) {
    const items = [];
    items.videos = [];
    for (const f of files) {
      if (CO.video && CO.video.isVideo(f)) { items.videos.push(CO.video.addItem(f, opts)); continue; }
      if (!U.isImage(f)) continue;
      const it = S.createItem(f);
      it.url = URL.createObjectURL(f);
      if (opts.driveId) it.driveOriginId = opts.driveId;
      if (opts.origin) it.origin = opts.origin;
      S.items.push(it);
      items.push(it);
      queue.push(it);
    }
    // the first new image opens straight away: it becomes the active one, and the old view is dropped (it selects when it is done)
    if (items.length) { S.activeId = items[0].id; P.drop(); }
    CO.emit('list', S.items);
    if (items.length) { pump(); CO.emit('activeItem', S.current()); }
    return items;
  };

  /** The app's model changed (the Model panel): every image that follows it and was made with another model, or is
   *  still on its way with one, runs again, so a batch never keeps the old model where one image would get the new one.
   *  Returns the images that re-run. */
  P.followModel = function () {
    const redo = S.items.filter((it) => it.kind !== 'video' && !it.model && it.status !== 'error'
      && (it.status === 'done' ? it.modelUsed !== S.model : running.has(it) && it.modelRunning !== S.model));
    redo.forEach((it) => P.rerun(it));
    return redo;
  };

  /** Give these images a model of their own (the settings panel with several pictures selected): only those of them that
   *  were made, or are being made, with another model run again. Returns the images that re-run. */
  P.pin = function (items, id) {
    const redo = [];
    for (const it of items) {
      if (it.kind === 'video') continue;
      it.model = id;
      if (it.status === 'error' || it.status === 'queued') continue;
      if (it.status === 'done' ? it.modelUsed !== id : running.has(it) && it.modelRunning !== id) redo.push(it);
    }
    redo.forEach((it) => P.rerun(it));
    return redo;
  };

  /** Re-segment an item (new model or a changed file). Keeps its brush edits. */
  P.rerun = function (it) {
    if (P.active && P.active.item === it) P.drop();
    cancel(it);
    it.base = null;
    queue.push(it);
    S.setStatus(it, 'queued', { error: '' });
    pump();
  };

  /** Build a record for an item (new worker job, post-processed). Caller must release() it. */
  P.build = async function (it) {
    const jobId = await SlopCutout.createJob(it.file, it.base);
    const r = await SlopCutout.finish(jobId, it.s, it.edit);
    const bitmap = await U.decode(it.file);
    return record(it, jobId, r, bitmap);
  };

  /** Make an item the active one (the image on screen). */
  P.select = async function (it) {
    if (!it || it.status !== 'done') return;
    if (P.active && P.active.item === it) return;
    const seq = ++refreshSeq;
    P.drop();
    try {
      const act = await P.build(it);
      if (seq !== refreshSeq || S.current() !== it) { free(act); return; }
      P.active = act;
      CO.emit('active', act);
    } catch (e) { S.setStatus(it, 'error', { error: e.message }); }
  };

  /** Free the worker job of the active image. */
  P.drop = function () {
    const act = P.active;
    P.active = null;
    if (act) free(act);
  };
  /** Free a record: its worker job and its decoded bitmap (a batch switches the image on screen often). */
  function free(act) {
    SlopCutout.release(act.jobId).catch(() => {});
    if (act.bitmap && act.bitmap.close) act.bitmap.close();
    if (act.cut) { if (CO.view && CO.view.release) CO.view.release(act.cut); act.cut.width = act.cut.height = 0; act.cut = null; }
    if (act.grey) { act.grey.width = act.grey.height = 0; act.grey = act.greyImg = null; }   // iOS frees a canvas's pixels only then
  }

  /** Re-run post-processing for the active image (settings or brush edits changed). Newest call wins. */
  P.refresh = async function (it) {
    const act = P.active;
    if (!act || act.item !== it || !act.jobId) return;
    const seq = ++refreshSeq;
    try {
      const r = await SlopCutout.finish(act.jobId, it.s, it.edit);
      if (seq !== refreshSeq || P.active !== act) return;
      fill(act, r);
      CO.emit('active', act);
    } catch (e) { S.setStatus(it, 'error', { error: e.message }); }
  };
  P.refreshSoon = U.debounce((it) => P.refresh(it), 90);

  /** Remove an item from the list. */
  P.remove = function (it) {
    if (P.active && P.active.item === it) P.drop();
    cancel(it);
    pump();
    const idx = S.index(it.id);
    if (idx >= 0) S.items.splice(idx, 1);
    if (it.url) URL.revokeObjectURL(it.url);
    if (S.activeId === it.id) {
      const next = S.items[Math.min(idx, S.items.length - 1)] || null;
      S.activeId = next ? next.id : null;
      CO.emit('activeItem', next);
      if (next) P.select(next);
    }
    CO.emit('list', S.items);
  };

  /** Live brush preview: recompute the matte and the cut-out alpha for one dirty rect on the main thread, so the
   * picture follows the brush at every stroke step (no worker round-trip). Same maths as P.matte + P.applyEdit;
   * feather and decontamination are applied by the worker when the stroke ends. */
  P.live = function (it, rect) {
    const act = P.active;
    if (!act || act.item !== it || !it.base || !act.mask || !rect) return;
    const W = act.w, alpha = C.alphaFn(it.s);
    const base = it.base, ed = it.edit, m = act.mask, cut = act.cutout.data;
    for (let y = rect.y; y < rect.y1; y++) {
      for (let x = rect.x; x < rect.x1; x++) {
        const i = y * W + x, a = alpha(base[i], ed ? ed[i] : 128);
        m[i] = a; cut[i * 4 + 3] = a;
      }
    }
    C.touch(act, rect);
    // one repaint per frame, however many pointer moves came in it
    if (!liveFrame) liveFrame = (window.requestAnimationFrame || setTimeout)(() => { liveFrame = 0; if (P.active) CO.emit('active', P.active); });
  };
  let liveFrame = 0;

  P.pending = () => queue.length + running.size;
  P.running = () => running.size;
  CO.on('look', (it) => P.refreshSoon(it));
  // Undoing or redoing a change of edge refinement changes the cut-out itself: the model runs again (the rest is cheap).
  CO.on('history', ({ it, entry, dir }) => {
    const e = entry && entry.kind === 'look' && (dir === 'undo' || dir === 'redo') ? entry : null;
    if (e && e.before.s.refine !== e.after.s.refine && it.status === 'done') P.rerun(it);
    else if (it.edit || it.s) P.refreshSoon(it);
  });
})();
