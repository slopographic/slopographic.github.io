// The static SEO pages in every published language, as they are on disk (shared/seo/HANDOFF.md, "Languages"): the root
// language (the profile's defaultLang, from the brand facts) at the site root and every other one in its folder, each
// page with its language on <html>, its own canonical, every language as an alternate plus x-default, and its title
// from that language's table; the sitemaps list them; a page in another language than English has no English body.
// Runs in every build: in a white-label build whose defaultLang is Swedish, the root pages are the Swedish ones.
// Covers: tools/seo/write.mjs, tools/seo/build-lang.mjs, tools/seo/copies.mjs, tools/seo/sitemap.mjs, tools/seo/chrome.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, loadRegistry, isPage } from '../../tools/seo/site.mjs';
import { published, prefixOf, context, ROOT_LANG, LANGS } from '../../tools/seo/lang.mjs';
import { escAttr } from '../../tools/seo/head.mjs';
import { sitemapName } from '../../tools/seo/sitemap.mjs';
import { landingIn } from '../../shared/seo/copy.mjs';
import { tasksIn } from '../../shared/seo/tasks/index.mjs';
import { roundupsIn } from '../../shared/seo/roundups/index.mjs';
import { guidesIn } from '../../shared/seo/guides/index.mjs';
import { FACTS } from '../brand-facts.mjs';
import { canonicalFor, mainApp } from '../../tools/seo/robots.mjs';

