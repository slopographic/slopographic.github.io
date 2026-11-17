// Swedish (shared/i18n/sv.js, shared/i18n/sv-apps.js) and the default language choice of shared/i18n/i18n.js: a brand
// profile's defaultLang is the language a visitor gets with nothing stored; English stays the fallback for missing keys.
// Run: node --test tests/node/i18n-sv.test.mjs
// Covers: shared/i18n/i18n.js, shared/i18n/sv.js, shared/i18n/sv-apps.js, shell/shell.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS } from '../brand-facts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const read = (f) => readFile(path.join(ROOT, f), 'utf8');
const MARKER = /\/\*profile:defaultLang\*\/(?:'[\w-]+'|"[\w-]+")/;   // this repo: 'en'; a build writes its profile's

/** Loads profile, i18n (with its default-choice literal rewritten the way tools/whitelabel does), English, Swedish. */
async function boot({ defaultLang, storage = memStorage() } = {}) {
  let i18n = await read('shared/i18n/i18n.js');
  if (defaultLang) i18n = i18n.replace(MARKER, `/*profile:defaultLang*/${JSON.stringify(defaultLang)}`);
  const ctx = { localStorage: storage };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const [f, src] of [['profile.js', await read('shared/profile/profile.js')], ['i18n.js', i18n], ['strings.js', await read('shared/i18n/strings.js')],
    ['sv.js', await read('shared/i18n/sv.js')], ['sv-apps.js', await read('shared/i18n/sv-apps.js')]]) vm.runInContext(src, ctx, { filename: f });
  return { I: ctx.SlopI18n, storage };
}

test('the default choice is one literal after the profile marker, on one line, and the build\'s start language (this repo: English)', async () => {
  const src = await read('shared/i18n/i18n.js');
  assert.equal(src.match(/\/\*profile:defaultLang\*\//g).length, 1);
  const lit = /var DEFAULT_CHOICE = \/\*profile:defaultLang\*\/('[\w-]+'|"[\w-]+");/.exec(src);
  assert.ok(lit, 'one quoted literal on the DEFAULT_CHOICE line');
  assert.equal(lit[1].slice(1, -1), FACTS.defaultLang);
});

test('with defaultLang sv and nothing stored the site starts in Swedish; English is still the fallback for a missing key', async () => {
  const { I } = await boot({ defaultLang: 'sv' });
  assert.equal(I.get(), 'sv');
  assert.equal(I.DEFAULT, 'en');
  assert.equal(I.DEFAULT_CHOICE, 'sv');
  assert.equal(I.t('nav.apps'), 'Appar');
  assert.equal(I.t('nav.settings'), 'Inställningar');
  I.add('en', { 'only.en': 'English only' });
  assert.equal(I.t('only.en'), 'English only');
});

test('switching to English is stored, and survives a new page with the same storage', async () => {
  const storage = memStorage();
  const { I } = await boot({ defaultLang: 'sv', storage });
  assert.equal(I.set('en').ok, true);
  assert.equal(I.get(), 'en');
  assert.equal(JSON.parse(storage.m.get('slop-profile')).data.lang.mode, 'en');
  const again = await boot({ defaultLang: 'sv', storage });
  assert.equal(again.I.get(), 'en');
  assert.equal(again.I.t('nav.apps'), 'Apps');
  assert.equal(again.I.set('sv').ok, true, 'choosing the default again clears the override');
  assert.equal(JSON.parse(storage.m.get('slop-profile')).data.lang?.mode, undefined);
});

test('with the default (en) the site starts in English, and an unknown stored code reads as the default choice', async () => {
  assert.equal((await boot()).I.get(), FACTS.defaultLang);   // the build's own start language (this repo: English)
  assert.equal((await boot({ defaultLang: 'en' })).I.get(), 'en');
  assert.equal((await boot({ defaultLang: 'en' })).I.t('nav.apps'), 'Apps');
  const bad = memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'zz' } } }) });
  assert.equal((await boot({ defaultLang: 'sv', storage: bad })).I.get(), 'sv');
  const { I } = await boot();
  assert.equal(I.create({ storage: memStorage(), defaultLang: 'sv' }).get(), 'sv', 'create() takes defaultLang');
  assert.equal(I.create({ storage: memStorage(), defaultLang: 'xx' }).get(), 'en', 'an unknown default is English');
});

test('Swedish is in the language list and every app id in shared/apps.js has a Swedish name and description', async () => {
  const { I } = await boot();
  const sv = I.LANGS.find((l) => l.code === 'sv');
  assert.equal(sv.name, 'Svenska');
  assert.equal(sv.dir, 'ltr');
  const win = {};
  vm.runInNewContext(await read('shared/apps.js'), { window: win });
  assert.ok(win.SLOP_APPS.length > 40, 'the registry is read');
  I.set('sv');
  const missing = [];
  for (const a of win.SLOP_APPS) {
    for (const k of [`app.${a.id}`, `apptag.${a.id}`]) if (I.t(k) === k || !I.t(k).trim()) missing.push(k);
  }
  assert.deepEqual(missing, []);
  assert.equal(I.t('app.pdf'), 'PDF-redigerare');
  assert.equal(I.t('app.drive'), 'Filer');
});

test('a Swedish page fetches sv.js and then sv-apps.js (the sv entry has appNames), after English', async () => {
  const i18n = await read('shared/i18n/i18n.js');
  assert.match(i18n, /L\('sv', 'Svenska', 'Swedish', 'ltr', \{ appNames: true \}\)/);
  assert.match(i18n, /c \+ '-apps\.js'/, 'the chrome source adds <code>-apps.js for a language with appNames');
});
