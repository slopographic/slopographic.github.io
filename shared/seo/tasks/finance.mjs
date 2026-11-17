// Finance files: SIE accounting files and bank statements (OFX, QIF, camt.053, MT940), in File convert (app convert) and
// Slop Ledger (app ledger). Every claim is what the code does: the readers in shared/finance/, the conversions in
// convert/js/core/finance.js, Import SIE in ledger/js/ui/sie.js and core/sie-import.js, and the Bank tab
// (ledger/js/ui/bank.js). Presets: convert to=sie-to-xlsx|bank-to-xlsx (the format the converter starts on, once a file
// is added); ledger view=journal|bank (the tab to open).
// The pair pages sie-to-xlsx, sie-to-csv, ofx-to-csv, qif-to-csv, camt053-to-xlsx and mt940-to-csv are converter pages
// (convert/js/core/finance-pages.js), so these tasks do not repeat them.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-finance*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'convert', slug: 'open-sie-file', cta: '@seo.task.convert.open-sie-file.crumb', query: 'to=sie-to-xlsx' },
  { app: 'convert', slug: 'sie-to-excel', query: 'to=sie-to-xlsx' },
  {
    app: 'convert',
    slug: 'ofx-to-excel',
    cta: '@seo.task.convert.ofx-to-excel.h1',
    query: 'to=bank-to-xlsx',
    faq: [null, null, [null, '@seo.task.convert.open-sie-file.faq.2.1']],
  },
  {
    app: 'convert',
    slug: 'mt940-to-excel',
    cta: '@seo.task.convert.mt940-to-excel.h1',
    query: 'to=bank-to-xlsx',
    steps: [null, '@seo.task.convert.ofx-to-excel.steps.2'],
  },
  { app: 'convert', slug: 'camt053-viewer', query: 'to=bank-to-xlsx', faq: [null, null, [null, '@seo.task.convert.open-sie-file.faq.2.1']] },
  { app: 'ledger', slug: 'import-sie-file', query: 'view=journal', faq: [['@seo.task.convert.open-sie-file.faq.3.0']] },
  { app: 'ledger', slug: 'import-bank-statement', query: 'view=bank' },
];
