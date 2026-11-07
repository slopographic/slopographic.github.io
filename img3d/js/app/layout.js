/* Slop Image to 3D: the page as the suite's View · Panel (shared/frame): the 3D view in the middle, the settings (Picture,
 * Depth, Subject, Output, Controls) in the panel on the right, the exports as its Result section and "Open in Slop 3D"
 * stuck to its foot (the suite rule, shared/frame/HANDOFF.md). Phones: the panel is a bottom sheet whose foot (Settings +
 * Open in Slop 3D) always shows. Runs before app/main.js, which wires and enables #btnObj, #btnGlb and #btnSend (drawn
 * once here, never redrawn). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const fr = g.SlopFrame.mount($('work'), {
    list: null, view: $('stage'), panel: $('panel'), phone: '(max-width: 720px)',
    panelLabel: 'img3d.app.settings',   // a key: the frame reads it again on a language change
    storageKey: 'img3d', button: document.querySelector('.topbar .actions'), phoneButton: false, width: 280, min: 240,
  });
  const panel = g.SlopFrame.panel($('panel'), { title: 'Image to 3D' });
  const groups = [...$('panel').querySelectorAll('.i3-group')];
  // built again on a language change: the section titles and the phone's Settings button read the current language
  function draw() {
    panel.render([
      ...groups.map((gr) => ({ title: t(gr.dataset.key), key: gr.dataset.title, settings: gr })),
      { title: t('img3d.group.result'), key: 'result', actions: [{ el: $('btnObj') }, { el: $('btnGlb') }] },
    ]);
    panel.footer([{ el: $('btnSend') }], { more: t('img3d.app.settings') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  (g.SlopImg3D = g.SlopImg3D || {}).layout = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
