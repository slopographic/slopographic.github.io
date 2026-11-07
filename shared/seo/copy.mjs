// SEO copy for the homepage, every app page and every about page. Read by tools/seo/write.mjs,
// which writes the head block (title, description, canonical, Open Graph, Twitter, JSON-LD) into
// each page, and rebuilds the sitemaps. The words are in the SEO tables (shared/seo/i18n/<code>/copy.js, keys
// seo.home.*, seo.app.<id>.*, seo.about.<id>.*, seo.page.<folder>.*; shared/seo/i18n/README.md); this file holds the
// facts: which pages have copy and each app's category. Edit the words there, then run: node tools/seo/write.mjs
// Keys are app ids from shared/apps.js. Titles are full titles. Descriptions must be 120 to 160 characters.
// category: a schema.org applicationCategory (SoftwareApplication).

import { VCF_COPY, FINANCE_COPY, THREED_COPY, CONVERT_PAGES } from './convert-copy.mjs';
import { cardKey } from '../../convert/js/core/page-words.js';
import { hydrate, seg, text, appTable } from './i18n.mjs';

/** The homepage. A brand profile can set its own for its root language (seo.homeTitle, seo.homeDescription;
 * tools/whitelabel/build.mjs writes them here); null reads the tables. root: the language is the build's root one. */
const HOME_PROFILE = { title: /*profile:seoHomeTitle*/null, description: /*profile:seoHomeDescription*/null };
export function homeIn(code = 'en', root = code === 'en') {
  const t = hydrate({}, 'seo.home', code);
  return root ? { title: HOME_PROFILE.title || t.title, description: HOME_PROFILE.description || t.description } : t;
}
export const HOME = homeIn('en');

/** Every app page's category; its title and description are seo.app.<id>.*. */
const CATEGORY = {
  photoslop: 'DesignApplication', vector: 'DesignApplication', pdf: 'BusinessApplication',
  label: 'BusinessApplication', cutout: 'MultimediaApplication', aitools: 'MultimediaApplication',
  ocr: 'BusinessApplication', reports: 'BusinessApplication', html2pdf: 'BusinessApplication',
  clean: 'UtilitiesApplication', ai: 'BusinessApplication', docs: 'BusinessApplication',
  tables: 'BusinessApplication', slides: 'BusinessApplication', press: 'DesignApplication',
  remix: 'MultimediaApplication', slopedit: 'MultimediaApplication', resize: 'MultimediaApplication',
  upscale: 'MultimediaApplication', watermark: 'MultimediaApplication', contacts: 'BusinessApplication',
  inventory: 'BusinessApplication', orders: 'BusinessApplication', quotes: 'BusinessApplication',
  purchases: 'BusinessApplication', timesheets: 'BusinessApplication', expenses: 'BusinessApplication',
  invoices: 'BusinessApplication', notes: 'ProductivityApplication', paste: 'UtilitiesApplication',
  effects: 'MultimediaApplication', hex: 'DeveloperApplication', sheetview: 'BusinessApplication',
  eml: 'UtilitiesApplication', checksum: 'UtilitiesApplication', diff: 'UtilitiesApplication',
  nodes: 'BusinessApplication', sorter: 'MultimediaApplication', signature: 'BusinessApplication',
  transcribe: 'BusinessApplication', recorder: 'MultimediaApplication', serials: 'BusinessApplication',
  qr: 'UtilitiesApplication', colors: 'DesignApplication', fontcreator: 'DesignApplication', scan: 'BusinessApplication',
  workflows: 'UtilitiesApplication', convert: 'UtilitiesApplication', calculator: 'UtilitiesApplication',
  time: 'UtilitiesApplication', crm: 'BusinessApplication', calendar: 'BusinessApplication',
  todo: 'BusinessApplication', projects: 'BusinessApplication', reminders: 'BusinessApplication',
  ledger: 'BusinessApplication', admin: 'BusinessApplication', drive: 'UtilitiesApplication',
  code: 'DeveloperApplication', gallery: 'MultimediaApplication', '3d': 'DesignApplication',
  img3d: 'DesignApplication', music: 'MultimediaApplication', 'paint-classic': 'MultimediaApplication',
};
export const appsIn = (code = 'en') => Object.fromEntries(Object.entries(CATEGORY).map(([id, category]) => [id, hydrate({ category }, `seo.app.${seg(id)}`, code)]));
export const APPS = appsIn('en');

/** About pages (seo.about.<id>.*), keyed by app id. Only apps with an about/ folder appear here. */
const ABOUT_IDS = [
  'photoslop', 'vector', 'pdf', 'cutout', 'label', 'calendar', 'todo', 'projects', 'reminders', 'time', 'calculator',
  'invoices', 'orders', 'quotes', 'purchases', 'timesheets', 'expenses',
];
export const aboutIn = (code = 'en') => Object.fromEntries(ABOUT_IDS.map((id) => [id, hydrate({}, `seo.about.${seg(id)}`, code)]));
export const ABOUT = aboutIn('en');

/** Pages that are not apps and have no registry entry, keyed by folder (the URL is /<folder>/). Written by write.mjs. */
export const pagesIn = (code = 'en') => ({
  // The typeface page (typeface/): only in a build whose profile has a type family (tools/whitelabel/font.mjs).
  .../*profile:font*/true ? { typeface: hydrate({}, 'seo.page.typeface', code) } : {},
  'how-it-works': hydrate({}, 'seo.page.how-it-works', code),
  // Converter pages: their copy is in the page lists of convert/js/core (convert-copy.mjs), their crumb the hub card's
  // label from the convert tables. Contacts, then finance files (SIE and bank statements), then 3D models, then the rest.
  ...convertIn(code),
});
// In English the converter copy is the page lists' own (convert-copy.mjs); in another language its title and description
// are seo.cv.<slug>.* (the English part cv-*.js is written from the page lists by tools/seo/tables.mjs) and its crumb the
// convert tables' card label in that language.
const CONVERT = { ...VCF_COPY, ...FINANCE_COPY, ...THREED_COPY, ...CONVERT_PAGES };
function convertIn(code) {
  if (code === 'en') return CONVERT;
  const labels = appTable('convert', code);
  return Object.fromEntries(Object.entries(CONVERT).map(([k, c]) => {
    const slug = k.slice('convert/'.length), s = `seo.cv.${seg(slug)}`;
    return [k, { ...c, title: text(`${s}.title`, code), description: text(`${s}.description`, code), crumb: labels.get(cardKey({ slug })) || c.crumb }];
  }));
}
export const PAGES = pagesIn('en');

export { LANDING, landingIn } from './landing-copy.mjs';
