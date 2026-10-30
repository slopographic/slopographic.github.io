/* Slop 3D: workspace layouts (shared/layouts). Mounts the outliner, viewport and inspector on the .workspace grid;
   the top bar stays put (Save is at the foot of the Properties panel). Below 900 px the viewport fills the screen and the panels are SlopSheets (shared/ui/sheet.js):
   the Scene outliner a drawer from the left, the Properties a bottom sheet, each opened and closed by its button over the
   viewport, with the shared ×, Escape, a tap outside and a swipe. Classic script. */
(function () {
  'use strict';
  const PHONE = '(max-width: 900px)', $ = (s) => document.querySelector(s);
  const t = (k) => (window.SlopI18n ? SlopI18n.t(k) : k);
  if (window.SlopLayouts) {
    SlopLayouts.mount({
      app: '3d',
      root: $('.workspace'),
      phone: PHONE,
      panels: {
        outliner: { el: $('.panel-left') },
        viewport: { el: $('.viewport') },
        inspector: { el: $('.panel-right') },
      },
    });
  }
  if (!window.SlopSheet) return;
  const root = $('.workspace');
  const scene = SlopSheet.attach({ root, panel: $('.panel-left'), side: 'start', phone: PHONE, toggles: [$('#btnScene')], get label() { return t('3d.app.scene'); } });
  const props = SlopSheet.attach({ root, panel: $('.panel-right'), phone: PHONE, toggles: [$('#btnProps')], get label() { return t('3d.app.properties'); } });
  window.Slop3DSheets = { scene, props };   // for the tests
  // The suite rule (shared/frame/HANDOFF.md): Save, the main button, sits at the foot of the Properties panel (the shared
  // footer, shared/frame/panel.js); on a phone the closed Properties sheet still shows it. Ctrl+S and File ▸ Save too.
  if (window.SlopFramePanel) {
    const fp = SlopFramePanel.create($('.panel-right'), { bare: true });
    const foot = () => fp.footer([{ el: $('#btnSave') }], { more: t('3d.app.properties'), onMore: () => props.toggle() });
    foot();
    if (window.SlopI18n && SlopI18n.on) SlopI18n.on(foot);   // the More button in the new language
  }
})();
