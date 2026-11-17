// SlopI18n: the language list, t() with English fallback and {var} filling, the stored choice, apply() on a small fake
// DOM, and every data-i18n key on the homepage and Settings existing in English. Run: node --test tests/node/i18n.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInto, plain } from './fx-env.mjs';
import { FACTS } from '../brand-facts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const EN = {
  'nav.apps': 'Apps',
  'nav.status': 'Status',
  'greet': 'Hi {name}, {n} left, {missing} stays',
};

const TWO = [{ code: 'en', name: 'English', dir: 'ltr', complete: true }, { code: 'xx', name: 'Test', dir: 'rtl', complete: false }];
const base = await loadInto(['profile/profile.js', 'i18n/i18n.js'], { localStorage: memStorage() });

/** The global instance, loaded the way a page loads it (profile, then i18n, then strings). */
async function global(seed = {}) {
  const storage = memStorage(seed);
  const ctx = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/strings.js'], { localStorage: storage });
  return { I: ctx.SlopI18n, storage };
}
/** A fresh instance over a two-language list (en, xx), with its own storage and strings. */
function instance({ seed = {}, en = EN, xx, document, storage } = {}) {
  const I = base.SlopI18n.create({ languages: TWO, storage: storage || memStorage(seed), document });
  I.add('en', en);
  if (xx) I.add('xx', xx);
  return I;
}
const XX = JSON.stringify({ v: 1, data: { lang: { mode: 'xx' } } });

test('the language list is data: English first, codes unique, each with a name and a text direction', async () => {
  const { I } = await global();
  const list = plain(I.LANGS);
  assert.equal(list[0].code, 'en');
  assert.equal(list[0].name, 'English');
  assert.equal(list[0].dir, 'ltr');
  assert.equal(list[0].complete, true);
  assert.equal(new Set(list.map((l) => l.code)).size, list.length, 'codes are unique');
  for (const l of list) {
    assert.match(l.code, /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, `code ${l.code}`);
    assert.ok(typeof l.name === 'string' && l.name.length > 0, `name of ${l.code}`);
    assert.ok(['ltr', 'rtl'].includes(l.dir), `dir of ${l.code}`);
  }
  assert.equal(I.DEFAULT, 'en');
  assert.equal(I.DEFAULT_CHOICE, FACTS.defaultLang, 'the build starts in its own language (this repo: English)');
  assert.equal(Object.isFrozen(I.LANGS), true);
  I.langs().pop();
  assert.equal(I.langs().length, I.LANGS.length, 'langs() gives a copy');
});

test('with nothing stored the choice is the start language; an unknown stored code falls back to it', async () => {
  const { I } = await global();
  assert.equal(I.get(), FACTS.defaultLang);   // this repo: English
  const bad = instance({ seed: { 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'zz' } } }) } });
  assert.equal(bad.get(), 'en');
  assert.equal((await global({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'zz' } } }) })).I.get(), FACTS.defaultLang);
});

test('set refuses a code that is not in the list and stores nothing', async () => {
  const I = instance({ en: EN });
  const r = plain(I.set('zz'));
  assert.equal(r.ok, false);
  assert.equal(I.get(), 'en');
});

test('set stores the choice in SlopProfile under lang/mode, and get reads it back', async () => {
  const storage = memStorage();
  const I = instance({ storage, en: EN, xx: { 'nav.apps': 'Xx apps' } });
  assert.deepEqual(plain(I.set('xx')), { ok: true, code: 'xx' });
  const o = JSON.parse(storage.m.get('slop-profile'));
  assert.equal(o.data.lang.mode, 'xx');
  assert.equal(I.get(), 'xx');
  assert.deepEqual(plain(I.set('en')), { ok: true, code: 'en' });
  assert.equal(I.get(), 'en');
});

test('t() gives the chosen language, falls back to English key by key, and then to the key itself', async () => {
  const seed = { 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'xx' } } }) };
  const I = instance({ seed, en: EN, xx: { 'nav.apps': 'Xx apps' } });
  assert.equal(I.get(), 'xx');
  assert.equal(I.t('nav.apps'), 'Xx apps');
  assert.equal(I.t('nav.status'), 'Status', 'missing in xx, so English');
  assert.equal(I.t('no.such.key'), 'no.such.key', 'missing everywhere, so the key');
});

test('t() fills {name} placeholders and leaves unknown ones in place', async () => {
  const I = instance({ en: EN });
  assert.equal(I.t('greet', { name: 'Ana', n: 3 }), 'Hi Ana, 3 left, {missing} stays');
  assert.equal(I.t('greet'), 'Hi {name}, {n} left, {missing} stays');
  assert.equal(I.t('nav.apps', { name: 'x' }), 'Apps', 'vars on a plain string do nothing');
});

