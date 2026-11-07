// The languages of the static SEO pages (shared/seo/HANDOFF.md, "Languages"). The build's root language is the brand
// profile's defaultLang: its pages are at the site root (/compare/). Every other published language has its own folder
// with the same paths (/sv/compare/, /de/pdf/). A language is published when its SEO tables are complete
// (shared/seo/i18n/<code>/, every English key) and the profile's seo.langs lets it in ('all', a list of codes, or 'none'
// or []: the root language only). The root language's pages are committed; the other languages' folders are written when
// the site is published (write.mjs --langs) and never committed (langdirs.mjs).
//   ROOT_LANG, SEO_LANGS          the profile markers (tools/whitelabel/emit.mjs markerValues)
//   LANGS                         the site's language list (shared/i18n/i18n.js): { code, name, dir, ... }
//   allowed(code, langs)          whether seo.langs (default SEO_LANGS) lets a language in
//   published(langs)              the published codes, the root language first; throws when the root one is incomplete
//   unpublished(langs)            the codes with tables that are not published, and why
//   prefixOf(code)                '' for the root language, else '/<code in lower case>'
//   context(code)                 { code, prefix, dir, root, t(key, vars), chrome(key, fallback), ui(key) }
//   alternates(path, codes)       [[hreflang, url]] for one page path ('/compare/') in every given language, x-default last
//   localizeLinks(html, prefix, paths)   the page's root-relative links to a page that exists in the language, prefixed
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, INDEX } from './site.mjs';
import { table, tableLangs, text } from '../../shared/seo/i18n.mjs';

export const ROOT_LANG = /*profile:defaultLang*/'en';
export const SEO_LANGS = /*profile:seoLangs*/'all';

export const LANGS = (() => {
  const ctx = { document: undefined };
  ctx.window = ctx;
  vm.runInNewContext(readFileSync(path.join(ROOT, 'shared/i18n/i18n.js'), 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.SlopI18n.LANGS));
})();
const byCode = new Map(LANGS.map((l) => [l.code, l]));

/** The English keys a language lacks (or has empty): [] when its tables are complete. */
export function missing(code) {
  const t = table(code), out = [];
  for (const k of table('en').keys()) if (!k.includes('#') && !(t.get(k) || '').trim()) out.push(k);
  return out;
}
// a site that is not indexed (site.mjs INDEX) publishes its root language only: no language folders, no hreflang
export const allowed = (code, langs = SEO_LANGS) => INDEX && (langs === 'all' || (Array.isArray(langs) && langs.includes(code)));

export function published(langs = SEO_LANGS) {
  if (!byCode.has(ROOT_LANG)) throw new Error(`SEO: the root language ${ROOT_LANG} is not in LANGS`);
  const gap = missing(ROOT_LANG);
  if (gap.length) throw new Error(`SEO: the root language ${ROOT_LANG} lacks ${gap.length} keys in shared/seo/i18n/${ROOT_LANG}/ (first: ${gap[0]})`);
  const others = tableLangs().filter((c) => c !== ROOT_LANG && byCode.has(c) && allowed(c, langs) && !missing(c).length);
  return [ROOT_LANG, ...others.sort((a, b) => LANGS.findIndex((l) => l.code === a) - LANGS.findIndex((l) => l.code === b))];
}
export function unpublished(langs = SEO_LANGS) {
  const pub = new Set(published(langs));
  return tableLangs().filter((c) => !pub.has(c)).map((c) => ({ code: c, why: !byCode.has(c) ? 'not in LANGS' : !INDEX ? 'the site is not indexed (seo.index)' : !allowed(c, langs) ? 'left out by the profile (seo.langs)' : `${missing(c).length} keys missing` }));
}

export const prefixOf = (code) => (code === ROOT_LANG ? '' : '/' + code.toLowerCase());

const plural = (code, n) => { try { return new Intl.PluralRules(code).select(n); } catch (e) { return n === 1 ? 'one' : 'other'; } };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));

/** The site chrome's tables (shared/i18n/strings.js and <code>.js, with <code>-apps.js): footer and app-name words. */
const chromeCache = new Map();
function chromeTable(code) {
  if (chromeCache.has(code)) return chromeCache.get(code);
  const m = new Map();
  const files = code === 'en' ? ['strings.js'] : [`${code}.js`, `${code}-apps.js`];
  const ctx = { SlopI18n: { add: (c, d) => { if (c === code) for (const [k, v] of Object.entries(d)) if (typeof v === 'string') m.set(k, v); } } };
  ctx.window = ctx;
  for (const f of files) { try { vm.runInNewContext(readFileSync(path.join(ROOT, 'shared/i18n', f), 'utf8'), ctx); } catch (e) { /* a language without the file */ } }
  chromeCache.set(code, m);
  return m;
}

export function context(code) {
  const lang = byCode.get(code) || { code, dir: 'ltr' };
  const t = (key, vars) => {
    const k = vars && typeof vars.n === 'number' ? `${key}#${plural(code, vars.n)}` : key;
    const tt = table(code), en = table('en');
    const s = tt.get(k) ?? (k !== key ? tt.get(key) : undefined) ?? en.get(k) ?? en.get(key) ?? text(key, code);
    return fill(s, vars);
  };
  const chrome = (key, fallback) => chromeTable(code).get(key) ?? chromeTable('en').get(key) ?? fallback;
  return { code, prefix: prefixOf(code), dir: lang.dir === 'rtl' ? 'rtl' : 'ltr', root: code === ROOT_LANG, t, chrome };
}

export const urlOf = (code, p) => `${SITE}${prefixOf(code)}${p}`;
export function alternates(p, codes) {
  return [...codes.map((c) => [c, urlOf(c, p)]), ['x-default', urlOf(ROOT_LANG, p)]];
}

/** Root-relative links (href="/x/" and href="/x/?q#h") to a page that the language has get its prefix. */
export function localizeLinks(html, prefix, paths) {
  if (!prefix) return html;
  return html.replace(/(\shref=")(\/[^"#?]*)([?#][^"]*)?"/g, (m, a, p, rest = '') => (paths.has(p) ? `${a}${prefix}${p}${rest}"` : m));
}
