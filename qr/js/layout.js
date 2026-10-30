/* QR SLOP: the page as the suite's View · Panel (shared/frame): the live preview in the middle, the editor (Templates,
 * Content, Design, Logo, Raw, Batch tabs) in the panel on the right, SVG and the print page as its Download section and
 * PNG stuck to its foot (the suite rule, shared/frame/HANDOFF.md). Phones: the preview is the page and the panel is a
 * bottom sheet whose foot (Edit + Download PNG) always shows. Runs at the end of <body>, before app.js's init (on
 * DOMContentLoaded) wires and enables #qr-dl-svg, #qr-dl-png and #qr-dl-pdf (drawn once here, never redrawn). */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const edit = $('qr-edit');
  const fr = g.SlopFrame.mount($('qr-work'), {
    list: null, view: $('qr-view'), panel: edit, phone: '(max-width: 860px)', get panelLabel() { return t('qr.app.editor'); },
    storageKey: 'qr', phoneButton: false, width: 440, min: 340, max: 640,
  });
  const panel = g.SlopFrame.panel(edit, { title: t('qr.app.panel_title') });
  // The first draw makes the three download buttons; a language change draws again with the same buttons (the app wired
  // them and keeps their disabled state), only their words change.
  const dl = (id, key, extra) => {
    const b = $(id);
    if (!b) return Object.assign({ id, label: t(key), disabled: true }, extra);
    const txt = b.querySelector('.sf-btn-txt');
    if (txt) txt.textContent = t(key);
    return { el: b };
  };
  function draw() {
    panel.setTitle(t('qr.app.panel_title'));
    panel.render([
      { title: t('qr.app.sec_edit'), key: 'edit', settings: [$('qr-tabs'), ...edit.querySelectorAll('.qr-panel')] },
      { title: t('qr.app.sec_download'), key: 'download', actions: [dl('qr-dl-svg', 'SVG'), dl('qr-dl-pdf', 'qr.app.print_pdf')] },
    ]);
    panel.footer([dl('qr-dl-png', 'qr.app.dl_png', { primary: true })], { more: t('qr.app.sec_edit') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  g.QRLayout = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
