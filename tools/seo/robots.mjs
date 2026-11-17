// What search engines are told (brand/README.md "Search engines"): the canonical URL of each page, robots.txt, and the
// mark at the top of every page's <head>. The profile decides through the markers in site.mjs (INDEX, CANONICAL_TO,
// CANONICAL_OVERRIDE, MAIN_APP); write.mjs applies it to every page it writes and every other page of the site.
//   canonicalFor(url)        the canonical of a page URL: an override's URL, the main app's page -> the root, CANONICAL_TO
//                            + the path, else the URL itself
//   hiddenApp(rel)           the hidden app (apps.hide) whose folder holds a site path ('pdf/x/'), or null
//   guardScript(host)        the host guard: on any host but the site's own (and localhost or a file), a noindex tag
//   markHead(html, mark)     the page with mark right after <head> (on the same line), the earlier mark replaced
//   unLang(rel)              a path without its language folder (sv/pdf/ -> pdf/)
//   pageMark(rel)            the mark of a page: the static noindex (INDEX false, or a hidden app's page), else the guard
//   robotsTxt(sitemaps)      robots.txt: crawling allowed, the sitemaps listed only when the site is indexed
//   sitePages()              every page of the site (.html, relative), without tests/, vendor/ and the language folders
// A copy of an indexed site on another host (a fork) is still indexed by nobody: Google renders the page, runs the guard
// and honours the noindex it adds. Tests: tests/seo/robots.test.mjs.
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, INDEX, CANONICAL_TO, CANONICAL_OVERRIDE, MAIN_APP, registryWindow, isPage } from './site.mjs';
import { LANGS, ROOT_LANG } from './lang.mjs';

export const NOINDEX = '<meta name="robots" content="noindex">';
const reg = registryWindow();
const ALL = reg.SLOP_ALL_APPS.filter(isPage), HIDDEN = new Set(reg.SLOP_HIDDEN_APPS || []);
const MAIN = MAIN_APP ? ALL.find((a) => a.id === MAIN_APP) : null;
if (MAIN_APP && !MAIN) throw new Error(`SEO: mainApp ${MAIN_APP} is not an app with a page in shared/apps.js`);
export const mainApp = () => MAIN;
const LANG_DIRS = new Set(LANGS.map((l) => l.code.toLowerCase()).filter((c) => c !== ROOT_LANG.toLowerCase()));

/** The hidden app whose folder holds rel (a path from the site root, no leading slash): the longest folder of every app
 *  decides, so a shown app inside a hidden one's folder stays shown. */
export function hiddenApp(rel, hidden = HIDDEN, all = ALL) {
  let best = null;
  for (const a of all) if (rel.startsWith(a.path) && (!best || a.path.length > best.path.length)) best = a;
  return best && hidden.has(best.id) ? best : null;
}

/** The canonical URL of a page of this site. A path in a language's folder ('/sv/pdf/') is matched without it, and the
 *  folder goes back in front of the new path. */
export function canonicalFor(url, { override = CANONICAL_OVERRIDE, to = CANONICAL_TO, main = MAIN } = {}) {
  if (!url.startsWith(SITE + '/')) return url;
  let rest = url.slice(SITE.length), prefix = '';
  const m = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*)$/.exec(rest);
  if (m && LANG_DIRS.has(m[1])) { prefix = '/' + m[1]; rest = m[2]; }
  const [p, q = ''] = rest.split(/(?=[?#])/);
  let hit = override['=' + p] !== undefined ? ['=' + p, override['=' + p]] : null;
  if (!hit) for (const k of Object.keys(override)) if (k[0] !== '=' && p.startsWith(k) && (!hit || k.length > hit[0].length)) hit = [k, override[k]];
  if (hit) {
    const to2 = new URL(hit[1]), tail = hit[0][0] === '=' ? '' : p.slice(hit[0].length);
    return `${to2.origin}${prefix}${to2.pathname}${tail}${q}`;
  }
  const own = main && !prefix && p === '/' + main.path ? '/' : p;   // a single-app site: its app's own page is the root
  return `${to || SITE}${prefix}${own}${q}`;
}

/** The host guard: a page served from any other host than the site's own says noindex (localhost, 127.0.0.1 and a file
 *  stay as they are, for the tests). One line, so no page grows. */
export function guardScript(host = new URL(SITE).hostname) {
  const bare = host.replace(/^www\./, ''), ok = JSON.stringify([bare, 'www.' + bare, 'localhost', '127.0.0.1', '[::1]', '']);
  return `<script data-robots-guard>(function(h){if(${ok}.indexOf(h)<0){var m=document.createElement('meta');m.name='robots';m.content='noindex';document.head.appendChild(m)}})(location.hostname)</script>`;
}
const LEAD = /^(?:<meta name="robots" content="noindex">|<script data-robots-guard>[^\n]*?<\/script>)*/;
/** The page with mark right after its <head> tag (the mark written there before replaced). A page that says noindex
 *  itself (404, offline, a moved page) keeps its own tag and gets no mark; a page without <head> stays as it is. */
export function markHead(html, mark) {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) return html;
  const at = head.index + head[0].length, rest = html.slice(at), body = rest.slice(LEAD.exec(rest)[0].length);
  return html.slice(0, at) + (/<meta\s+name=["']robots["'][^>]*noindex/i.test(body) ? '' : mark) + body;
}

/** The mark of a page (rel: its path from the site root): noindex for a site that is not indexed and for a hidden app's
 *  page (no list links it; it is a copy of the parent site's page), else the host guard. */
export const unLang = (rel) => { const i = rel.indexOf('/'); return i > 0 && LANG_DIRS.has(rel.slice(0, i)) ? rel.slice(i + 1) : rel; };
export const pageMark = (rel, index = INDEX) => (!index || hiddenApp(unLang(rel)) ? NOINDEX : guardScript());

/** robots.txt. Crawling stays allowed either way: a crawler must read a page to see its noindex. */
export function robotsTxt(sitemaps, index = INDEX) {
  return 'User-agent: *\nAllow: /\n' + (index && sitemaps.length ? '\n' + sitemaps.map((s) => `Sitemap: ${SITE}/${s}\n`).join('') : '');
}

const SKIP = new Set(['.git', '.github', 'node_modules', 'tests', 'vendor']);
/** Every page of the site on disk, relative to the root (the language folders' pages are write.mjs --langs's). */
export function sitePages(root = ROOT, dir = '') {
  const out = [];
  for (const f of readdirSync(path.join(root, dir))) {
    const rel = dir + f, full = path.join(root, rel);
    if (!dir && (SKIP.has(f) || LANG_DIRS.has(f))) continue;
    if (statSync(full).isDirectory()) out.push(...sitePages(root, rel + '/'));
    else if (f.endsWith('.html') && existsSync(full)) out.push(rel);
  }
  return out;
}
