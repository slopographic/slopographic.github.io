// The capability strip under the homepage hero: one short label per app (shared/apps.js, kind "app"): the lead apps first
// (SLOP_LEAD, the PDF family the globe opens on, in its order; home/globe/sphere.js leadFirst), then the registry order,
// with File convert shown as its number of conversions (convert/js/core/pages.js). tools/seo/write.mjs writes it into
// index.html between <!-- site:marquee --> and <!-- /site:marquee -->, so a new app joins the strip the next time it runs.
// data-controls: its links move (it scrolls), so Sloppo treats the whole strip as controls (shared/buddy/avoid.js).
// The list is written twice: the second copy (aria-hidden) lets the strip loop without a gap (home/hero.css scrolls it).
// Each label is a link to its app (data-id: home/marquee.js turns the globe to it on hover or focus). One tab stop: the
// first link takes Tab, the arrow keys move along (home/marquee.js); the copy's links are never in the tab order.
//   capability(app) -> the short label, from the app's title: "PhotoSlop: photo editor" -> "photo editor",
//     "OCR: read text from images" -> "OCR" (the part before the colon when it is not the app's own name),
//     "Contacts (address book)" -> "Contacts"; a long label is cut at its first comma, or before "for", "with"...
//   entries(apps, conversions, lead) -> [{ id, path, label }] (no repeated labels; apps only, with a page; lead ids first)
//   capabilities(apps, conversions, lead) -> [label]
//   label(app, conversions) -> one app's label (File convert: its number of conversions, when given)
//   buildMarquee(entries) -> html (an entry with a key gets data-i18n: the root page follows a language switch)
//   marquee(L) -> the html for the site's own data in one language (a lang.mjs context; the root one when left out): the
//     titles from that language's SEO tables (seo.reg.<id>.title, English when it lacks one). With brand names each
//     label carries data-i18n="seo.mq.<id>" (the runtime words, apptables.mjs); a plain-names build shows slopAppName
//     instead (home/marquee.js), so its labels carry no key.
//   localTitles(apps, code) -> the registry entries with their titles in a language (the SEO tables)
import { registryWindow } from './site.mjs';
import { table } from '../../shared/seo/i18n.mjs';
import { context, ROOT_LANG } from './lang.mjs';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';
import { createRequire } from 'node:module';

const { leadFirst } = createRequire(import.meta.url)('../../home/globe/sphere.js');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LONG = 26;

export function capability(a) {
  const t = String(a.title || a.name).replace(/\s*\([^)]*\)/g, '');
  const i = t.indexOf(': ');
  let x = i < 0 ? t : t.slice(0, i) !== a.name ? t.slice(0, i) : t.slice(i + 2);
  x = x.split(', ')[0];
  if (x.length > LONG) x = x.split(/ for | across | with | from /)[0];
  return x.trim();
}

export const label = (a, conversions) => (a.id === 'convert' && conversions ? `${conversions} conversions` : capability(a));
export const shown = (a) => a.kind === 'app' && !!a.path && !a.path.startsWith('#');
export function entries(apps, conversions, lead = []) {
  const out = [];
  for (const a of leadFirst(apps, lead)) {
    if (!shown(a)) continue;
    const l = label(a, conversions);
    if (l && !out.some((x) => x.label.toLowerCase() === l.toLowerCase())) out.push({ id: a.id, path: a.path, label: l });
  }
  return out;
}
export function localTitles(apps, code) {
  const t = code === 'en' ? new Map() : table(code);
  return apps.map((a) => Object.assign({}, a, { title: t.get(`seo.reg.${a.id}.title`) || a.title }));
}
export const capabilities = (apps, conversions, lead) => entries(apps, conversions, lead).map((e) => e.label);

export function buildMarquee(list) {
  const items = (copy) => list.map((e, i) => `<li><a href="${esc(e.path)}" data-id="${esc(e.id)}" tabindex="${!copy && !i ? 0 : -1}"${e.key ? ` data-i18n="${esc(e.key)}"` : ''}>${esc(e.label)}</a></li>`).join('');
  return `<div class="hx-marquee" data-controls><div class="mq-track"><ul class="mq-list" aria-label="What the apps do" data-i18n-attr="aria-label:hero.marquee">${items(false)}</ul>` +
    `<ul class="mq-list" aria-hidden="true">${items(true)}</ul></div></div>`;
}

const cached = new Map();
export function marquee(L = context(ROOT_LANG)) {
  if (cached.has(L.code)) return cached.get(L.code);
  const win = registryWindow(), keyed = win.SLOP_NAMING !== 'plain';
  // the number of conversions is English words: another language shows File convert's own title
  const list = entries(localTitles(win.SLOP_APPS, L.code), L.code === 'en' ? CONVERTERS.length : 0, win.SLOP_LEAD);
  const html = buildMarquee(list.map((e) => (keyed ? Object.assign(e, { key: `seo.mq.${e.id}` }) : e)));
  cached.set(L.code, html);
  return html;
}
