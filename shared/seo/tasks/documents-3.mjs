// Documents family, part 3: Slop Sheets (sheetview), Slop HTML to PDF (html2pdf), Slop Notes (notes),
// Paste (paste), Checksum (checksum), Slop Hex (hex), Slop Code (code) and SlopClean (clean). Checksum reads
// ?alg=sha256|sha384|sha512|sha1 (checksum/js/checksum.js); the others take no preset.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-documents-3*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'sheetview', slug: 'open-xlsx-online', cta: '@seo.task.sheetview.open-xlsx-online.crumb' },
  { app: 'sheetview', slug: 'csv-viewer' },
  { app: 'sheetview', slug: 'xlsx-to-csv', cta: '@seo.task.sheetview.xlsx-to-csv.h1' },
  { app: 'html2pdf', slug: 'html-to-pdf' },
  { app: 'html2pdf', slug: 'saved-web-page-to-pdf' },
  { app: 'notes', slug: 'markdown-editor' },
  { app: 'notes', slug: 'markdown-to-pdf', steps: ['@seo.task.notes.markdown-editor.steps.0'] },
  { app: 'paste', slug: 'code-snippet-manager' },
  { app: 'checksum', slug: 'sha256-checksum', query: 'alg=sha256' },
  { app: 'checksum', slug: 'verify-checksum' },
  { app: 'checksum', slug: 'sha512-checksum', query: 'alg=sha512' },
  { app: 'hex', slug: 'hex-viewer', cta: '@seo.task.hex.hex-viewer.h1', faq: [null, null, ['@seo.task.checksum.sha512-checksum.faq.2.0']] },
  {
    app: 'hex',
    slug: 'identify-file-type',
    steps: ['@seo.task.checksum.sha512-checksum.steps.0'],
    faq: [null, null, ['@seo.task.checksum.sha512-checksum.faq.2.0']],
  },
  { app: 'code', slug: 'html-editor-live-preview' },
  { app: 'code', slug: 'json-formatter', cta: '@seo.task.code.json-formatter.h1' },
  { app: 'clean', slug: 'remove-exif-data' },
  { app: 'clean', slug: 'remove-gps-from-photo' },
  { app: 'clean', slug: 'exif-viewer', faq: [[null, '@seo.task.clean.remove-exif-data.faq.1.1']] },
];
