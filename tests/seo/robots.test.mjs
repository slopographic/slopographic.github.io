// Covers: tools/seo/robots.mjs, tools/seo/site.mjs, tools/seo/indexnow.mjs, tools/seo/head.mjs, tools/seo/sitemap.mjs
// What search engines are told (brand/README.md "Search engines"): the canonical of a page (its own address, another
// origin, an override per path, a single-app site's root), the host guard at the top of every page, the static noindex,
// robots.txt, and IndexNow, which a site that is not indexed never pings. The whole writer on a copy of the site with
// other profile markers: tests/seo/robots-site.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalFor, guardScript, markHead, pageMark, robotsTxt, hiddenApp, unLang, NOINDEX, sitePages } from '../../tools/seo/robots.mjs';
import { SITE, INDEX, ROOT } from '../../tools/seo/site.mjs';
import { main as indexNow } from '../../tools/seo/indexnow.mjs';
import { ROOT_LANG } from '../../tools/seo/lang.mjs';

const HOST = new URL(SITE).hostname;
const O = ROOT_LANG === 'sv' ? 'de' : 'sv';   // a language with its own folder (the root language has none)

test('the canonical: the page itself, another origin, an override per path, one page, the language folder kept', () => {
  const none = { override: {}, to: '', main: null };
  assert.equal(canonicalFor(`${SITE}/pdf/`, none), `${SITE}/pdf/`);
  assert.equal(canonicalFor('https://elsewhere.example/x/', none), 'https://elsewhere.example/x/');
  assert.equal(canonicalFor(`${SITE}/pdf/sign-pdf/`, { ...none, to: 'https://mirror.example' }), 'https://mirror.example/pdf/sign-pdf/');
  const override = { '/pdf/': 'https://pdf.example/pdf/', '=/pdf/': 'https://pdf.example/', '/pdf/about/': 'https://about.example/' };
  const o = { ...none, override };
  assert.equal(canonicalFor(`${SITE}/pdf/`, o), 'https://pdf.example/', 'the one page');
  assert.equal(canonicalFor(`${SITE}/pdf/sign-pdf/`, o), 'https://pdf.example/pdf/sign-pdf/', 'the rest of the path after the URL');
  assert.equal(canonicalFor(`${SITE}/pdf/about/`, o), 'https://about.example/', 'the longest key wins');
  assert.equal(canonicalFor(`${SITE}/${O}/pdf/sign-pdf/`, o), `https://pdf.example/${O}/pdf/sign-pdf/`, 'a language folder stays in front');
  assert.equal(canonicalFor(`${SITE}/ocr/`, o), `${SITE}/ocr/`, 'outside the paths: unchanged');
  // a single-app site: its app's page names the root; the root language only
  const main = { ...none, main: { id: 'pdf', path: 'pdf/' } };
  assert.equal(canonicalFor(`${SITE}/pdf/`, main), `${SITE}/`);
  assert.equal(canonicalFor(`${SITE}/pdf/sign-pdf/`, main), `${SITE}/pdf/sign-pdf/`);
  assert.equal(canonicalFor(`${SITE}/${O}/pdf/`, main), `${SITE}/${O}/pdf/`);
  // this site's own profile: every page is its own canonical
  assert.equal(canonicalFor(`${SITE}/pdf/`), `${SITE}/pdf/`);
});

/** Runs the guard as a page on host would: whether it added the noindex tag. */
function guarded(script, host) {
  const added = [];
  const doc = { createElement: () => ({}), head: { appendChild: (m) => added.push(m) } };
  vm.runInNewContext(script.replace(/^<script[^>]*>|<\/script>$/g, ''), { document: doc, location: { hostname: host } });
  return added.some((m) => m.name === 'robots' && m.content === 'noindex');
}

