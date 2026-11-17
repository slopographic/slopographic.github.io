// Guides for the documents apps, part 2: Slop Docs (docs), Slop Slides (slides), Slop Tables (tables) and Slop Sheets
// (sheetview). Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real.
// Sources: docs/HANDOFF.md, docs/js/ui/commands.js, outline.js; slides/js/ui/commands.js, present.js; tables/HANDOFF.md,
// tables/js/ui/commands.js; sheetview/index.html, sheetview/js/*.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-documents-2*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'docs',
    slug: 'getting-started',
    sections: [{ image: { src: '/assets/guides/docs-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/docs-getting-started-2.jpg' } }],
    shortcuts: [
      ['Ctrl+B / Ctrl+I / Ctrl+U'],
      ['Ctrl+Alt+1, 2, 3'],
      ['Ctrl+Shift+7'],
      ['Ctrl+Shift+L'],
      ['Ctrl+Space'],
      ['Ctrl+Shift+. / Ctrl+Shift+,'],
      ['Alt+Up / Alt+Down'],
      ['Ctrl+S'],
      ['Ctrl+K'],
    ],
  },
  {
    app: 'slides',
    slug: 'getting-started',
    crumb: '@seo.guide.docs.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/slides-getting-started-1.jpg' } },
      null,
      null,
      { image: { src: '/assets/guides/slides-getting-started-2.jpg' } },
    ],
    shortcuts: [
      ['Ctrl+Shift+Enter'],
      ['T'],
      ['Enter'],
      ['Ctrl+D'],
      ['Delete'],
      ['Ctrl+Shift+] / ['],
      ['PageDown / PageUp'],
      ['F5', '@seo.guide.slides.getting-started.sections.2.h2'],
      ['Alt+F5'],
      ['Ctrl+S', '@seo.guide.docs.getting-started.shortcuts.7.1'],
    ],
  },
  {
    app: 'tables',
    slug: 'getting-started',
    crumb: '@seo.guide.docs.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/tables-getting-started-1.jpg' } },
      null,
      { h2: '@seo.guide.docs.getting-started.sections.2.h2', image: { src: '/assets/guides/tables-getting-started-2.jpg' } },
    ],
    shortcuts: [['Enter / Tab'], ['F2'], ['Ctrl+arrow keys'], ['Ctrl+B / Ctrl+I'], ['Ctrl+Z / Ctrl+Y'], ['Ctrl+S'], ['Ctrl+O']],
  },
  {
    app: 'sheetview',
    slug: 'getting-started',
    crumb: '@seo.guide.docs.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/sheetview-getting-started-1.jpg' } }, { image: { src: '/assets/guides/sheetview-getting-started-2.jpg' } }],
  },
];
