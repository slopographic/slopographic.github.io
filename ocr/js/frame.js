/* Slop OCR: the tool as the suite's View · Panel (shared/frame): the files, the page and its text in the middle, and on the
 * right Language (Language and model), Save (the exports, Copy all text, Clear) and "Read text" stuck to the panel's foot
 * (the suite rule, shared/frame/HANDOFF.md). Phones: the panel is a bottom sheet whose foot (Options + Read text) always
 * shows. The buttons stay in the page's markup (the menu bar names them) and the panel adopts them; js/app.js wires and
 * enables them. (js/layout.js is the text layout of the read lines, not this.) Classic script, before the app module runs. */
(function (g) {
  'use strict';
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const $ = (id) => document.getElementById(id);
  const fr = g.SlopFrame.mount($('ui'), {
    list: null, view: $('ocrView'), panel: $('ocrSide'), phone: '(max-width: 820px)', panelLabel: 'ocr.app.options',
    storageKey: 'ocr', button: '.smb-tools', phoneButton: false, width: 280, min: 240,
  });
  const panel = g.SlopFrame.panel($('ocrSide'), { title: t('ocr.app.read') });
  const el = (id) => ({ el: $(id) });
  const note = $('ocrSave').querySelector('.sf-note');
  // built again on a language change, so the panel's words follow it
  function draw() {
    panel.setTitle(t('ocr.app.read'));
    panel.render([
      { title: t('ocr.app.language'), key: 'lang', settings: $('ocrLangGroup') },
      { title: t('ocr.app.save'), key: 'save', actions: ['dlTxt', 'dlMd', 'dlDocx', 'dlPdf', 'copy', 'clear'].map(el), body: note },
    ]);
    panel.footer([el('read')], { more: t('ocr.app.options') });
  }
  draw();
  $('ocrSave').remove();   // its buttons and note are the panel's now
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  g.SlopOCRFrame = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
