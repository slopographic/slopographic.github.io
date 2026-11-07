#!/usr/bin/env node
// Writes the static SEO pages in every published language: the head block of every app page, about page and the
// homepage, the generated pages (landing, task, guide, round-up and hub pages), the copies of the hand-made pages in each
// other language's folder, the sitemaps, the English table parts written from other sources (tables.mjs) and the app
// words pages read at run time in every language (apptables.mjs: shared/i18n/apps/<code>.js).
//   node tools/seo/write.mjs            the root language's files only: what is committed (and the .gitignore block)
//   node tools/seo/write.mjs --langs    the other languages' folders and sitemaps only: what a publish adds (never committed)
//   node tools/seo/write.mjs --all      both, the root pass first (the copies are made from the root pages it wrote)
//   node tools/seo/write.mjs --check    exit 1 and name the files that are out of date, write nothing (with --langs or
//                                       --all: those files)
//   node tools/seo/write.mjs --date=2026-10-11   lastmod date (default: today)
// The root language (the brand profile's defaultLang) is at the site root, every other published language in its own
// folder (/sv/...): lang.mjs. Which languages: the profile's seo.langs ('all', a list, or 'none'). The language folders are
// git-ignored (langdirs.mjs) and written by the publish jobs (.github/workflows/pages.yml, preview.yml), CI's test job and
// tools/whitelabel/build.mjs; a site whose seo.langs is 'none' builds none of them. The copy is in the SEO tables
// (shared/seo/i18n), the facts in shared/seo, the app list in shared/apps.js. Each page gets one block between
// <!-- seo:start --> and <!-- seo:end -->, placed after its charset tag.
// A language folder holds only what this tool writes: a file there that it does not write is removed (and a folder of
// a language no longer published, every one when the site is not indexed; a folder left empty goes) by a --langs run.
// Read shared/seo/HANDOFF.md first.
// What search engines are told follows the profile (robots.mjs, brand/README.md "Search engines"): the root pass also
// writes robots.txt, puts the noindex tag or the host guard at the top of every page of the site, and removes the
// generated pages the site does not publish (all of them when it is not indexed, a hidden app's always).
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SITE, INDEX, loadRegistry, registryWindow, isPage, pageUrl } from './site.mjs';
import { markHead, pageMark, robotsTxt, sitePages } from './robots.mjs';
import { published, unpublished, prefixOf, LANGS, ROOT_LANG, SEO_LANGS } from './lang.mjs';
import { withBlock, clashes } from './langdirs.mjs';
import { buildLang, pagePaths, generated } from './build-lang.mjs';
import { converterFiles } from './footnav.mjs';
import { sitemaps } from './sitemap.mjs';
import { generatedParts } from './tables.mjs';
import { runtimeParts } from './apptables.mjs';
import { context } from './lang.mjs';

export { ROOT, SITE, loadRegistry, isPage, pageUrl };
export { headBlock, injectHead, validateCopy, imageFor, TRIAL_TOKENS } from './head.mjs';
export { appJsonLd, homeJsonLd } from './build-lang.mjs';
export { siteChrome } from './chrome.mjs';

/** Every file under a folder, relative to the repo. */
const walk = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((f) => (statSync(path.join(ROOT, dir, f)).isDirectory() ? walk(`${dir}${f}/`) : [`${dir}${f}`]));

/** Removes the folders a removal left empty, up to (not including) the site root: a language folder or a generated
 *  page's folder that no longer holds anything is gone too (a copy that had them committed ends up without them). */
function pruneEmpty(files) {
  const dirs = [...new Set(files.map((f) => path.dirname(f)))].sort((a, b) => b.length - a.length);
  for (let d of dirs) {
    while (d.startsWith(ROOT + path.sep) && existsSync(d) && !readdirSync(d).length) { rmdirSync(d); d = path.dirname(d); }
  }
}
/** The directories of the generated pages (the same in every language: a language is published only when complete): of
 *  the apps given (the shown ones), or of every app in the registry when all is true (the pages that may be on disk). */
async function generatedDirs(apps, all = false) {
  const { landingIn } = await import('../../shared/seo/copy.mjs');
  const { TASKS } = await import('../../shared/seo/tasks/index.mjs');
  const { ROUNDUPS } = await import('../../shared/seo/roundups/index.mjs');
  const { GUIDES } = await import('../../shared/seo/guides/index.mjs');
  if (!INDEX && !all) return [];
  const ids = new Set(apps.map((a) => a.id)), shown = (x) => ids.has(x.app);
  const g = generated(apps, context(ROOT_LANG), { LANDING: landingIn(ROOT_LANG), TASKS: TASKS.filter(shown), ROUNDUPS: ROUNDUPS.filter(shown), GUIDES: GUIDES.filter(shown) });
  return [...g.landing, ...g.tasks, g.hub, ...g.best, g.bestIndex, ...g.guides].map((p) => p.dir);
}
/** The root pass's search-engine files: robots.txt, the generated pages on disk the site no longer publishes, and the
 *  mark at the top of every page it does not write itself (out: the files written so far). */
