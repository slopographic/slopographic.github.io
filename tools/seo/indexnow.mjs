#!/usr/bin/env node
// IndexNow: tells Bing, Yandex, Seznam and the other IndexNow engines which public pages changed, so they crawl them
// within hours. Run by .github/workflows/indexnow.yml after a push to main (production), never for the testing preview.
//   node tools/seo/indexnow.mjs <before-sha> <after-sha>   posts the URLs of the pages that push changed
//   urlsFor(files, sitemapUrls, site) -> the URLs to send (pure; the tests call it)
// A changed page file is sent as its URL; a change to this tool, the workflow or the key sends every sitemap URL.
// The key is public by design: the engines fetch /<KEY>.txt from the site to check the request comes from its owner.
// A site that is not indexed (the brand profile's seo.index, tools/seo/site.mjs INDEX) never pings: main() returns first.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEX } from './site.mjs';

export const KEY = '606148179f6c838c4632d5a78f3ab36f';
export const SITE = 'https://slopographic.com';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ALL = [/^tools\/seo\/indexnow\.mjs$/, /^\.github\/workflows\/indexnow\.yml$/, new RegExp('^' + KEY + '\\.txt$')];

/** The page URL of a changed file: dir/index.html -> SITE/dir/, index.html -> SITE/, other files -> null. */
export function urlOf(file, site = SITE) {
  if (file === 'index.html') return site + '/';
  const m = /^(.+\/)index\.html$/.exec(file);
  return m ? site + '/' + m[1] : null;
}
export function urlsFor(files, sitemapUrls, site = SITE) {
  if (files.some((f) => ALL.some((re) => re.test(f)))) return [...sitemapUrls];
  const listed = new Set(sitemapUrls);
  return [...new Set(files.map((f) => urlOf(f, site)).filter((u) => u && listed.has(u)))];
}
const sitemapUrls = () => [...readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

export async function main(index = INDEX) {
  if (!index) { console.log('IndexNow: the site is not indexed (seo.index); nothing sent'); return false; }
  const [before, after] = process.argv.slice(2);
  const zero = !before || /^0+$/.test(before);
  const files = zero ? ['tools/seo/indexnow.mjs'] : execFileSync('git', ['diff', '--name-only', before, after], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const urls = urlsFor(files, sitemapUrls()).slice(0, 10000);
  if (!urls.length) { console.log('IndexNow: no page changed'); return; }
  if (!existsSync(path.join(ROOT, KEY + '.txt'))) throw new Error('the key file is missing');
  const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: SITE + '/' + KEY + '.txt', urlList: urls }) });
  console.log('IndexNow: sent ' + urls.length + ' URL' + (urls.length === 1 ? '' : 's') + ', HTTP ' + res.status);
  if (res.status >= 400 && res.status !== 429) process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
