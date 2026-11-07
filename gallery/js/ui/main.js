/* Slop Gallery: boot. Loads the library from IndexedDB, mounts the timeline and the side panel, registers the app with
 * the one intake (every way photos come in), the commands, and the bus. Sets window.SlopGallery.ready
 * when the library is on screen (the tests wait for it). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);

  // Every way photos come in (a drop of files or folders, Import, Ctrl+O, Import a folder, Import from Slop Drive,
  // ?drive=<id> from another app, a paste, the sample) goes through the one intake (shared/intake): its rules refuse what
  // is not a photo, with the reason, and each photo goes to G.actions.importOne. SlopDrop (shared/drop) is the drop
  // source and the feedback: the outline, each file's row and the toast. Dropped folders are walked by SlopDrop.folders
  // inside the drop event. The zone is a compact strip, so the empty library carries the preview (what it makes, and
  // how) and the sample button.
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const preview = () => ({
    picture: { src: '../assets/shots/gallery.jpg', alt: t('gallery.grid.preview_alt') },
    steps: [t('gallery.grid.step_drop'), t('gallery.grid.step_browse'), t('gallery.grid.step_backup')],
  });
  function bindDrop() {
    window.SlopIntake.register({
      id: 'gallery', accept: G.source.rules(), driveAccept: ['image/*'],
      process: (file, ctx) => G.actions.importOne(file, ctx),
    });
    G.actions.registerBackup();
    window.SlopDrop.attach($('gDrop'), {
      intake: 'gallery',
      compact: true,
      targets: [document.querySelector('main.grid-area') || document.body],
      files: (dt) => window.SlopDrop.folders.read(dt),
    });
    const pv = window.SlopDrop.panel.preview(preview());
    if (pv) $('emptyIntro').append(pv);
    if (window.SlopI18n) window.SlopI18n.on(() => { const n = window.SlopDrop.panel.preview(preview()); if (n) $('emptyIntro').replaceChildren(n); });
    $('emptySample').addEventListener('click', () => window.SlopIntake.sample(() => window.SlopSamples.photos(8), { to: 'gallery' }));
  }

  async function boot() {
    if (window.SlopHub && SlopHub.register) SlopHub.register('gallery');
    if (window.SlopCmd) SlopCmd.init({ app: 'gallery' });
    G.commands.register();
    bindDrop();
    await G.library.load();
    G.timeline.init({
      scroller: $('grid'), content: $('tlContent'), sticky: $('sticky'), empty: $('empty'), status: $('status'),
    });
    G.sidebar.init($('side'));
    G.panel.init();   // the panel on the right with Import at its foot (ui/panel.js)
    G.driveView.init(); // the Library / Drive switch (ui/drive-view.js)
    G.driveBar.init();
    G.peopleBar.init(); // the People bar (ui/people.js); the scan starts from core/people.js
    G.menus.bind($('grid'));
    $('topImport').addEventListener('click', () => G.actions.importFiles());
    $('emptyImport').addEventListener('click', () => G.actions.importFiles());
    $('topSort').addEventListener('click', () => G.actions.sortIds(G.state.selected.length ? G.state.selected : []));
    G.reel.init($('topReel'));
    $('btnActions').addEventListener('click', (e) => G.menus.openActions(e.currentTarget));
    $('btnSelectMode').addEventListener('click', (e) => {
      const on = !G.state.state.selectMode;
      G.state.state.selectMode = on;
      e.currentTarget.setAttribute('aria-pressed', String(on));
    });
    G.library.on(() => { if (G.state.state.view === 'album' && !G.library.album(G.state.state.query.album)) G.state.setView('photos'); });
    await G.viewState.restore(); // ui/view-state.js: the view, filters, Select mode and scroll
    G.ready = true;
    window.SlopIntake.launch({ to: 'gallery' }); // ?drive=<id> (Send to…) or the files the installed app was opened with
  }

  G.boot = boot;
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => boot().catch((e) => console.error(e)));
  else boot().catch((e) => console.error(e));
})();
