// Task pages for the creative apps, part 3: SlopLabel, Slop Press and QR SLOP (see index.mjs for the shape of a task).
// QR SLOP reads type=<a form kind> and tab=<a tab> (qr/js/state.js presetOf).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-creative-3*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'label', slug: 'print-labels-from-excel' },
  { app: 'label', slug: 'avery-label-template' },
  { app: 'label', slug: 'zpl-viewer' },
  { app: 'label', slug: 'sscc-pallet-label' },
  { app: 'label', slug: 'bartender-alternative' },
  { app: 'press', slug: 'business-card-maker' },
  { app: 'press', slug: 'zine-maker' },
  { app: 'press', slug: 'flyer-maker' },
  { app: 'press', slug: 'indesign-alternative' },
  { app: 'qr', slug: 'wifi-qr-code', cta: '@seo.task.qr.wifi-qr-code.h1', query: 'type=wifi' },
  { app: 'qr', slug: 'qr-code-with-logo', query: 'tab=logo' },
  { app: 'qr', slug: 'vcard-qr-code', query: 'type=vcard' },
  { app: 'qr', slug: 'bulk-qr-code-generator', query: 'tab=batch' },
  { app: 'qr', slug: 'qr-code-monkey-alternative' },
];
