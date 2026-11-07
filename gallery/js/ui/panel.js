/* Slop Gallery: the panel on the right (the suite rule, shared/frame/HANDOFF.md: SlopFrame, shared/frame/frame.js and
 * panel.js). The photos are the view; views, albums and filters stay on the left (ui/sidebar.js, a drawer on a phone).
 * The panel holds what acts on the photos: the selection (Sort, Make reel, More actions), adding photos (a folder, from
 * Slop Drive, keep duplicates) and the library tools (sort deck, duplicates, backup, restore), with Import photos, the main
 * button, at its foot. The page's own buttons move in (their ids and listeners stay). On a phone the panel is a bottom
 * sheet whose closed state still shows Import; "Library" opens it. Exposes window.SlopGallery.panel.init(). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);
  let fr = null, p = null, lastN = -1;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function render() {
    const n = G.state.selected.length;
    if (n === lastN) return;
    lastN = n;
    $('btnActions').textContent = t('gallery.app.more_actions_dots');
    p.render([
      { key: 'sel', title: n ? t('gallery.panel.selection_n', { n }) : t('gallery.panel.selection'), note: n ? '' : t('gallery.panel.selection_note'),
        actions: [{ el: $('topSort'), label: n ? t('gallery.panel.sort_n', { n }) : t('gallery.panel.sort_photos') }, { el: $('topReel') }, { el: $('btnActions') }] },
      { key: 'add', title: t('gallery.panel.add_photos'), settings: [$('btnFolder'), $('btnDrive'), $('keepDup').closest('label')] },
      { key: 'lib', title: t('gallery.side.library'), settings: [$('btnSort'), $('btnDupes'), $('btnBackup'), $('btnRestore')] },
    ]);
  }

  function init() {
    if (!window.SlopFrame || fr) return;
    const panel = $('gPanel'), main = document.querySelector('main.grid-area');   // the panel's place is in index.html
    fr = G.panel.frame = window.SlopFrame.mount(document.querySelector('.app > .body'), { view: main, panel, panelLabel: 'gallery.side.library', storageKey: 'gallery',
      button: '.tb-group', phoneButton: false, phone: '(max-width: 700px)', width: 280, min: 240, max: 420 });
    p = window.SlopFrame.panel(panel, { title: t('gallery.side.library') });
    $('btnImport').closest('.side-sec').hidden = true;   // its buttons are in the panel now (Import photos… is the foot's)
    render();
    const foot = () => p.footer([{ el: $('topImport'), primary: true, label: t('gallery.panel.import_photos'), title: t('gallery.app.import_tip') }], { more: t('gallery.side.library') });
    foot();
    if (window.SlopI18n) window.SlopI18n.on(() => { if (p.setTitle) p.setTitle(t('gallery.side.library')); lastN = -1; render(); foot(); });
    G.state.subscribe((what) => { if (what === 'selection') render(); });
  }

  G.panel = { init, render: () => { lastN = -1; if (p) render(); } };
})();
