/* SlopIsolate — getting images in. ONE way in: every route (the picker, the drop zone #isoDrop and the queue sidebar,
 * paste, the sample, Open from Slop Drive, a file another app sent with ?drive=) is a source of the suite's intake
 * (shared/intake, spec 'cutout'), whose reader hands the whole batch to CO.files.take(files, opts) at once; one image is
 * simply a batch of one. take() keeps the app's own steps: the first-use gate F.gate() (the only notice; the spec has
 * none of its own), then CO.process.add (the bounded model pool in io/process.js, so every file of a batch is cut out at
 * once, up to the pool size). The intake's accept rules are F.ACCEPT. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, t = U.t;
  const F = CO.files = {};
  const S = () => CO.state;
  const toast = (msg) => { if (window.SlopUI) SlopUI.toast(msg); };

  /** The first-use notice: shown once, the first time files are given to the app. Only the chosen model downloads
   * (the others when they are first picked), so the notice names that one, with its size from the model registry. */
  F.notice = function () {
    const M = window.SlopCutoutModels, m = M.get(CO.state.model);
    return {
      title: t('cutout.app.notice_title'),
      lines: [t('cutout.app.notice_line1'), t('cutout.app.notice_line2')],
      downloads: [{ name: t('cutout.app.notice_model', { name: m.name, arch: m.arch.split(' (')[0] }), bytes: m.bytes }],
    };
  };
  /** What the app takes: images and videos (SlopDrop's rule format; the drop zone and paste refuse the rest with a reason). */
  const ACCEPT = F.ACCEPT = {
    types: ['image/*', 'video/*'],
    exts: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff', '.mp4', '.m4v', '.mov', '.webm'],
    get noun() { return t('cutout.app.accept_noun'); },
  };
  F.accepts = (f) => U.isImage(f) || !!(CO.video && CO.video.isVideo(f));

  /** The first-use gate: one notice for a batch, whichever route it came by. Batches that arrive while it is open wait on
   *  the same notice. Cancelling asks again next time. Resolves true to carry on. */
  let gating = null;
  F.gate = function () {
    if (!window.SlopFirstRun) return Promise.resolve(true);
    if (!gating) gating = Promise.resolve(SlopFirstRun.once('slopisolate', F.notice())).finally(() => { gating = null; });
    return gating;
  };

  /** THE way files enter the app. files: a list (or FileList); opts: { source, driveId, origin }. Resolves with the new
   *  image items (queued, the first on screen), or [] when the notice was cancelled or nothing could be used. */
  F.take = async function (files, opts = {}) {
    const list = [...(files || [])];
    if (!list.length) return [];
    if (!(await F.gate())) return [];
    const ok = list.filter(F.accepts);
    if (!ok.length) { toast(t(list.length === 1 ? 'cutout.app.not_image' : 'cutout.app.not_images')); return []; }
    return CO.process.add(ok, opts);
  };

  /** The intake spec: every route ends here, and the whole batch goes to take() in one call (no per-file add). A file
   *  from Slop Drive keeps its record: its id, and for one another app sent (?drive=) where it came from, so the mask can
   *  go back to it (PhotoSlop's Layer ▸ Isolate Subject). Values: the new item ids, in the files' order. */
  F.register = function () {
    SlopIntake.register({
      id: 'cutout', accept: ACCEPT, driveAccept: ['image/*', 'video/*'], toast: true,
      processAll: async (files, ctx) => {
        const rec = files.length === 1 && files[0].slopDrive ? files[0].slopDrive.record : null;
        const opts = Object.assign({ source: ctx.source }, ctx.data || {});
        if (rec) { opts.driveId = rec.id; if (ctx.source === 'launch') opts.origin = { from: rec.from, meta: rec.meta || {} }; }
        const items = await F.take(files, opts);
        if (rec && rec.meta && rec.meta.requestId && items[0]) items[0].request = { requestId: rec.meta.requestId };
        return files.map((f) => { const it = items.find((x) => x.file === f || x.name === f.name); return it ? it.id : null; });
      },
    });
  };
  const takeVia = (source, input, data) => SlopIntake.take(input, { to: 'cutout', source, data }).then((s) => s.added.map((a) => a.value && S().get(a.value)).filter(Boolean));
  /** Open the system file picker (several images at once): the intake's picker. */
  F.open = () => SlopIntake.pick({ to: 'cutout', accept: 'image/*' });
  /** The built-in sample image (a generated Sloppo goo on a busy background). */
  F.sample = () => SlopIntake.sample(() => CO.sample.make().then((f) => [f]), { to: 'cutout' });
  /** A file from Slop Drive (File ▸ Open from Slop Drive, or one another app sent here). rec: a Slop Hub record. */
  F.fromDrive = function (rec, extra = {}) {
    if (!rec) return Promise.resolve([]);
    return takeVia(extra.source || 'drive', [rec], extra.origin ? { origin: extra.origin } : undefined);
  };

  /** Resolves with the item id once it is cut out (rejects when it fails or is removed); progress(0..1) on the way. */
  F.settled = function (it, progress) {
    return new Promise((resolve, reject) => {
      const offs = [], end = (fn, v) => { offs.forEach((off) => off()); fn(v); };
      const check = () => {
        if (it.status === 'done') end(resolve, it.id);
        else if (it.status === 'error') end(reject, new Error(it.error || 'could not be cut out'));
        else if (!S().get(it.id)) end(reject, new Error('was removed'));
      };
      offs.push(CO.on('item', (x) => { if (x === it) check(); }), CO.on('list', check));
      if (progress) offs.push(CO.on('progress', (d) => { if (d && d.it === it && it.progress != null) progress(it.progress); }));
      check();
    });
  };

  /** What the app makes and how, in the empty card (the drop zone is a compact strip, so the card carries it). */
  const PREVIEW = () => ({
    picture: { src: '../assets/shots/cutout.jpg', alt: t('cutout.app.preview_alt') },
    steps: [t('cutout.app.step_drop'), t('cutout.app.step_cut'), t('cutout.app.step_download')],
  });

  /** Drag and drop onto the workspace (a compact zone above the stage, and the window). Pasting stays below. */
  F.init = function () {
    const intro = () => { const pv = SlopDrop.panel.preview(PREVIEW()); U.$('#emptyIntro').replaceChildren(...(pv ? [pv] : [])); };
    intro();
    U.onLang(intro);   // the card's words follow a language switch
    // The workspace and the queue sidebar take drops; a paste, Choose files and the rest are the intake's too. Every
    // batch reaches take() once, through the spec's reader.
    F.register();
    F.drop = SlopDrop.attach(U.$('#isoDrop'), {
      intake: 'cutout',
      compact: true,
      targets: [U.$('#workspace'), U.$('#queue')],
    });
  };
})();
