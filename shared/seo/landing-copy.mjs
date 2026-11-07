// The landing pages' head copy (LANDING), kept apart from shared/seo/copy.mjs so each file stays short; copy.mjs
// re-exports it. Read by tools/seo/write.mjs. Descriptions must be 120 to 160 characters.
// Landing pages (/apps/<id>/, /slop-365/, /creative-slop-pro/, /compare/). Written by tools/seo/landing.mjs,
// with the head block from this copy. Descriptions use only facts from each app's registry entry.
// The words are the SEO tables' seo.landing.<id>.title and .description (shared/seo/i18n/<code>/landing.js); this list
// names the pages that have them.
import { hydrate, seg } from './i18n.mjs';
const IDS = [
  'best', 'all-tools', 'watermark', 'photoslop', 'vector', 'pdf', 'label', 'cutout',
  'aitools', 'reports', 'ocr', 'scan', 'html2pdf', 'clean', 'ai', 'docs', 'tables',
  'slides', 'press', 'remix', 'slopedit', 'resize', 'upscale', 'contacts', 'inventory',
  'orders', 'quotes', 'purchases', 'timesheets', 'expenses', 'invoices', 'notes', 'paste',
  'effects', 'img3d', 'sheetview', 'hex', 'eml', 'checksum', 'diff', 'nodes',
  'sorter', 'signature', 'transcribe', 'recorder', 'serials', 'qr', 'colors', 'fontcreator',
  'workflows', 'convert', 'calculator', 'time', 'crm', 'calendar', 'todo', 'projects',
  'reminders', 'ledger', 'admin', 'drive', 'code', 'gallery', '3d', 'music',
  'paint-classic', 'slop-365', 'creative-slop-pro', 'compare',
];
export const landingIn = (code = 'en') => Object.fromEntries(IDS.map((id) => [id, hydrate({}, `seo.landing.${seg(id)}`, code)]));
export const LANDING = landingIn('en');
