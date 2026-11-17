/* Slop Resize: the controller. Opens pictures and videos through the one intake (shared/intake: Open, a drop, a paste,
 * the Slop Drive picker, or ?drive=<id> from another app), runs the queue with the panel's settings, and hands out the results: a download (one file, or a zip of them all),
 * or a copy saved to Slop Drive. Originals are never changed. Classic script. */
(function () {
  'use strict';
  const NS = window.SlopResize, $ = (id) => document.getElementById(id);
  const toast = (m) => { if (window.SlopUI) window.SlopUI.toast(m); };
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function render() {
    const items = NS.queue.items();
    $('rs-empty').hidden = items.length > 0;
    $('rs-queue-wrap').hidden = items.length === 0;
    NS.list.render($('rs-list'), items, actions);
    const ref = items.find((i) => i.src);
    NS.settings.setSource(ref ? ref.src : null, ref ? ref.name : '');
    NS.layout.paint(api);   // the panel's buttons (app/layout.js)
    $('rs-stat').textContent = NS.list.summary(items);
  }

  /** File ▸ Open (and Ctrl+O) and Open from Slop Drive: sources of the one intake (shared/intake), like a drop. */
  const openPicker = () => window.SlopIntake.pick({ to: 'resize' });
  const openDrive = () => window.SlopIntake.fromDrive({ to: 'resize' });

  async function run() {
    if (!NS.queue.items().some((i) => i.src)) return;
    const opt = NS.settings.toRun(NS.settings.read());
    await NS.queue.run(opt);
    const items = NS.queue.items(), done = items.filter((i) => i.status === 'done').length;
    const failed = items.filter((i) => i.status === 'error' && i.src).length;
    toast(failed ? t('resize.toast.resized_failed', { n: done, failed }) : t('resize.toast.resized', { n: done }));
  }

  /** A name that is not already in the zip: "x-500x500.jpg", then "x-500x500 (2).jpg". */
  function uniqueNames(items) {
    const seen = new Map();
    return items.map((it) => {
      const n = it.outName, c = seen.get(n) || 0;
      seen.set(n, c + 1);
      return c ? n.replace(/(\.[^.]+)$/, ` (${c + 1})$1`) : n;
    });
  }

  async function downloadAll() {
    const done = NS.queue.items().filter((i) => i.status === 'done');
    if (!done.length) { toast(t('resize.toast.nothing')); return; }
    if (done.length === 1) { download(done[0]); return; }
    const names = uniqueNames(done);
    const zip = await window.SlopZip.zip(done.map((it, i) => ({ name: names[i], data: it.out.blob })));
    window.SlopUI.download(zip, `slop-resize-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.zip`);
    SlopSupport.afterExport('resize');
  }

  function download(it) {
    if (it.out) { window.SlopUI.download(it.out.blob, it.outName); SlopSupport.afterExport('resize'); }
  }

  async function saveTo(items) {
    if (!NS.drive.available()) { toast(t('resize.toast.no_drive')); return; }
    let n = 0;
    for (const it of items) {
      try { it.drive = await NS.drive.save(it.out.blob, it.outName, { source: it.name }); n++; }
      catch (e) { toast(t('resize.toast.save_failed', { error: (e && e.message) || t('resize.err.unknown') })); break; }
    }
    render();
    if (n) toast(t('resize.toast.saved', { n }));
  }

  /** Sends a row to Slop Upscale: the result when it is done, else the original. Opens Upscale in a new tab. */
  async function sendToUpscale(it) {
    if (!window.SlopHub || !window.SlopOuttake) { toast(t('resize.toast.no_drive')); return; }
    const done = it.status === 'done' && it.out;
    // the one way out (shared/intake/outtake.js): the file goes through Slop Drive and Upscale takes it with its intake
    try { await window.SlopOuttake.send('upscale', { from: 'resize', get: () => (done ? it.out.blob : it.file), name: done && it.outName ? it.outName : it.name, type: (done ? it.out.blob : it.file).type }); }
    catch (e) { toast(t('resize.toast.upscale_failed', { error: e.message })); }
  }

  const actions = {
    download,
    save: (it) => saveTo([it]),
    upscale: sendToUpscale,
    remove: (it) => NS.queue.remove(it.id),
  };

  /** Commands for SlopCmd and the keyboard. */
  const api = {
    open: openPicker, drive: openDrive, run, cancel: () => NS.queue.cancel(), downloadAll, saveAll: () => saveTo(NS.queue.items().filter((i) => i.status === 'done' && !i.drive)),
    clear: () => NS.queue.clear(), render, toast, actions,
  };

  /** The Target menu, in the page's language (built again on a language change, keeping the choice). */
  function sizeOptions() {
    const sel = $('rs-preset'), groups = new Map(), was = sel.value;
    sel.replaceChildren(new Option(t('resize.panel.custom'), ''));
    for (const p of NS.size.PRESETS) {
      if (!groups.has(p.group)) { const og = document.createElement('optgroup'); og.label = NS.size.groupLabel(p.group); groups.set(p.group, og); sel.append(og); }
      groups.get(p.group).append(new Option(NS.size.presetLabel(p), p.id));
    }
    sel.value = was;
  }
  function fillSizePresets() {
    const sel = $('rs-preset');
    sizeOptions();
    sel.addEventListener('change', () => {
      const p = NS.size.presetById(sel.value);
      if (p) NS.settings.write(Object.assign(NS.settings.read(), NS.size.applyPreset(p)));
    });
  }

  /** Disable the choices this browser cannot make, and say why. */
  let engines = null;
  async function checkEngines() {
    const [mimes, sup] = await Promise.all([NS.format.imageSupport(), NS.video.support()]);
    for (const opt of $('rs-mime').options) opt.disabled = !mimes.has(opt.value);
    if (!mimes.has($('rs-mime').value)) $('rs-mime').value = 'image/jpeg';
    NS.settings.alphaUI();
    for (const opt of $('rs-vformat').options) opt.disabled = !sup.formats[opt.value];
    const vf = $('rs-vformat');
    if (!sup.formats[vf.value]) vf.value = sup.formats.webm ? 'webm' : 'mp4';
    engines = sup;
    engineText();
  }
  /** The notes on what this browser cannot encode, in the page's language. */
  function engineText() {
    const sup = engines;
    if (!sup) return;
    const off = !sup.ok;
    for (const id of ['rs-vformat', 'rs-vquality', 'rs-fps', 'rs-audio']) $(id).disabled = off;
    const note = $('rs-engine-note');
    note.hidden = sup.ok && sup.formats.mp4 && sup.formats.webm;
    note.textContent = off ? t('resize.note.images_work', { reason: sup.reason }) : t('resize.note.one_format', { missing: sup.formats.mp4 ? 'WebM' : 'MP4', only: sup.formats.mp4 ? 'MP4' : 'WebM' });
    $('rs-video-warning').hidden = !off;
    if (off) $('rs-video-warning').textContent = t('resize.note.no_video', { reason: sup.reason });
  }

  // Every way in (a drop on the left column or the zone, Open, Ctrl+O, Open from Slop Drive, ?drive=<id> from another app,
  // a paste, the sample) is a source of the one intake (shared/intake): it checks each file and hands it to the queue
  // here, and the zone (SlopDrop) shows its row and progress. A file the queue cannot read shows its error in the zone.
  const DROP_RULES = {
    types: ['image/*', 'video/*'],
    exts: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff', '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.ogv', ...(window.SlopRaw ? window.SlopRaw.EXTS.map((e) => '.' + e) : [])],
  };
  function registerIntake() {
    DROP_RULES.noun = t('resize.app.noun');
    window.SlopIntake.register({
      id: 'resize', accept: DROP_RULES, noun: DROP_RULES.noun, driveAccept: ['image/*', 'video/*'],
      process: async (file, ctx) => {
        if (ctx.drive && window.SlopHub) window.SlopHub.touch(ctx.drive.id);
        const it = await NS.queue.add(file, { name: file.name });
        if (it.status === 'error') throw new Error(it.err);
        return it.id;
      },
    });
  }
  function wireDrop() {
    SlopDrop.attach($('rs-drop'), {
      intake: 'resize',
      label: 'resize.drop.label',
      hint: 'resize.drop.hint',
      targets: [$('rs-left')],
      preview: { picture: { src: '../assets/shots/resize.jpg', alt: 'resize.drop.alt' },
        steps: ['resize.drop.step1', 'resize.drop.step2', 'resize.drop.step3'] },
      sample: { label: 'resize.drop.sample', files: () => window.SlopSamples.photos(4, { width: 2400, height: 1600 }) },
      reveal: () => $('rs-list').lastElementChild,
    });
  }
  /** A language change: everything drawn from script again (the panel's words, the list, the notes, the commands). */
  function relang() {
    sizeOptions();
    engineText();
    NS.settings.alphaUI();
    NS.settings.ratioNote();
    if (NS.presets.refresh) NS.presets.refresh();
    NS.layout.reset();
    render();
    if (window.SlopCmd) NS.commands.install(api);
  }

  function wirePanel() {
    const panel = $('rs-panel');
    panel.addEventListener('change', () => { NS.settings.showModes($('rs-mode').value); NS.settings.labels(); NS.settings.alphaUI(); });
    panel.addEventListener('input', () => NS.settings.labels());
    $('rs-open').addEventListener('click', () => api.open());
    $('rs-drive').addEventListener('click', () => api.drive());
  }

  async function boot() {
    if (window.SlopHub) window.SlopHub.register('resize');
    fillSizePresets();
    NS.settings.write(Object.assign(NS.settings.fromSaved(NS.settings.DEFAULTS), NS.settings.presetOf(location.search)));
    NS.presets.bind({ select: $('rs-saved'), apply: $('rs-apply'), saveAs: $('rs-save-as'), del: $('rs-delete'), status: toast });
    wirePanel();
    NS.settings.wireLock();
    registerIntake();
    wireDrop();
    NS.queue.on(render);
    render();
    checkEngines();
    if (window.SlopCmd) { SlopCmd.init({ app: 'resize' }); NS.commands.install(api); }
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(relang);
    await window.SlopIntake.launch({ to: 'resize' }); // ?drive=<id> (Send to…) or the files the installed app was opened with
  }

  NS.app = api;
  NS.layout.paint(api);   // the panel and its Resize button are in before the first paint
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
