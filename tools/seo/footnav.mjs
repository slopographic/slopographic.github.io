// The site footer navigation: one block of plain links to the pages the SEO tools write, on the homepage, every
// generated content page (landing.mjs siteFoot) and every converter page. Built only from the data those pages come
// from, so a new app, round-up or converter is linked from the footer the next time tools/seo/write.mjs runs:
//   Apps        one column per registry group (shared/apps.js group, headed by SLOP_GROUP_LABELS), each app's /apps/<id>/
//               (in a build with plain names, the heading carries the i18n key footer.group_<group>)
//               (an app with no group joins the group of the app whose folder holds it)
//   Compare     /compare/, /best/ and every round-up (shared/seo/roundups/)
//   Converters  the first converter page of each category (convert/js/core/pages.js order), and /convert/
//   Guides      How it works, All tools, the first getting-started guides (registry order), Settings, the sitemap
// Each column is a <details open> with its links in a grid (a long list the whole width, a short one half); a small inline script folds them on phones (max-width: 640px) and opens them again on wider
// screens, so without JavaScript every link shows. Styles: shared/footnav/footnav.css. Labels with a data-i18n key are
// translated where the page loads shared/i18n (the homepage): the chrome's footer.* words, and the round-ups', guides'
// and converters' words as seo.foot.* (the runtime words written from this block in each language: apptables.mjs).
// In another language than English the labels are the chrome tables' (footer.*, shared/i18n/<code>.js), the round-ups'
// and guides' own words in that language and the convert tables' card labels; the links stay root-relative (write.mjs
// gives them the language's folder).
// A site that is not indexed (site.mjs INDEX) has no generated pages: its apps link to their own pages, and Compare, All
// tools, the guides and the sitemap are left out. A single-app site's suite (shared/apps.js SLOP_PARENT) gets a column of
// its own, "More free tools", and a link into a hidden app's folder goes to the same path there (route).
//   buildFootNav({ apps, groups, roundups, guides, converters, word, index, parent, route }) -> html (pure: tests pass
//                 their own data; word(key, english) gives a label in the page's language, English when left out)
//   footNav(L) -> the html for the site's own data in one language (a lang.mjs context; the root one when left out)
//   footNavLinks(html) -> [href] in the block
//   addFootSlot(html) -> a converter page with an empty <!-- site:footnav --> slot before its shell script
import { isPage, registryWindow, INDEX } from './site.mjs';
import { hiddenApp } from './robots.mjs';
import { roundupsIn } from '../../shared/seo/roundups/index.mjs';
import { guidesIn } from '../../shared/seo/guides/index.mjs';
import { appTable } from '../../shared/seo/i18n.mjs';
import { context, ROOT_LANG } from './lang.mjs';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';
import { cardKey } from '../../convert/js/core/page-words.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const PHONE = '(max-width: 640px)';
export const GUIDE_PICKS = 4;   // getting-started guides in the Guides column
const WIDE = 12;                // a list longer than this takes the whole width (fn-wide), a shorter one half

const li = ([href, text, key]) => `<li><a href="${esc(href)}"${key ? ` data-i18n="${key}"` : ''}>${esc(text)}</a></li>`;
function col(head, links, key, word) {
  head = word(key, head);
  links = links.map(([h, t, k]) => [h, k ? word(k, t) : t, k]);
  const long = links.some(([, t]) => t.length > 22) ? ' fn-long' : '';   // long titles get wider cells
  return `<details class="fn-col${links.length > WIDE ? ' fn-wide' : ''}${long}" open><summary><span${key ? ` data-i18n="${key}"` : ''}>${esc(head)}</span></summary><ul>${links.map(li).join('')}</ul></details>`;
}

