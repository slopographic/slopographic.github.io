// A hand-made page in another language (tools/seo/write.mjs): the app pages, the homepage and the converter pages are
// written by hand (or by their own tools) at the site root. In a language with its own folder each gets a copy at the
// same path under the folder (/sv/pdf/, /sv/, /sv/convert/jpg-to-png/): the same page, not a second copy of the app.
//   - <base href> points every relative URL back at the original folder (../../pdf/), so the copy loads the app's own
//     scripts, styles, workers and data: nothing is duplicated but the page's HTML.
//   - <html lang dir data-lang-page>: the language of the copy. shared/i18n/i18n.js starts the page in it (and keeps it
//     as the visitor's choice), so the app runs in that language from its first paint.
//   - The head block in that language (write.mjs), and the static text: every element marked data-i18n="key" (and
//     data-i18n-attr) gets that key's text from the language's tables (chrome, ui and the app's own), so a crawler reads
//     the language without running a script; a converter page's own copy (h1, lead, how, questions) comes from the SEO
//     tables (seo.cv.*) and its labels from the convert tables.
//   - Links to a page that exists in the language go to that language's page; a link to "#x" stays on the copy.
// The root page itself can be in another language than English (a build whose root language is not English): translate()
// maps a converter page from the language its <html lang> says to any other, so writing it twice changes nothing.
//   copyPage(html, { dir, L, paths })     the page at dir (its folder, 'pdf/') as a copy in L's folder
//   prerender(html, table)                data-i18n text and attributes from table (Map key -> text)
//   pageTables(code, appDir)              Map of the chrome, ui and app tables of one language (English filled in)
//   converterWords(p, code)               [[key, text]] of one converter page in a language (the pairs translate() maps)
//   translate(html, pairs)                [[from, to]]: element text and attribute values, exactly, replaced
import path from 'node:path';
import { sharedTables, appTables, sharedAreas } from '../i18n/tables.mjs';
import { seg, text, table, appTable } from '../../shared/seo/i18n.mjs';
import { cardKey } from '../../convert/js/core/page-words.js';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';
import { esc } from './frame.mjs';
import { setHtmlLang } from './head.mjs';

const escQ = (s) => esc(s);                                         // & < > "
const escN = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // quotes as they are

const tableCache = new Map(), loaded = new Map();
const once = (key, load) => { if (!loaded.has(key)) loaded.set(key, load()); return loaded.get(key); };   // each table file is run once
export function pageTables(code, appDir) {
  const id = code + ':' + (appDir || '');
  if (tableCache.has(id)) return tableCache.get(id);
  const m = new Map();
  const add = (src) => { if (src) for (const [k, v] of src) m.set(k, v); };
  for (const c of code === 'en' ? ['en'] : ['en', code]) {
    add(once('chrome', () => sharedTables('chrome')).tables[c]);
    add(once('ui', () => sharedTables('ui')).tables[c]);
    const parts = once('areas', () => sharedAreas()).find((a) => a.id === 'ui-parts');
    if (parts) add(once('ui-parts', () => appTables(parts)).tables[c]);
    if (appDir) add(once('app:' + appDir, () => appTables({ id: appDir, dir: appDir })).tables[c]);
  }
  tableCache.set(id, m);
  return m;
}

/** Text and attributes of marked elements from a table. A text with a {placeholder} is left to the page's script. */
export function prerender(html, table) {
  const ok = (k) => table.has(k) && !/\{\w+\}/.test(table.get(k));
  let out = html.replace(/<([a-z][a-z0-9]*)(\s(?:[^>]*?\s)?data-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/gi, (m, tag, attrs, key, inner) => (ok(key) ? `<${tag}${attrs}>${escN(table.get(key))}</${tag}>` : m));
  out = out.replace(/<([a-z][a-z0-9]*)(\s(?:[^>]*?\s)?data-i18n-attr="([^"]+)"[^>]*)>/gi, (m, tag, attrs, spec) => {
    let a = attrs;
    for (const pair of spec.split(';')) {
      const [name, key] = pair.split(':').map((x) => x && x.trim());
      if (!name || !key || !ok(key) || name === 'data-i18n-attr') continue;
      a = a.replace(new RegExp(`(\\s${name}=")[^"]*(")`), (mm, p, q) => `${p}${escQ(table.get(key))}${q}`);
    }
    return `<${tag}${a}>`;
  });
  return out;
}

