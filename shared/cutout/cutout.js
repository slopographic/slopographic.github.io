/* SlopCutout: on-device AI background removal for any Slopographic app. Classic script, sets window.SlopCutout.
 * The model runs in Web Workers (shared/cutout/worker.js) so the page never freezes. Calls made together run at once,
 * spread over poolSize() workers (each with its own model session); every call gets the same model, size and refinement.
 *
 *   const r = await SlopCutout.removeBackground(fileOrBitmap, { model: 'quality', onProgress });
 *   r.mask      Uint8ClampedArray (w*h, 0..255): the final alpha (use it as a layer mask)
 *   r.cutout    ImageData: the original pixels with that alpha (edge colours decontaminated)
 *   r.base      Uint8ClampedArray: the refined model mask before threshold/feather/brush edits
 *   r.width, r.height, r.model, r.timings { infer, post, total, backend, cached }
 *   await r.toBlob('image/png')   → Blob of the cutout
 *
 * opts: model 'fast' | 'quality' | 'portrait'; refine (edge-aware upscale, default true); threshold (0..1, .5);
 *   softness (0..1, 1 = keep the soft matte); feather (px); decontaminate (default true);
 *   keep: true keeps the pixels in the worker so finish(r.jobId, settings, edit) can re-run the cheap
 *   post-processing (threshold, brush edits, feather) at full resolution; call release(r.jobId) after.
 *   createJob(input, base) does the same later for a stored base mask without re-running the model.
 *   onProgress({ phase: 'runtime'|'model'|'init'|'infer'|'refine', loaded, total, cached, model }).
 * Accepts Blob/File, ImageBitmap, HTMLImageElement, canvas (incl. OffscreenCanvas) or ImageData. */
