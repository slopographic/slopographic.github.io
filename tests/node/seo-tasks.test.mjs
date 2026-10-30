// Task pages (tools/seo/tasks.mjs, copy in shared/seo/tasks/): the copy checks, the page body, the JSON-LD, and that
// every task page is written with its head block and listed in the sitemap.
// Covers: tools/seo/tasks.mjs, shared/seo/tasks/index.mjs, shared/seo/tasks/cutout.mjs, shared/seo/tasks/creative.mjs, shared/seo/tasks/creative-2.mjs,
// Covers: shared/seo/tasks/compare.mjs
//   shared/seo/tasks/creative-3.mjs,
//   shared/seo/tasks/documents.mjs, shared/seo/tasks/documents-2.mjs, shared/seo/tasks/documents-3.mjs, shared/seo/tasks/documents-4.mjs, shared/seo/tasks/business.mjs, shared/seo/tasks/business-2.mjs,
//   shared/seo/tasks/business-3.mjs, shared/seo/tasks/everyday.mjs, shared/seo/tasks/everyday-2.mjs, shared/seo/tasks/threed.mjs,
//   shared/seo/tasks/finance.mjs, shared/seo/tasks/raw.mjs
//   shared/seo/tasks/recorder.mjs
// Covers: shared/seo/tasks/colors.mjs
// Covers: shared/seo/tasks/fontcreator.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { checkTask, taskPages, taskJsonLd, videoJsonLd } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/tasks.mjs')).href);
const { TASKS } = await import(pathToFileURL(path.join(ROOT, 'shared/seo/tasks/index.mjs')).href);
const { loadRegistry, SITE } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/site.mjs')).href);
const apps = await loadRegistry();
const app = (id) => apps.find((a) => a.id === id);
const { context, ROOT_LANG } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/lang.mjs')).href);
const EN = context('en');   // the templates' English words: these checks read them (the root language may be another)
const { FACTS } = await import(pathToFileURL(path.join(ROOT, 'tests/brand-facts.mjs')).href);
const INDEXED = { skip: !FACTS.seoIndex && 'the site is not indexed (seo.index): no generated pages or sitemaps (tests/seo/robots.test.mjs)' };
const SHOWN = TASKS.filter((t) => app(t.app));   // the tasks of the apps the profile shows (apps.hide)
const good = { app: 'cutout', slug: 'x-y', h1: 'Do a thing', lead: 'A lead long enough to say what the page is about, in a sentence or two.',
  steps: ['one', 'two', 'three'], faq: [['Q one?', 'An answer that is forty characters or longer, at least.'], ['Q two?', 'An answer that is forty characters or longer, at least.'], ['Q three?', 'An answer that is forty characters or longer, at least.']] };

test('checkTask refuses copy that would make a thin or broken page', () => {
  assert.doesNotThrow(() => checkTask(good, app('cutout')));
  assert.throws(() => checkTask(good, undefined), /no such app/);
  assert.throws(() => checkTask({ ...good, slug: 'Bad Slug' }, app('cutout')), /slug/);
  assert.throws(() => checkTask({ ...good, steps: ['a', 'b'] }, app('cutout')), /3 to 6 steps/);
  assert.throws(() => checkTask({ ...good, faq: good.faq.slice(0, 2) }, app('cutout')), /at least 3 questions/);
  assert.throws(() => checkTask({ ...good, faq: [['No mark', 'An answer that is forty characters or longer, at least.'], ...good.faq] }, app('cutout')), /question mark/);
  // Regression: translated copy uses its own script's question mark and says more per character (zh-CN failed the build)
  const zh = { ...good, faq: [['一次能处理的图片数量有限制吗？', '没有固定上限，取决于设备内存，建议一次处理几十张。'], ...good.faq.slice(1)] };
  assert.doesNotThrow(() => checkTask(zh, app('cutout'), 'zh-CN'));
  assert.throws(() => checkTask(zh, app('cutout'), 'en'), /answer of 40\+/);
  assert.doesNotThrow(() => checkTask({ ...good, faq: [['هل يعمل دون اتصال؟', 'نعم، يعمل كل شيء داخل المتصفح على جهازك دون رفع أي ملف.'], ...good.faq.slice(1)] }, app('cutout'), 'ar'));
  assert.throws(() => checkTask({ ...good, query: 'bg=white;rm' }, app('cutout')), /query/);
});

