/* SlopIsolate — boot. Starts every UI and render module (a missing one is skipped with a warning, a failing
 * init is logged and the rest still start), then keeps the app-level pieces in step: empty / work mode, the
 * status bar, the busy overlay, toasts, the download button, the unsaved-work guard, and the Slop Hub
 * (register, and open a file another app sent here with ?drive=). */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, $ = U.$, t = U.t;
  const MODULES = ['view', 'pointer', 'ctxbar', 'panel', 'queue', 'menus', 'commands', 'ctxmenu', 'files', 'send', 'videoPlayer', 'bulk', 'thumbs', 'openIn', 'viewState'];
  let busyBy = null;

  function startModules() {
    for (const name of MODULES) {
      const m = CO[name];
      if (!m || typeof m.init !== 'function') { console.warn('SlopIsolate: module missing: ' + name); continue; }
      try { m.init(); } catch (e) { console.error('SlopIsolate: ' + name + '.init failed', e); }
    }
  }

  /* ---------- app state on the page ---------- */
  function mode() { $('#app').dataset.mode = S.current() ? 'work' : 'empty'; }

  function status() {
    const it = S.current(), P = CO.process;
    $('#statusLeft').textContent = it
      ? it.name + (it.w ? ' · ' + it.w + ' × ' + it.h : '') + (it.file ? ' · ' + U.fmtBytes(it.file.size) : '')
      : t('cutout.app.no_image');
    let msg = '';
    if (it) {
      if (it.status === 'error') msg = it.error || t('cutout.app.st_error');
      else if (it.status === 'done' && it.manual && SlopCutout.lowMemoryText) msg = SlopCutout.lowMemoryText(it.manual);
      else if (it.status === 'working') msg = t('cutout.app.st_cutting');
      else if (it.status === 'queued') msg = P && P.pending() > 1 ? t('cutout.app.st_queued_more', { n: P.pending() - 1 }) : t('cutout.app.st_queued');
    }
    $('#statusMsg').textContent = msg;
  }

  /** The download button (the one main button, at the settings panel's foot) exports the active image in the chosen
   *  format, or with two or more pictures selected those that are done (a ZIP); it needs a finished cutout. */
  function download() {
    const b = $('#btnDownload'), it = S.current(), fmt = S.exportOpts.format.toUpperCase();
    const many = S.bulk(), ready = many ? S.targets().filter((it) => it.status === 'done').length : 0;
    b.disabled = many ? !ready : !(it && it.status === 'done' && it.kind !== 'video');
    const label = many ? t('cutout.app.export_n_zip', { n: ready }) : t('cutout.app.download_fmt', { fmt });
    U.btnIcon(b, 'download', label);
    b.title = label;
  }

  function showBusy(on, msg, progress) {
    const el = $('#busy');
    el.hidden = !on;
    if (!on) return;
    el.querySelector('.busy-msg').textContent = msg || t('cutout.app.working');
    const none = progress == null;
    el.classList.toggle('indeterminate', none);
    el.querySelector('.busy-bar i').style.width = none ? '' : Math.round(U.clamp(progress, 0, 1) * 100) + '%';
  }

  /** Unsaved-work guard: an image with brush or look edits lives only in this tab until exported. */
  function guardSync() {
    const g = window.SlopGuard;
    if (g && g.setUnsaved) g.setUnsaved('cutout', S.items.some((it) => it.hist && it.hist.undo.length > 0));
  }

  /* ---------- events ---------- */
  function wire() {
    CO.on('activeItem', () => { mode(); status(); download(); });
    CO.on('list', () => { mode(); status(); download(); guardSync(); });
    CO.on('sel', download);
    CO.on('item', () => {
      status(); download();
      // The model download shows a busy bar; hide it once no image is still being worked on.
      if (busyBy === 'progress' && !S.items.some((i) => i.status === 'working')) { busyBy = null; showBusy(false); }
      guardSync();
    });
    CO.on('history', guardSync);
    CO.on('export', download);
    // Only a download (the runtime or a model) shows the busy bar; each image's own progress is on its queue tile.
    CO.on('progress', ({ p }) => {
      if (!p || !['runtime', 'model', 'init'].includes(p.phase)) { if (busyBy === 'progress') { busyBy = null; showBusy(false); } return; }
      busyBy = 'progress';
      showBusy(true, t('cutout.app.loading_model'), p && p.total ? p.loaded / p.total : null);
    });
    CO.on('busy', (d) => { busyBy = d.on ? 'busy' : null; showBusy(!!d.on, d.msg, d.progress); });
    CO.on('toast', (msg) => { if (window.SlopUI) SlopUI.toast(msg); });
  }

  /** Announce this app to Slop Hub and open a file another app sent here (?drive=<id>). */
  async function hubBoot() {
    const hub = document.documentElement.dataset.offline ? null : window.SlopHub;
    if (!hub) return;
    hub.register('cutout');
    if (!CO.files) return;
    // Through the intake (source 'launch'): a file PhotoSlop sent to be cut out (Layer ▸ Isolate Subject) keeps where it
    // came from and its request (io/files.js), so the mask goes back to it.
    await SlopIntake.launch({ to: 'cutout' });
  }

  /** The suite rule (shared/frame/HANDOFF.md): the main buttons (Send back, Open in…, Download) sit at the foot of the
   *  settings panel (the shared footer, shared/frame/panel.js); on a phone the closed settings sheet still shows them. */
  let frame = null;   // made once; footer() again (a language change) redraws only its footer
  function footer() {
    if (!window.SlopFramePanel) return;
    const acts = ['#btnSendBack', '#btnOpenIn', '#btnDownload'].map((id) => $(id)).filter(Boolean).map((el) => ({ el }));
    if (!frame) frame = SlopFramePanel.create($('#props'), { bare: true });
    frame.footer(acts, { more: t('cutout.app.settings'), onMore: () => CO.sheet && CO.sheet.toggle() });
  }

  function boot() {
    startModules();
    footer();
    wire();
    CO.viewState.restore().catch(function (e) { console.warn('SlopIsolate: the last session was not restored', e); }); // ui/view-state.js
    mode(); status(); download(); guardSync();
    U.onLang(() => { status(); download(); footer(); });   // the status bar and the main buttons follow a language switch
    hubBoot().catch((e) => console.warn('SlopIsolate: Slop Hub is not available', e));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
