/* Slop HTML to PDF: the page as the suite's View · Panel (shared/frame): the paper preview in the middle, the options
 * (Source, Paper, Page header) in the panel on the right, and "Print or save as PDF…" stuck to the panel's foot (the
 * suite rule, shared/frame/HANDOFF.md). Phones: the panel is a bottom sheet whose foot (Options + Print) always shows.
 * Runs before app.js, which wires and enables #h2p-print (drawn once here, never redrawn). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const fr = g.SlopFrame.mount($('h2p-main'), {
    list: null, view: $('h2p-stage'), panel: $('h2p-side'), phone: '(max-width: 800px)',
    get panelLabel() { return t('html2pdf.app.options'); },   // read again by the frame on a language change
    storageKey: 'html2pdf', button: '.smb-tools', phoneButton: false, width: 300, min: 260,
  });
  const panel = g.SlopFrame.panel($('h2p-side'), { title: 'HTML to PDF' });
  const groups = [...$('h2p-side').querySelectorAll('.h2p-group')];
  // built again on a language change: the section titles and the phone's Options button read the current language
  function draw() {
    panel.render(groups.map((gr) => ({ title: t(gr.dataset.key), key: gr.dataset.title, settings: gr })));
    panel.footer([{ el: $('h2p-print') }], { more: t('html2pdf.app.options') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  (g.H2P = g.H2P || {}).layout = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