async function searchFiles(out, written, root) {
  const files = [{ file: path.join(ROOT, 'robots.txt'), html: robotsTxt(INDEX ? ['sitemap.xml', 'sitemap-index.xml'] : []) }];
  const keep = new Set(written), have = new Set(out.map((f) => f.file));
  for (const d of await generatedDirs(registryWindow().SLOP_ALL_APPS, true)) {
    const f = path.join(ROOT, d, 'index.html');
    if (!keep.has(d) && existsSync(f)) files.push({ file: f, html: null });
  }
  const gone = new Set(files.filter((f) => f.html === null).map((f) => f.file));
  for (const rel of root ? sitePages() : []) {
    const f = path.join(ROOT, rel);
    if (!have.has(f) && !gone.has(f)) files.push({ file: f, html: markHead(await readFile(f, 'utf8'), pageMark(rel)) });
  }
  for (const f of files) f.before = existsSync(f.file) ? await readFile(f.file, 'utf8') : undefined;
  return files;
}

/** Builds every page's new content: [{ file, html, before }] (html null: the file goes). only: 'root' (the committed
 * files), 'langs' (the other languages' folders and sitemaps, copied from the root pages on disk) or 'all' (both in one
 * pass, from the root pages as they are on disk); langs: the profile's seo.langs. */
export async function build({ date, only = 'root', langs = SEO_LANGS }) {
  const apps = await loadRegistry(), codes = published(langs);
  const root = only !== 'langs', other = only !== 'root';
  const bad = other ? clashes(codes, apps) : [];
  if (bad.length) throw new Error(`SEO: the folder of ${bad.join(', ')} is an app's or not a language folder; it is never written or cleaned`);
  const out = root ? [...generatedParts(), ...runtimeParts()].map((p) => ({ file: path.join(ROOT, p.file), html: p.text })) : [];
  const ignore = path.join(ROOT, '.gitignore');
  if (root && existsSync(ignore)) out.push({ file: ignore, html: withBlock(await readFile(ignore, 'utf8')) });
  for (const f of out) f.before = existsSync(f.file) ? await readFile(f.file, 'utf8') : '';
  const gen = await generatedDirs(apps), paths = pagePaths(apps, gen);
  const byLang = new Map();
  for (const code of codes) {
    if (code === ROOT_LANG ? !root : !other) continue;
    const r = await buildLang(code, codes, { apps, date, paths });
    out.push(...r.files);
    byLang.set(code, r.urls);
  }
  // a language folder holds only what is written here
  const written = new Set(out.map((f) => f.file));
  for (const l of other ? LANGS : []) {
    const dir = l.code.toLowerCase();   // the root language too: its pages are at the root, not in a folder
    if (!dir || !existsSync(path.join(ROOT, dir)) || clashes([l.code], apps).length) continue;
    for (const f of walk(dir + '/')) if (!written.has(path.join(ROOT, f))) out.push({ file: path.join(ROOT, f), html: null, before: await readFile(path.join(ROOT, f), 'utf8') });
  }
  if (root) out.push(...await searchFiles(out, gen, root));
  const gone = new Set(out.filter((f) => f.html === null).map((f) => f.file));
  out.push(...await sitemaps(byLang, date, codes, { root, langs: other, gone }));
  // every page written here gets its mark at the top (robots.mjs pageMark): the noindex tag or the host guard
  for (const f of out) if (f.html && f.file.endsWith('.html')) f.html = markHead(f.html, pageMark(path.relative(ROOT, f.file).split(path.sep).join('/')));
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  const dateArg = process.argv.find((a) => a.startsWith('--date='));
  const date = dateArg ? dateArg.slice(7) : new Date().toISOString().slice(0, 10);
  // --all is two passes: the other languages' copies are made from the root pages as the first pass wrote them
  const passes = process.argv.includes('--all') ? ['root', 'langs'] : process.argv.includes('--langs') ? ['langs'] : ['root'];
  const langs = published().map((c) => `${c}${c === ROOT_LANG ? ' (root)' : ` (${prefixOf(c)}/)`}`).join(', ');
  const left = unpublished().map((u) => `${u.code}: ${u.why}`).join('; ');
  for (const only of passes) {
    const files = await build({ date, only });
    const stale = files.filter((f) => f.before !== f.html && !(f.html === null && f.before === undefined)).map((f) => path.relative(ROOT, f.file));
    if (check) {
      if (stale.length) { console.error(`SEO out of date (run node tools/seo/write.mjs${only === 'root' ? '' : ' --' + only}):\n  ` + stale.slice(0, 50).join('\n  ') + (stale.length > 50 ? `\n  ... and ${stale.length - 50} more` : '')); process.exit(1); }
      console.log(`SEO up to date (${only}): ${files.length} files; languages ${langs}${left ? `; not published: ${left}` : ''}`);
      continue;
    }
    for (const f of files) {
      if (f.before === f.html) continue;
      if (f.html === null) { await rm(f.file, { force: true }); continue; }
      await mkdir(path.dirname(f.file), { recursive: true });
      await writeFile(f.file, f.html);
    }
    pruneEmpty(files.filter((f) => f.html === null).map((f) => f.file));
    console.log(`SEO written (${only}): ${stale.length} changed of ${files.length} files (lastmod ${date}); languages ${langs}${left ? `; not published: ${left}` : ''}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
