// The brand facts the tests read (tests/brand-facts.js) are this site's own profile here (brand/profiles/slopographic.json),
// so a test that compares with a fact is exactly as strict on this site as one that wrote this site's value; and a build
// rewrites them from its profile like every other marker (tools/whitelabel/emit.mjs). Repo-only: a build has no profiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { FACTS, BRAND, ROOT } from '../brand-facts.mjs';
import { loadProfile, profilesDir } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, brandJson, manifest, homeThemeColor } from '../../tools/whitelabel/emit.mjs';

const facts = (src) => { const g = {}; vm.runInNewContext(src, g); return g.BRAND_FACTS; };
const SRC = readFileSync(path.join(ROOT, 'tests/brand-facts.js'), 'utf8');

test('here the facts are this site\'s profile: brand names, playful, the buddy, media, analytics, English, no app hidden', () => {
  const p = loadProfile(profilesDir(ROOT), 'slopographic');
  assert.deepEqual({ ...FACTS, hideApps: [...FACTS.hideApps], aiModels: { ...FACTS.aiModels }, themes: [...FACTS.themes] }, { naming: p.naming, tone: p.tone, mascot: p.mascot === true ? 'builtin' : 'none',
    media: p.media, analytics: p.analytics, defaultLang: p.defaultLang, hideApps: p.apps.hide, seoIndex: p.seo.index, aiModels: {},
    savings: p.savings !== false, themes: ['light', 'dark', 'classic', 'lime'], themeBrand: '', defaultTheme: 'system' });
  assert.deepEqual([FACTS.naming, FACTS.tone, FACTS.mascot, FACTS.defaultLang], ['brand', 'playful', 'builtin', 'en']);
  assert.equal(applyMarkers(SRC, markerValues(p)), SRC, 'this site\'s profile leaves the file as it is');
  assert.deepEqual(BRAND.support, brandJson(BRAND, p).support);
  // the manifest the browser tests compare with brand.json: this site's names and colours (Slopographic, Slop, #0a0a0a)
  const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')), want = JSON.parse(manifest(JSON.stringify(m), p));
  for (const k of ['name', 'short_name', 'background_color', 'theme_color', 'lang']) assert.equal(m[k], want[k], k);
  assert.deepEqual([m.name, m.short_name, m.background_color], ['Slopographic', 'Slop', '#0a0a0a']);
  // the homepage's theme-color is the manifest's: a build writes its own ink there
  const home = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(homeThemeColor(home, p), home);
  assert.match(homeThemeColor(home, { colors: { ink: '#123456' } }), /<meta name="theme-color" content="#123456">/);
});

test('a build\'s facts follow its profile: the samples', () => {
  const dir = profilesDir(ROOT);
  const sample = facts(applyMarkers(SRC, markerValues(loadProfile(dir, 'sample'))));
  assert.deepEqual([sample.naming, sample.tone, sample.mascot, sample.media, sample.analytics, sample.defaultLang], ['plain', 'plain', 'overlay', false, false, 'en']);
  const sv = facts(applyMarkers(SRC, markerValues(loadProfile(dir, 'sample-sv'))));
  assert.deepEqual([sv.mascot, sv.defaultLang, sv.seoIndex], ['none', 'sv', false]);
  assert.equal(sample.seoIndex, false, 'a profile that does not say true is not indexed');
  // hidden themes and brand theme names: the tests offer only the themes the build has, named after the brand
  const p = loadProfile(dir, 'sample');
  const themed = facts(applyMarkers(SRC, markerValues({ ...p, themes: { ...p.themes, hide: ['classic', 'lime'], names: 'name' }, defaultTheme: 'light' })));
  assert.deepEqual([[...themed.themes], themed.themeBrand, themed.defaultTheme], [['light', 'dark'], p.name, 'light']);
});
