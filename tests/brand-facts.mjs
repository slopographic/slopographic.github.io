// The brand facts for Node tests: the profile's switches (tests/brand-facts.js, the same markers as the code), the brand
// (brand/brand.json) and the app registry with its visible names (shared/apps.js, as a page loads it). A test that is about
// a feature, not about this site's values, reads names, switches and the start language from here, so it passes on this
// site and on every white-label build of it with the same assertions. Node only. Tests: tests/node/brand-facts.test.mjs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

/** The profile's switches: { naming, tone, mascot ('builtin' | 'overlay' | 'none'), media, analytics, defaultLang, hideApps, seoIndex, aiModels, savings }. */
export const FACTS = (() => { const g = {}; vm.runInNewContext(read('tests/brand-facts.js'), g); return g.BRAND_FACTS; })();

/** brand/brand.json as shipped. */
export const BRAND = JSON.parse(read('brand/brand.json'));

/** The registry as a page sees it: { apps, all, name(id or app), tagline(app) } (no language loaded, so the profile's own names). */
export function registry() {
  const w = {};
  vm.runInNewContext(read('shared/apps.js'), { window: w });
  return { apps: w.SLOP_APPS, all: w.SLOP_ALL_APPS, name: w.slopAppName, tagline: w.slopAppTagline, groups: w.SLOP_GROUP_LABELS };
}

/** The visible name of an app id (the profile's naming). */
export const appName = (id) => registry().name(id);
