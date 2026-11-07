// Guides for the creative apps, part 4: SlopLabel (label), Slop Press (press) and QR SLOP (qr). Shape in
// tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real. Sources: label/HANDOFF.md,
// label/js/ui/*.js (menus, props, printdlg); press/HANDOFF.md, press/js/ui/commands.js, main.js, press/js/io/templates*.js;
// qr/index.html, qr/js/app.js, forms.js, payload.js, panel-design.js, batch.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-creative-4*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'label',
    slug: 'getting-started',
    sections: [
      { image: { src: '/assets/guides/label-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/label-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/label-getting-started-3.jpg' } },
    ],
  },
  {
    app: 'press',
    slug: 'getting-started',
    crumb: '@seo.guide.label.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/press-getting-started-1.jpg' } }],
    shortcuts: [
      ['V'],
      ['T'],
      ['F'],
      ['M / L'],
      ['H'],
      ['Ctrl+D'],
      ['Ctrl+E'],
      ['Ctrl+P'],
      ['Shift+Ctrl+P'],
      ['Shift+PageUp / Shift+PageDown'],
      ['Ctrl+Z / Shift+Ctrl+Z'],
      ['Ctrl+K'],
    ],
  },
  {
    app: 'qr',
    slug: 'getting-started',
    crumb: '@seo.guide.label.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/qr-getting-started-1.jpg' } }, { image: { src: '/assets/guides/qr-getting-started-2.jpg' } }],
  },
];
