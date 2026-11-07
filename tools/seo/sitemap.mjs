// The sitemaps (tools/seo/write.mjs): sitemap.xml lists the root language's pages, sitemap-<code>.xml each other
// published language's (sv: sitemap-sv.xml), and sitemap-index.xml all of them (robots.txt names both sitemap.xml and the
// index). A URL of the root sitemap keeps the date it was last written with; only a new URL gets this run's date. The other
// languages' sitemaps are written when the site is published (write.mjs --langs), never committed: a page there takes the
// date of the same page in the root sitemap (a page in one language changes with the others), else its own last one.
//   sitemaps(byLang, date, codes, { root, langs, gone }) -> [{ file, html, before }]: root (default true) the root sitemap and the
//   index, langs (default true) the other languages' sitemaps (one of a language no longer published: html null); gone: the
//   files this run removes (never kept in a sitemap)
// A sitemap lists the pages whose canonical is their own address (robots.mjs canonicalFor) outside a hidden app's folder;
// a site that is not indexed (site.mjs INDEX) has no sitemaps (any on disk: html null).
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, INDEX } from './site.mjs';
import { canonicalFor, hiddenApp, unLang } from './robots.mjs';
import { ROOT_LANG } from './lang.mjs';

const read = async (f) => (existsSync(f) ? readFile(f, 'utf8') : '');
export const sitemapName = (code) => (code === ROOT_LANG ? 'sitemap.xml' : `sitemap-${code.toLowerCase()}.xml`);

const datesIn = (xml) => new Map([...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]));

const listed = (u) => canonicalFor(u) === u && !hiddenApp(unLang(u.slice(SITE.length + 1)));
async function urlset(file, urls, date, keepOld, rootDate = () => undefined, gone = new Set()) {
  const old = await read(file);
  const list = urls.filter(listed);
  // Keep the pages of the root sitemap that are not written here (the convert hub's own entries), while their file is there
  // (a white-label build can leave a page out: the typeface page of a site without its own fonts).
  const onDisk = (u) => { const rel = u.slice(SITE.length + 1), f = path.join(ROOT, rel === '' || rel.endsWith('/') ? rel + 'index.html' : rel); return existsSync(f) && !gone.has(f); };
  if (keepOld) for (const m of old.matchAll(/<loc>([^<]+)<\/loc>/g)) if (!list.includes(m[1]) && onDisk(m[1]) && listed(m[1])) list.push(m[1]);
  const dated = datesIn(old);
  // the order the file had (a smaller change), new URLs after it in the order written
  const at = new Map([...old.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m, i) => [m[1], i]));
  const ordered = [...new Set(list)].map((u, i) => [u, at.has(u) ? at.get(u) : 1e9 + i]).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
  const body = ordered.map((u) => `  <url><loc>${u}</loc><lastmod>${rootDate(u) || dated.get(u) || date}</lastmod></url>`).join('\n');
  return { file, html: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, before: old };
}

export async function sitemaps(byLang, date, codes, { root = true, langs = true, gone = new Set() } = {}) {
  const out = [];
  if (!INDEX) {
    const mine = (f) => (f === 'sitemap.xml' || f === 'sitemap-index.xml' ? root : /^sitemap-[a-z-]+\.xml$/.test(f) && langs);
    for (const f of readdirSync(ROOT).filter(mine)) out.push({ file: path.join(ROOT, f), html: null, before: await read(path.join(ROOT, f)) });
    return out;
  }
  if (root) out.push(await urlset(path.join(ROOT, sitemapName(ROOT_LANG)), byLang.get(ROOT_LANG), date, true, undefined, gone));
  if (langs) {
    const rootDates = datesIn(root ? out[0].html : await read(path.join(ROOT, sitemapName(ROOT_LANG))));
    for (const code of codes.filter((c) => c !== ROOT_LANG)) {
      const prefix = `${SITE}/${code.toLowerCase()}`;
      out.push(await urlset(path.join(ROOT, sitemapName(code)), byLang.get(code), date, false, (u) => rootDates.get(SITE + u.slice(prefix.length))));
    }
    const names = new Set(codes.map(sitemapName));
    for (const f of readdirSync(ROOT).filter((x) => /^sitemap-(?!index)[a-z-]+\.xml$/.test(x) && !names.has(x))) out.push({ file: path.join(ROOT, f), html: null, before: await read(path.join(ROOT, f)) });
  }
  if (!root) return out;
  const index = path.join(ROOT, 'sitemap-index.xml');
  const body = codes.map((c) => `  <sitemap><loc>${SITE}/${sitemapName(c)}</loc></sitemap>`).join('\n');
  out.push({ file: index, html: `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`, before: await read(index) });
  return out;
}
