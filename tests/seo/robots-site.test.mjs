// Covers: tools/seo/write.mjs, tools/seo/build-lang.mjs, tools/seo/mainapp.mjs, tools/seo/footnav.mjs, tools/seo/landing.mjs, tools/seo/lang.mjs
// The SEO writer on a copy of the site with other profile markers (brand/README.md "Search engines", "Single-app
// sites"): a site that is not indexed (noindex on every page, its own or canonicalTo's canonicals, no sitemaps, no
// language folders, no generated pages), and a single-app site (its app at the root, only its apps' pages in the sitemap,
// the parent in the footer, a canonical override per path). Language folders already in the copy (a white-label copy
// commits them) are removed. This site as it is: tests/seo/robots.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ROOT, SITE, registryWindow } from '../../tools/seo/site.mjs';

const SKIP = /^(tests|vendor|assets|node_modules)\/|^\.git\//;
/** The site's files (as git lists them) in a new folder, without the tests, vendored code and media. */
function copySite() {
  const out = mkdtempSync(path.join(os.tmpdir(), 'seo-site-'));
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0');
  for (const f of files) {
    if (!f || SKIP.test(f) || !existsSync(path.join(ROOT, f))) continue;
    mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    cpSync(path.join(ROOT, f), path.join(out, f));
  }
  return out;
}
/** Sets a profile marker's literal in one file of the copy (the white-label build's job, done by hand here). */
function mark(dir, file, key, value) {
  const f = path.join(dir, file), src = readFileSync(f, 'utf8');
  const re = new RegExp(String.raw`/\*profile:${key}\*/('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|true|false|null|\[[^\]\n]*\]|\{[^}\n]*\})`);
  assert.match(src, re, `${file}: ${key}`);
  writeFileSync(f, src.replace(re, `/*profile:${key}*/${JSON.stringify(value)}`));
}
const write = (dir, ...args) => execFileSync(process.execPath, ['tools/seo/write.mjs', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEO_LENIENT: '1' } });
const read = (dir, f) => readFileSync(path.join(dir, f), 'utf8');
const canonical = (html) => (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pages = (dir, sub = '') => readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (sub === '' && /^(tests|vendor)$/.test(e.name) ? [] : pages(dir, `${sub}${e.name}/`)) : e.name.endsWith('.html') ? [sub + e.name] : []));