test('t() on the global instance gives the English strings the pages use', async () => {
  const { I } = await global();
  assert.equal(I.t('nav.apps'), 'Apps');
  assert.equal(I.t('footer.code_license'), 'Code MIT');
  assert.equal(I.t('settings.language_saved', { name: 'English' }), 'Saved. English is the language of the app text.');
});

test('apply() sets lang and dir on the root, replaces data-i18n text and data-i18n-attr attributes', async () => {
  const root = fakeEl('html');
  const apps = fakeEl('a', { 'data-i18n': 'nav.apps' }, 'Apps');
  const status = fakeEl('a', { 'data-i18n': 'nav.status' }, 'Status');
  const aria = fakeEl('button', { 'data-i18n-attr': 'aria-label:nav.apps;title:nav.status' }, '');
  const keep = fakeEl('p', { 'data-i18n': 'no.such.key' }, 'Kept');
  const nodes = { '[data-i18n]': [apps, status, keep], '[data-i18n-attr]': [aria] };
  const document = { documentElement: root, querySelectorAll: (sel) => nodes[sel] || [] };
  const I = instance({ seed: { 'slop-profile': XX }, en: EN, xx: { 'nav.apps': 'Xx apps' }, document });
  I.apply();
  assert.equal(root.attrs.lang, 'xx');
  assert.equal(root.attrs.dir, 'rtl');
  assert.equal(apps.textContent, 'Xx apps');
  assert.equal(status.textContent, 'Status', 'missing in xx, so English text');
  assert.equal(keep.textContent, 'Kept', 'missing everywhere, so the element keeps its own text');
  assert.equal(aria.attrs['aria-label'], 'Xx apps');
  assert.equal(aria.attrs.title, 'Status');
});

test('apply() on an English page sets lang="en" and dir="ltr"', async () => {
  const root = fakeEl('html');
  const document = { documentElement: root, querySelectorAll: () => [] };
  instance({ en: EN, document }).apply();
  assert.equal(root.attrs.lang, 'en');
  assert.equal(root.attrs.dir, 'ltr');
});

