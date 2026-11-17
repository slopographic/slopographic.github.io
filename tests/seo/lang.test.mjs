// The parts of the SEO pages' languages (shared/seo/HANDOFF.md, "Languages"): the copy tables joined with the facts
// (shared/seo/i18n.mjs), which languages are published (only complete ones), URLs and alternates, the head block, the
// copies of hand-made pages, the checks by script, and the English parts written from the registry and the converters.
// Covers: tools/seo/lang.mjs, tools/seo/head.mjs, tools/seo/copies.mjs, tools/seo/frame.mjs, tools/seo/tables.mjs, shared/seo/i18n.mjs
// Covers: tools/seo/chrome.mjs, tools/seo/sitemap.mjs, tools/seo/build-lang.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE } from '../../tools/seo/site.mjs';
import { hydrate, table, tableLangs, text } from '../../shared/seo/i18n.mjs';
import { published, unpublished, missing, prefixOf, context, alternates, localizeLinks, LANGS, ROOT_LANG } from '../../tools/seo/lang.mjs';
import { headBlock, injectHead, setAlternates, setHtmlLang, descLimits, validateCopy } from '../../tools/seo/head.mjs';
import { copyPage, prerender, translate, localizeAll } from '../../tools/seo/copies.mjs';
import { htmlTag } from '../../tools/seo/frame.mjs';
import { generatedParts } from '../../tools/seo/tables.mjs';
import { siteChrome } from '../../tools/seo/chrome.mjs';
import { sitemapName } from '../../tools/seo/sitemap.mjs';
import { pagePaths } from '../../tools/seo/build-lang.mjs';

const EN = context('en');

test('the tables join the facts: a key\'s path is where its text goes, @key is that key\'s text, a gap is an error', () => {
  const key = [...table('en').keys()].find((k) => /^seo\.task\.[^.]+\.[^.]+\.faq\.0\.1$/.test(k));
  const prefix = key.split('.').slice(0, 4).join('.');
  const t = hydrate({ app: 'x' }, prefix);
  assert.equal(t.faq[0][1], text(key));
  assert.equal(t.app, 'x');
  assert.equal(hydrate({ a: [`@${key}`] }, 'seo.none').a[0], text(key));
  assert.throws(() => hydrate({ a: [null] }, 'seo.none'), /gap/);
  assert.throws(() => text('seo.no.such.key'), /no English text/);
});

test('a language is published only with every English key; the others are listed with the reason', () => {
  const codes = published();
  assert.equal(codes[0], ROOT_LANG);
  for (const c of codes) assert.deepEqual(missing(c), [], `${c}: complete`);
  for (const c of tableLangs()) assert.ok(codes.includes(c) || unpublished().some((u) => u.code === c), `${c}: published or said why not`);
  // a language with no tables gets no folder and no alternate on any page
  const none = LANGS.map((l) => l.code).find((c) => !tableLangs().includes(c));
  assert.ok(none && !codes.includes(none));
  assert.ok(!existsSync(path.join(ROOT, none.toLowerCase())), `${none}: no folder without tables`);
  const page = ['compare/index.html', 'pdf/index.html'].find((f) => existsSync(path.join(ROOT, f)));   // no compare page: a site not indexed
  assert.ok(!readFileSync(path.join(ROOT, page), 'utf8').includes(`hreflang="${none}"`));
});

test('URLs: the root language at the root, the others in a lower-case folder; alternates end with x-default', () => {
  assert.equal(prefixOf(ROOT_LANG), '');
  for (const l of LANGS) if (l.code !== ROOT_LANG) assert.equal(prefixOf(l.code), '/' + l.code.toLowerCase());
  const alts = alternates('/compare/', [ROOT_LANG, 'pt-BR']);
  assert.deepEqual(alts.at(-1), ['x-default', `${SITE}/compare/`]);
  assert.deepEqual(alts[1], ['pt-BR', `${SITE}/pt-br/compare/`]);
  const paths = new Set(['/compare/', '/pdf/']);
  assert.equal(localizeLinks('<a href="/compare/#x">a</a><a href="/settings/">b</a>', '/sv', paths), '<a href="/sv/compare/#x">a</a><a href="/settings/">b</a>');
  assert.equal(localizeAll('<a href="../pdf/?a=1">p</a><a href="#top">t</a><a href="https://x.example/">x</a>', 'compare/', '/sv', paths), '<a href="/sv/pdf/?a=1">p</a><a href="#top">t</a><a href="https://x.example/">x</a>');
});