test('a site that is not indexed: noindex everywhere, its own canonicals, no sitemaps, no generated pages', { timeout: 120000 }, () => {
  const dir = copySite();
  try {
    // a site that published its languages before (a white-label copy commits their folders): a --langs run removes them
    for (const f of ['sv/index.html', 'sv/pdf/index.html', 'de/index.html', 'de/compare/index.html']) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), `<!doctype html><html lang="${f.slice(0, 2)}" data-lang-page="${f.slice(0, 2)}"><title>old</title>`); }
    mark(dir, 'tools/seo/site.mjs', 'seoIndex', false);
    write(dir); write(dir, '--langs');
    assert.equal(read(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    assert.deepEqual(readdirSync(dir).filter((f) => /^sitemap/.test(f)), []);
    for (const d of ['compare', 'best', 'all-tools', 'apps/pdf', 'pdf/sign-pdf']) assert.ok(!existsSync(path.join(dir, d, 'index.html')), `${d}: not built`);
    for (const l of ['sv', 'de']) assert.ok(!existsSync(path.join(dir, l)), `no language folders: ${l}/`);
    for (const p of pages(dir)) {
      const html = read(dir, p);
      if (/<head(\s[^>]*)?>/i.test(html)) assert.match(html, /<meta name="robots" content="noindex">/, p);
      assert.ok(!html.includes('hreflang='), `${p}: no hreflang`);
    }
    assert.equal(canonical(read(dir, 'pdf/index.html')), `${SITE}/pdf/`, 'the build\'s own origin');
    const foot = (/<nav class="fnav"[\s\S]*?<\/nav>/.exec(read(dir, 'index.html')) || [''])[0];
    assert.ok(foot && !/href="\/(apps|best|compare|all-tools)\//.test(foot) && !foot.includes('sitemap.xml'), 'the footer links no generated page');
    assert.match(write(dir, '--check'), /SEO up to date/);
    // canonicalTo: every canonical on that origin, the same path
    mark(dir, 'tools/seo/site.mjs', 'seoCanonicalTo', 'https://mirror.example');
    write(dir);
    assert.equal(canonical(read(dir, 'pdf/index.html')), 'https://mirror.example/pdf/');
    assert.equal(canonical(read(dir, 'index.html')), 'https://mirror.example/');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a single-app site: the app at the root, only its apps\' pages, the parent in the footer, an override per path', { timeout: 120000 }, () => {
  const dir = copySite(), keep = ['pdf', 'ocr', 'drive', 'convert'];
  try {
    const all = registryWindow().SLOP_ALL_APPS, hide = all.map((a) => a.id).filter((id) => !keep.includes(id));
    mark(dir, 'shared/apps.js', 'hideApps', hide);
    mark(dir, 'shared/apps.js', 'parent', { name: 'Example Suite', url: 'https://example.com' });
    mark(dir, 'tools/seo/site.mjs', 'seoIndex', true);
    mark(dir, 'tools/seo/site.mjs', 'mainApp', 'pdf');
    mark(dir, 'tools/seo/site.mjs', 'seoCanonicalOverride', { '/ocr/': 'https://ocr.example/ocr/' });
    write(dir); write(dir, '--langs');
    const root = read(dir, 'index.html'), app = read(dir, 'pdf/index.html');
    assert.match(root, /<head>[^\n]*<base href="pdf\/" data-main-app="pdf">/, 'the app\'s page, with a base in its folder');
    const body = (html) => html.replace(/<head>[^\n]*?(?=\n)/, '').replace('<link rel="expect" href="/#', '<link rel="expect" href="#');
    assert.equal(body(root), body(app), 'the same page below its first line (its render-blocking link at the root\'s address)');
    assert.match(root, /<link rel="expect" href="\/#/);
    assert.equal(canonical(root), `${SITE}/`);
    assert.equal(canonical(app), `${SITE}/`, 'the app\'s own page names the root');
    assert.equal(canonical(read(dir, 'ocr/index.html')), 'https://ocr.example/ocr/', 'the override');
    const urls = locs(read(dir, 'sitemap.xml'));
    assert.ok(urls.includes(`${SITE}/`) && !urls.includes(`${SITE}/pdf/`) && !urls.some((u) => u.startsWith(`${SITE}/ocr/`)));
    assert.ok(urls.includes(`${SITE}/pdf/sign-pdf/`), 'the app\'s task pages');
    const shown = new Set(keep.map((id) => all.find((a) => a.id === id).path));
    for (const u of urls) {
      const rel = u.slice(SITE.length + 1), owner = all.filter((a) => a.path && !a.path.startsWith('#') && rel.startsWith(a.path)).sort((a, b) => b.path.length - a.path.length)[0];
      if (owner) assert.ok(shown.has(owner.path), `${u}: a hidden app's page in the sitemap`);
      const m = /^apps\/([^/]+)\/$/.exec(rel);
      if (m) assert.ok(keep.includes(m[1]), `${u}: a hidden app's landing page`);
    }
    for (const id of hide.slice(0, 5)) assert.ok(!existsSync(path.join(dir, 'apps', id, 'index.html')), `apps/${id}: gone`);
    const hiddenPage = all.find((a) => hide.includes(a.id) && a.path && !a.path.startsWith('#') && existsSync(path.join(dir, a.path, 'index.html')));
    assert.match(read(dir, `${hiddenPage.path}index.html`), /<meta name="robots" content="noindex">/, 'a hidden app\'s page says noindex');
    assert.match(read(dir, 'convert/png-to-jpg/index.html'), /<span>Example Suite<\/span><\/summary><ul><li><a href="https:\/\/example\.com"[^>]*>[^<]+ →</, 'the parent in the footer');
    assert.match(write(dir, '--check'), /SEO up to date/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
