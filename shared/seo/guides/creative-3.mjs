// Guides for the creative apps, part 3: Slop Effects (effects), Slop Image to 3D (img3d), Slop 3D (3d), Slop Gallery
// (gallery) and Slop Photo Sorter (sorter). Shape in tools/seo/guides.mjs. Every step matches the app as it is;
// screenshots are real. Sources: effects/HANDOFF.md, effects/js/app/cmd.js, js/ui/props-fx.js, menus.js; img3d/HANDOFF.md,
// img3d/index.html; 3d/HANDOFF.md, 3d/js/app/commands.js, menus.js, editmodal.js; gallery/HANDOFF.md, gallery/index.html;
// sorter/index.html, sorter/js/app.js, shared/deck/deck.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-creative-3*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'effects',
    slug: 'getting-started',
    sections: [
      null,
      null,
      { image: { src: '/assets/guides/effects-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/effects-getting-started-2.jpg' } },
    ],
    shortcuts: [
      ['Space'],
      ['Left / Right'],
      ['Shift+Left / Shift+Right'],
      ['I / O'],
      ['L'],
      ['Ctrl+Shift+T'],
      ['Ctrl+Shift+N'],
      ['Ctrl+D'],
      ['Ctrl+E', '@seo.guide.effects.getting-started.sections.3.h2'],
      ['Ctrl+S'],
    ],
  },
  {
    app: 'img3d',
    slug: 'getting-started',
    crumb: '@seo.guide.effects.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/img3d-getting-started-1.jpg' } }],
  },
  {
    app: '3d',
    slug: 'getting-started',
    crumb: '@seo.guide.effects.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/3d-getting-started-1.jpg' } }],
    shortcuts: [
      ['Tab'],
      ['1 / 2 / 3'],
      ['G / R / S / E'],
      ['F'],
      ['Home'],
      ['W'],
      ['Ctrl+D'],
      ['Ctrl+G'],
      ['H'],
      ['Ctrl+Z / Ctrl+Shift+Z'],
      ['Ctrl+S', '@seo.guide.effects.getting-started.shortcuts.9.1'],
    ],
  },
  {
    app: 'gallery',
    slug: 'getting-started',
    crumb: '@seo.guide.effects.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/gallery-getting-started-1.jpg' } }],
  },
  {
    app: 'sorter',
    slug: 'getting-started',
    crumb: '@seo.guide.effects.getting-started.crumb',
    sections: [
      { steps: [null, '@seo.guide.gallery.getting-started.sections.0.steps.1'], image: { src: '/assets/guides/sorter-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/sorter-getting-started-2.jpg' } },
    ],
    shortcuts: [['Up arrow'], ['Down arrow'], ['Left arrow'], ['Right arrow'], ['Enter, or type'], ['Escape']],
  },
];
