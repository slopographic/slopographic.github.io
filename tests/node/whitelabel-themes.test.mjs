// Covers: shared/theme/theme.js, tools/whitelabel/emit.mjs, tools/whitelabel/profile.mjs, settings/appearance.js
// A brand profile's theme options in a build: themes.names ("<brand> Light" / "<brand> Dark" in every language, through the
// chrome keys shell.theme_brand_light / _dark) and defaultTheme (the theme of a visitor who never chose one; a choice
// still wins). The theme script is run with the profile's markers applied, as tools/whitelabel/build.mjs writes it.
// Run: node --test tests/node/whitelabel-themes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInto } from './fx-env.mjs';
import { validate, loadProfile, profilesDir } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, themesMarker } from '../../tools/whitelabel/emit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLE = loadProfile(profilesDir(ROOT), 'sample');
const THEME_JS = readFileSync(path.join(ROOT, 'shared/theme/theme.js'), 'utf8');
// every chrome table: the files of shared/i18n that hold shell.theme_light (strings.js is English)
const I18N = path.join(ROOT, 'shared/i18n');
const TABLES = readdirSync(I18N).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(path.join(I18N, f), 'utf8')])
  .filter(([, text]) => text.includes("'shell.theme_light'"));
const memStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
/** SlopTheme built for a profile (its markers applied), with the English and Swedish chrome tables. */
async function built(profile, { prefersLight = false } = {}) {
  const ctx = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/strings.js', 'i18n/sv.js'], {
    localStorage: memStorage(), matchMedia: (q) => ({ matches: q.includes('light') ? prefersLight : false, addEventListener() {} }),
  });
  vm.runInContext(applyMarkers(THEME_JS, markerValues(profile)), ctx, { filename: 'theme.js' });
  return { T: ctx.SlopTheme, I: ctx.SlopI18n, storage: ctx.localStorage };
}
const withThemes = (extra, rest = {}) => Object.assign({}, SAMPLE, rest, { themes: Object.assign({}, SAMPLE.themes, extra) });

test('themes.names: Light and Dark read "<brand> Light" / "<brand> Dark" in English and Swedish', async () => {
  const { T, I } = await built(withThemes({ names: 'brandWord', hide: ['lime'] }));
  I.set('en');
  assert.deepEqual(Array.from(T.THEMES, (t) => t.name), ['Acme Light', 'Acme Dark', 'Classic 98']);
  assert.deepEqual(Array.from(T.THEMES, (t) => t.branded), [true, true, false]);
  I.set('sv');
  assert.deepEqual(Array.from(T.THEMES, (t) => t.name), ['Acme Ljust', 'Acme Mörkt', 'Klassiskt 98']);
  const byName = await built(withThemes({ names: 'name' }));
  byName.I.set('en');
  assert.equal(byName.T.THEMES[0].name, `${SAMPLE.name} Light`);
});

test('without themes.names the themes keep their plain names', async () => {
  const { T, I } = await built(SAMPLE);
  I.set('en');
  assert.deepEqual(Array.from(T.THEMES, (t) => t.name).slice(0, 2), ['Light', 'Dark']);
  assert.equal(T.THEMES[0].branded, false);
});

test('every chrome table has the brand theme keys with the {brand} placeholder', () => {
  assert.ok(TABLES.length >= 29, `${TABLES.length} chrome tables`);
  for (const [f, text] of TABLES) {
    for (const k of ['shell.theme_brand_light', 'shell.theme_brand_dark']) {
      const m = text.match(new RegExp(`'${k.replace(/\./g, '\\.')}': '([^']*)'`));
      assert.ok(m, `${f}: ${k}`);
      assert.match(m[1], /\{brand\}/, `${f}: ${k} keeps {brand}`);
    }
  }
});

test('defaultTheme is used when nothing is stored, and a visitor\'s own choice wins', async () => {
  const p = withThemes({}, { defaultTheme: 'light' });
  const fresh = await built(p, { prefersLight: false });
  assert.equal(fresh.T.DEFAULT, 'light');
  assert.equal(fresh.T.get(), 'light');
  assert.equal(fresh.T.resolve(fresh.T.get()), 'light', 'a dark system still gets the profile default');
  const chose = await built(p);
  assert.equal(chose.T.set('dark').ok, true);
  assert.equal(chose.T.get(), 'dark');
  chose.T.set('system');
  assert.equal(chose.T.get(), 'system', 'System is kept as a choice when the default is not System');
  chose.T.set('light');
  assert.equal(chose.T.get(), 'light');
  assert.equal((await built(SAMPLE)).T.get(), 'system', 'no defaultTheme: System');
});

test('the markers: names becomes the brand text, defaultTheme its own marker; this site keeps its literals', () => {
  assert.deepEqual(themesMarker(withThemes({ names: 'brandWord', hide: ['lime'] })), Object.assign({}, SAMPLE.themes, { hide: ['lime'], brand: 'Acme' }));
  assert.equal('names' in themesMarker(withThemes({ names: 'name' })), false);
  assert.equal(themesMarker(SAMPLE).brand, undefined);
  assert.equal(markerValues(withThemes({}, { defaultTheme: 'dark' })).defaultTheme, 'dark');
  assert.match(THEME_JS, /\/\*profile:defaultTheme\*\/'system'/);
});

test('validate: themes.names, themes.hide, theme ids and defaultTheme', () => {
  const errs = (p) => validate(p).join('\n');
  assert.deepEqual(validate(withThemes({ names: 'brandWord', hide: ['lime', 'classic'] }, { defaultTheme: 'light' })), []);
  assert.deepEqual(validate(withThemes({}, { defaultTheme: 'system' })), []);
  assert.match(errs(withThemes({ names: 'yes' })), /^themes\.names:/m);
  assert.match(errs(Object.assign(withThemes({ names: 'brandWord' }), { brandWord: undefined })), /^themes\.names:/m);
  assert.match(errs(withThemes({ hide: ['mauve'] })), /^themes\.hide:/m);
  assert.match(errs(withThemes({ sepia: SAMPLE.themes.light })), /^themes\.sepia:/m);
  assert.match(errs(withThemes({ hide: ['lime'] }, { defaultTheme: 'lime' })), /^defaultTheme:/m);
  assert.match(errs(withThemes({}, { defaultTheme: 'auto' })), /^defaultTheme:/m);
});
