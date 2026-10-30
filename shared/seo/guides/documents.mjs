// Guides for the documents apps, part 1: Slop PDF (pdf, two guides), Slop OCR (ocr) and File convert (convert).
// Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real (assets/guides/<app>-<slug>-<n>.jpg).
// Sources: pdf/index.html, pdf/HANDOFF.md, pdf/js/ui/commands.js, pdf/js/editor/view.js; ocr/index.html, ocr/js/app.js;
// convert/index.html, convert/js/ui/*.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-documents*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'pdf',
    slug: 'getting-started',
    sections: [{ image: { src: '/assets/guides/pdf-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/pdf-getting-started-2.jpg' } }],
    shortcuts: [['Ctrl+O'], ['Ctrl+S'], ['Ctrl+Z / Ctrl+Shift+Z'], ['Ctrl+F'], ['Ctrl+K'], ['Enter'], ['Escape'], ['V, T, P, H'], ['PageDown / PageUp'], ['?']],
  },
  {
    app: 'pdf',
    slug: 'organize-pages',
    sections: [{ image: { src: '/assets/guides/pdf-organize-pages-1.jpg' } }, null, null, { image: { src: '/assets/guides/pdf-organize-pages-2.jpg' } }],
    shortcuts: [['Ctrl+A'], ['R / Shift+R'], ['Delete'], ['Ctrl+D'], ['Alt+arrow keys'], ['Space'], ['Ctrl+Z']],
  },
  {
    app: 'ocr',
    slug: 'getting-started',
    crumb: '@seo.guide.pdf.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/ocr-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/ocr-getting-started-2.jpg' } }],
  },
  {
    app: 'convert',
    slug: 'getting-started',
    crumb: '@seo.guide.pdf.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/convert-getting-started-1.jpg' } }, { image: { src: '/assets/guides/convert-getting-started-2.jpg' } }],
  },
];
