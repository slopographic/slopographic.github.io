// Business apps, part 1: Slop Invoices, Quotes, Orders and Purchases. More in business-2.mjs (inventory, contacts, CRM,
// ledger) and business-3.mjs (expenses, timesheets, reports, signature). No presets here: these apps open on their lists.
// Every claim is checked against the app's code; the company name, address, tax number and currency are set in Slop Admin.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-business*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'invoices', slug: 'free-invoice-generator' },
  { app: 'invoices', slug: 'invoice-with-vat' },
  { app: 'invoices', slug: 'recurring-invoices' },
  { app: 'invoices', slug: 'credit-note' },
  { app: 'invoices', slug: 'customer-statement' },
  { app: 'invoices', slug: 'wave-alternative' },
  { app: 'quotes', slug: 'quote-maker' },
  { app: 'quotes', slug: 'quote-to-invoice' },
  { app: 'orders', slug: 'order-management' },
  { app: 'orders', slug: 'delivery-note' },
  { app: 'purchases', slug: 'purchase-order-template' },
  { app: 'purchases', slug: 'receive-stock' },
];