(function () {
  'use strict';
  if (window.SlopCutout) return;
  const SCRIPT = document.currentScript;
  const BASE = SCRIPT && SCRIPT.src ? new URL('./', SCRIPT.src).href : new URL('shared/cutout/', location.href).href;
  const conf = { workerUrl: BASE + 'worker.js', init: null, workers: 0 };
  /** A failure shown to the person (ui.cutout.*), in the chosen language when it happens. */
  const tr = (k, v) => { const I = window.SlopI18n; return I ? I.t(k, v) : k; };
  /** The low-memory words (shared/cutout/i18n, keys cutoutmem.*: English and Swedish; other languages read English),
   *  with the English text when the tables are not loaded. */
  const EN = {
    low_memory: 'This device is low on memory, so the AI background remover cannot run here.',
    manual: 'This device is low on memory, so the AI background remover cannot run here. Brush Remove over the background (and Keep over the subject) to cut it out by hand.',
    smaller: 'This device is low on memory: the Fast model was used instead.',
    unavailable: 'The AI background remover cannot run in this browser.',
    manual_unavailable: 'The AI background remover cannot run in this browser. Brush Remove over the background (and Keep over the subject) to cut it out by hand.',
  };
  function lowText(k, v) { const key = 'cutoutmem.' + k, s = tr(key, v); return s && s !== key ? s : EN[k]; }
  if (window.SlopI18n && SlopI18n.source && document.head) {   // the tables: English and the chosen language
    const s = document.createElement('script');
    s.src = BASE + 'i18n/index.js';
    document.head.append(s);
  }
  const isIOS = (nav) => /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  /** An Error for the page; code 'low-memory' (the device could not fit the model) or 'unavailable' (ONNX Runtime cannot
   *  start in this browser) gets the words people read, the engine's own message stays in .detail. */
  function failure(message, code) {
    const e = new Error(code === 'low-memory' ? lowText('low_memory') : code === 'unavailable' ? lowText('unavailable') : message || tr('ui.cutout.failed'));
    if (code) { e.code = code; e.detail = message; }
    return e;
  }
  // A pool of workers, each with its own ONNX Runtime and model session: without cross-origin isolation WebAssembly runs
  // single-threaded, so separate workers are the only way to segment several images at once. Worker 0 also answers the
  // plain calls (load, cached, info, ping). One more worker, 'edit', holds the jobs made by createJob (the image on screen):
  // its finish() runs no model, so slider and brush changes never wait behind a batch. A kept job lives in the worker
  // that made it, and finish/release go there.
  const slots = new Map(), jobAt = new Map();
  let seq = 0, jobSeq = 0, seen = null; // seen: the backend the workers really use (known after the first model pass)

  /** How many images can be segmented at once here. WebGPU: 2 (the GPU runs one model pass at a time; the second worker
   *  overlaps its CPU work: decode, edge refinement, decontamination). WebAssembly: one per two cores, at most 3, and 2
   *  with under 4 GB of memory; 1 on iOS or with 2 GB or less (every worker holds its own copy of the model). */
  function poolSize() {
    if (conf.workers > 0) return conf.workers;
    const nav = typeof navigator !== 'undefined' ? navigator : {}, cores = nav.hardwareConcurrency || 2, mem = nav.deviceMemory || 8;
    if (isIOS(nav) || mem <= 2) return 1;
    // Before the first pass, a browser with WebGPU is assumed to use it; a software adapter falls back to WebAssembly.
    const gpu = seen ? seen === 'webgpu' : !!nav.gpu && !(conf.init && conf.init.backend === 'wasm');
    const n = gpu ? 2 : Math.min(3, Math.max(1, Math.floor(cores / 2)));
    return mem < 4 ? Math.min(n, 2) : n;
  }

  /** Stop one worker (or all): its calls reject with msg, its jobs are gone. The next call starts a fresh one. */
  function fail(msg, only, code) {
    for (const s of only ? [only] : [...slots.values()]) {
      for (const p of s.pending.values()) p.reject(code ? failure(msg, code) : new Error(msg));
      s.pending.clear();
      s.worker.terminate();
      if (slots.get(s.key) === s) slots.delete(s.key);
      for (const [j, at] of jobAt) if (at === s) jobAt.delete(j);
    }
  }
  function slotAt(key) {
    if (slots.has(key)) return slots.get(key);
    const s = { key, worker: new Worker(conf.workerUrl), pending: new Map(), running: new Set() };
    s.worker.onmessage = (e) => {
      const { id, type, data, message, code } = e.data || {}, p = s.pending.get(id);
      if (type !== 'progress') s.running.delete(id);
      if (!p) return;
      if (type === 'progress') { if (p.onProgress) try { p.onProgress(data); } catch (err) { console.warn(err); } return; }
      s.pending.delete(id);
      if (type === 'error') p.reject(failure(message, code)); else p.resolve(data);
    };
    // a worker that dies without a word was almost always killed for its memory
    s.worker.onerror = (e) => { e.preventDefault(); fail(e.message ? tr('ui.cutout.stopped_why', { error: e.message }) : tr('ui.cutout.stopped_oom'), s, e.message ? null : 'low-memory'); };
    s.worker.postMessage({ id: ++seq, type: 'init', data: Object.assign({ ios: isIOS(typeof navigator !== 'undefined' ? navigator : {}) }, conf.init) });
    slots.set(key, s);
    return s;
  }
  /** The segment worker with the least work in flight (work a worker is still doing counts, even when its caller gave
   *  up). An idle started worker is used first; a new one starts only when every started one is busy, up to poolSize(). */
  function idlest() {
    const n = poolSize(), live = [];
    for (let i = 0; i < n; i++) if (slots.has(i)) live.push(slots.get(i));
    const free = live.find((s) => s.running.size === 0);
    if (free) return free;
    for (let i = 0; i < n; i++) if (!slots.has(i)) return slotAt(i);
    return live.reduce((a, s) => (s.running.size < a.running.size ? s : a));
  }
  /** Low-level RPC to a worker (worker 0 unless a slot is given). */
  function call(type, data, { onProgress, transfer, signal, slot } = {}) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const s = slot || slotAt(0), id = ++seq;
      s.pending.set(id, { resolve, reject, onProgress });
      s.running.add(id);
      if (signal) signal.addEventListener('abort', () => { if (s.pending.delete(id)) reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      s.worker.postMessage({ id, type, data }, transfer || []);
    });
  }
  const jobSlot = (jobId) => { const s = jobAt.get(jobId); if (!s || slots.get(s.key) !== s) throw new Error('Unknown cutout job ' + jobId); return s; };

  /** Turn any supported input into something we can transfer to the worker. */
  async function prepare(input, { transfer: give = false } = {}) {
    if (typeof ImageData !== 'undefined' && input instanceof ImageData) {
      const copy = new Uint8ClampedArray(input.data);
      return { image: { width: input.width, height: input.height, data: copy }, transfer: [copy.buffer] };
    }
    let bmp;
    if (input instanceof Blob) {
      try { bmp = await createImageBitmap(input, { imageOrientation: 'from-image' }); }
      catch (e) { bmp = await decodeViaImg(input); }
    } else if (typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap) bmp = give ? input : await createImageBitmap(input);
    else if (input && (input.width || input.naturalWidth)) bmp = await createImageBitmap(input);
    else throw new Error('Unsupported image');
    return { image: bmp, transfer: [bmp] };
  }
  /** Fallback decode (e.g. SVG blobs that createImageBitmap rejects). */
  function decodeViaImg(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth || 1024; c.height = img.naturalHeight || 1024; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); createImageBitmap(c).then(res, rej); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(tr('ui.cutout.unreadable'))); };
      img.src = url;
    });
  }

  const settingsOf = (o) => ({ threshold: o.threshold, softness: o.softness, feather: o.feather, decontaminate: o.decontaminate, decontaminateStrength: o.decontaminateStrength });
  function wrap(r, extra) {
    const out = Object.assign({}, r, extra);
    out.cutout = new ImageData(r.cutout, r.width, r.height);
    out.toBlob = (type = 'image/png', quality) => toBlob(out.cutout, type, quality);
    out.maskImageData = () => maskToImageData(out.mask, r.width, r.height);
    return out;
  }

  async function removeBackground(input, opts = {}) {
    if (opts.signal && opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { image, transfer } = await prepare(input, opts);
    const jobId = opts.keep ? 'j' + (++jobSeq) : null, slot = idlest();
    if (jobId) jobAt.set(jobId, slot);
    try {
      const r = await call('segment', { image, model: opts.model || 'fast', jobId, refine: opts.refine, guided: opts.guided, wantLow: !!opts.wantLow, settings: settingsOf(opts) },
        { onProgress: opts.onProgress, transfer, signal: opts.signal, slot });
      if (r.timings && r.timings.backend) seen = r.timings.backend;
      return wrap(r, { jobId, worker: slot.key });
    } catch (e) { if (jobId) release(jobId); throw e; }
  }
  /** Re-run threshold → brush edit → feather → decontaminate at full resolution for a kept job.
   *  edit: optional Uint8Array (w*h, 128 = untouched, 255 = keep, 0 = remove); it is copied. */
  async function finish(jobId, settings = {}, edit = null, { base } = {}) {
    const e = edit ? edit.slice() : null, b = base ? base.slice() : null;
    const r = await call('finish', { jobId, settings: settingsOf(settings), edit: e && e.buffer, base: b && b.buffer }, { transfer: [e && e.buffer, b && b.buffer].filter(Boolean), slot: jobSlot(jobId) });
    return wrap(r, { jobId });
  }

  /** Store an image plus a base mask from an earlier removeBackground() in the worker, without running
   *  the model again, so finish() works on it. Resolves with the new jobId. */
  async function createJob(input, base) {
    const { image, transfer } = await prepare(input), b = base.slice(), jobId = 'j' + (++jobSeq), slot = slotAt('edit');
    jobAt.set(jobId, slot);
    try { await call('job', { jobId, image, base: b.buffer }, { transfer: transfer.concat([b.buffer]), slot }); }
    catch (e) { jobAt.delete(jobId); throw e; }
    return jobId;
  }
  /** Free a kept job in the worker that holds it. */
  function release(jobId) {
    const s = jobId && jobAt.get(jobId);
    if (!s) return Promise.resolve();
    jobAt.delete(jobId);
    return slots.get(s.key) === s ? call('release', { jobId }, { slot: s }) : Promise.resolve();
  }

  /* ---------- helpers ---------- */
  function canvasOf(imageData) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(imageData.width, imageData.height) : Object.assign(document.createElement('canvas'), { width: imageData.width, height: imageData.height });
    c.getContext('2d').putImageData(imageData, 0, 0);
    return c;
  }
  function toBlob(imageData, type = 'image/png', quality) {
    const c = canvasOf(imageData);
    if (c.convertToBlob) return c.convertToBlob({ type, quality });
    return new Promise((res) => c.toBlob(res, type, quality));
  }
  /** Grey RGBA view of a mask (white = keep), e.g. for a PhotoSlop layer mask or a preview. */
  function maskToImageData(mask, w, h) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = mask[i]; d[j + 3] = 255; }
    return new ImageData(d, w, h);
  }

  window.SlopCutout = {
    removeBackground, finish, createJob, release, poolSize,
    /** Words for a device the model cannot run on: 'low_memory', 'unavailable' (the engine cannot run), 'manual',
     *  'manual_unavailable' (brush by hand instead), 'smaller' (the Fast model was used). */
    lowMemoryText: lowText,
    /** Download (or read from cache) and initialise a model ahead of time. */
    load: (model = 'fast', onProgress) => call('load', { model }, { onProgress }),
    /** { fast: bool, quality: bool, portrait: bool }: which models are already stored on this device. */
    cached: () => call('cached'),
    info: () => call('info'),
    /** configure({ workerUrl, backend: 'auto'|'wasm', vendor, models, sources, workers, ios, ua }) before the first call.
     *  ios / ua: stand-ins for the device check (tests); the browser's own are used otherwise.
     *  workers: how many images segment at once (0 = poolSize() decides). */
    configure(o = {}) {
      if (o.workerUrl) conf.workerUrl = o.workerUrl;
      if (o.workers !== undefined) conf.workers = Math.max(0, o.workers | 0);
      const init = {};
      for (const k of ['backend', 'vendor', 'models', 'sources', 'ios', 'ua']) if (o[k] !== undefined) init[k] = o[k];
      conf.init = Object.assign(conf.init || {}, init);
      if (slots.size && Object.keys(init).length) {
        if (o.backend !== undefined) { seen = null; fail('Restarting with a new backend'); }
        else for (const s of slots.values()) s.worker.postMessage({ id: ++seq, type: 'init', data: init });
      }
    },
    terminate: () => fail('Stopped'),
    call, toBlob, maskToImageData, canvasOf, BASE,
    get busy() { let n = 0; for (const s of slots.values()) n += s.pending.size; return n; },
    /** Workers started so far, the edit worker included (for tests). */
    get workers() { return slots.size; },
  };
})();
