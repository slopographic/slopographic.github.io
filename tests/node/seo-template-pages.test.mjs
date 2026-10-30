// The about pages and How it works as templates (tools/seo/template.mjs, shared/seo/pages/): every slot is a key of the
// English tables and every key of their parts is used; the page on disk in the root language is its template drawn in
// that language (in English, the words it has always had); every other published language has its own copy, with the
// alternates, in the sitemap, and with none of the root language page's sentences.
// Covers: tools/seo/template.mjs, tools/seo/build-lang.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, loadRegistry, isPage } from '../../tools/seo/site.mjs';
import { published, prefixOf, context, ROOT_LANG } from '../../tools/seo/lang.mjs';
import { aboutTemplate, pageTemplate, PAGES_DIR, templateKeys, renderTemplate } from '../../tools/seo/template.mjs';
import { readTable, table } from '../../shared/seo/i18n.mjs';
import { sitemapName } from '../../tools/seo/sitemap.mjs';

const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const codes = published(), apps = (await loadRegistry()).filter(isPage);
const about = apps.filter((a) => existsSync(aboutTemplate(a.id)));
/** [dir, template file, vars] of every template page. */
const pages = [...about.map((a) => [`${a.path}about/`, aboutTemplate(a.id), { app: a.name }]),
  ...readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).map((f) => [`${f.slice(0, -5)}/`, pageTemplate(f.slice(0, -5)), {}])];
const fileOf = (code, dir) => path.posix.join(prefixOf(code).slice(1), dir, 'index.html');
const urlOf = (code, dir) => `${SITE}${prefixOf(code)}/${dir}`;
const mainOf = (h) => (/<main[\s\S]*?<\/main>/.exec(h) || [''])[0];
const PARTS = ['about-a', 'about-b', 'how'];

test('the templates: the about pages and How it works, every slot an English key, every key of their parts used', () => {
  assert.ok(about.length >= 10, 'the apps\' about pages are templates');
  assert.ok(pages.some(([dir]) => dir === 'how-it-works/'), 'How it works is a template');
  const en = table('en'), used = new Set();
  for (const [dir, file] of pages) {
    const keys = templateKeys(file);
    assert.ok(keys.length > 2, `${dir}: its words are keys`);
    for (const k of keys) { assert.ok(en.has(k), `${path.relative(ROOT, file)}: ${k} is not in shared/seo/i18n/en/`); used.add(k); }
  }
  for (const p of PARTS) for (const k of readTable(path.join(ROOT, 'shared/seo/i18n/en', `${p}.js`), 'en').keys()) assert.ok(used.has(k), `${p}: ${k} is used by no template`);
});

test('the root language: each page is its template drawn in that language, with an alternate for every language', () => {
  const L = context(ROOT_LANG);
  for (const [dir, file, vars] of pages) {
    const h = read(fileOf(ROOT_LANG, dir));
    assert.equal(mainOf(h), mainOf(renderTemplate(file, L, vars)), `${dir}: the page is its template (node tools/seo/write.mjs)`);
    for (const c of codes) assert.ok(codes.length < 2 || h.includes(`<link rel="alternate" hreflang="${c}" href="${urlOf(c, dir)}">`), `${dir}: alternate ${c}`);
  }
});

test('in English the pages keep their words', { skip: ROOT_LANG !== 'en' }, () => {
  const pdf = read('pdf/about/index.html'), how = read('how-it-works/index.html'), calc = read('calculator/about/index.html');
  for (const s of ['<p class="l-eyebrow">Slopographic app</p>', 'Merge, split, annotate, redact and fill PDFs in your browser. Nothing is uploaded.',
    '<h2 id="limits-title">What it cannot do yet</h2>', '<td class="us" data-label="Slop PDF"><span class="yes">Yes</span>, RC4 and AES</td>',
    '<th scope="col">Typical desktop PDF editor</th>', 'No tracking runs unless the owner has turned it on in <a href="../../settings/">Settings</a>.']) assert.ok(pdf.includes(s), `pdf about: ${s}`);
  assert.ok(calc.includes('<a class="l-btn primary" href="../">Open Slopculator</a>') && calc.includes('<h2 id="about-title">About Slopculator</h2>'));
  for (const s of ['<p class="eyebrow">Audit</p>', '<h2 id="short">The short version</h2>', '<th scope="col">Where in the code</th>',
    '<td>Fetch</td><td>Every network request in the apps. The full list is in <a href="#network">Outbound requests</a>.</td>',
    '<code>slop-drive</code></td><td>IndexedDB</td><td>Slop Drive files and folders, including the file contents.</td>']) assert.ok(how.includes(s), `how it works: ${s}`);
});

test('every other published language: its own copy, in the sitemap, with none of the root page\'s sentences', () => {
  const root = table(ROOT_LANG), rootText = (k) => root.get(k) ?? table('en').get(k);
  for (const code of codes.filter((c) => c !== ROOT_LANG)) {
    const map = read(sitemapName(code)), tt = table(code);
    for (const [dir, file] of pages) {
      const f = fileOf(code, dir);
      assert.ok(existsSync(path.join(ROOT, f)), `${f} is missing (node tools/seo/write.mjs)`);
      const h = read(f), body = mainOf(h);
      assert.match(h, new RegExp(`<html lang="${code}"[^>]*data-lang-page="${code}"`), `${f}: its language`);
      assert.ok(h.includes(`<link rel="canonical" href="${urlOf(code, dir)}">`), `${f}: canonical`);
      assert.ok(h.includes(`<link rel="alternate" hreflang="${ROOT_LANG}" href="${urlOf(ROOT_LANG, dir)}">`), `${f}: the root page as an alternate`);
      assert.ok(map.includes(`<loc>${urlOf(code, dir)}</loc>`), `${sitemapName(code)}: ${dir}`);
      // a sample: the longer sentences of the page, which a translation always changes (in the language: English
      // falls back to its own table's text)
      const text = (k) => tt.get(k) ?? table('en').get(k);
      const sample = templateKeys(file).filter((k) => rootText(k).length > 40 && text(k) !== rootText(k)).slice(0, 8);
      assert.ok(sample.length > 0, `${dir}: sentences to check`);
      for (const k of sample) assert.ok(!body.includes(rootText(k)), `${f}: the root language's text of ${k}`);
    }
  }
});