/** Element text (>text<) and attribute values (="text") replaced exactly, longest first. */
export function translate(html, pairs) {
  const list = pairs.filter(([a, b]) => a && b && a !== b).sort((x, y) => y[0].length - x[0].length);
  let out = html;
  for (const [from, to] of list) {
    for (const [f, t] of [[escN(from), escN(to)], [escQ(from), escQ(to)]]) out = out.split(`>${f}<`).join(`>${t}<`);
    out = out.split(`="${escQ(from)}"`).join(`="${escQ(to)}"`);
  }
  return out;
}

/** The keys of a converter page's own extra words (shared/seo/i18n/en/cv-page.js: seo.cvx.<slug>.<n>). */
const cvxKeys = (slug) => [...table('en').keys()].filter((k) => k.startsWith(`seo.cvx.${seg(slug)}.`));
const byConverter = new Map(CONVERTERS.map((p) => [p.slug, p]));
/** The words of one converter page in a language, keyed: its copy, the page's fixed labels and the linked labels. */
export function converterWords(p, code, L) {
  const out = [], s = `seo.cv.${seg(p.slug)}`, en = code === 'en';
  const put = (k, v) => out.push([k, v]);
  for (const f of ['h1', 'lead']) put(f, en ? p[f] : text(`${s}.${f}`, code));
  (p.how || []).forEach((h, i) => put(`how.${i}`, en ? h : text(`${s}.how.${i}`, code)));
  (p.faq || []).forEach(([q, a], i) => { put(`faq.${i}.0`, en ? q : text(`${s}.faq.${i}.0`, code)); put(`faq.${i}.1`, en ? a : text(`${s}.faq.${i}.1`, code)); });
  for (const k of ['skip', 'tool', 'preview', 'how', 'questions', 'more', 'ad', 'accepts', 'how_to', 'every', 'private_a', 'private_b', 'upload_q', 'upload_a']) put('ui.' + k, L.t('seo.ui.cv.' + k));
  for (const k of cvxKeys(p.slug)) put(k, text(k, code));
  put('ui.home', L.t('seo.ui.cv.home', { brand: 'Slopographic' }));
  const labels = appTable('convert', code);
  for (const q of CONVERTERS) put('card.' + q.slug, labels.get(cardKey(q)) || q.label);
  return out;
}
/** [[from, to]] that turn one converter page from one language to another. */
export function converterPairs(slug, from, to) {
  const p = byConverter.get(slug);
  if (!p) return [];
  const a = new Map(converterWords(p, from.code, from)), b = new Map(converterWords(p, to.code, to));
  return [...a].map(([k, v]) => [v, b.get(k)]);
}

/** Relative and root-relative links of a page at dir that go to a page the language has: to that page. */
export function localizeAll(html, dir, prefix, paths) {
  return html.replace(/(\shref=")([^"]*)"/g, (m, a, href) => {
    if (!href || /^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return m;
    const [p, rest = ''] = href.split(/(?=[?#])/);
    const abs = p.startsWith('/') ? p : path.posix.normalize('/' + dir + p) + (p.endsWith('/') || p === '' || p === '.' ? '/' : '');
    const key = abs.replace(/\/+$/, '/').replace(/\/index\.html$/, '/');
    return paths.has(key) ? `${a}${prefix}${key}${rest}"` : m;
  });
}

// A link to "#x" on a copy would follow <base> to the original page: keep it on this one.
const HASH_FIX = '<script>document.addEventListener(\'click\',function(e){var a=e.target.closest&&e.target.closest(\'a[href^="#"]\');if(!a||e.defaultPrevented)return;e.preventDefault();location.hash=a.getAttribute(\'href\')})</script>';

/** The copy of the page at dir ('pdf/', '' for the homepage, 'convert/jpg-to-png/') in language L. */
export function copyPage(html, { dir, L, paths }) {
  const depth = L.prefix.split('/').filter(Boolean).length + dir.split('/').filter(Boolean).length;
  const base = '../'.repeat(depth) + dir;
  // the links first: they are read against the original folder; then the <base> that sends the rest back there
  let out = localizeAll(html.replace(/<base\s[^>]*>/i, ''), dir, L.prefix, paths);
  // in the head, on the <base> line: the page keeps its line count and its last element (an app's paint mark)
  out = setHtmlLang(out.replace(/<head([^>]*)>/i, (m) => `${m}<base href="${base}">${HASH_FIX}`), L, { page: true });
  return out;
}
