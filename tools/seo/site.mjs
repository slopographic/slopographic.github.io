// Shared site facts for the SEO tools: the root folder, the site origin, the app registry reader and URL helpers.
// Used by tools/seo/write.mjs and tools/seo/landing.mjs. Node only. Tests: tests/seo/robots.test.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE = 'https://slopographic.com';
// The brand profile's search settings (markers: tools/whitelabel/emit.mjs markerValues; brand/README.md "Search engines"):
// INDEX false (any profile that does not say true): every page says noindex, no sitemaps, no generated SEO pages, no
// language folders; CANONICAL_TO: the origin every canonical points to instead of SITE (''); CANONICAL_OVERRIDE: the
// canonical of the pages under a path ({ '/pdf/': 'https://pdf.example/pdf/', '=/pdf/': one page }); MAIN_APP: the app the
// site's root opens (a single-app site, mainapp.mjs).
export const INDEX = /*profile:seoIndex*/true;
export const CANONICAL_TO = /*profile:seoCanonicalTo*/'';
export const CANONICAL_OVERRIDE = /*profile:seoCanonicalOverride*/{};
export const MAIN_APP = /*profile:mainApp*/'';

/** The app registry, read the way the browser reads it (a classic script that sets window.SLOP_APPS). */
export async function loadRegistry() { return registryWindow().SLOP_APPS; }
/** The same, at once: the window the registry script fills (SLOP_APPS, SLOP_GROUP_LABELS). */
export function registryWindow() {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(ROOT, 'shared', 'apps.js'), 'utf8'), { window: win });
  return win;
}
export const isPage = (app) => !!app.path && !app.path.startsWith('#');
export const pageUrl = (app) => `${SITE}/${app.path}`;
