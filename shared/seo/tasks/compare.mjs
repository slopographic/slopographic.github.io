// Slop Compare (diff): the "how do I compare…" pages. No URL preset: every page opens the app as it is.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-compare*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'diff', slug: 'compare-text', cta: '@seo.task.diff.compare-text.crumb' },
  {
    app: 'diff',
    slug: 'compare-pdf',
    cta: '@seo.task.diff.compare-pdf.crumb',
    faq: [['@seo.task.diff.compare-text.faq.0.0', '@seo.task.diff.compare-text.faq.0.1']],
  },
  {
    app: 'diff',
    slug: 'compare-images',
    cta: '@seo.task.diff.compare-images.crumb',
    faq: [['@seo.task.diff.compare-text.faq.0.0', '@seo.task.diff.compare-text.faq.0.1']],
  },
  {
    app: 'diff',
    slug: 'json-csv-diff',
    cta: '@seo.task.diff.json-csv-diff.crumb',
    faq: [['@seo.task.diff.compare-text.faq.0.0', '@seo.task.diff.compare-text.faq.0.1']],
  },
];
