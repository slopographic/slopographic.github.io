// Guides for the documents apps, part 3: Slop HTML to PDF (html2pdf), Slop EML (eml), Slop Notes (notes) and Paste
// (paste). Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-documents-3*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'html2pdf',
    slug: 'getting-started',
    sections: [
      { image: { src: '/assets/guides/html2pdf-getting-started-1.jpg' } },
      null,
      null,
      null,
      { image: { src: '/assets/guides/html2pdf-getting-started-2.jpg' } },
    ],
    shortcuts: [['Ctrl+P (Cmd+P)']],
  },
  {
    app: 'eml',
    slug: 'getting-started',
    crumb: '@seo.guide.html2pdf.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/eml-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/eml-getting-started-2.jpg' } }],
    shortcuts: [['Ctrl+O (Cmd+O)']],
  },
  {
    app: 'notes',
    slug: 'getting-started',
    crumb: '@seo.guide.html2pdf.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/notes-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/notes-getting-started-2.jpg' } }],
    shortcuts: [['Ctrl+Alt+N'], ['Ctrl+S'], ['Ctrl+Alt+V'], ['Ctrl+Shift+F'], ['Ctrl+Alt+P'], ['Ctrl+Alt+Down / Up'], ['F2']],
  },
  {
    app: 'paste',
    slug: 'getting-started',
    crumb: '@seo.guide.html2pdf.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/paste-getting-started-1.jpg' } }],
    shortcuts: [['Ctrl+V'], ['Ctrl+Alt+N'], ['Ctrl+Alt+L'], ['Ctrl+Shift+F'], ['Ctrl+Alt+Down / Up']],
  },
];
