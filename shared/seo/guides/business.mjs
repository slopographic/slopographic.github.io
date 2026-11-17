// Guides for the business apps (shape in tools/seo/guides.mjs). Every step matches the app as it is; screenshots are real.
// Slop Invoices, Quotes, Orders, Purchases, Timesheets, Expenses, Admin, Inventory, Contacts, CRM, Ledger, Reports, Signature.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-business*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'invoices',
    slug: 'getting-started',
    sections: [
      null,
      { image: { src: '/assets/guides/invoices-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/invoices-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/invoices-getting-started-3.jpg' } },
    ],
    shortcuts: [['Ctrl+K'], ['Enter'], ['Escape']],
  },
  {
    app: 'quotes',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/quotes-getting-started-1.jpg' } }, { image: { src: '/assets/guides/quotes-getting-started-2.jpg' } }],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'orders',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { steps: [null, '@seo.guide.quotes.getting-started.sections.0.steps.1'], image: { src: '/assets/guides/orders-getting-started-1.jpg' } },
      null,
      null,
      { image: { src: '/assets/guides/orders-getting-started-2.jpg' } },
    ],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'purchases',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/purchases-getting-started-1.jpg' } }],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'timesheets',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/timesheets-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/timesheets-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/timesheets-getting-started-3.jpg' } },
    ],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'expenses',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/expenses-getting-started-1.jpg' } }, null, { image: { src: '/assets/guides/expenses-getting-started-3.jpg' } }],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'admin',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/admin-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/admin-getting-started-2.jpg' } },
      null,
      { image: { src: '/assets/guides/admin-getting-started-3.jpg' } },
    ],
  },
  {
    app: 'inventory',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/inventory-getting-started-1.jpg' } },
      null,
      { image: { src: '/assets/guides/inventory-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/inventory-getting-started-3.jpg' } },
    ],
    shortcuts: [['Enter'], ['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'contacts',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/contacts-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/contacts-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/contacts-getting-started-3.jpg' } },
    ],
    shortcuts: [['Ctrl+F'], ['Ctrl+A'], ['Delete'], ['Escape'], ['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'crm',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      {
        steps: [null, null, null, '@seo.guide.timesheets.getting-started.sections.0.steps.4'],
        image: { src: '/assets/guides/crm-getting-started-1.jpg' },
      },
      { image: { src: '/assets/guides/crm-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/crm-getting-started-3.jpg' } },
    ],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'ledger',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [
      { image: { src: '/assets/guides/ledger-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/ledger-getting-started-2.jpg' } },
      { image: { src: '/assets/guides/ledger-getting-started-3.jpg' } },
    ],
    shortcuts: [['Ctrl+K', '@seo.guide.invoices.getting-started.shortcuts.0.1']],
  },
  {
    app: 'reports',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/reports-getting-started-1.jpg' } }, { image: { src: '/assets/guides/reports-getting-started-2.jpg' } }],
  },
  {
    app: 'signature',
    slug: 'getting-started',
    crumb: '@seo.guide.invoices.getting-started.crumb',
    sections: [null, { image: { src: '/assets/guides/signature-getting-started-1.jpg' } }],
  },
];
