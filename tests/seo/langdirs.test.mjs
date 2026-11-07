// The SEO pages of the languages besides the root one are written when the site is published, never committed
// (shared/seo/HANDOFF.md, "Languages"): which languages the profile's seo.langs lets in ('all', a list, 'none'), what each
// mode of write.mjs writes, the .gitignore block (exactly the language folders and their sitemaps, never an app folder),
// and that git holds none of them. Repo-only (tests/repo-only.json): a white-label build commits its language folders.
// Covers: tools/seo/langdirs.mjs, tools/seo/write.mjs, tools/seo/lang.mjs, tools/seo/sitemap.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, SITE, loadRegistry } from '../../tools/seo/site.mjs';
import { published, allowed, LANGS, ROOT_LANG } from '../../tools/seo/lang.mjs';
import { langDirs, ignoreBlock, withBlock, withoutBlock, clashes, START, END } from '../../tools/seo/langdirs.mjs';
import { build } from '../../tools/seo/write.mjs';

const git = (args, input) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input }).split('\n').filter(Boolean);
const DIRS = langDirs(), OTHERS = published('all').filter((c) => c !== ROOT_LANG);
const rel = (f) => path.relative(ROOT, f.file).split(path.sep).join('/');
const inLangDir = (r) => DIRS.includes(r.split('/')[0]) && r.includes('/');
const langSitemap = (r) => /^sitemap-(?!index)[a-z-]+\.xml$/.test(r);
const date = '2026-01-01';

test('seo.langs picks the published languages: \'all\', a list, \'none\' or [] (the root language always)', () => {
  assert.deepEqual(published('none'), [ROOT_LANG]);
  assert.deepEqual(published([]), [ROOT_LANG]);
  assert.deepEqual(published('all'), [ROOT_LANG, ...OTHERS]);
  for (const c of OTHERS) assert.deepEqual(published([c]), [ROOT_LANG, c]);
  assert.deepEqual(published([ROOT_LANG]), [ROOT_LANG], 'a list may name the root language');
  assert.deepEqual(published(['xx']), [ROOT_LANG], 'a code without tables publishes nothing');
  assert.ok(allowed('sv', 'all') && allowed('sv', ['sv']) && !allowed('sv', 'none') && !allowed('sv', []) && !allowed('sv', ['de']));
});

test('the .gitignore block: every language but the root one, as an anchored folder and its sitemap, written by write.mjs', () => {
  assert.deepEqual(DIRS, LANGS.filter((l) => l.code !== ROOT_LANG).map((l) => l.code.toLowerCase()));
  const block = ignoreBlock();
  assert.equal(block[0], START);
  assert.equal(block[block.length - 1], END);
  for (const l of block.slice(1, -1).filter((x) => !x.startsWith('#'))) assert.match(l, /^\/([a-z]{2,3}(-[a-z]{2})?\/|sitemap-[a-z]{2,3}(-[a-z]{2})?\.xml)$/, l);
  const text = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.equal(withBlock(text), text, '.gitignore holds the current block (node tools/seo/write.mjs)');
  assert.ok(!withoutBlock(text).includes(START) && withoutBlock(text).includes('node_modules/'));
  assert.equal(withBlock('a\n'), 'a\n', 'a file without the markers stays as it is (a white-label build)');
});

test('git ignores exactly the language folders and their sitemaps, never an app folder or the root sitemaps', () => {
  const ignored = ['sv/index.html', 'sv/pdf/index.html', 'pt-br/compare/index.html', 'zh-cn/index.html', 'sitemap-sv.xml', 'sitemap-pt-br.xml'];
  const kept = ['index.html', 'pdf/index.html', 'docs/index.html', 'colors/index.html', 'apps/sv/index.html', 'pdf/sv/index.html', 'svg/a.js',
    'sitemap.xml', 'sitemap-index.xml', 'sv.html', 'shared/i18n/sv.js', 'convert/i18n/sv/app.js', 'shared/seo/i18n/sv/copy.js'];
  const hit = new Set(git(['check-ignore', '--no-index', '--stdin'], [...ignored, ...kept].join('\n') + '\n').filter((l) => l));
  for (const f of ignored) assert.ok(hit.has(f), `${f} is ignored`);
  for (const f of kept) assert.ok(!hit.has(f), `${f} is not ignored`);
});

test('no language folder or language sitemap is committed, and no app or other folder has a language\'s name', async () => {
  const tracked = git(['ls-files']);
  const top = new Set(tracked.map((f) => f.split('/')[0]));
  for (const d of DIRS) assert.ok(!top.has(d), `${d}/ is in git: language folders are written when the site is published`);
  assert.deepEqual(tracked.filter(langSitemap), [], 'only sitemap.xml and sitemap-index.xml are committed');
  const apps = await loadRegistry();
  assert.deepEqual(clashes(LANGS.map((l) => l.code), apps), [], 'every folder with a language\'s name was written by write.mjs');
  assert.deepEqual(clashes(['it'], [{ id: 'x', path: 'it/' }]), ['it'], 'an app folder with a language\'s name');
  assert.deepEqual(clashes(['docs'], apps), ['docs'], 'a folder whose index.html is not a language page');
});

test('write.mjs, the root language only (the default): the committed files, no language folder or its sitemap', async () => {
  const files = (await build({ date })).map(rel);
  assert.ok(files.includes('sitemap.xml') && files.includes('sitemap-index.xml') && files.includes('.gitignore') && files.includes('index.html'));
  assert.deepEqual(files.filter((r) => inLangDir(r) || langSitemap(r)), []);
});

test('write.mjs --langs with seo.langs \'none\': nothing written, an old language folder and sitemap go', async () => {
  const out = await build({ date, only: 'langs', langs: 'none' });
  assert.deepEqual(out.filter((f) => f.html !== null).map(rel), [], 'no file written, not even the root ones');
  for (const f of out) assert.ok(inLangDir(rel(f)) || langSitemap(rel(f)), `${rel(f)}: only language files go`);
});

test('write.mjs --langs with a list: only those languages\' folders and sitemaps, dated as the root sitemap', { skip: !OTHERS.length && 'no other language' }, async () => {
  const code = OTHERS[0], dir = code.toLowerCase(), sm = `sitemap-${dir}.xml`;
  const out = await build({ date, only: 'langs', langs: [code] });
  const written = out.filter((f) => f.html !== null);
  for (const r of written.map(rel)) assert.ok(r.startsWith(dir + '/') || r === sm, `${r}: in ${dir}/ or its sitemap`);
  assert.ok(written.some((f) => rel(f) === `${dir}/index.html`) && written.length > 50);
  for (const f of out.filter((x) => x.html === null)) assert.ok(rel(f) !== sm && !rel(f).startsWith(dir + '/'), `${rel(f)} is kept`);
  const root = new Map([...readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)</g)].map((m) => [m[1], m[2]]));
  const mine = [...written.find((f) => rel(f) === sm).html.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)</g)];
  for (const [, u, d] of mine) {
    const same = root.get(SITE + u.slice(`${SITE}/${dir}`.length));
    if (same) assert.equal(d, same, `${u}: the date of its root language page`);
  }
});
