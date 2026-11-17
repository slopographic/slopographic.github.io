/* SlopClean: the page as the suite's View · Panel (shared/frame): the pictures and what they hold in the middle, and on the
 * right "What to remove" (the choices, Remove all), the Drive save as its Result section and "Copy and clean: download"
 * stuck to its foot (the suite rule, shared/frame/HANDOFF.md). Phones: the panel is a bottom sheet whose foot (Choices +
 * Copy and clean) always shows. The buttons are the page's own (the panel adopts them); app/main.js wires and enables
 * them, and ui/choices.js fills #cl-choices. Classic script, before app/main.js. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const fr = g.SlopFrame.mount($('cl-frame'), {
    list: null, view: $('cl-view'), panel: $('cl-side'), phone: '(max-width: 860px)',
    get panelLabel() { return t('clean.app.choices'); },   // read again by the frame on a language change
    storageKey: 'clean', button: '.cl-tools', phoneButton: false, width: 300, min: 260,
  });
  const panel = g.SlopFrame.panel($('cl-side'), { title: t('clean.panel.title') });
  // built again on a language change: the section titles and the phone's Choices button read the current language
  function draw() {
    panel.setTitle(t('clean.panel.title'));
    panel.render([
      { title: t('clean.panel.remove'), key: 'remove', settings: [$('cl-choices'), $('cl-remove-all')] },
      { title: t('clean.panel.result'), key: 'result', actions: [{ el: $('cl-save-all') }] },
    ]);
    panel.footer([{ el: $('cl-all') }], { more: t('clean.app.choices') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  (g.CL = g.CL || {}).layout = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
