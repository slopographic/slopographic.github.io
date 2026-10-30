/* Slop Scan: boot. The header (SlopAppBar: Take photo and Add photos, plus the shell's buttons), the suite's List · View ·
 * Panel (shared/frame, SlopFrame: the pages on the left, the page in the middle, the settings and Download PDF on the
 * right; on a phone the pages are the screen, a page opens over them, and the panel is a bottom sheet whose foot always
 * shows), the drop zone of the empty page (SlopDrop, spec 'scan', with a sample), a photo sent from another app
 * (?drive=) and the redraws on every change. Classic script, after the other parts. */
(function (g) {
  'use strict';
  const S = g.SlopScan, $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let frame = null, bar = null, zone = null;

  function actions() {
    return [
      { id: 'camera', label: t('scan.app.camera'), primary: true, onClick: () => S.io.camera() },
      { id: 'open', label: t('scan.app.add'), icon: 'open', onClick: () => S.io.pick() },
    ];
  }
  function barText() { bar.setSubtitle(t('scan.app.subtitle')); bar.setActions(actions()); }
  function wireDrop() {
    S.io.register();
    zone = g.SlopDrop.attach($('sc-drop'), {
      intake: 'scan',
      targets: [$('sc-drop'), $('sc-view'), $('sc-list')],
      label: 'scan.drop.label',
      hint: 'scan.drop.hint',
      preview: { steps: ['scan.drop.step1', 'scan.drop.step2', 'scan.drop.step3'] },
      sample: { label: 'scan.drop.sample', files: () => S.sample(2) },
    });
  }
  /** After a batch of photos: the last page shows (on a phone, over the list). */
  function added() {
    if (frame && S.pages.size()) frame.showView();
    S.view.paint(true);
  }
  function boot() {
    bar = g.SlopAppBar.mount($('sc-bar'), { home: '../', title: 'Slop Scan', subtitle: t('scan.app.subtitle'), actions: actions(), menu: [] });   // i18n-ignore: the app's name
    frame = g.SlopFrame.mount($('sc-main'), { list: $('sc-list'), view: $('sc-view'), panel: $('sc-panel'), panelLabel: 'ui.settings', listLabel: 'scan.list.label',
      storageKey: 'scan', phone: '(max-width: 860px)', phoneButton: false, width: 320, min: 280, max: 460, listWidth: 260, listMin: 200, listMax: 420 });
    frame.setList(false);
    const mq = g.matchMedia('(max-width: 860px)');
    if (mq.addEventListener) mq.addEventListener('change', () => S.panel.footer());
    S.panel.mount($('sc-panel'));
    S.view.wire(); S.list.wire();
    $('sc-empty-camera').addEventListener('click', () => S.io.camera());
    wireDrop();
    S.pages.on(() => { S.panel.paint(); S.io.forget(); if (zone && zone.empty) zone.empty(!S.pages.size()); });
    S.panel.paint();
    S.view.paint(true);
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { barText(); S.panel.redraw(); });
    if (g.SlopHub) g.SlopHub.register('scan');
    g.SlopIntake.launch({ to: 'scan' });
  }
  S.app = { frame: () => frame, added, bar: () => bar };
  document.addEventListener('DOMContentLoaded', () => {
    try { boot(); } catch (e) { console.error(e); if (g.SlopUI) g.SlopUI.toast(t('scan.app.start_failed', { msg: e.message })); }
    document.body.classList.add('ready');
  });
})(window);
