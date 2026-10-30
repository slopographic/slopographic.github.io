// Covers: tools/whitelabel/profile.mjs, tools/whitelabel/emit.mjs, tools/whitelabel/transform.mjs, brand/profiles/sample.json, brand/profiles/slopographic.json, brand/profiles/sample-single.json
// The profile schema, the rename map file, the visible-name pairs, the forbidden words, and the files a build writes from
// a profile. The site's own profile gives today's output unchanged (brand.json, every marker literal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, loadProfile, loadMap, phrasePairs, forbiddenTerms, profilesDir, allProfiles } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, brandJson, markSvg, logoSvg, manifest, mit, readme } from '../../tools/whitelabel/emit.mjs';
import { context } from '../../tools/whitelabel/transform.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);

test('every profile in brand/profiles is valid; the sample has a rename map', () => {
  for (const p of allProfiles(DIR)) assert.deepEqual(validate(p), [], p.id);
  assert.ok(loadMap(DIR, 'sample').compounds.length > 3);
  assert.equal(loadMap(DIR, 'slopographic'), null);
});

test('validate names each bad field', () => {
  const p = Object.assign({}, loadProfile(DIR, 'sample'), { origin: 'http://x/', naming: 'fun', colors: { ink: 'red' }, defaultLang: 'xx' });
  const errs = validate(p).join('\n');
  for (const k of ['origin', 'naming', 'colors', 'defaultLang']) assert.match(errs, new RegExp(`^${k}:`, 'm'));
});