const english = (key, text) => text;
export function buildFootNav({ apps, groups = {}, plainNames = false, roundups = [], guides = [], converters = [], word = english, index = true, parent = null, route = (h) => h }) {
  const pages = apps.filter(isPage);
  const byGroup = new Map(Object.keys(groups).map((g) => [g, []]));
  // an app without a group joins the group of the app it lives in (photoslop/classic/ is PhotoSlop's), else More apps
  const groupOf = (a) => a.group || (pages.find((b) => b !== a && b.group && a.path.startsWith(b.path)) || {}).group;
  for (const a of pages) {
    const g = byGroup.has(groupOf(a)) ? groupOf(a) : '';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push([index ? `/apps/${a.id}/` : `/${a.path}`, a.name]);
  }
  const cols = [...byGroup].filter(([, l]) => l.length).map(([g, l]) => (g ? col(groups[g], l, plainNames ? `footer.group_${g}` : '', word) : col('More apps', l, 'footer.more_apps', word)));
  if (index) cols.push(col('Compare', [['/compare/', 'All apps compared', 'footer.all_compared'], ['/best/', 'All comparisons', 'footer.all_comparisons'],
    ...roundups.map((r) => [`/best/${r.slug}/`, r.crumb || r.h1, `seo.foot.best.${r.slug}`])], 'footer.compare', word));
  const firsts = new Map();
  for (const p of converters) if (!firsts.has(p.cat)) firsts.set(p.cat, [`/convert/${p.slug}/`, p.label, `seo.foot.cv.${p.slug}`]);
  // not indexed: the apps' columns link File convert itself already
  cols.push(col('Converters', [...firsts.values(), ...(index ? [['/convert/', 'All conversions', 'footer.all_conversions']] : [])].map(([h, t, k]) => [route(h), t, k]), 'footer.converters', word));
  const order = new Map(pages.map((a, i) => [a.id, i]));
  const starts = guides.filter((g) => g.slug === 'getting-started' && order.has(g.app)).sort((x, y) => order.get(x.app) - order.get(y.app)).slice(0, GUIDE_PICKS);
  const path = (g) => pages.find((a) => a.id === g.app).path;
  cols.push(col('Guides & help', index ? [['/how-it-works/', 'How it works', 'footer.how'], ['/all-tools/', 'All tools', 'footer.all_tools'],
    ...starts.map((g) => [`/${path(g)}${g.slug}/`, g.h1, `seo.foot.guide.${g.app}.${g.slug}`]), ['/settings/', 'Settings and privacy', 'footer.settings_link'], ['/sitemap.xml', 'Sitemap', 'footer.sitemap']]
    : [['/how-it-works/', 'How it works', 'footer.how'], ['/settings/', 'Settings and privacy', 'footer.settings_link']], 'footer.guides', word));
  if (parent) cols.push(col(parent.name, [[parent.url, 'More free tools →', 'parent.more_tools']], '', word));
  const fold = `<script>(function(){var m=matchMedia('${PHONE}'),s=function(){document.querySelectorAll('.fnav details').forEach(function(d){d.open=!m.matches})};s();m.addEventListener('change',s)})()</script>`;
  return `<nav class="fnav" aria-label="${esc(word('footer.site_map', 'Site map'))}" data-i18n-attr="aria-label:footer.site_map"><div class="fn-grid">${cols.join('')}</div></nav>${fold}`;
}

const cached = new Map();
export function footNav(L = context(ROOT_LANG)) {
  if (cached.has(L.code)) return cached.get(L.code);
  const win = registryWindow(), en = L.code === 'en', labels = en ? null : appTable('convert', L.code);
  const converters = en ? CONVERTERS : CONVERTERS.map((p) => ({ slug: p.slug, cat: p.cat, label: labels.get(cardKey(p)) || p.label }));
  // the parent link's words are in shared/parent/i18n (en and sv; another language reads English)
  const own = (key, text) => (key.startsWith('parent.') ? appTable('shared/parent', L.code).get(key) || appTable('shared/parent', 'en').get(key) || text : null);
  const word = (key, text) => (!key || key.startsWith('seo.foot.') ? text : own(key, text) ?? (en ? text : L.chrome(key, text)));
  const parent = win.SLOP_PARENT || null, route = (h) => (parent && hiddenApp(h.slice(1)) ? parent.url + h : h);
  const html = buildFootNav({ apps: win.SLOP_APPS, groups: win.SLOP_GROUP_LABELS || {}, plainNames: win.SLOP_NAMING === 'plain', roundups: roundupsIn(L.code).filter((r) => win.SLOP_APPS.some((a) => a.id === r.app)), guides: guidesIn(L.code), converters, word, index: INDEX, parent, route });
  cached.set(L.code, html);
  return html;
}
/** [key, text] of the links with a runtime key (seo.foot.*) in a footer block. */
export const footWords = (html) => [...html.matchAll(/data-i18n="(seo\.foot\.[^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')]);
export const footNavLinks = (html) => [...(/<nav class="fnav"[\s\S]*?<\/nav>/.exec(html) || [''])[0].matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

/** The converter pages (convert/js/core/pages.js), as repo paths. */
export const converterFiles = () => CONVERTERS.map((p) => `convert/${p.slug}/index.html`);
/** A converter page gets the footer in its own frame: a <footer class="cv-foot"> before the shell script. */
export function addFootSlot(html) {
  if (html.includes('<!-- site:footnav -->')) return html;
  const at = html.indexOf('<script src="../../shell/shell.js"></script>');
  if (at < 0) throw new Error('converter page without its shell script: cannot place the footer');
  return `${html.slice(0, at)}<footer class="cv-wrap cv-foot"><!-- site:footnav --><!-- /site:footnav --></footer>\n  ${html.slice(at)}`;
}
