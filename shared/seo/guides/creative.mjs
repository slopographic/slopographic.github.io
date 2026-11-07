// Guides for the creative apps, part 1: PhotoSlop (photoslop, two guides), Slop Paint Classic (paint-classic) and
// SlopVector (vector). Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real.
// Sources: photoslop/js/ui/menus.js, js/ui/panels.js, js/app/welcome.js, js/tools/*.js (tool keys); photoslop/classic/
// paint/20-menus.js, 04-icons.js, 17-files.js; slopvector/HANDOFF.md, js/ui/actions.js, js/tools/*.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-creative*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'photoslop',
    slug: 'getting-started',
    sections: [
      null,
      { image: { src: '/assets/guides/photoslop-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/photoslop-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/photoslop-getting-started-3.jpg' } },
    ],
    shortcuts: [
      ['V'],
      ['M'],
      ['L'],
      ['W'],
      ['C'],
      ['B'],
      ['E'],
      ['T'],
      ['I'],
      ['X / D'],
      ['Ctrl+T'],
      ['Ctrl+Z / Shift+Ctrl+Z'],
      ['Ctrl+O'],
      ['Ctrl+S'],
      ['Alt+Shift+Ctrl+W'],
    ],
  },
  {
    app: 'photoslop',
    slug: 'layers',
    sections: [null, null, { image: { src: '/assets/guides/photoslop-layers-1.jpg' } }],
    shortcuts: [['Shift+Ctrl+N'], ['Ctrl+J'], ['Ctrl+] / Ctrl+['], ['Alt+Ctrl+G'], ['Ctrl+/'], ['Ctrl+E'], ['Shift+Ctrl+E']],
  },
  {
    app: 'paint-classic',
    slug: 'getting-started',
    crumb: '@seo.guide.photoslop.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/paint-classic-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/paint-classic-getting-started-2.jpg' } },
    ],
    shortcuts: [['Ctrl+Z / Ctrl+Y'], ['Ctrl+A'], ['Delete'], ['X'], ['Ctrl+G'], ['Ctrl+PageUp / Ctrl+PageDown'], ['Ctrl+O / Ctrl+S']],
  },
  {
    app: 'vector',
    slug: 'getting-started',
    crumb: '@seo.guide.photoslop.getting-started.crumb',
    sections: [
      null,
      null,
      { image: { src: '/assets/guides/vector-getting-started-1.jpg' } },
      { h2: '@seo.guide.photoslop.getting-started.sections.3.h2', image: { src: '/assets/guides/vector-getting-started-2.jpg' } },
    ],
    shortcuts: [
      ['V / A'],
      ['P'],
      ['T', '@seo.guide.photoslop.getting-started.shortcuts.7.1'],
      ['M / L'],
      ['I', '@seo.guide.photoslop.getting-started.shortcuts.8.1'],
      ['X'],
      ['D'],
      ['Ctrl+G / Ctrl+Shift+G'],
      ['Ctrl+D'],
      ['Ctrl+Z / Ctrl+Shift+Z', '@seo.guide.photoslop.getting-started.shortcuts.11.1'],
      ['F1'],
    ],
  },
];
