/* Slop Upscale: the controller. Pictures and short videos come in through the one intake (shared/intake, spec 'upscale')
 * and each joins the list; choose 2× or 4× and a model, run (this one, or every one not done yet), compare, then
 * download, save to Slop Drive or open in another app. The page's layout and panel are app/layout.js.
 * Models: Fast (FSRCNN, bundled) for 2× and 4×; Quality (Real-ESRGAN, opt-in through Get more) for 4× only; Lanczos
 * alone. When the chosen model is not installed the run uses Lanczos and the page says so. Classic script. */
(function (g) {
  'use strict';
  const U = g.SlopUpscale, IO = U.io, SL = U.slider, D = U.drive, V = U.video, t = U.t, WD = U.words;
  const E = () => g.SlopUpscaleEngine, PL = () => g.SlopUpscalePipeline, MD = g.SlopUpscaleModels;
  const $ = (id) => document.getElementById(id);
  const QUALITY_ID = 'realesrgan-x4plus', QUALITY_FILE = 'model.onnx';
  const S = { items: [], item: null, busy: false, cancel: { cancelled: false }, scale: 2, model: 'fast', format: 'png', quality: 0.92, fps: 24, installed: false, unsupported: {} };

  // The controller's state and helpers, for the output module (app/output.js), which runs later, on a click.
  U.app = { S, open: (...a) => open(...a), toast: (m) => toast(m), setStatus: (m, f) => setStatus(m, f),
    run: () => run(), cancel: () => cancel(), select: (it) => select(it), remove: (it) => remove(it) };
  let nextId = 1;
  const toast = (msg) => { if (g.SlopUI && g.SlopUI.toast) g.SlopUI.toast(msg); };
  const setStatus = (msg, frac) => {
    $('up-status').textContent = msg;
    const bar = $('up-bar');
    bar.hidden = frac == null; if (frac != null) bar.value = frac;
  };

  /* ---------- Get more (the library scripts load on first need; nothing is downloaded here) ---------- */
  const LIB = ['manifest.js', 'store.js', 'install.js', 'get-more.js'];
  let libP = null;
  function loadLib() {
    if (!libP) libP = LIB.reduce((chain, f) => chain.then(() => new Promise((res) => {
      if (document.querySelector(`script[data-lib="${f}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = new URL('../shared/library/' + f, location.href).href; s.async = false; s.dataset.lib = f;
      s.onload = s.onerror = () => res();
      document.head.append(s);
    })), Promise.resolve());
    return libP;
  }
  async function refreshModels() {
    try {
      await loadLib();
      const rows = g.SlopLibraryStore ? await g.SlopLibraryStore.listPacks() : [];
      S.installed = rows.some((r) => r.id === QUALITY_ID);
    } catch (e) { S.installed = false; }
    WD.options(S);
    updateNote();
  }

  /** The model a run will use, with the reason when it is not the one picked. */
  function choice() {
    if (S.model === 'lanczos') return { id: null, label: t('upscale.run.lanczos'), note: t('upscale.run.lanczos_note') };
    if (S.model === 'quality' && S.scale === 4) {
      if (S.installed) return { id: QUALITY_ID, label: t('upscale.run.quality'), note: '' };
      return { id: null, label: t('upscale.run.lanczos'), note: t('upscale.run.no_quality') };
    }
    const id = `fsrcnn-x${S.scale}`;
    return { id, label: t('upscale.run.fast', { scale: String(S.scale) }), note: '' };
  }
  function updateNote() {
    const c = choice();
    $('up-model-note').textContent = c.note || (S.model === 'quality' && S.scale !== 4 ? t('upscale.run.quality_4x') : '');
  }

  async function libBytes() {
    const b = await g.SlopLibraryStore.getBlob(`${QUALITY_ID}/${QUALITY_FILE}`);
    if (!b) throw new Error(t('upscale.run.quality_gone'));
    return b.arrayBuffer();
  }

  /* ---------- Opening ---------- */
  /** Every file closes (the list empties). */
  function clear() {
    if (S.busy) return;
    for (const it of S.items) URL.revokeObjectURL(it.url);
    S.items = [];
    select(null);
  }
  /** One file leaves the list; the next one (or the empty page) shows. */
  function remove(it) {
    if (S.busy || !it) return;
    const i = S.items.indexOf(it);
    if (i < 0) return;
    URL.revokeObjectURL(it.url);
    S.items.splice(i, 1);
    select(S.items[Math.min(i, S.items.length - 1)] || null);
  }
  /** Show one file: its picture (or the before and after when done), its line, its result. */
  function select(it) {
    S.item = it || null;
    if (!it) {
      $('up-stage').replaceChildren(); $('up-stage').hidden = true;
      $('up-empty').hidden = false; $('up-info').textContent = '';
      setStatus('');
    } else {
      $('up-empty').hidden = true; $('up-stage').hidden = false;
      if (!it.out) showBefore(); else if (it.kind === 'image') showAfterImage(); else showAfterVideo();
      setStatus(it.status || t('upscale.run.ready'));
      updateInfo();
    }
    updateButtons();
  }

  /** The first-use notice: the fast models come with the app; the quality model is downloaded once, when it is first chosen. */
  /** The one reader (the intake's process, after its first-use notice): the file becomes the open item. */
  async function open(file, o = {}) {
    const kind = IO.kind(file);
    if (!kind) { toast(t('upscale.run.not_media')); return false; }
    if (S.busy) { toast(t('upscale.run.wait')); return false; }
    const item = { id: nextId++, name: file.name || 'Untitled', file, kind, url: URL.createObjectURL(file), canvas: null, out: null, outBlob: null, outName: '', drive: o.drive || null, w: 0, h: 0, dur: 0 };
    try {
      if (kind === 'image') {
        item.canvas = await IO.decode(file);
        item.w = item.canvas.width; item.h = item.canvas.height;
      } else {
        const probe = document.createElement('video');
        probe.muted = true; probe.src = item.url;
        await new Promise((res, rej) => { probe.onloadedmetadata = () => res(); probe.onerror = () => rej(new Error(t('upscale.video.unreadable'))); });
        item.w = probe.videoWidth; item.h = probe.videoHeight; item.dur = probe.duration;
        probe.removeAttribute('src'); probe.load();
        if (item.dur > V.MAX_SECONDS) throw new Error(t('upscale.video.too_long', { max: V.MAX_SECONDS, s: Math.round(item.dur) }));
      }
    } catch (e) { URL.revokeObjectURL(item.url); toast(e.message); setStatus(e.message); return false; }
    S.items.push(item);
    select(item);
    return true;
  }

  function showBefore() {
    const it = S.item;
    if (it.kind === 'image') {
      const img = document.createElement('img');
      img.src = it.url; img.alt = t('upscale.stage.original');
      $('up-stage').replaceChildren(img);
    } else {
      const v = document.createElement('video');
      v.src = it.url; v.controls = true; v.muted = true; v.playsInline = true; v.setAttribute('aria-label', t('upscale.stage.original_video'));
      $('up-stage').replaceChildren(v);
    }
  }

  function updateInfo() {
    const it = S.item;
    if (!it) { $('up-info').textContent = ''; return; }
    const ow = it.w * S.scale, oh = it.h * S.scale;
    const v = { name: it.name, w: String(it.w), h: String(it.h), ow: String(ow), oh: String(oh), scale: String(S.scale), s: Math.round(it.dur), fps: String(S.fps) };
    $('up-info').textContent = t(it.kind === 'video' ? 'upscale.app.info_video' : 'upscale.app.info', v);
  }

  /* ---------- Running ---------- */
  /** Upscale: every file not done yet, one after the other, when there are two or more; else the one shown (again). */
  async function run() {
    if (!S.item || S.busy) return;
    const todo = S.items.filter((x) => !x.out);
    const queue = todo.length > 1 ? todo : [S.item];
    S.busy = true; S.cancel = { cancelled: false };
    for (const it of queue) {
      if (S.cancel.cancelled) break;
      select(it);
      await runOne(it);
    }
    S.busy = false;
    updateButtons();
  }
  async function runOne(it) {
    const c = choice();
    it.running = true;
    updateButtons();
    try {
      const bytes = c.id === QUALITY_ID && !E().isLoaded(QUALITY_ID) ? await libBytes() : null;
      if (it.kind === 'image') {
        setStatus(t('upscale.run.starting', { model: c.label }), 0);
        it.out = { scale: S.scale, canvas: await PL().run(it.canvas, { scale: S.scale, model: c.id, bytes, signal: S.cancel,
          onProgress: (d, n) => setStatus(t('upscale.run.tile', { model: c.label, d, n }), d / n) }) };
        showAfterImage();
        setStatus(t('upscale.run.done', { model: c.label, w: String(it.out.canvas.width), h: String(it.out.canvas.height), note: c.note }).trim());
      } else {
        setStatus(t('upscale.run.starting_video', { model: c.label }), 0);
        const r = await V.run(it.file, { scale: S.scale, model: c.id, bytes, fps: S.fps, signal: S.cancel,
          progress: (d, n) => setStatus(t('upscale.run.frame', { model: c.label, d, n }), d / n) });
        it.outBlob = r.blob; it.outName = IO.outName(it.name, S.scale, r.ext);
        it.out = { scale: S.scale, w: r.w, h: r.h };
        showAfterVideo();
        setStatus(t('upscale.run.done_video', { n: r.frames, w: String(r.w), h: String(r.h), model: c.label, note: c.note }).trim());
      }
    } catch (e) {
      if (S.cancel.cancelled || e.message === 'Cancelled') setStatus(t('upscale.run.cancelled'));
      else setStatus(t('upscale.run.failed', { msg: e.message }));
    } finally {
      it.running = false;
      it.status = $('up-status').textContent;
    }
  }

  function showAfterImage() {
    const it = S.item, before = document.createElement('img');
    before.src = it.url; before.alt = t('upscale.stage.original');
    const after = it.out.canvas;
    after.className = 'up-result'; after.setAttribute('role', 'img'); after.setAttribute('aria-label', t('upscale.stage.upscaled'));
    SL.show($('up-stage'), before, after);
  }
  function showAfterVideo() {
    const it = S.item, box = $('up-stage'), before = document.createElement('video'), after = document.createElement('video');
    before.src = it.url; after.src = URL.createObjectURL(it.outBlob);
    for (const v of [before, after]) { v.controls = true; v.muted = true; v.playsInline = true; }
    before.setAttribute('aria-label', t('upscale.stage.original_video')); after.setAttribute('aria-label', t('upscale.stage.upscaled_video'));
    const row = document.createElement('div'); row.className = 'up-videos';
    row.append(before, after);
    box.replaceChildren(row);
  }

  function cancel() {
    if (!S.busy) return;
    S.cancel.cancelled = true;
    E().cancel();
    setStatus(t('upscale.run.cancelling'));
  }

  /* ---------- Controls (the buttons themselves are drawn by app/layout.js) ---------- */
  function updateButtons() {
    const has = !!S.item;
    if (U.layout) U.layout.paint();
    $('up-scale-2').setAttribute('aria-pressed', String(S.scale === 2));
    $('up-scale-4').setAttribute('aria-pressed', String(S.scale === 4));
    $('up-model').querySelector('option[value="quality"]').disabled = S.scale !== 4;
    if (S.scale !== 4 && S.model === 'quality') { S.model = 'fast'; $('up-model').value = 'fast'; }
    $('up-quality-wrap').hidden = S.format === 'png';
    $('up-fps-wrap').hidden = !(has && S.item.kind === 'video');
    updateNote();
  }
  function setScale(s) { S.scale = s; updateInfo(); updateButtons(); }

  async function formats() {
    const sel = $('up-format');
    for (const o of sel.options) {
      if (o.value === 'png') continue;
      o.disabled = S.unsupported[o.value] = !(await IO.formatSupported(o.value));
    }
    WD.options(S);
  }

  function wire() {
    $('up-open').addEventListener('click', () => g.SlopIntake.pick({ to: 'upscale' }));
    $('up-drive').addEventListener('click', () => g.SlopIntake.fromDrive({ to: 'upscale', title: t('upscale.app.drive_title') }));
    $('up-scale-2').addEventListener('click', () => setScale(2));
    $('up-scale-4').addEventListener('click', () => setScale(4));
    $('up-model').addEventListener('change', (e) => { S.model = e.target.value; updateButtons(); });
    $('up-format').addEventListener('change', (e) => { S.format = e.target.value; updateButtons(); });
    $('up-quality').addEventListener('input', (e) => { S.quality = Number(e.target.value) / 100; $('up-quality-val').textContent = e.target.value; });
    $('up-fps').addEventListener('change', (e) => { S.fps = Number(e.target.value); updateInfo(); });
    $('up-get-more').addEventListener('click', async () => { await loadLib(); if (g.SlopLibrary) g.SlopLibrary.open({ onInstalled: refreshModels }); });
    // The zone (shared/drop) is the intake's: the empty state's only drop area; the stage and the list take drops too.
    SlopDrop.attach($('up-drop'), {
      intake: 'upscale',
      label: 'upscale.drop.label',
      hint: 'upscale.drop.hint',
      targets: [$('up-stage-wrap'), $('up-list')],
      preview: { picture: { src: '../assets/shots/upscale.jpg', alt: 'upscale.drop.alt' },
        steps: ['upscale.drop.step1', 'upscale.drop.step2', 'upscale.drop.step3'] },
      // The city at night (the fourth scene), small: its lit windows show the sharper edges best.
      sample: { label: 'upscale.drop.sample', files: async () => (await window.SlopSamples.photos(4, { width: 400, height: 260 })).slice(3) },
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      else if (e.key === 'Escape' && S.busy) cancel();
    });
  }

  /** Every way in (Open, the zone, drops, a paste, Slop Drive, ?drive=<id>, a launch, the sample, controller.open) is a
   *  source of this one spec: its first-use notice, then open(); each file joins the list (up to 50). */
  function registerIntake() {
    g.SlopIntake.register({
      id: 'upscale', limit: 50, notice: WD.firstUse(MD.get(QUALITY_ID).bytes), driveAccept: ['image/*', 'video/*'],
      accept: { types: ['image/*', 'video/*'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.mp4', '.m4v', '.mov', '.webm'], noun: 'upscale.drop.noun' },
      process: async (file, ctx) => { if (!(await open(file, { drive: ctx.drive ? ctx.drive.id : null }))) throw new Error('could not be opened'); return file.name; },
    });
  }

  async function boot() {
    registerIntake();
    // The Quality model's size on the page comes from the registry's byte count, as the first-use notice's does.
    const qs = document.getElementById('up-quality-size');
    if (qs && g.SlopFirstRun) qs.textContent = g.SlopFirstRun.size(MD.get(QUALITY_ID).bytes);
    wire();
    WD.fine();
    WD.on(() => { WD.options(S); WD.fine(); updateInfo(); if (S.item && !S.item.status) setStatus(t('upscale.run.ready')); updateButtons(); });
    updateButtons();
    await formats();
    await refreshModels();
    if (g.SlopLibrary) g.SlopLibrary.onChange(refreshModels);
    if (g.SlopHub) g.SlopHub.register('upscale');
    await g.SlopIntake.launch({ to: 'upscale' });
  }

  U.controller = { open: (file) => g.SlopIntake.take([file], { to: 'upscale' }), run, clear, remove, select, state: () => ({ scale: S.scale, model: S.model, busy: S.busy, files: S.items.length }) };
  updateButtons();   // the panel's buttons are in before the first paint
  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