test('the head block: canonical and every alternate on one line; a hand-made head gets the alternates alone; lang and dir', () => {
  const alts = [['en', `${SITE}/x/`], ['sv', `${SITE}/sv/x/`], ['x-default', `${SITE}/x/`]];
  const lines = headBlock({ title: 'T', description: 'D', url: `${SITE}/sv/x/`, image: 'i', jsonld: [], alternates: alts });
  assert.ok(lines.some((l) => l.startsWith(`<link rel="canonical" href="${SITE}/sv/x/"><link rel="alternate" hreflang="en"`) && l.includes('hreflang="x-default"')));
  const page = '<html lang="en"><head><meta charset="utf-8"><title>Old</title></head><body></body></html>';
  assert.match(injectHead(page, lines), /<title>T<\/title>/);
  const own = setAlternates(page, alts);
  assert.match(own, /<!-- seo:alt --><link rel="alternate" hreflang="en"[^\n]*<!-- \/seo:alt -->/);
  assert.equal(setAlternates(own, alts), own, 'written twice, the same');
  assert.equal(setAlternates(own, alts.slice(0, 1).concat([alts[2]])), page.replace('<html', '<html'), 'one language: no alternates');
  const ar = context('ar');
  assert.match(setHtmlLang(page, ar, { page: true }), /<html lang="ar" dir="rtl" data-lang-page="ar">/);
  assert.match(htmlTag(ar), /dir="rtl"/);
  assert.doesNotMatch(htmlTag(EN), /dir=/);
});

test('descriptions are checked by script; titles and descriptions are unique within a language', () => {
  assert.deepEqual(descLimits('sv'), [120, 160]);
  assert.deepEqual(descLimits('ja'), [45, 110]);
  assert.deepEqual(descLimits('zh-CN'), [45, 110]);
  assert.deepEqual(descLimits('ko'), [55, 130]);
  const d = 'x'.repeat(130), j = '字'.repeat(60);
  assert.doesNotThrow(() => validateCopy([['a', { title: 'A', description: d }]], { code: 'sv', lenient: false }));
  assert.throws(() => validateCopy([['a', { title: 'A', description: j }]], { code: 'sv', lenient: false }), /description is 60/);
  assert.doesNotThrow(() => validateCopy([['a', { title: 'A', description: j }]], { code: 'ja', lenient: false }));
  assert.throws(() => validateCopy([['a', { title: 'A', description: d }], ['b', { title: 'B', description: d }]], { code: 'sv', lenient: false }), /description repeats/);
  assert.throws(() => validateCopy([['a', { title: 'A', description: d }], ['b', { title: 'A', description: d + 'y' }]], { code: 'sv', lenient: false }), /title repeats/);
});

test('a copy of a hand-made page: base back to its folder, its language, links in the language, # links kept on the copy', () => {
  const de = context(ROOT_LANG === 'de' ? 'fr' : 'de'), html = '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"></head>\n<body><a href="../">Home</a><a href="#x">x</a></body>\n</html>';
  const out = copyPage(html, { dir: 'pdf/', L: de, paths: new Set(['/']) });
  assert.match(out, /<head><base href="..\/..\/pdf\/"><script>/);
  assert.match(out, /<\/a><\/body>/, 'the body ends as it did (an app page\'s paint mark stays last)');
  assert.ok(out.includes(`<html lang="${de.code}" data-lang-page="${de.code}">`));
  assert.ok(out.includes(`<a href="${de.prefix}/">Home</a>`));
  assert.match(out, /location\.hash=a\.getAttribute\('href'\)/);
  assert.equal(out.split('\n').length, html.split('\n').length, 'no line added (the 300-line rule)');
  const table = new Map([['k.a', 'Öppna'], ['k.b', 'Stäng'], ['k.v', 'Hej {name}']]);
  assert.equal(prerender('<b data-i18n="k.a">Open</b><i data-i18n="k.v">Hi</i><button title="Close" data-i18n-attr="title:k.b">x</button>', table),
    '<b data-i18n="k.a">Öppna</b><i data-i18n="k.v">Hi</i><button title="Stäng" data-i18n-attr="title:k.b">x</button>');
  assert.equal(translate('<h2>How it works</h2><p aria-label="How it works">How it works here</p>', [['How it works', 'Så fungerar det']]),
    '<h2>Så fungerar det</h2><p aria-label="Så fungerar det">How it works here</p>');
});

test('the English parts written from the registry and the converter lists are current, and each part has at most 300 lines', () => {
  for (const p of generatedParts()) {
    assert.equal(readFileSync(path.join(ROOT, p.file), 'utf8'), p.text, `${p.file}: run node tools/seo/write.mjs`);
    assert.ok(p.text.split('\n').length <= 300, `${p.file}: at most 300 lines`);
  }
});

test('the frame, the sitemaps\' names and the pages a language has', () => {
  assert.match(siteChrome('<!-- site:top -->old<!-- /site:top -->', EN), /<header class="l-top">/);
  assert.equal(sitemapName(ROOT_LANG), 'sitemap.xml');
  assert.equal(sitemapName('pt-BR'), ROOT_LANG === 'pt-BR' ? 'sitemap.xml' : 'sitemap-pt-br.xml');
  const paths = pagePaths([{ id: 'pdf', path: 'pdf/' }, { id: 'home', path: '#home' }], ['compare/']);
  assert.ok(paths.has('/') && paths.has('/pdf/') && paths.has('/compare/') && !paths.has('/#home'));
});
