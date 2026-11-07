// Slop Effects media bin: the images and videos this session has loaded (from the computer or Slop Drive). A project only
// references media (name, size, Drive id); the files stay in this bin, so a project opened later reports what is missing.
// prepare(doc, t) seeks every video layer to the frame at t and waits for the seek, so the preview and the render show
// the right frame. Browser only. Classic script: window.SlopEffects.media.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const bin = new Map(); // id -> entry { id, kind, name, size, driveId, w, h, dur, el, url }
  const SEEK_TIMEOUT = 3000;

  /** Kind from a MIME type: 'image', 'video', or null for anything else. */
  function kindOf(type) {
    if (/^image\//.test(type || '')) return 'image';
    if (/^video\//.test(type || '')) return 'video';
    return null;
  }

  /** Waits for an event on an element, or for a timeout (so a broken file never hangs the app). */
  function once(el, name, ms) {
    return new Promise((res, rej) => {
      const ok = () => { clearTimeout(timer); el.removeEventListener('error', bad); res(); };
      const bad = () => { clearTimeout(timer); el.removeEventListener(name, ok); rej(new Error('the file could not be read')); };
      const timer = setTimeout(() => { el.removeEventListener(name, ok); el.removeEventListener('error', bad); rej(new Error('timed out reading the file')); }, ms);
      el.addEventListener(name, ok, { once: true });
      el.addEventListener('error', bad, { once: true });
    });
  }

  /**
   * Adds a file to the bin. meta: { id, name, size, kind, driveId }. blob: the file. Resolves with the bin entry, which
   * holds the element and the media's natural size (video also its duration).
   */
  async function add(meta, blob) {
    const url = URL.createObjectURL(blob);
    let el, w = 0, h = 0, dur = 0;
    if (meta.kind === 'image') {
      el = new Image();
      el.src = url;
      await once(el, 'load', 20000);
      w = el.naturalWidth; h = el.naturalHeight;
    } else {
      el = document.createElement('video');
      el.muted = true; el.playsInline = true; el.preload = 'auto';
      el.src = url;
      await once(el, 'loadeddata', 20000);
      w = el.videoWidth; h = el.videoHeight; dur = el.duration || 0;
    }
    const entry = { id: meta.id, kind: meta.kind, name: meta.name, size: meta.size || 0, driveId: meta.driveId || '', w, h, dur, el, url };
    remove(meta.id);
    bin.set(meta.id, entry);
    return entry;
  }

  /** A bin entry without its element, for a project's media list. */
  const info = (e) => ({ id: e.id, name: e.name, kind: e.kind, w: e.w, h: e.h, dur: e.dur, size: e.size, driveId: e.driveId });
  const get = (id) => bin.get(id) || null;
  const list = () => [...bin.values()].map(info);

  /** Removes an entry and frees its URL. */
  function remove(id) {
    const e = bin.get(id);
    if (!e) return;
    if (e.url) URL.revokeObjectURL(e.url);
    bin.delete(id);
  }

  /** The element to draw for a media id at this moment, or null while it is not ready. */
  function drawable(id) {
    const e = bin.get(id);
    if (!e) return null;
    if (e.kind === 'image') return e.el.complete && e.el.naturalWidth > 0 ? e.el : null;
    return e.el.readyState >= 2 ? e.el : null;
  }

  /** Seeks one video element to a time and waits until the frame is there (or the timeout passes). */
  function seek(el, t) {
    return new Promise((res) => {
      const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); res(); };
      const timer = setTimeout(done, SEEK_TIMEOUT);
      el.addEventListener('seeked', done);
      el.currentTime = t;
    });
  }

  /**
   * Gets every video layer of the document ready for time t: each one seeks to t (clamped to the clip's length) and
   * waits for the frame. Images need nothing. Resolves when all are ready.
   */
  async function prepare(doc, t) {
    const jobs = [];
    for (const layer of doc.layers) {
      if (layer.type !== 'video' || layer.hidden) continue;
      const e = bin.get(layer.source.mediaId);
      if (!e || e.kind !== 'video') continue;
      const target = Math.min(Math.max(0, t), e.el.duration || Infinity);
      if (Math.abs(e.el.currentTime - target) > 1e-3 || e.el.readyState < 2) jobs.push(seek(e.el, target));
    }
    await Promise.all(jobs);
  }

  /**
   * Pairs the media a project lists with the bin: by Drive id when both have one, else by name and size. Returns
   * { map: Map(projectId -> binId), missing: [record] }. Missing media keeps its id, so its layers still point at it.
   */
  function match(records) {
    const map = new Map(), missing = [];
    const all = [...bin.values()];
    for (const rec of records) {
      const hit = all.find((e) => (rec.driveId && e.driveId === rec.driveId) || (e.name === rec.name && e.size === rec.size && e.kind === rec.kind));
      if (hit) map.set(rec.id, hit.id); else missing.push(rec);
    }
    return { map, missing };
  }

  /** Clears the bin (a new project). Frees every URL. */
  function clear() { for (const id of [...bin.keys()]) remove(id); }

  ns.media = { kindOf, add, get, list, info, remove, drawable, prepare, match, clear, seek };
})(typeof window !== 'undefined' ? window : globalThis);
