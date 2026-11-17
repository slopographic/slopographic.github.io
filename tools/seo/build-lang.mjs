// Every page of one language (tools/seo/write.mjs): the generated pages (landing, task, guide, round-up, hub pages) in
// that language, and the head block of the hand-made ones. In the root language the hand-made pages are the files
// themselves (each app page, the homepage, the converter pages); in another language they are copies in its folder
// (copies.mjs). The about pages and How it works are templates whose words are in the tables (template.mjs): written in
// every language, the root one at the page's folder, the others as copies. Every page that exists in more than one
// language lists them all (hreflang).
//   buildLang(code, codes, { apps, date, paths }) -> { files: [{ file, html, before }], urls: [url] }
//   pagePaths(apps, code) -> Set of the page paths ('/compare/', '/pdf/') a published language has
// A site that is not indexed (site.mjs INDEX false) gets none of the generated pages; a single-app site (MAIN_APP) gets
// its app's page at the root (mainapp.mjs) instead of the homepage; a hidden app's pages (apps.hide) are left alone.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, INDEX, registryWindow, isPage } from './site.mjs';
import { mainApp, hiddenApp, markHead } from './robots.mjs';
import { mainRoot } from './mainapp.mjs';
import { context, prefixOf, alternates, localizeLinks, ROOT_LANG } from './lang.mjs';
import { headBlock, injectHead, setAlternates, setHtmlLang, validateCopy, imageFor, DEFAULT_IMAGE, OS, AUTHOR } from './head.mjs';
import { landingPages, regWords } from './landing.mjs';
import { taskPages, taskJsonLd, videoJsonLd, hubPage } from './tasks.mjs';
import { roundupPages, roundupJsonLd, roundupIndex } from './roundups.mjs';
import { guidePages, guideJsonLd } from './guides.mjs';
import { addFootSlot, converterFiles } from './footnav.mjs';
import { copyPage, prerender, pageTables, translate, converterPairs } from './copies.mjs';
import { siteChrome } from './chrome.mjs';
import { aboutTemplate, pageTemplate, hasTemplate, renderTemplate } from './template.mjs';
import { appsIn, aboutIn, pagesIn, homeIn, landingIn } from '../../shared/seo/copy.mjs';
import { tasksIn } from '../../shared/seo/tasks/index.mjs';
import { roundupsIn } from '../../shared/seo/roundups/index.mjs';
import { guidesIn } from '../../shared/seo/guides/index.mjs';

const ld = (type, extra) => ({ '@context': 'https://schema.org', '@type': type, ...extra });
const crumbs = (items) => ld('BreadcrumbList', { itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const site = (L) => `${SITE}${L.prefix}`;

/** The SoftwareApplication and BreadcrumbList for an app page. */
export function appJsonLd(app, copy, url, L = context(ROOT_LANG)) {
  const software = ld('SoftwareApplication', { name: app.name, applicationCategory: copy.category, operatingSystem: OS,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: copy.description, url, image: imageFor(app), author: AUTHOR });
  return [software, crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], [app.name, url]])];
}
/** Homepage: Organization, and an ItemList of every app in the registry. */
export function homeJsonLd(apps, L = context(ROOT_LANG)) {
  const org = ld('Organization', { name: 'Slopographic', url: `${SITE}/`, logo: `${SITE}/brand/logo.svg` });
  const list = ld('ItemList', { name: L.t('seo.ui.ld.apps'), numberOfItems: apps.length,
    itemListElement: apps.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name, url: `${site(L)}/${a.path}` })) });
  return [org, list];
}
const webPage = (L, name, description, url, type = 'WebPage') => ld(type, { name, description, url, isPartOf: { '@type': 'WebSite', name: 'Slopographic', url: `${site(L)}/` } });

/** The page paths of a published language, the same in every one: the generated pages, the app pages and their about
 *  pages, the homepage, How it works and the converter pages. */