const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const codes = published(), apps = (await loadRegistry()).filter(isPage);
const fileOf = (code, dir) => path.posix.join(prefixOf(code).slice(1), dir, 'index.html');
const urlOf = (code, dir) => `${SITE}${prefixOf(code)}/${dir}`;
// the canonical and the alternates as the profile names them (robots.mjs; on this site a page's own address)
const canon = (code, dir) => canonicalFor(urlOf(code, dir)), alt = (code, dir) => (canon(code, dir).startsWith(SITE + '/') ? canon(code, dir) : urlOf(code, dir));
const INDEXED = { skip: !FACTS.seoIndex && 'the site is not indexed (seo.index): no generated pages, language folders or sitemaps' };
const get = (h, re) => (h.match(re) || [])[1];
const titleOf = (h) => get(h, /<title>([^<]*)<\/title>/);
const alternatesOf = (h) => [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
const dirOf = (code) => (LANGS.find((l) => l.code === code) || {}).dir;

/** A sample of every kind of page: [dir, title of the page in a language or null when the title is the app page's]. */
function samples(code) {
  const appOf = (id) => apps.find((a) => a.id === id), shown = (x) => appOf(x.app);   // the profile's apps (apps.hide)
  const t = tasksIn(code).find(shown), r = roundupsIn(code).find(shown), g = guidesIn(code).find(shown), L = landingIn(code);
  return [['compare/', L.compare.title], ['best/', L.best.title], ['all-tools/', L['all-tools'].title], [`apps/${apps[0].id}/`, L[apps[0].id].title],
    [`${appOf(t.app).path}${t.slug}/`, t.title], [`best/${r.slug}/`, r.title], [`${appOf(g.app).path}${g.slug}/`, g.title], [apps[0].path, null], ...(mainApp() ? [] : [['', null]])];   // a single-app site's root: tests/seo/robots-site.test.mjs
}

test('the root language is the profile\'s defaultLang, and it is published', () => {
  assert.equal(ROOT_LANG, FACTS.defaultLang);
  assert.equal(codes[0], ROOT_LANG);
  assert.equal(prefixOf(ROOT_LANG), '');
});

test('every published language has every kind of page, in its language, with its own canonical and every alternate', INDEXED, () => {
  for (const code of codes) {
    for (const [dir, title] of samples(code)) {
      const f = fileOf(code, dir);
      assert.ok(existsSync(path.join(ROOT, f)), `${code}: ${f} is missing (node tools/seo/write.mjs --all)`);
      const h = read(f);
      assert.equal(get(h, /<html[^>]*\slang="([^"]+)"/), code, `${f}: <html lang>`);
      if (dirOf(code) === 'rtl') assert.match(h, /<html[^>]*\sdir="rtl"/, `${f}: right to left`);
      assert.equal(get(h, /<link rel="canonical" href="([^"]+)">/), canon(code, dir), `${f}: canonical`);
      if (title) assert.equal(titleOf(h), escAttr(title), `${f}: the title of its language`);
      if (codes.length > 1) {
        assert.deepEqual(alternatesOf(h), [...codes.map((c) => [c, alt(c, dir)]), ['x-default', alt(ROOT_LANG, dir)]], `${f}: alternates`);
      }
    }
  }
});

test('a generated page carries its language for the switcher, and links stay in its language', INDEXED, () => {
  for (const code of codes) {
    const h = read(fileOf(code, 'compare/'));
    assert.match(h, new RegExp(`<html[^>]*data-lang-page="${code}"`));
    const p = prefixOf(code);
    assert.ok(h.includes(`href="${p}/apps/${apps[0].id}/"`), `${code}: a link to a landing page in the same language`);
    assert.ok(h.includes('href="/settings/"'), `${code}: a page with no copy in the language keeps its one address`);
    if (code !== ROOT_LANG) {
      const copy = read(fileOf(code, apps[0].path));
      assert.ok(copy.includes(`<base href="${'../'.repeat(1 + apps[0].path.split('/').filter(Boolean).length)}${apps[0].path}">`), `${code}: the app copy loads the app from its own folder`);
      assert.match(copy, new RegExp(`data-lang-page="${code}"`));
    }
  }
});

test('the sitemaps: one per language, all in the index, each listing its pages', INDEXED, () => {
  const index = read('sitemap-index.xml');
  for (const code of codes) {
    assert.ok(index.includes(`<loc>${SITE}/${sitemapName(code)}</loc>`), `${code}: in the sitemap index`);
    const map = read(sitemapName(code));
    for (const [dir] of samples(code)) if (canon(code, dir) === urlOf(code, dir)) assert.ok(map.includes(`<loc>${urlOf(code, dir)}</loc>`), `${sitemapName(code)}: ${dir}`);
  }
  assert.match(read('robots.txt'), new RegExp(`^Sitemap: ${SITE}/sitemap-index\\.xml$`, 'm'));
});

// A sample check that a page in another language is not English underneath: English's commonest words, which the other
// languages do not use, are rare in its main text (an English page has about one word in six of them).
const ENGLISH = /\b(the|and|your|with|this|which|from|you)\b/gi;
test('a page in another language than English has no English body (sample)', INDEXED, () => {
  for (const code of codes.filter((c) => c !== 'en')) {
    const R = roundupsIn(code), T = tasksIn(code), G = guidesIn(code);
    const dirs = ['compare/', 'best/', 'all-tools/', ...apps.slice(0, 8).map((a) => `apps/${a.id}/`), ...R.slice(0, 6).map((r) => `best/${r.slug}/`),
      ...T.slice(0, 12).map((t) => `${apps.find((a) => a.id === t.app).path}${t.slug}/`), ...G.slice(0, 6).map((g) => `${apps.find((a) => a.id === g.app).path}${g.slug}/`)];
    for (const dir of dirs) {
      const main = (/<main[\s\S]*?<\/main>/.exec(read(fileOf(code, dir))) || [''])[0].replace(/<[^>]+>/g, ' ');
      const words = main.match(/[\p{L}]+/gu) || [], english = main.match(ENGLISH) || [];
      assert.ok(words.length > 50, `${code} ${dir}: a page with text`);
      assert.ok(english.length / words.length < 0.05, `${code} ${dir}: ${english.length} of ${words.length} words are English (${[...new Set(english)].join(', ')})`);
    }
  }
});

test('the context words: a plural and the templates\' words fall back to English, never to a key', () => {
  for (const code of codes) {
    const L = context(code);
    assert.ok(!/^seo\./.test(L.t('seo.ui.video.minutes', { n: 1 })) && !/^seo\./.test(L.t('seo.ui.video.minutes', { n: 7 })));
    assert.match(L.t('seo.ui.video.minutes', { n: 7 }), /7/);
  }
});
