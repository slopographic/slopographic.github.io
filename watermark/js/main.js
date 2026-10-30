/* Slop Watermark: boot. The suite's List · View · Panel layout (shared/frame, SlopFrame): the files on the left (when
 * there is more than one), the preview in the middle, and on the right the shared watermark panel with the main actions
 * in the panel's footer (Watermark N files, Download, Save to Slop Drive, Open in…). On a phone the list is the page, a
 * file opens over it, and the panel is a bottom sheet. Also the header (SlopAppBar), the drop zone (SlopDrop), the saved
 * setup, a file sent from another app (Slop Drive, ?drive=), and the ready mark for the tests. Pictures, videos and PDFs
 * can be mixed in one batch. Classic script. */
(function () {
  'use strict';
  const $ = window.WMUtil.$, t = window.WMUtil.t;
  const toast = (msg) => window.SlopUI.toast(msg);
  let bar = null, busy = false, run = null, dropZone = null, frame = null, side = null;

  const pics = (items) => items.every((x) => x.media === 'picture');
  /** The header (Open, Clear) and the panel's footer: the main action and what to do with the results. */
  function syncBar() {
    const items = window.WMItems.all(), n = items.length, outs = window.WMItems.outCount(), one = n === 1 && items[0].out;
    if (dropZone) dropZone.empty(!n); // the preview in the zone is for an empty page only
    $('wm-preview-box').hidden = !n; // the empty stage would only repeat the zone
    bar.setActions([
      { id: 'open', label: t('watermark.bar.open'), icon: 'open', disabled: busy, onClick: () => window.SlopIntake.pick({ to: 'watermark' }) },
      { id: 'clear', label: t('watermark.bar.clear'), disabled: busy || !n, onClick: clearAll },
    ]);
    bar.setMenu([{ id: 'drive', label: t('watermark.bar.save_all'), disabled: busy || !outs, onClick: saveAll }]);
    const O = window.SlopOuttake, openIn = one && O ? O.items({ get: () => items[0].out.blob, name: items[0].out.name, type: items[0].out.blob.type, from: 'watermark', folder: false }) : null;
    side.footer([
      { id: 'wm-apply', label: n ? t(pics(items) ? 'watermark.foot.apply_n' : 'watermark.foot.apply_files_n', { n }) : t('watermark.foot.apply'), primary: true, disabled: busy || !n, run: applyAll },
      { id: 'wm-zip', label: n > 1 ? t('watermark.foot.zip') : t('watermark.foot.download'), disabled: busy || !outs, run: n > 1 ? downloadZip : () => window.WMExport.downloadOne(items[0]) },
      { id: 'wm-drive', label: t('watermark.foot.drive'), disabled: busy || !outs, run: saveAll },
      openIn && openIn.length ? { id: 'wm-openin', label: t('watermark.foot.open_in'), menu: openIn } : null,
    ], { stack: true, more: t('watermark.app.settings') });
    frame.setList(n > 1);
    const panel = window.WMSettings.panel();
    if (panel) panel.setMedia(window.WMItems.kinds());
  }
  const saveAll = () => window.WMExport.saveAllToDrive(window.WMItems.all()).catch((e) => toast(t('watermark.toast.save_failed', { msg: e.message })));
  /** Changing the setup makes earlier results out of date: they are dropped, and the page says so. */
  function changed() {
    if (window.WMItems.outCount()) { window.WMItems.clearOuts(); $('wm-run-note').textContent = t('watermark.run.changed'); }
    window.WMList.render();
    window.WMPreview.schedule();
    syncBar();
  }
  function showRun(on) { $('wm-progress').hidden = !on; $('wm-cancel').disabled = !on; }
  async function applyAll() {
    if (busy || !window.WMItems.count()) return;
    const problem = window.SlopWatermarkSpec.check(window.WMSettings.spec());
    if (problem) { toast(problem); return; }
    busy = true; run = new AbortController(); syncBar(); showRun(true);
    const pbar = $('wm-prog-bar');
    try {
      const res = await window.WMExport.applyAll(window.WMItems.all(), (item) => window.WMSettings.specFor(item.group),
        (done, total, name, part) => { pbar.max = total; pbar.value = done + (part || 0); $('wm-prog-text').textContent = t(part ? 'watermark.run.writing_part' : 'watermark.run.writing', { i: done + 1, total, name, pct: Math.round(part * 100) }); },
        run.signal);
      const n = res.done;
      $('wm-run-note').textContent = res.stopped ? t('watermark.run.stopped', { n })
        : res.failed ? t('watermark.run.failed', { n, failed: res.failed })
        : t(pics(window.WMItems.all()) ? 'watermark.run.done_pictures' : 'watermark.run.done_files', { n });
    } catch (err) {
      toast(t('watermark.toast.apply_failed', { msg: (err && err.message) || t('watermark.toast.unknown') }));
    } finally {
      busy = false; run = null; showRun(false); window.WMList.render(); syncBar();
    }
  }
  async function downloadZip() {
    if (!window.WMItems.outCount()) return;
    window.SlopUI.download(await window.WMExport.zipAll(window.WMItems.all()), window.WMExport.ZIP_NAME);
  }
  function clearAll() {
    if (busy) return;
    window.WMItems.clear();
    $('wm-run-note').textContent = '';
    window.WMList.render(); window.WMPreview.schedule(); syncBar();
  }
  const added = () => { window.WMList.render(); window.WMPreview.schedule(); syncBar(); if (frame.isPhone()) frame.showView(); };

  /** The one way files come in (shared/intake, spec 'watermark'): a drop, the zone's Choose files, Open files…, a paste,
   *  ?drive=<id> (another app's Open in…) and a PWA launch. Each file is read into the list; the zone reports the rest. */
  function wireDrop() {
    const W = window.SlopWatermark, exts = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.gif', '.svg', '.heic', '.heif', '.mp4', '.m4v', '.mov', '.webm', '.pdf'];
    window.SlopIntake.register({
      id: 'watermark',
      accept: { types: W.ACCEPT.split(',').filter((type) => type.includes('/')), exts, noun: 'watermark.drop.noun' },
      process: async (file) => {
        if (window.WMItems.count() >= window.WMItems.MAX) throw new Error(t('watermark.drop.full', { n: window.WMItems.MAX }));
        return (await window.WMItems.add(file)).id;
      },
      after: added,
    });
    dropZone = window.SlopDrop.attach($('wm-drop'), {
      intake: 'watermark',
      targets: [$('wm-drop'), $('wm-preview-box')],
      label: 'watermark.drop.label',
      hint: 'watermark.drop.hint',
      preview: { picture: { src: '../assets/shots/watermark.jpg', alt: 'watermark.drop.alt' }, steps: STEPS },
      sample: { label: 'watermark.drop.sample', files: () => window.SlopSamples.photos(4) },
      reveal: () => $('wm-list').lastElementChild,
    });
  }

  const STEPS = ['watermark.drop.step1', 'watermark.drop.step2', 'watermark.drop.step3'];
  /** Slop Workflows: this watermark as a Watermark step (shared/ops/flowdoc.js; the mapping is the operation's). */
  function addToWorkflow() {
    window.SlopFlowDoc.addToWorkflow({ id: 'watermark.apply' }, { settings: { spec: window.WMSettings.spec() } })
      .catch((e) => toast(t('watermark.toast.workflows_failed', { msg: e.message })));
  }

  /** For the commands (commands.js, ai-commands.js): the page's own actions. */
  window.WMApp = { applyAll, downloadZip, clearAll, busy: () => busy, refresh: () => { window.WMList.render(); window.WMPreview.schedule(); syncBar(); } };

  /** A file sent from another app or opened from Slop Drive (?drive=). */
  function boot() {
    bar = window.SlopAppBar.mount($('wm-bar'), {
      home: '../', title: 'Slop Watermark', subtitle: t('watermark.app.subtitle'), actions: [], menu: [],
    });
    frame = window.SlopFrame.mount($('wm-main'), { list: $('wm-files'), view: $('wm-work'), panel: $('wm-panel'), panelLabel: 'watermark.app.watermark',
      storageKey: 'watermark', phone: '(max-width: 860px)', phoneButton: false, width: 340, min: 300, max: 520 });
    side = window.SlopFrame.panel($('wm-panel'), { title: t('watermark.app.watermark') });
    side.render([{ key: 'settings', body: $('wm-settings-box') }]);
    $('wm-panel-open').addEventListener('click', () => frame.openSheet());
    $('wm-back').addEventListener('click', () => frame.showList());
    window.WMSettings.init({ onChange: changed, toWorkflow: addToWorkflow });
    window.WMList.wire((id) => { window.WMItems.remove(id); window.WMList.render(); window.WMPreview.schedule(); syncBar(); });
    $('wm-cancel').addEventListener('click', () => { if (run) run.abort(); });
    wireDrop();
    window.WMSettings.restore();
    window.WMList.render();
    syncBar();
    window.WMPreview.schedule();
    if (window.SlopHub) window.SlopHub.register('watermark');
    window.SlopIntake.launch({ to: 'watermark' });
    // a language change: the header, the panel's title and footer, the list and the preview's note in the new language
    window.WMUtil.onLang(() => {
      bar.setSubtitle(t('watermark.app.subtitle'));
      side.setTitle(t('watermark.app.watermark'));
      window.WMList.render(); window.WMPreview.schedule(); syncBar();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { boot(); } catch (e) {
      console.error(e);
      if (window.SlopUI) toast(t('watermark.toast.start_failed', { msg: e.message }));
    }
    document.body.classList.add('ready');
  });
  window.WMMain = { frame: () => frame, view: () => { if (frame && frame.isPhone()) frame.showView(); } };
})();
