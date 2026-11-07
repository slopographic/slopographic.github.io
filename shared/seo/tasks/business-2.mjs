// Business apps, part 2: Slop Inventory, Contacts, CRM and Ledger (part 1 is business.mjs). Preset read by the app:
// ledger view=journal|gl|trial|accounts|rates|bank|fin (the tab to open, ledger/js/ui/app.js NS.presetOf).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-business-2*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'inventory', slug: 'inventory-spreadsheet-alternative' },
  { app: 'inventory', slug: 'barcode-inventory-scanner' },
  { app: 'inventory', slug: 'stock-count' },
  { app: 'inventory', slug: 'low-stock-alerts' },
  { app: 'inventory', slug: 'sortly-alternative' },
  { app: 'contacts', slug: 'vcf-to-csv' },
  { app: 'contacts', slug: 'csv-to-vcf' },
  { app: 'contacts', slug: 'merge-duplicate-contacts' },
  { app: 'crm', slug: 'simple-crm-free' },
  { app: 'crm', slug: 'sales-pipeline' },
  { app: 'crm', slug: 'customer-follow-up-tracker' },
  { app: 'crm', slug: 'hubspot-crm-alternative' },
  { app: 'ledger', slug: 'profit-and-loss-statement', query: 'view=fin' },
  { app: 'ledger', slug: 'balance-sheet', cta: '@seo.task.ledger.profit-and-loss-statement.cta', query: 'view=fin' },
  { app: 'ledger', slug: 'bank-reconciliation', query: 'view=bank' },
  { app: 'ledger', slug: 'quickbooks-alternative' },
];