export function pagePaths(apps, gen) {
  const out = new Set(mainApp() ? [] : ['/']);   // a single-app site's root is the app's page, in the root language only
  for (const a of apps) if (isPage(a)) { out.add('/' + a.path); if (hasTemplate(aboutTemplate(a.id))) out.add(`/${a.path}about/`); }
  for (const slug of Object.keys(pagesIn())) if (hasTemplate(pageTemplate(slug))) out.add(`/${slug}/`);
  for (const f of converterFiles()) out.add('/' + f.replace(/index\.html$/, ''));
  for (const d of gen) out.add('/' + d);
  return out;
}

export async function buildLang(code, codes, { apps, paths }) {
  const L = context(code), root = code === ROOT_LANG, multi = codes.length > 1;
  const fileOf = (dir) => path.join(ROOT, L.prefix.slice(1), dir, 'index.html');
  const urlOf = (dir) => `${site(L)}/${dir}`;
  const alt = (dir) => (multi ? alternates('/' + dir, codes) : []);
  const hidden = new Set(registryWindow().SLOP_HIDDEN_APPS || []), shown = (x) => !hidden.has(x.app);
  const APPS = appsIn(code), ABOUT = aboutIn(code), LANDING = landingIn(code), PAGES = pagesIn(code), HOME = homeIn(code, root);
  const TASKS = tasksIn(code).filter(shown), ROUNDUPS = roundupsIn(code).filter(shown), GUIDES = guidesIn(code).filter(shown);

  const gen = INDEX ? generated(apps, L, { LANDING, TASKS, ROUNDUPS, GUIDES }) : { landing: [], tasks: [], hub: null, best: [], bestIndex: null, guides: [] };
  const { landing, tasks, hub, best, bestIndex, guides } = gen;
  const aboutApps = apps.filter((a) => isPage(a) && hasTemplate(aboutTemplate(a.id)));
  const entries = [['home', HOME], ...apps.filter(isPage).map((a) => { if (!APPS[a.id]) throw new Error(`${a.id}: no entry in shared/seo/copy.mjs`); return [a.id, APPS[a.id]]; })];
  for (const a of aboutApps) { if (!ABOUT[a.id]) throw new Error(`${a.id}: has about/ but no entry in shared/seo/copy.mjs ABOUT`); entries.push([`${a.id} about`, ABOUT[a.id]]); }
  for (const p of landing) entries.push([`${p.key} landing`, LANDING[p.key]]);
  for (const p of tasks) entries.push([`${p.key} task`, p.task]);
  if (INDEX) entries.push(['all-tools landing', LANDING['all-tools']], ['best landing', LANDING.best]);
  for (const p of best) entries.push([`${p.key} roundup`, p.r]);
  for (const p of guides) entries.push([`${p.key} guide`, p.guide]);
  for (const slug of Object.keys(PAGES)) if (root || slug.startsWith('convert/') || hasTemplate(pageTemplate(slug))) entries.push([`${slug} page`, PAGES[slug]]);
  validateCopy(entries, { code });

  const files = [], urls = [];
  const read = async (f) => (existsSync(f) ? readFile(f, 'utf8') : '');
  const put = async (file, html, url) => { files.push({ file, html, before: await read(file) }); if (url) urls.push(url); };
  const block = (dir, title, description, image, jsonld, viewport = false) => headBlock({ title, description, url: urlOf(dir), image, jsonld, viewport, alternates: alt(dir) });
  const local = (html) => localizeLinks(html, L.prefix, paths);

  // the hand-made pages: the root language's own files, or copies of them (a template page: drawn in the language first)
  const own = async (dir, make, { app, template, vars } = {}) => {
    const src = path.join(ROOT, dir, 'index.html'), source = template ? renderTemplate(template, L, vars) : await readFile(src, 'utf8');
    const outside = source.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, '');
    const head = make(!/<meta[^>]+name=["']viewport["']/i.test(outside));
    if (root) return put(src, siteChrome(setHtmlLang(injectHead(source, head), L), L), urlOf(dir));
    const copy = copyPage(siteChrome(injectHead(source, head), L), { dir, L, paths });
    return put(fileOf(dir), prerender(copy, pageTables(code, app && app.path)), urlOf(dir));
  };
  const main = mainApp();
  if (!main) await own('', (vp) => block('', HOME.title, HOME.description, DEFAULT_IMAGE, homeJsonLd(apps, L), vp));
  for (const app of apps.filter(isPage)) {
    const copy = APPS[app.id], dir = app.path;
    if (!existsSync(path.join(ROOT, dir, 'index.html'))) throw new Error(`${app.id}: no page at ${dir}index.html`);
    await own(dir, (vp) => block(dir, copy.title, copy.description, imageFor(app), appJsonLd(app, copy, urlOf(dir), L), vp), { app });
  }
  if (main && root) await put(path.join(ROOT, 'index.html'), mainRoot(markHead(files.find((f) => f.file === path.join(ROOT, main.path, 'index.html')).html, ''), main), `${SITE}/`);
  for (const app of aboutApps) {
    const dir = `${app.path}about/`, c = ABOUT[app.id];
    const jsonld = [crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], [app.name, urlOf(app.path)], [L.t('seo.ui.crumb.about'), urlOf(dir)]])];
    await own(dir, (vp) => block(dir, c.title, c.description, imageFor(app), jsonld, vp), { template: aboutTemplate(app.id), vars: { app: app.name } });
  }
  for (const [slug, c] of Object.entries(PAGES)) {
    const dir = `${slug}/`, conv = slug.startsWith('convert/'), template = !conv && hasTemplate(pageTemplate(slug)) && pageTemplate(slug);
    if ((!root && !conv && !template) || hiddenApp(dir)) continue;   // a hidden app's page (the converters of a hidden File convert)
    const web = c.category
      ? ld('SoftwareApplication', { name: c.crumb, applicationCategory: c.category, operatingSystem: OS, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: c.description, url: urlOf(dir), author: AUTHOR })
      : webPage(L, c.title, c.description, urlOf(dir));
    const jsonld = [web, crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], [c.crumb, urlOf(dir)]])];
    if (conv) { await convPage(slug.slice(8), (vp) => block(dir, c.title, c.description, DEFAULT_IMAGE, jsonld, vp)); continue; }
    if (template) { await own(dir, (vp) => block(dir, c.title, c.description, DEFAULT_IMAGE, jsonld, vp), { template }); continue; }
    // the typeface page: written by hand in English (its script writes English too), in the root language only
    const file = path.join(ROOT, dir, 'index.html'), source = await read(file);
    const vp = !/<meta[^>]+name=["']viewport["']/i.test(source.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, ''));
    await put(file, siteChrome(injectHead(source, headBlock({ title: c.title, description: c.description, url: urlOf(dir), image: DEFAULT_IMAGE, jsonld, viewport: vp })), L), urlOf(dir));
  }
  // the converter pages that keep their own hand-made head: only the language alternates (and, in a copy, the head block)
  async function convPage(slug, make) {
    const dir = `convert/${slug}/`, src = path.join(ROOT, dir, 'index.html');
    let source = await readFile(src, 'utf8');
    const from = context((/<html[^>]*\slang="([^"]+)"/.exec(source) || [, 'en'])[1]);
    source = siteChrome(addFootSlot(translate(source, converterPairs(slug, from, L))), L);
    const vp = !/<meta[^>]+name=["']viewport["']/i.test(source.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, ''));
    const head = make ? injectHead(source, make(vp)) : setAlternates(source, alt(dir));
    if (root) return put(src, setHtmlLang(head, L), urlOf(dir));
    return put(fileOf(dir), prerender(copyPage(make ? head : injectHead(source, converterHead(slug, L, dir, alt(dir))), { dir, L, paths }), pageTables(code, 'convert/')), urlOf(dir));
  }
  const inPages = new Set(Object.keys(PAGES).filter((s) => s.startsWith('convert/')).map((s) => s.slice(8)));
  for (const f of converterFiles()) { const slug = f.split('/')[1]; if (!inPages.has(slug) && !hiddenApp(f)) await convPage(slug, null); }

  // the generated pages
  for (const p of landing) {
    const c = LANDING[p.key], app = apps.find((a) => a.id === p.key), video = app && videoJsonLd(app, SITE, L);
    const jsonld = [webPage(L, c.title, c.description, urlOf(p.dir)), crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], [p.crumb, urlOf(p.dir)]]), ...(video ? [video] : [])];
    await put(fileOf(p.dir), local(injectHead(p.html, block(p.dir, c.title, c.description, DEFAULT_IMAGE, jsonld))), urlOf(p.dir));
  }
  for (const p of tasks) await put(fileOf(p.dir), local(injectHead(p.html, block(p.dir, p.task.title, p.task.description, imageFor(p.app), taskJsonLd(p.task, p.app, urlOf(p.dir), site(L), L)))), urlOf(p.dir));
  if (hub) { const c = LANDING['all-tools'], jsonld = [webPage(L, c.title, c.description, urlOf(hub.dir), 'CollectionPage'), crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], [L.t('seo.ui.crumb.all_tools'), urlOf(hub.dir)]])];
    await put(fileOf(hub.dir), local(injectHead(hub.html, block(hub.dir, c.title, c.description, DEFAULT_IMAGE, jsonld))), urlOf(hub.dir)); }
  for (const p of guides) await put(fileOf(p.dir), local(injectHead(p.html, block(p.dir, p.guide.title, p.guide.description, imageFor(p.app), guideJsonLd(p.guide, p.app, urlOf(p.dir), site(L), L)))), urlOf(p.dir));
  for (const p of bestIndex ? [...best, { ...bestIndex, r: null }] : []) {
    const c = p.r || LANDING.best;
    const jsonld = p.r ? roundupJsonLd(p.r, urlOf(p.dir), site(L), L) : [ld('CollectionPage', { name: c.title, description: c.description, url: urlOf(p.dir) })];
    await put(fileOf(p.dir), local(injectHead(p.html, block(p.dir, c.title, c.description, DEFAULT_IMAGE, jsonld))), urlOf(p.dir));
  }
  return { files, urls, generated: [...landing, ...tasks, hub, ...guides, ...best, bestIndex].filter(Boolean).map((p) => p.dir) };
}