test('every data-i18n key on the homepage and Settings has an English string', async () => {
  const { I } = await global();
  // the shared components' words beyond ui/en.js (UI_PARTS: shared/i18n/ui/en/<part>.js), as a page has them
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(path.join(ROOT, 'shared/i18n/ui/en')).filter((n) => n.endsWith('.js'))) new Function('window', await readFile(path.join(ROOT, 'shared/i18n/ui/en', f), 'utf8'))({ SlopI18n: I });
  // Settings keeps its own words like an app (settings/i18n/en/*.js, keys settings.<area>.<name>) beside the chrome's
  const { pageAreas, sharedAreas, appTables } = await import('../../tools/i18n/tables.mjs');
  const own = appTables(pageAreas().find((a) => a.id === 'settings')).tables.en;
  // the app words (shared/i18n/apps/en.js: the homepage strip and footer links, seo.mq.* and seo.foot.*; tools/seo/apptables.mjs)
  new Function('window', await readFile(path.join(ROOT, 'shared/i18n/apps/en.js'), 'utf8'))({ SlopI18n: I });
  I.add('en', Object.fromEntries(own));
  const missing = [];
  for (const f of ['index.html', 'settings/index.html']) {
    const html = await readFile(path.join(ROOT, f), 'utf8');
    // a shared area's words (shared/<area>/i18n, e.g. the homepage's savings line) when the page loads its index.js
    for (const a of sharedAreas()) if (a.id !== 'ui-parts' && html.includes(`src="${a.base}index.js"`)) I.add('en', Object.fromEntries(appTables(a).tables.en || []));
    for (const a of pageAreas()) if (html.includes(`${a.dir}i18n/index.js"`)) I.add('en', Object.fromEntries(appTables(a).tables.en || [])); // privacy/i18n: the link
    for (const m of html.matchAll(/data-i18n(?:-attr)?="([^"]+)"/g)) {
      for (const pair of m[1].split(';')) {
        const key = pair.includes(':') ? pair.slice(pair.indexOf(':') + 1) : pair;
        if (I.t(key) === key) missing.push(`${f}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

/** The keys and values of a language file (shared/i18n/<file>), read from its add('<code>', { 'key': 'text', ... }) call. */
async function table(file) {
  const src = await readFile(path.join(ROOT, 'shared', 'i18n', file), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/^\s*'([\w.]+)':\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) out.set(m[1], m[2]);
  return out;
}
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every key in English has a translation in each other language, with the same placeholders', async () => {
  const { I } = await global();
  const en = await table('strings.js');
  assert.ok(en.size > 50, 'the English table is read');
  const others = plain(I.LANGS).filter((l) => l.code !== 'en');
  assert.ok(others.length >= 1, 'at least one other language');
  for (const l of others) {
    const file = `${l.code}.js`;
    const tr = await table(file);
    const missing = [...en.keys()].filter((k) => !tr.has(k));
    const extra = [...tr.keys()].filter((k) => !en.has(k));
    assert.deepEqual(missing, [], `${l.code} is missing keys`);
    assert.deepEqual(extra, [], `${l.code} has keys English does not`);
    for (const [k, v] of en) {
      assert.ok(tr.get(k).trim().length > 0, `${l.code}: ${k} is empty`);
      assert.equal(placeholders(tr.get(k)), placeholders(v), `${l.code}: ${k} placeholders`);
    }
  }
});

/** The languages in the picker, in order: code, the name each language gives itself, and its text direction. */
const LANG_ORDER = [
  ['en', 'English', 'ltr'], ['es', 'Español', 'ltr'], ['fr', 'Français', 'ltr'], ['de', 'Deutsch', 'ltr'],
  ['pt-BR', 'Português (Brasil)', 'ltr'], ['it', 'Italiano', 'ltr'], ['ar', 'العربية', 'rtl'], ['sv', 'Svenska', 'ltr'],
  ['zh-CN', '简体中文', 'ltr'], ['zh-TW', '繁體中文', 'ltr'], ['ja', '日本語', 'ltr'], ['ko', '한국어', 'ltr'], ['hi', 'हिन्दी', 'ltr'],
  ['ru', 'Русский', 'ltr'], ['uk', 'Українська', 'ltr'], ['pl', 'Polski', 'ltr'], ['nl', 'Nederlands', 'ltr'], ['tr', 'Türkçe', 'ltr'],
  ['id', 'Bahasa Indonesia', 'ltr'], ['vi', 'Tiếng Việt', 'ltr'], ['he', 'עברית', 'rtl'],
  ['sw', 'Kiswahili', 'ltr'], ['am', 'አማርኛ', 'ltr'], ['ha', 'Hausa', 'ltr'], ['yo', 'Yorùbá', 'ltr'], ['ig', 'Igbo', 'ltr'],
  ['zu', 'isiZulu', 'ltr'], ['xh', 'isiXhosa', 'ltr'], ['af', 'Afrikaans', 'ltr'],
];
const BETA = ['sw', 'am', 'ha', 'yo', 'ig', 'zu', 'xh', 'af'];

test('the picker lists every language by its own name, English first; Arabic and Hebrew are right to left', async () => {
  const { I } = await global();
  const list = plain(I.LANGS);
  assert.deepEqual(list.map((l) => [l.code, l.name, l.dir]), LANG_ORDER);
  for (const l of list) assert.equal(l.complete, true, `${l.code} is complete`);
  for (const l of list) assert.ok(typeof l.en === 'string' && l.en.length > 1, `${l.code} has an English name (for search)`);
  assert.deepEqual(list.filter((l) => l.quality === 'beta').map((l) => l.code), BETA, 'the languages without a native review are marked beta');
  assert.ok(!list.some((l) => l.code === 'so'), 'Somali is not offered');
});

test('each language has one file, named by its code, that adds its strings under that code', async () => {
  // <code>-apps.js is a language's app-name table (sv-apps.js), loaded next to its main file.
  const files = (await readdir(path.join(ROOT, 'shared', 'i18n'))).filter((f) => f.endsWith('.js') && !['i18n.js', 'strings.js', 'switcher.js', 'early.js'].includes(f) && !/-apps\.js$/.test(f));
  const codes = LANG_ORDER.map(([c]) => c).filter((c) => c !== 'en');
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), [...codes].sort(), 'one file per language, and no stray file');
  for (const code of codes) {
    const src = await readFile(path.join(ROOT, 'shared', 'i18n', `${code}.js`), 'utf8');
    const adds = [...src.matchAll(/SlopI18n\.add\('([\w-]+)'/g)].map((m) => m[1]);
    assert.deepEqual(adds, [code], `${code}.js adds its strings under '${code}'`);
  }
});

test('the shell, the homepage and Settings load i18n.js, which fetches the tables itself (no page lists a language file)', async () => {
  const loaders = { 'shell/shell.js': await readFile(path.join(ROOT, 'shell', 'shell.js'), 'utf8'), 'index.html': await readFile(path.join(ROOT, 'index.html'), 'utf8'), 'settings/index.html': await readFile(path.join(ROOT, 'settings', 'index.html'), 'utf8') };
  for (const [f, src] of Object.entries(loaders)) {
    assert.match(src, /shared\/i18n\/i18n\.js/, `${f} loads i18n.js`);
    assert.doesNotMatch(src, /i18n\/(strings|es|fr|de|sv)\.js/, `${f} leaves the tables to i18n.js`);
  }
  assert.match(loaders['shell/shell.js'], /SlopI18n\.ready\(\)/, 'the shell waits for the tables before its header');
});

test('each language file loads on its own after strings.js, and the chosen language is in effect at boot', async () => {
  for (const [code, name, dir] of LANG_ORDER.filter(([c]) => c !== 'en')) {
    const storage = memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: code } } }) });
    const ctx = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/strings.js', `i18n/${code}.js`], { localStorage: storage });
    assert.equal(ctx.SlopI18n.get(), code, `${name} is the chosen language`);
    assert.notEqual(ctx.SlopI18n.t('nav.apps'), 'nav.apps', `${name} has its strings`);
    assert.equal(ctx.SlopI18n.LANGS.find((l) => l.code === code).dir, dir, `${name} direction`);
  }
  const storage = memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'es' } } }) });
  const ctx = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/strings.js', 'i18n/es.js'], { localStorage: storage });
  assert.equal(ctx.SlopI18n.t('nav.apps'), 'Aplicaciones');
  assert.equal(ctx.SlopI18n.t('nav.profile'), 'Perfil');
});

test('a right-to-left language sets lang and dir="rtl" on the root; a left-to-right one sets dir="ltr"', async () => {
  const LIST = [TWO[0], { code: 'ar', name: 'العربية', dir: 'rtl', complete: true }, { code: 'fr', name: 'Français', dir: 'ltr', complete: true }];
  for (const [code, dir] of [['ar', 'rtl'], ['fr', 'ltr'], ['en', 'ltr']]) {
    const root = fakeEl('html');
    const document = { documentElement: root, querySelectorAll: () => [] };
    const I = base.SlopI18n.create({ languages: LIST, storage: memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: code } } }) }), document });
    I.add('en', EN);
    I.apply();
    assert.equal(root.attrs.lang, code);
    assert.equal(root.attrs.dir, dir, `${code} direction`);
  }
});

test('the shared chrome CSS uses logical properties (inline start and end), so the layout mirrors for right-to-left languages', async () => {
  const banner = await readFile(path.join(ROOT, 'shared', 'consent', 'banner.css'), 'utf8');
  const support = await readFile(path.join(ROOT, 'shared', 'support', 'support.css'), 'utf8');
  const physical = /\b(left|right)\s*:|margin-(left|right)\s*:|text-align:\s*(left|right)\b/;
  assert.doesNotMatch(banner, physical, 'consent strip');
  assert.doesNotMatch(support, physical, 'support card');
  const shell = await readFile(path.join(ROOT, 'shell', 'shell.css'), 'utf8');
  const header = shell.split('\n').filter((l) => /^\s*\.sh-(hdr|fab|opt|hbtn|sw)\b/.test(l));
  assert.ok(header.length >= 4, 'the header and switcher rules are read');
  for (const l of header) assert.doesNotMatch(l, physical, `shell.css: ${l.trim().slice(0, 60)}`);
});

test('the Arabic table is right to left in the language list and the rule is written in HANDOFF.md', async () => {
  const handoff = await readFile(path.join(ROOT, 'shared', 'i18n', 'HANDOFF.md'), 'utf8');
  assert.match(handoff, /dir: 'rtl'/);
  assert.match(handoff, /margin-inline-start/);
});

test('every shared-chrome key used by the shell, the consent strip, the support card and the homepage and Settings exists in English', async () => {
  const files = ['shell/header.js', 'shell/switcher.js', 'shell/shell.js', 'shell/notify.js', 'shared/ui/hbtn.js', 'shared/tour/mount.js', 'shared/i18n/switcher.js', 'shared/consent/banner.js', 'shared/support/card.js', 'index.html', 'settings/index.html'];
  const en = await table('strings.js');
  const missing = [];
  for (const f of files) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/['"]((?:nav|shell|switcher|consent|support|menu|settings|footer)\.[a-z_]+)['"]/g)) {
      if (/^settings\.(css|js|html)$/.test(m[1])) continue; // file names, not keys
      if (!en.has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

/** A minimal element: attributes, textContent. Enough for apply(). */
function fakeEl(tag, attrs = {}, text = '') {
  const el = { tag, attrs: { ...attrs }, textContent: text };
  el.getAttribute = (n) => (Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null);
  el.setAttribute = (n, v) => { el.attrs[n] = String(v); };
  return el;
}
