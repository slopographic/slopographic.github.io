// Business apps, part 3: Slop Expenses, Timesheets, Reports and Signature (part 1 is business.mjs). Presets read by the
// apps: reports report=<built-in report id> (reports/js/app.js R.presetOf); signature mail=gmail|outlook|outlook-web|apple
// (the steps that open, signature/js/app.js presetOf).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-business-3*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'expenses', slug: 'expense-tracker' },
  { app: 'expenses', slug: 'mileage-log' },
  { app: 'expenses', slug: 'receipt-scanner' },
  { app: 'expenses', slug: 'bills-to-pay' },
  { app: 'expenses', slug: 'expensify-alternative' },
  { app: 'timesheets', slug: 'free-timesheet' },
  { app: 'timesheets', slug: 'billable-hours-tracker' },
  { app: 'timesheets', slug: 'toggl-alternative' },
  { app: 'reports', slug: 'sales-tax-report', query: 'report=sales-tax' },
  { app: 'reports', slug: 'cash-flow-report', query: 'report=cash-flow' },
  { app: 'reports', slug: 'unpaid-invoices-report', query: 'report=unpaid-invoices' },
  { app: 'signature', slug: 'gmail-signature', cta: '@seo.task.signature.gmail-signature.h1', query: 'mail=gmail' },
  { app: 'signature', slug: 'outlook-signature', query: 'mail=outlook', steps: [null, '@seo.task.signature.gmail-signature.steps.3'] },
  {
    app: 'signature',
    slug: 'apple-mail-signature',
    cta: '@seo.task.signature.apple-mail-signature.h1',
    query: 'mail=apple',
    steps: ['@seo.task.signature.outlook-signature.steps.0', '@seo.task.signature.gmail-signature.steps.3'],
  },
  { app: 'signature', slug: 'html-email-signature' },
  { app: 'signature', slug: 'wisestamp-alternative' },
];