/** The generated pages of one language: landing, task, hub, round-up and guide pages (a site that is indexed only). */
export function generated(apps, L, { LANDING, TASKS, ROUNDUPS, GUIDES }) {
  return { landing: landingPages(apps, SITE, LANDING, TASKS, ROUNDUPS, GUIDES, L), tasks: taskPages(apps, SITE, TASKS, { ROUNDUPS, GUIDES }, L),
    hub: hubPage(apps, SITE, TASKS, L), best: roundupPages(apps, SITE, ROUNDUPS, { TASKS, GUIDES }, L), bestIndex: roundupIndex(SITE, ROUNDUPS, L),
    guides: guidePages(apps, SITE, GUIDES, { TASKS, ROUNDUPS }, L) };
}

/** A copy's head for a converter page whose root keeps its own hand-made head: the page's copy in the language. */
function converterHead(slug, L, dir, alts) {
  const s = `seo.cv.${slug}`, url = `${site(L)}/${dir}`, title = L.t(`${s}.title`), description = L.t(`${s}.description`);
  const jsonld = [ld('SoftwareApplication', { name: title.replace(/\s*\|.*$/, ''), applicationCategory: 'UtilitiesApplication', operatingSystem: OS, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, url, author: AUTHOR }),
    crumbs([[L.t('seo.ui.crumb.home'), `${site(L)}/`], ['File convert', `${site(L)}/convert/`], [title.replace(/\s*\|.*$/, ''), url]])];
  return headBlock({ title, description, url, image: DEFAULT_IMAGE, jsonld, viewport: false, alternates: alts });
}
export { regWords };