test('the host guard: noindex on any other host, none on the site\'s own, its www, localhost or a file', () => {
  const g = guardScript('pdf.example.com');
  assert.match(g, /^<script data-robots-guard>.*<\/script>$/);
  assert.ok(!g.includes('\n'), 'one line: no page grows');
  for (const h of ['fork.github.io', 'example.com', 'pdf.example.com.evil.test', 'slopographic.github.io']) assert.equal(guarded(g, h), true, h);
  for (const h of ['pdf.example.com', 'www.pdf.example.com', 'localhost', '127.0.0.1', '']) assert.equal(guarded(g, h), false, h || '(file)');
  assert.equal(guarded(guardScript(), HOST), false, 'the build\'s own origin');
});

test('the mark at the top of every page: written once, replaced, never over a page\'s own noindex', () => {
  const page = '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n</head><body></body></html>';
  const a = markHead(page, guardScript());
  assert.equal(a.split('\n').length, page.split('\n').length, 'on the <head> line');
  assert.match(a, /<head><script data-robots-guard>/);
  assert.equal(markHead(a, guardScript()), a, 'again: the same');
  const b = markHead(a, NOINDEX);
  assert.match(b, /<head><meta name="robots" content="noindex">\n/);
  assert.ok(!b.includes('data-robots-guard'));
  assert.equal(markHead(b, guardScript()), a, 'and back');
  const own = page.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex">');
  assert.equal(markHead(own, guardScript()), own, 'a page that says noindex itself keeps it alone');
  assert.equal(markHead('<p>no head</p>', NOINDEX), '<p>no head</p>');
  // which mark: noindex for a site that is not indexed, the guard on an indexed one
  assert.equal(pageMark('pdf/index.html', false), NOINDEX);
  assert.equal(pageMark('pdf/index.html', true), hiddenApp('pdf/') ? NOINDEX : guardScript());
  assert.equal(unLang(`${O}/pdf/index.html`), 'pdf/index.html');
  assert.equal(unLang(`pdf/${O}/index.html`), `pdf/${O}/index.html`);
});

test('a hidden app\'s folder: the longest app folder decides', () => {
  const all = [{ id: 'paint', path: 'paint/' }, { id: 'classic', path: 'paint/classic/' }, { id: 'pdf', path: 'pdf/' }];
  assert.equal(hiddenApp('paint/x/', new Set(['paint']), all).id, 'paint');
  assert.equal(hiddenApp('paint/classic/', new Set(['paint']), all), null, 'a shown app inside a hidden one\'s folder');
  assert.equal(hiddenApp('pdf/', new Set(['paint']), all), null);
  assert.equal(hiddenApp('settings/', new Set(['paint']), all), null);
});

test('robots.txt: crawling allowed either way; the sitemaps only when the site is indexed', () => {
  assert.equal(robotsTxt(['sitemap.xml'], false), 'User-agent: *\nAllow: /\n');
  assert.equal(robotsTxt(['sitemap.xml', 'sitemap-index.xml'], true), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\nSitemap: ${SITE}/sitemap-index.xml\n`);
  if (INDEX) assert.equal(readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), robotsTxt(['sitemap.xml', 'sitemap-index.xml']));
  else assert.equal(readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n');
});

test('every page of the site carries its mark (the writer keeps it so: node tools/seo/write.mjs)', () => {
  const pages = sitePages();
  assert.ok(pages.length > 50 && pages.includes('index.html') && !pages.some((p) => p.startsWith('tests/')));
  for (const p of pages) {
    const html = readFileSync(path.join(ROOT, p), 'utf8');
    if (!/<head(\s[^>]*)?>/i.test(html)) continue;
    assert.ok(markHead(html, pageMark(p)) === html, `${p}: run node tools/seo/write.mjs`);
    if (!INDEX) assert.match(html, /<meta\s+name=["']robots["'][^>]*noindex/i, p);
  }
});

test('IndexNow: a site that is not indexed sends nothing', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('fetched'); };
  try { assert.equal(await indexNow(false), false); } finally { globalThis.fetch = fetch0; }
});
