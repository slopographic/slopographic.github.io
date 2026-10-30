/* Slop Transcribe: the tool as the suite's View · Panel (shared/frame): the files and the transcript in the middle, and on
 * the right Record, Language (Language and model), Save (file format, Download, Copy, Save to Slop Drive, Open in Slop
 * Docs) and Transcribe / Stop stuck to the panel's foot (the suite rule, shared/frame/HANDOFF.md). Phones: the panel is a
 * bottom sheet whose foot (Options + Transcribe) always shows. The buttons stay in the page's markup (the menu bar names
 * them) and the panel adopts them; js/app.js wires them and shows Stop while it runs. Classic script, before the app module. */
(function (g) {
  'use strict';
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const $ = (id) => document.getElementById(id);
  const fr = g.SlopFrame.mount($('trUi'), {
    list: null, view: $('trView'), panel: $('trSide'), phone: '(max-width: 760px)', panelLabel: 'transcribe.app.options',
    storageKey: 'transcribe', button: '.smb-tools', phoneButton: false, width: 300, min: 260,
  });
  const panel = g.SlopFrame.panel($('trSide'), { title: t('transcribe.app.run') });
  const el = (id) => ({ el: $(id) });
  // built again on a language change, so the panel's words follow it
  function draw() {
    panel.setTitle(t('transcribe.app.run'));
    panel.render([
      { title: t('transcribe.app.record'), key: 'rec', settings: $('trRecGroup') },
      { title: t('transcribe.app.language'), key: 'lang', settings: $('trLangGroup') },
      { title: t('transcribe.app.save'), key: 'save', settings: $('trFormatField'), actions: ['trDownload', 'trCopy', 'trDrive', 'trDocs'].map(el) },
    ]);
    panel.footer([el('trRun'), el('trStop')], { more: t('transcribe.app.options') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  g.SlopTranscribeFrame = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
