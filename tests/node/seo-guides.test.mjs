// Guides (tools/seo/guides.mjs, copy in shared/seo/guides/): the checks, the page in the guide layout, the JSON-LD.
// Covers: tools/seo/guides.mjs, shared/seo/guides/index.mjs, shared/seo/guides/creative.mjs, shared/seo/guides/documents.mjs,
// Covers: shared/seo/guides/compare.mjs
//   shared/seo/guides/creative-2.mjs, shared/seo/guides/creative-3.mjs, shared/seo/guides/creative-4.mjs,
//   shared/seo/guides/documents-2.mjs, shared/seo/guides/documents-3.mjs, shared/seo/guides/documents-4.mjs,
//   shared/seo/guides/business.mjs, shared/seo/guides/everyday.mjs
//   shared/seo/guides/recorder.mjs
// Covers: shared/seo/guides/colors.mjs
// Covers: shared/seo/guides/fontcreator.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = await import(pathToFileURL(path.join(ROOT, 'tools/seo/guides.mjs')).href);
const { GUIDES } = await import(pathToFileURL(path.join(ROOT, 'shared/seo/guides/index.mjs')).href);
const { loadRegistry, SITE } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/site.mjs')).href);
const apps = await loadRegistry(), app = (id) => apps.find((a) => a.id === id);
const { context, ROOT_LANG } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/lang.mjs')).href);
const EN = context('en');   // the templates' English words: these checks read them (the root language may be another)
const { FACTS } = await import(pathToFileURL(path.join(ROOT, 'tests/brand-facts.mjs')).href);
const good = { app: 'photoslop', slug: 'getting-started', crumb: 'Getting started', title: 't', description: 'd', h1: 'Getting started with PhotoSlop', lead: 'l',
  sections: [{ h2: 'Open a picture', steps: ['Drop it', 'Look'] }, { h2: 'Layers', text: ['Each layer…'], image: { src: '/assets/shots/photoslop.jpg', alt: 'The Layers panel' } },
    { h2: 'Save', text: ['Export.'], tip: 'Ctrl+S saves.' }], shortcuts: [['Ctrl+Z', 'Undo']] };

test('checks: at least 3 sections with text or steps, images under /assets/ with alt text, shortcut pairs', () => {
  assert.doesNotThrow(() => G.checkGuide(good, app('photoslop')));
  assert.throws(() => G.checkGuide({ ...good, sections: good.sections.slice(0, 2) }, app('photoslop')), /3 sections/);
  assert.throws(() => G.checkGuide({ ...good, sections: [...good.sections, { h2: 'Empty' }] }, app('photoslop')), /text or steps/);
  assert.throws(() => G.checkGuide({ ...good, sections: [...good.sections, { h2: 'Pic', text: ['x'], image: { src: 'https://x.example/a.png', alt: 'a' } }] }, app('photoslop')), /under \/assets\//);
  assert.throws(() => G.checkGuide({ ...good, shortcuts: [['Ctrl+Z']] }, app('photoslop')), /pairs/);
});

test('a guide page: the guide sidebar with it marked, its sections listed, the video, the steps and the shortcuts', () => {
  const [p] = G.guidePages(apps, SITE, [good], {}, EN);
  assert.equal(p.dir, 'photoslop/getting-started/');
  assert.match(p.html, /<a href="\/photoslop\/getting-started\/" aria-current="page">Getting started<\/a>/);
  assert.match(p.html, /On this page/);
  // PhotoSlop's tutorial video; a build without media has none
  if (FACTS.media) assert.match(p.html, /yt-sasXp4d8rtg\.jpg/); else assert.doesNotMatch(p.html, /yt-[\w-]+\.jpg|youtube/);
  assert.match(p.html, /<ol><li>Drop it<\/li><li>Look<\/li><\/ol>/);
  assert.match(p.html, /<td><code>Ctrl\+Z<\/code><\/td><td>Undo<\/td>/);
  const ld = G.guideJsonLd(good, app('photoslop'), `${SITE}/photoslop/getting-started/`, SITE, EN);
  assert.deepEqual(ld.map((x) => x['@type']), ['TechArticle', 'BreadcrumbList'].concat(FACTS.media ? ['VideoObject'] : []));
});

test('every guide in the copy passes the checks', () => {
  for (const g of GUIDES) assert.doesNotThrow(() => G.checkGuide(g, app(g.app)), `${g.app}/${g.slug}`);
});
