// Guides for the documents apps, part 4: Checksum (checksum), Slop Hex (hex), Slop Code (code) and SlopClean (clean).
// Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real (assets/guides/<app>-<slug>-<n>.jpg).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-documents-4*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  { app: 'checksum', slug: 'getting-started', sections: [null, null, { image: { src: '/assets/guides/checksum-getting-started-1.jpg' } }] },
  {
    app: 'hex',
    slug: 'getting-started',
    crumb: '@seo.guide.checksum.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/hex-getting-started-1.jpg' } }],
    shortcuts: [
      ['Ctrl+O'],
      ['Ctrl+S'],
      ['Ctrl+Alt+S'],
      ['Ctrl+G'],
      ['Ctrl+F'],
      ['F3 / Shift+F3'],
      ['Ctrl+Z'],
      ['Ctrl+Y or Ctrl+Shift+Z'],
      ['Ctrl+C'],
      ['Arrows, Page Up, Page Down, Home, End'],
      ['Ctrl+Home / Ctrl+End'],
    ],
  },
  {
    app: 'code',
    slug: 'getting-started',
    crumb: '@seo.guide.checksum.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/code-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/code-getting-started-2.jpg' } }],
    shortcuts: [
      ['Ctrl+O'],
      ['Ctrl+Alt+N'],
      ['Ctrl+Alt+Shift+N'],
      ['Ctrl+S'],
      ['Ctrl+Shift+S'],
      ['Ctrl+Alt+W'],
      ['Ctrl+F / Ctrl+H'],
      ['Ctrl+Space'],
      ['Ctrl+Shift+F'],
      ['Ctrl+Alt+Z'],
      ['Ctrl+B'],
      ['Ctrl+Enter'],
    ],
  },
  {
    app: 'clean',
    slug: 'getting-started',
    crumb: '@seo.guide.checksum.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/clean-getting-started-1.jpg' } }, { image: { src: '/assets/guides/clean-getting-started-2.jpg' } }],
    shortcuts: [['Ctrl+O', '@seo.guide.clean.getting-started.sections.0.h2'], ['Ctrl+S'], ['Ctrl+Shift+R']],
  },
];