test('seo.langs: the SEO pages\' languages besides the root one, \'all\', a list or \'none\'; the marker carries it to tools/seo', () => {
  const sv = loadProfile(DIR, 'sample-sv'), langs = (v) => validate({ ...sv, seo: { ...sv.seo, langs: v } });
  assert.deepEqual([sv.defaultLang, sv.seo.langs], ['sv', ['sv', 'en']]);
  assert.deepEqual(markerValues(sv).seoLangs, ['sv', 'en']);
  assert.equal(markerValues(loadProfile(DIR, 'sample')).seoLangs, undefined, 'unset: the code keeps \'all\'');
  for (const ok of ['all', 'none', [], ['sv'], ['sv', 'de', 'pt-BR', 'zh-CN']]) assert.deepEqual(langs(ok), [], JSON.stringify(ok));
  for (const bad of ['some', 'None', ['sv', 'xx'], ['pt-br'], ['sv', 'sv'], 3, null]) assert.match(langs(bad).join('\n'), /^seo\.langs:/m, JSON.stringify(bad));
  // this site's value is its own profile's (brand/profiles/slopographic.json; the marker test below holds them equal), 'all' unset
  const own = loadProfile(DIR, 'slopographic').seo.langs, src = readFileSync(path.join(ROOT, 'tools/seo/lang.mjs'), 'utf8');
  assert.match(src, /\/\*profile:defaultLang\*\/'en'[\s\S]*\/\*profile:seoLangs\*\//);
  if (own === undefined) assert.match(src, /\/\*profile:seoLangs\*\/'all'/);
  // a list in the marker (this site's own value, set by hand to the profile's) is read back and rewritten like any literal
  const line = "export const SEO_LANGS = /*profile:seoLangs*/'all';", list = applyMarkers(line, { seoLangs: ['sv', 'de'] });
  assert.equal(list, 'export const SEO_LANGS = /*profile:seoLangs*/["sv","de"];');
  assert.equal(applyMarkers(list, { seoLangs: ['sv', 'de'] }), list);
  assert.equal(applyMarkers(list, { seoLangs: 'none' }), 'export const SEO_LANGS = /*profile:seoLangs*/"none";');
});

test('search engines: seo.index (off unless true), canonicalTo, canonicalOverride; the markers carry them to tools/seo', () => {
  const s = loadProfile(DIR, 'sample'), own = loadProfile(DIR, 'slopographic'), seo = (v) => validate({ ...s, seo: { ...s.seo, ...v } });
  assert.equal(markerValues(s).seoIndex, false, 'a profile that does not say true is not indexed');
  assert.equal(markerValues(loadProfile(DIR, 'sample-sv')).seoIndex, false);
  assert.equal(own.seo.index, true, 'this site is');
  assert.equal(markerValues(own).seoIndex, true);
  for (const ok of [{ index: true }, { index: false }, { canonicalTo: 'https://tools.example.com' }, { canonicalOverride: { '/pdf/': 'https://pdf.example/pdf/', '=/pdf/': 'https://pdf.example/' } }]) assert.deepEqual(seo(ok), [], JSON.stringify(ok));
  for (const [bad, key] of [[{ index: 'yes' }, 'seo.index'], [{ canonicalTo: 'https://x.example/' }, 'seo.canonicalTo'], [{ canonicalTo: 'http://x.example' }, 'seo.canonicalTo'],
    [{ canonicalOverride: { pdf: 'https://p.example/' } }, 'seo.canonicalOverride'], [{ canonicalOverride: { '/pdf/': 'https://p.example' } }, 'seo.canonicalOverride'], [{ canonicalOverride: [] }, 'seo.canonicalOverride']]) {
    assert.match(seo(bad).join('\n'), new RegExp(`^${key.replace('.', '\\.')}:`, 'm'), JSON.stringify(bad));
  }
  const v = markerValues({ ...s, seo: { canonicalTo: 'https://m.example', canonicalOverride: { '/pdf/': 'https://p.example/pdf/' } } });
  assert.deepEqual([v.seoCanonicalTo, v.seoCanonicalOverride], ['https://m.example', { '/pdf/': 'https://p.example/pdf/' }]);
  // an object marker is rewritten and read back like any literal
  const line = 'export const O = /*profile:seoCanonicalOverride*/{};', set = applyMarkers(line, v);
  assert.equal(set, 'export const O = /*profile:seoCanonicalOverride*/{"/pdf/":"https://p.example/pdf/"};');
  assert.equal(applyMarkers(set, v), set);
  assert.equal(applyMarkers(set, markerValues(own)), line, 'this site\'s own value');
});

test('a single-app site: mainApp, parent; the app ids a marker names are renamed like the registry', () => {
  const one = loadProfile(DIR, 'sample-single'), s = loadProfile(DIR, 'sample');
  assert.deepEqual(validate(one), []);
  assert.equal(one.mainApp, 'pdf');
  assert.ok(!one.apps.hide.includes('pdf') && one.apps.hide.length > 30);
  assert.deepEqual(markerValues(one).parent, { name: one.parent.name, url: 'https://example.com' });
  assert.equal(markerValues(s).parent, null);
  assert.equal(markerValues(s).mainApp, '');
  for (const [bad, key] of [[{ mainApp: 'nope' }, 'mainApp'], [{ mainApp: 'pdf', apps: { hide: ['pdf'] } }, 'mainApp'], [{ parent: { name: 'X' } }, 'parent'], [{ parent: { name: '', url: 'https://x.example' } }, 'parent'], [{ parent: { name: 'X', url: 'http://x.example' } }, 'parent']]) {
    assert.match(validate({ ...s, ...bad }).join('\n'), new RegExp(`^${key}:`, 'm'), JSON.stringify(bad));
  }
  const ctx = context(ROOT, one, loadMap(DIR, 'sample-single'));
  assert.ok(ctx.values.hideApps.length === one.apps.hide.length && !ctx.values.hideApps.some((id) => /slop/.test(id)), 'no source id reaches the build');
  assert.ok(ctx.values.hideApps.includes('imageeditor'));
});

test('phrase pairs: registry plain names, the tone copy, the brand name', () => {
  const pairs = new Map(phrasePairs(ROOT, loadProfile(DIR, 'sample')));
  assert.equal(pairs.get('Slop PDF'), 'PDF Editor');
  assert.equal(pairs.get('PhotoSlop'), 'Image Editor');
  assert.equal(pairs.get('Slop Drive'), 'Files');
  assert.equal(pairs.get('Slopographic'), 'Acme Tools');
  assert.equal(pairs.get('Sloppo'), 'Helper');
  assert.deepEqual(phrasePairs(ROOT, loadProfile(DIR, 'slopographic')).map((x) => x[0]).filter((x) => x === 'Slop PDF'), []);
});

test('forbidden words: the source stem and the other profiles’ terms', () => {
  const t = forbiddenTerms(DIR, loadProfile(DIR, 'sample'));
  assert.ok(t.includes('slop') && t.includes('slurp'));
  assert.ok(!t.includes('acme tools'));
});

test('the site’s own profile writes today’s brand.json', () => {
  const src = JSON.parse(readFileSync(path.join(ROOT, 'brand/brand.json'), 'utf8'));
  assert.deepEqual(brandJson(src, loadProfile(DIR, 'slopographic')), src);
});

test('the site’s own profile leaves every marker literal as it is', () => {
  const values = markerValues(loadProfile(DIR, 'slopographic'));
  const files = ['shared/apps.js', 'shared/theme/theme.js', 'shared/buddy/boot.js', 'shared/consent/config.js', 'shared/i18n/i18n.js', 'ai/js/ui/sloppo.js', 'drive/js/ui/empty.js', 'shared/seo/copy.mjs', 'tools/seo/lang.mjs', 'tools/seo/site.mjs'];
  for (const f of files) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(text, /\/\*profile:\w+\*\//, f);
    assert.equal(applyMarkers(text, values), text, f);
  }
  const sample = markerValues(loadProfile(DIR, 'sample'));
  assert.match(applyMarkers("const N = /*profile:naming*/'brand';", sample), /\/\*profile:naming\*\/"plain"/);
  assert.throws(() => applyMarkers('/*profile:nope*/1', sample), /unknown profile marker/);
});

test('generated files: logo, manifest, licence, README', () => {
  const p = loadProfile(DIR, 'sample');
  assert.match(markSvg(p), /<svg[^>]*>.*>A<\/text>/s);
  assert.match(logoSvg(p), /Acme Tools/);
  const m = JSON.parse(manifest(JSON.stringify({ name: 'x', short_name: 'y', icons: [] }), p));
  assert.equal(m.name, 'Acme Tools'); assert.equal(m.theme_color, p.colors.ink);
  assert.match(mit(p), /Copyright \(c\) 2026 Acme Example Ltd/);
  assert.match(readme(p), /Generated - do not edit/);
});

test('no file in the repository names a real brand profile', () => {
  // brand/profiles holds the made-up sample and the site's own profile only; real ones live outside the repository.
  const names = readdirSync(DIR).filter((f) => statSync(path.join(DIR, f)).isFile());
  assert.deepEqual(names.sort(), ['sample-single.json', 'sample-single.map.json', 'sample-sv.json', 'sample-sv.map.json', 'sample.json', 'sample.map.json', 'slopographic.json']);
});
