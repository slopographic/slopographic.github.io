// The site footer navigation (tools/seo/footnav.mjs, shared/footnav/footnav.css): every link reaches a page of the repo,
// the homepage footer links every round-up and the compare hub, the lists come from the shared data (a new round-up,
// converter category or app is a new link), and the block is on the homepage, every content page and every converter
// page, but not on the app pages (they have their own chrome).
// Covers: tools/seo/footnav.mjs, tools/seo/site.mjs, tools/seo/landing.mjs, tools/seo/write.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildFootNav, footNav, footNavLinks, converterFiles, addFootSlot, GUIDE_PICKS } from '../../tools/seo/footnav.mjs';
import { registryWindow, isPage, ROOT, SITE } from '../../tools/seo/site.mjs';
import { siteFoot } from '../../tools/seo/landing.mjs';
import { ROUNDUPS, roundupsIn } from '../../shared/seo/roundups/index.mjs';
import { context, ROOT_LANG } from '../../tools/seo/lang.mjs';
import { GUIDES } from '../../shared/seo/guides/index.mjs';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';
import { FACTS } from '../brand-facts.mjs';

const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const win = registryWindow(), apps = win.SLOP_APPS, groups = win.SLOP_GROUP_LABELS;
const data = { apps, groups, roundups: ROUNDUPS, guides: GUIDES, converters: CONVERTERS };
const nav = footNav(), links = footNavLinks(nav);
// The root language's words (a build can have another root language than English): its round-ups and group headings.
const R = context(ROOT_LANG), rootRoundups = roundupsIn(ROOT_LANG);
const groupLabel = (key, label) => (ROOT_LANG === 'en' || win.SLOP_NAMING !== 'plain' ? label : R.chrome(`footer.group_${key}`, label));
// a site that is not indexed (FACTS.seoIndex) has no sitemap and no generated pages: its footer links the apps themselves
const sitemap = new Set(FACTS.seoIndex ? [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : []);
const INDEXED = { skip: !FACTS.seoIndex && 'the site is not indexed (seo.index): no generated pages to link' };
const fileOf = (href) => (href.endsWith('/') ? `${href.slice(1)}index.html` : href.slice(1));

test('every footer link is a page of the repo, and every page link but Settings is in the sitemap', () => {
  assert.ok(links.length > (FACTS.seoIndex ? 100 : 20), `${links.length} links`);
  for (const href of links) {
    if (win.SLOP_PARENT && href.startsWith(win.SLOP_PARENT.url)) continue;   // a single-app site's suite (shared/parent)
    assert.match(href, /^\/[\w./-]*$/, `${href}: a site path`);
    assert.ok(existsSync(path.join(ROOT, fileOf(href))), `${href}: no file ${fileOf(href)}`);
    if (FACTS.seoIndex && href.endsWith('/') && href !== '/settings/') assert.ok(sitemap.has(SITE + href), `${href}: not in sitemap.xml`);
  }
  assert.equal(new Set(links).size, links.length, 'no link twice');
});

test('the homepage footer has the block, with every round-up, the compare hub and the comparisons index', INDEXED, () => {
  const home = read('index.html'), footer = /<footer class="footer">[\s\S]*?<\/footer>/.exec(home)[0];
  assert.ok(footer.includes(nav), 'index.html carries the current block (run node tools/seo/write.mjs)');
  const homeLinks = footNavLinks(footer);
  for (const r of ROUNDUPS) assert.ok(homeLinks.includes(`/best/${r.slug}/`), `${r.slug} is not linked`);
  for (const r of rootRoundups) assert.ok(footer.includes(`>${(r.crumb || r.h1).replace(/&/g, '&amp;')}</a>`), `${r.slug}: its title`);
  assert.ok(homeLinks.includes('/compare/') && homeLinks.includes('/best/') && homeLinks.includes('/convert/') && homeLinks.includes('/how-it-works/') && homeLinks.includes('/sitemap.xml'));
  assert.ok(home.includes('href="shared/footnav/footnav.css"'), 'the homepage loads the footer styles');
});

test('the lists come from the shared data: every app page, one converter per category, the first getting-started guides', () => {
  for (const a of apps.filter(isPage)) assert.ok(links.includes(FACTS.seoIndex ? `/apps/${a.id}/` : `/${a.path}`), `${a.id}: no link to its landing page (or, not indexed, to the app)`);
  for (const [k, g] of Object.entries(groups)) assert.ok(new RegExp(`<summary><span[^>]*>${groupLabel(k, g)}</span>`).test(nav), `group ${g}: no column`);   // a plain-name build adds data-i18n
  const cats = new Set(CONVERTERS.map((p) => p.cat));
  assert.equal(links.filter((h) => /^\/convert\/[^/]+\/$/.test(h)).length, cats.size);
  assert.equal(links.filter((h) => h.endsWith('/getting-started/')).length, FACTS.seoIndex ? GUIDE_PICKS : 0);
});

test('adding a round-up, a converter category or an app adds a footer link', () => {
  const r = { ...ROUNDUPS[0], slug: 'free-test-tools', crumb: 'Free test tools' };
  assert.ok(buildFootNav({ ...data, roundups: [...ROUNDUPS, r] }).includes('<a href="/best/free-test-tools/" data-i18n="seo.foot.best.free-test-tools">Free test tools</a>'));
  const c = { ...CONVERTERS[0], slug: 'abc-to-xyz', label: 'ABC to XYZ', cat: 'Test files' };
  assert.ok(buildFootNav({ ...data, converters: [...CONVERTERS, c] }).includes('<a href="/convert/abc-to-xyz/" data-i18n="seo.foot.cv.abc-to-xyz">ABC to XYZ</a>'));
  const a = { ...apps.find(isPage), id: 'newapp', name: 'New App', path: 'newapp/' };
  assert.ok(buildFootNav({ ...data, apps: [...apps, a] }).includes('<a href="/apps/newapp/">New App</a>'));
  assert.ok(!buildFootNav({ ...data, roundups: [] }).includes('/best/free-'), 'no round-ups, no round-up links');
});

test('the content pages, the hand-made pages with markers and every converter page carry the block', () => {
  assert.ok(siteFoot().includes(nav));
  const content = !FACTS.seoIndex ? ['how-it-works/index.html'] : ['apps/pdf/index.html', 'compare/index.html', 'best/index.html', `best/${ROUNDUPS[0].slug}/index.html`, 'all-tools/index.html',
    'how-it-works/index.html', 'photoslop/getting-started/index.html'];
  for (const f of content) assert.ok(read(f).includes(nav), `${f}: no footer navigation`);
  for (const f of converterFiles()) {
    const html = read(f);
    assert.ok(html.includes(nav) && html.includes('<footer class="cv-wrap cv-foot">'), `${f}: no footer navigation`);
    assert.equal(addFootSlot(html), html, `${f}: the slot is added once`);
  }
  assert.match(read('convert/css/convert.css'), /@import url\("\.\.\/\.\.\/shared\/footnav\/footnav\.css"\)/);
});

test('the app pages do not get it: they have their own chrome', () => {
  for (const a of apps.filter(isPage)) {
    if (a.path === 'convert/') continue;   // the converter hub is the app; its pair pages carry the footer
    assert.ok(!read(`${a.path}index.html`).includes('class="fnav"'), `${a.path}: an app page with the footer navigation`);
  }
});

test('the columns fold on phones and every link shows without JavaScript', () => {
  assert.ok(!/<details(?![^>]*\sopen)[^>]*>/.test(nav), 'every column is open in the HTML');
  assert.match(nav, /matchMedia\('\(max-width: 640px\)'\)/);
  assert.match(read('shared/footnav/footnav.css'), /@media \(max-width: 640px\)/);
  // the parent site's link (a single-app site) has its words in shared/parent/i18n, the round-ups', guides' and converters'
  // the app words (shared/i18n/apps/en.js, tools/seo/apptables.mjs)
  const home = (k) => (k.startsWith('parent.') ? 'shared/parent/i18n/en/parent.js' : k.startsWith('seo.foot.') ? 'shared/i18n/apps/en.js' : 'shared/i18n/strings.js');
  for (const k of [...nav.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1])) assert.ok(read(home(k)).includes(`'${k}'`), `${k}: no English string`);
});
