/* Slop Signature: the page as the suite's View · Panel (shared/frame): the signature in a mock email in the middle, the
 * form on the right (Your details, with Random and its seed), the copies for Gmail, Outlook and Apple Mail, Copy HTML code
 * and Download HTML as its Result section, and Copy signature stuck to
 * its foot (the suite rule, shared/frame/HANDOFF.md). Phones: the panel is a bottom sheet whose foot (Edit + Copy
 * signature) always shows, so the email is the page. Runs before app.js, which wires and enables the buttons (drawn once
 * here, never redrawn) and fills #sgForm. Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const fr = g.SlopFrame.mount($('sgApp'), {
    list: null, view: $('sgView'), panel: $('sgPanel'), phone: '(max-width: 860px)', panelLabel: 'signature.lay.details',
    storageKey: 'signature', button: '.smb-tools', phoneButton: false, width: 420, min: 320, max: 600,
  });
  const panel = g.SlopFrame.panel($('sgPanel'), { title: t('signature.lay.title') });
  /** The panel's sections and foot in the chosen language (again after a language change: app.js). */
  function relabel() {
  panel.setTitle(t('signature.lay.title'));
  panel.render([
  { title: t('signature.lay.your_details'), key: 'details', settings: [$('sgStart'), $('sgSeedRow'), $('sgForm')] },
  { title: t('signature.lay.result'), key: 'result', settings: [$('sgOut')], actions: [{ el: $('sgCode') }, { el: $('sgDownload') }] },
  ]);
  panel.footer([{ el: $('sgCopy') }], { more: t('signature.lay.edit') });
  }
  relabel();
  (g.SlopSignature = g.SlopSignature || {}).layout = { frame: fr, panel, relabel };
})(typeof window !== 'undefined' ? window : globalThis);