test('a page has the task, an Open link with the preset, the questions, and links to the other tasks', () => {
  const pages = taskPages(apps, SITE, TASKS, {}, EN), p = pages.find((x) => x.key === 'cutout/white-background');
  assert.equal(p.dir, 'slopisolate/white-background/');
  assert.match(p.html, /<h1>White background for product photos<\/h1>/);
  assert.match(p.html, /href="\/slopisolate\/\?bg=white&amp;format=jpg"/);
  assert.match(p.html, /<h3>Is the background pure white \(#ffffff\)\?<\/h3>/);
  assert.match(p.html, /href="\/slopisolate\/bulk-background-remover\/"/);
  // the app's tutorial thumbnail; a build without media has none
  if (FACTS.media) assert.match(p.html, /yt-jKWTbl2PEIc\.jpg/); else assert.doesNotMatch(p.html, /yt-[\w-]+\.jpg|youtube/);
});

test('JSON-LD: breadcrumb to the app, HowTo steps, FAQ and the tutorial as a VideoObject', () => {
  const t = TASKS.find((x) => x.slug === 'bulk-background-remover'), url = `${SITE}/slopisolate/bulk-background-remover/`;
  const ld = taskJsonLd(t, app('cutout'), url, SITE, EN), type = (k) => ld.find((x) => x['@type'] === k);
  assert.deepEqual(type('BreadcrumbList').itemListElement.map((i) => i.item), [`${SITE}/`, `${SITE}/apps/cutout/`, url]);
  assert.equal(type('HowTo').step.length, t.steps.length);
  assert.equal(type('FAQPage').mainEntity.length, t.faq.length);
  if (FACTS.media) assert.deepEqual([type('VideoObject').uploadDate, type('VideoObject').duration], ['2026-10-14T14:06:15-07:00', 'PT1M41S']);
  else assert.equal(type('VideoObject'), undefined);
  assert.equal(videoJsonLd(app('docs'), SITE), null);
});

test('every task page is on disk with its head block, and in the sitemap', INDEXED, () => {
  const map = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const p of taskPages(apps, SITE, SHOWN)) {
    const file = path.join(ROOT, p.dir, 'index.html');
    assert.ok(existsSync(file), `${p.dir} is written (node tools/seo/write.mjs)`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<!-- seo:start/, p.dir);
    assert.ok(html.includes(`<link rel="canonical" href="${p.url}">`), `${p.dir}: canonical`);
    assert.ok(map.includes(`<loc>${p.url}</loc>`), `${p.dir}: in the sitemap`);
  }
});

test('the All tools hub lists every task page, is in the sitemap, and every landing page links it', INDEXED, async () => {
  const { hubPage } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/tasks.mjs')).href);
  const hub = hubPage(apps, SITE, SHOWN), html = readFileSync(path.join(ROOT, 'all-tools/index.html'), 'utf8');
  assert.equal(hub.count, SHOWN.length);
  for (const p of taskPages(apps, SITE, SHOWN)) assert.ok(html.includes(`href="/${p.dir}"`), `${p.dir} is on the hub`);
  assert.ok(readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes(`<loc>${SITE}/all-tools/</loc>`));
  assert.ok(readFileSync(path.join(ROOT, `apps/${SHOWN[0].app}/index.html`), 'utf8').includes(`<a href="/all-tools/">${context(ROOT_LANG).t('seo.ui.nav.all_tools')}</a>`));
});
