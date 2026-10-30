// Documents family, part 2: File convert (convert), Slop Docs (docs), Slop Slides (slides) and Slop Tables (tables).
// File convert reads ?to=<catalog id> (convert/js/ui/route.js): the format is chosen as soon as the files allow it. The
// pairs that have their own converter page (convert/js/core/pages.js, such as merge-pdf or csv-to-xlsx) are not repeated.
// Docs, Slides and Tables open files from Slop Drive, so their steps start there.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-documents-2*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'convert', slug: 'pdf-to-word', query: 'to=pdf-to-docx' },
  {
    app: 'convert',
    slug: 'pdf-to-excel',
    query: 'to=pdf-to-xlsx',
    steps: ['@seo.task.convert.pdf-to-word.steps.0', null, '@seo.task.convert.pdf-to-word.steps.2'],
  },
  {
    app: 'convert',
    slug: 'pdf-to-powerpoint',
    query: 'to=pdf-to-pptx',
    steps: ['@seo.task.convert.pdf-to-word.steps.0', null, '@seo.task.convert.pdf-to-word.steps.2'],
  },
  { app: 'convert', slug: 'avif-to-jpg', cta: '@seo.task.convert.avif-to-jpg.h1', query: 'to=to-jpg' },
  { app: 'convert', slug: 'ics-to-csv', query: 'to=ics-to-csv' },
  { app: 'convert', slug: 'xml-to-json', cta: '@seo.task.convert.xml-to-json.h1', query: 'to=xml-to-json' },
  { app: 'convert', slug: 'cloudconvert-alternative' },
  { app: 'docs', slug: 'online-word-processor' },
  { app: 'docs', slug: 'markdown-to-word' },
  { app: 'docs', slug: 'microsoft-word-alternative', cta: '@seo.task.docs.markdown-to-word.cta' },
  { app: 'slides', slug: 'online-presentation-maker' },
  { app: 'slides', slug: 'powerpoint-alternative', faq: [null, null, ['@seo.task.docs.online-word-processor.faq.0.0']] },
  { app: 'tables', slug: 'online-spreadsheet' },
  { app: 'tables', slug: 'budget-spreadsheet-template', h1: '@seo.task.tables.budget-spreadsheet-template.crumb' },
  { app: 'tables', slug: 'excel-alternative', faq: [null, null, null, ['@seo.task.docs.online-word-processor.faq.0.0']] },
];
