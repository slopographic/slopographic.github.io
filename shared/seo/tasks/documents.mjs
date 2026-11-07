// Documents family, part 1: Slop PDF (app id pdf) and Slop OCR (ocr). Parts 2 and 3 are documents-2.mjs and
// documents-3.mjs. Presets read by the apps: Slop PDF ?tool=<rail tool> (organize, edit, sign, redact, numbers,
// watermark, comments, forms, compress, convert, ocr, split, metadata; pdf/js/ui/route.js). Merging and splitting PDFs
// are the converter pages convert/merge-pdf/ and convert/split-pdf/, so they are not repeated here.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-documents*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'pdf', slug: 'sign-pdf', cta: '@seo.task.pdf.sign-pdf.crumb', query: 'tool=sign' },
  { app: 'pdf', slug: 'fill-pdf-form', cta: '@seo.task.pdf.fill-pdf-form.crumb', query: 'tool=forms' },
  { app: 'pdf', slug: 'edit-pdf-text', query: 'tool=edit' },
  { app: 'pdf', slug: 'compress-pdf', h1: '@seo.task.pdf.compress-pdf.crumb', cta: '@seo.task.pdf.compress-pdf.crumb', query: 'tool=compress' },
  { app: 'pdf', slug: 'redact-pdf', h1: '@seo.task.pdf.redact-pdf.crumb', cta: '@seo.task.pdf.redact-pdf.crumb', query: 'tool=redact' },
  { app: 'pdf', slug: 'rotate-pdf', cta: '@seo.task.pdf.rotate-pdf.crumb' },
  { app: 'pdf', slug: 'adobe-acrobat-alternative' },
  { app: 'ocr', slug: 'image-to-text' },
  { app: 'ocr', slug: 'searchable-pdf' },
];
