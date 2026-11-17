// Round-up pages (tools/seo/roundups.mjs, copy in shared/seo/roundups/): the checks that keep them fair and sourced,
// the page (disclosure, criteria, table, sources, trademark note) and the JSON-LD.
// Covers: shared/seo/install-copy.mjs, tools/seo/guide.mjs, tools/seo/roundups.mjs, shared/seo/roundups/index.mjs, shared/seo/roundups/creative.mjs,
// Covers: shared/seo/roundups/compare.mjs
//   shared/seo/roundups/creative-2.mjs, shared/seo/roundups/creative-3.mjs, shared/seo/roundups/creative-4.mjs, shared/seo/roundups/documents.mjs,
//   shared/seo/roundups/documents-2.mjs, shared/seo/roundups/documents-3.mjs, shared/seo/roundups/documents-4.mjs, shared/seo/roundups/business.mjs,
//   shared/seo/roundups/business-2.mjs, shared/seo/roundups/business-3.mjs
//   shared/seo/roundups/recorder.mjs
// Covers: shared/seo/roundups/colors.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const R = await import(pathToFileURL(path.join(ROOT, 'tools/seo/roundups.mjs')).href);
const { ROUNDUPS } = await import(pathToFileURL(path.join(ROOT, 'shared/seo/roundups/index.mjs')).href);
const { loadRegistry, SITE } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/site.mjs')).href);
const apps = await loadRegistry();
const { context, ROOT_LANG } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/lang.mjs')).href);
const EN = context('en');   // the templates' English words: these checks read them (the root language may be another)
const { FACTS } = await import(pathToFileURL(path.join(ROOT, 'tests/brand-facts.mjs')).href);
const INDEXED = { skip: !FACTS.seoIndex && 'the site is not indexed (seo.index): no generated pages or sitemaps (tests/seo/robots.test.mjs)' };
const tool = (name, extra = {}) => ({ name, url: `https://${name.toLowerCase()}.example/`, bestFor: 'x', pros: ['a'], cons: ['b'], cells: ['Free', 'Yes'],
  sources: [{ label: `${name} pricing`, url: `https://${name.toLowerCase()}.example/pricing` }], ...extra });
const good = { slug: 'free-pdf-editors', app: 'pdf', checked: '2026-10-24', title: 't', description: 'd', h1: 'Best free PDF editors', lead: 'l',
  criteria: ['Free to use', 'Privacy', 'Features'], columns: ['Price', 'Works offline'],
  tools: [{ ...tool('Slop PDF'), ours: true, sources: undefined, url: undefined }, tool('Alpha'), tool('Beta')],
  faq: [['Q1?', 'A'], ['Q2?', 'A'], ['Q3?', 'A']] };

test('checks: a date the facts were checked, exactly one tool of ours, a con for every tool, sources for the others', () => {
  assert.doesNotThrow(() => R.checkRoundup(good, apps));
  assert.throws(() => R.checkRoundup({ ...good, checked: 'October' }, apps), /checked/);
  assert.throws(() => R.checkRoundup({ ...good, tools: good.tools.map((t) => ({ ...t, ours: false })) }, apps), /exactly one/);
  assert.throws(() => R.checkRoundup({ ...good, tools: [good.tools[0], { ...tool('Alpha'), sources: [] }, tool('Beta')] }, apps), /sources/);
  assert.throws(() => R.checkRoundup({ ...good, tools: [good.tools[0], { ...tool('Alpha'), cons: [] }, tool('Beta')] }, apps), /con/);
  assert.throws(() => R.checkRoundup({ ...good, tools: [good.tools[0], { ...tool('Alpha'), cells: ['Free'] }, tool('Beta')] }, apps), /one cell per column/);
  assert.throws(() => R.checkRoundup({ ...good, app: 'nope' }, apps), /no app/);
});

test('the page says which tool is ours, how they were compared, and links each source', () => {
  const [p] = R.roundupPages(apps, SITE, [good], {}, EN);
  assert.equal(p.dir, 'best/free-pdf-editors/');
  assert.match(p.html, /We make Slop PDF, one of the tools on this page/);
  assert.match(p.html, /<h2 id="how-we-compared-them">How we compared them<\/h2>/);
  assert.match(p.html, /<a href="https:\/\/alpha\.example\/pricing" rel="noopener nofollow">Alpha pricing<\/a>/);
  assert.match(p.html, /<a class="btn" href="\/pdf\/">Open Slop PDF<\/a>/);
  assert.match(p.html, /trademarks of their owners/);
  assert.match(p.html, /class="l-wrap"/);   // the site's page frame
});

test('JSON-LD: the article with its date, the list in order, the breadcrumb and the questions', () => {
  const ld = R.roundupJsonLd(good, `${SITE}/best/free-pdf-editors/`, SITE, EN), t = (k) => ld.find((x) => x['@type'] === k);
  assert.equal(t('Article').dateModified, '2026-10-24');
  assert.deepEqual(t('ItemList').itemListElement.map((i) => i.name), ['Slop PDF', 'Alpha', 'Beta']);
  assert.equal(t('ItemList').itemListElement[0].url, `${SITE}/apps/pdf/`);
  assert.equal(t('FAQPage').mainEntity.length, 3);
});

test('every round-up in the copy passes the checks, and the index lists them all', () => {
  for (const r of ROUNDUPS) assert.doesNotThrow(() => R.checkRoundup(r, apps), r.slug);
  const idx = R.roundupIndex(SITE, ROUNDUPS, EN);
  for (const r of ROUNDUPS) assert.ok(idx.html.includes(`href="/best/${r.slug}/"`));
});

