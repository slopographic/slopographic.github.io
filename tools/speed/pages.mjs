// The pages the speed check measures (tools/speed/run.mjs): every URL in sitemap.xml (the homepage, the site pages and every
// generated SEO page), every app page in shared/apps.js, and the site pages that are not in the sitemap (settings/ and the
// fixed list below). A page is its path from the site root, "" for the homepage, "pdf/" for an app. Unit-tested in
// tests/node/speed-pages.test.mjs.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Site pages measured whether or not the sitemap lists them. */
export const FIXED = ['', 'settings/', 'how-it-works/', 'all-tools/', 'compare/', 'best/'];

/** The site paths in a sitemap's text: https://host/a/b/ -> "a/b/", the root -> "". */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/^\//, ''));
}

/** The page paths of the apps in the registry: relative paths only (no anchors, no external links), with a trailing slash. */
export function appPaths(apps) {
  return apps.map((a) => String(a.path || '')).filter((p) => p && !/^(#|[a-z]+:|\/\/)/i.test(p))
    .map((p) => p.split(/[?#]/)[0]).filter(Boolean).map((p) => (p.endsWith('/') || /\.html?$/.test(p) ? p : p + '/'));
}

/** Every page once, in name order (the homepage "" first). */
export function allPages({ sitemap = [], apps = [], fixed = FIXED } = {}) {
  return [...new Set([...fixed, ...sitemap, ...apps])].sort();
}

/** The registry's apps, read the way the browser runs shared/apps.js. */
export function readApps(root = ROOT) {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(root, 'shared/apps.js'), 'utf8'), { window: win });
  return JSON.parse(JSON.stringify(win.SLOP_APPS || []));
}

/** The pages of the checkout at root, keeping only those whose file is there (a page dir has an index.html). */
export function discoverPages(root = ROOT) {
  const pages = allPages({
    // a site that is not indexed has no sitemap (tools/seo/robots.mjs): its pages are the apps and the fixed ones
    sitemap: existsSync(path.join(root, 'sitemap.xml')) ? sitemapPaths(readFileSync(path.join(root, 'sitemap.xml'), 'utf8')) : [],
    apps: appPaths(readApps(root)),
  });
  return pages.filter((p) => existsSync(path.join(root, p.endsWith('/') || p === '' ? p + 'index.html' : p)));
}
