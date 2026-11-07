// What the suite saves in a year: the paid subscriptions one person would otherwise buy for the apps here, at US list
// prices. The one source of the homepage's "≈ $X a year" line (index.html, home/savings.js) and of its list (#savings).
// Every price is from the plan's own pricing page (source), checked on the date given; most come from the round-ups'
// facts (shared/seo/roundups/*.mjs, the same sources and dates), the Adobe one from adobe.com directly. Rules:
//   - one subscription, counted once: a plan that covers several apps here (Creative Cloud: PhotoSlop, SlopVector, Slop
//     PDF, ...) lists them all in apps and its price is added one time; each app appears in one plan at most
//   - the cheapest paid plan that does the job, billed yearly where that is cheaper; one user, no tax, no discounts
//   - apps with a free equivalent that does the job (the local AI, notes, hex, QR, colours...) are left out
// SHOWN rounds the total down to the hundred, so the line never claims more than the list adds up to.
// Plain data: a page imports it (home/savings.js) and Node does (tests/node/savings.test.mjs).

export const CURRENCY = 'USD';

/** { id, name (the product, as its maker writes it), terms (the billing priced: savings.terms.<terms> in the tables),
 *  month or year (the list price in USD), source (the pricing page), checked (YYYY-MM-DD), apps (registry ids from
 *  shared/apps.js it stands in for) } */
export const PLANS = [
  { id: 'creative-cloud', name: 'Adobe Creative Cloud Standard', terms: 'annual_monthly', month: 54.99,
    source: 'https://www.adobe.com/creativecloud/plans.html', checked: '2026-10-27',
    apps: ['photoslop', 'vector', 'pdf', 'press', 'slopedit', 'effects', 'cutout', 'resize', 'upscale', 'watermark', 'ocr', 'html2pdf'] },
  { id: 'microsoft-365', name: 'Microsoft 365 Personal', terms: 'yearly', year: 99.99,
    source: 'https://www.microsoft.com/en-us/microsoft-365/buy/compare-all-microsoft-365-products', checked: '2026-10-24',
    apps: ['docs', 'tables', 'slides'] },
  { id: 'zoho-books', name: 'Zoho Books Standard', terms: 'billed_yearly', month: 15,
    source: 'https://www.zoho.com/us/books/pricing/', checked: '2026-10-24',
    apps: ['ledger', 'invoices', 'expenses', 'quotes'] },
  { id: 'zoho-inventory', name: 'Zoho Inventory Standard', terms: 'billed_yearly', month: 29,
    source: 'https://www.zoho.com/us/inventory/pricing/', checked: '2026-10-24',
    apps: ['inventory', 'orders', 'purchases'] },
  { id: 'bigin', name: 'Bigin by Zoho CRM Express', terms: 'user_yearly', month: 7,
    source: 'https://www.bigin.com/pricing.html', checked: '2026-10-24', apps: ['crm'] },
  { id: 'clockify', name: 'Clockify Basic', terms: 'seat_yearly', month: 3.99,
    source: 'https://clockify.me/pricing', checked: '2026-10-24', apps: ['timesheets'] },
  { id: 'otter', name: 'Otter Pro', terms: 'billed_yearly', month: 8.33,
    source: 'https://otter.ai/pricing', checked: '2026-10-24', apps: ['transcribe'] },
  { id: 'wisestamp', name: 'WiseStamp Pro+', terms: 'billed_yearly', month: 9,
    source: 'https://www.wisestamp.com/pricing/', checked: '2026-10-24', apps: ['signature'] },
  { id: 'convertio', name: 'Convertio', terms: 'lowest_yearly', month: 6.99,
    source: 'https://convertio.co/pricing/', checked: '2026-10-24', apps: ['convert'] },
  { id: 'ticktick', name: 'TickTick Premium', terms: 'yearly', year: 49.99,
    source: 'https://ticktick.com/about/upgrade', checked: '2026-10-24', apps: ['todo'] },
];

/** A plan's price for a year, in cents-exact USD (a monthly price times 12). */
export const yearly = (p) => Math.round((p.year !== undefined ? p.year : p.month * 12) * 100) / 100;

/** The sum of every plan's yearly price, each plan once. */
export const TOTAL = Math.round(PLANS.reduce((s, p) => s + yearly(p) * 100, 0)) / 100;

/** The figure the homepage shows: the total rounded down to the hundred. */
export const SHOWN = Math.floor(TOTAL / 100) * 100;

/** The newest checked date: "prices checked on" in the list. */
export const CHECKED = PLANS.map((p) => p.checked).sort().pop();