test('the feature matrix: one value per tool, shown with marks, and the same tables on the app landing page', async () => {
  const m = (feature, values) => ({ feature, values });
  const withMatrix = { ...good, matrix: [m('Merge', ['yes', 'yes', 'no']), m('Sign', ['yes', 'partial', 'unknown']), m('OCR', ['no', 'yes', 'yes']),
    m('Offline', ['yes', 'no', 'no']), m('Free limit', ['None', '2 a day', 'unknown'])] };
  assert.doesNotThrow(() => R.checkRoundup(withMatrix, apps));
  assert.throws(() => R.checkRoundup({ ...withMatrix, matrix: withMatrix.matrix.slice(0, 3) }, apps), /at least 5/);
  assert.throws(() => R.checkRoundup({ ...withMatrix, matrix: [m('X', ['yes'])].concat(withMatrix.matrix) }, apps), /one value per tool/);
  const html = R.compareTables(withMatrix, EN);
  assert.match(html, /<td class="m-yes"><span aria-hidden="true">✓<\/span> Yes<\/td>/);
  assert.match(html, /<td class="m-partial">/);
  assert.match(html, /<td>2 a day<\/td>/);
  assert.match(html, /<tr class="us"><th scope="row">Slop PDF <span class="l-badge">ours<\/span>/);
  const L = await import(pathToFileURL(path.join(ROOT, 'tools/seo/landing.mjs')).href);
  const page = L.landingPages(apps, SITE, new Proxy({}, { get: () => ({ title: 't', description: 'd' }) }), [], [withMatrix], [], EN).find((p) => p.key === 'pdf');
  const name = apps.find((a) => a.id === 'pdf').name;   // the heading and its id follow the app's name (this site: Slop PDF)
  assert.ok(page.html.includes(`<h2 id="how-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-compares">How ${name} compares</h2>`), page.html.slice(0, 400));
  assert.ok(page.html.includes(R.compareTables(withMatrix, EN)));
  assert.match(page.html, /href="\/best\/free-pdf-editors\/"/);
});

test('the guide: a sidebar of the app\'s pages on its landing, task and comparison pages, with this page marked and its sections listed', async () => {
  const G = await import(pathToFileURL(path.join(ROOT, 'tools/seo/guide.mjs')).href);
  const pdf = apps.find((a) => a.id === 'pdf');
  const nav = G.appNav(pdf, { tasks: [{ slug: 'sign-pdf', h1: 'Sign a PDF', crumb: 'Sign a PDF' }], roundups: [good] }, '/pdf/sign-pdf/', EN);
  assert.match(nav, /<a href="\/pdf\/sign-pdf\/" aria-current="page">Sign a PDF<\/a>/);
  assert.match(nav, /<a href="\/best\/free-pdf-editors\/">Best free PDF editors<\/a>/);
  // Slop PDF has a tutorial in the registry; a build without media has none
  if (FACTS.media) assert.match(nav, /Video tutorial/); else assert.doesNotMatch(nav, /Video tutorial|youtube/);
  assert.match(nav, /<a class="btn l-side-open" href="\/pdf\/">Open Slop PDF<\/a>/);
  const { body, toc } = G.withToc('<h2>One</h2><p>x</p><h2 id="keep">Two</h2><h2>One</h2>');
  assert.deepEqual(toc.map((t) => t.id), ['one', 'keep', 'one-2']);
  assert.match(body, /<h2 id="one">One<\/h2>/);
  assert.match(G.docsLayout(nav, toc, body, EN), /<p class="l-side-h">On this page<\/p>/);
  assert.doesNotMatch(G.docsLayout(nav, toc.slice(0, 2), body, EN), /On this page/);   // short pages need no list
});

test('our app is first in every round-up, and every feature row moved with it', async () => {
  const { ROUNDUPS: all, oursFirst } = await import(pathToFileURL(path.join(ROOT, 'shared/seo/roundups/index.mjs')).href);
  for (const r of all) assert.ok(r.tools[0].ours, `${r.slug}: ${r.tools[0].name} is first`);
  // the move keeps each tool's values with it: our column stays ours, the others keep their order
  const r = { tools: [{ name: 'A' }, { name: 'B' }, { name: 'Us', ours: true }, { name: 'C' }], matrix: [{ feature: 'f', values: ['a', 'b', 'us', 'c'] }] };
  const o = oursFirst(r);
  assert.deepEqual(o.tools.map((t) => t.name), ['Us', 'A', 'B', 'C']);
  assert.deepEqual(o.matrix[0].values, ['us', 'a', 'b', 'c']);
  assert.equal(oursFirst(o), o);   // already first: unchanged
});

test('the install facts are stated once and every app landing page shows how to install it', INDEXED, async () => {
  const { INSTALL: EN_INSTALL, installIn } = await import(pathToFileURL(path.join(ROOT, 'shared/seo/install-copy.mjs')).href);
  for (const k of ['short', 'pro', 'con', 'how']) assert.ok(typeof EN_INSTALL[k] === 'string' && EN_INSTALL[k].length > 10, k);
  const INSTALL = installIn(ROOT_LANG);   // the root pages are in the root language
  const { readFileSync, readdirSync } = await import('node:fs');
  for (const d of readdirSync(path.join(ROOT, 'apps'))) {
    const html = readFileSync(path.join(ROOT, 'apps', d, 'index.html'), 'utf8');
    assert.ok(html.includes(INSTALL.how.slice(0, 40).replace(/&/g, '&amp;')), `apps/${d}: the install note`);
  }
});
