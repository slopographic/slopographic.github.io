// SlopTheme: the theme list (every theme has all five tokens), System resolving to a real theme, and the choice being
// stored in the profile and mirrored into each app's own key. Run: node --test tests/node/theme-list.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, plain } from './fx-env.mjs';
import { FACTS } from '../brand-facts.mjs';

// The build's themes (tests/brand-facts.js): a brand profile can hide some, name Light and Dark after the brand ("<brand>
// Light") and start a visitor on another theme than System. Here: all four, their plain names, System.
const branded = (id) => !!FACTS.themeBrand && (id === 'light' || id === 'dark');
const THEMES = [...FACTS.themes];   // an array of this realm (the facts come from a vm context)
const names = (table) => THEMES.map((id) => (branded(id) ? `${FACTS.themeBrand} ${table[id]}` : table[id]));
const CLASSIC = THEMES.includes('classic');

const TOKENS = ['background', 'surface', 'text', 'accent', 'border'];
const HEX = /^#[0-9a-f]{6}$/i;

const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const media = (prefersLight) => (q) => ({ matches: q.includes('light') ? prefersLight : false, addEventListener() {} });

async function theme({ seed = {}, prefersLight = false } = {}) {
  const storage = memStorage(seed);
  const ctx = await loadInto(['profile/profile.js', 'theme/theme.js'], { localStorage: storage, matchMedia: media(prefersLight) });
  return { T: ctx.SlopTheme, storage };
}
/** SlopTheme with the i18n engine and the English and Swedish chrome tables, for the theme names. */
async function themeI18n() {
  const ctx = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/strings.js', 'i18n/sv.js', 'theme/theme.js'], { localStorage: memStorage(), matchMedia: media(false) });
  return { T: ctx.SlopTheme, I: ctx.SlopI18n };
}
const profileMode = (s) => {
  const o = JSON.parse(s.m.get('slop-profile') || 'null');
  return o && o.data && o.data.theme ? o.data.theme.mode : undefined;
};

test('every theme has an id, a name, a colour scheme and all five tokens as hex colours', async () => {
  const { T } = await theme();
  const list = plain(T.THEMES);
  assert.deepEqual(list.map((t) => t.id), THEMES);
  assert.deepEqual(list.map((t) => t.key), THEMES.map((id) => (branded(id) ? 'shell.theme_brand_' : 'shell.theme_') + id));
  for (const t of list) {
    assert.ok(['light', 'dark'].includes(t.scheme), `${t.id} scheme`);
    assert.deepEqual(Object.keys(t.tokens).sort(), [...TOKENS].sort(), `${t.id} tokens`);
    for (const k of TOKENS) assert.match(t.tokens[k], HEX, `${t.id}.${k}`);
  }
});

test('theme names come from the chrome tables and follow a language change (shell.theme_<id>)', async () => {
  const { T, I } = await themeI18n();
  I.set('en');
  assert.deepEqual(Array.from(T.THEMES, (t) => t.name), names({ light: 'Light', dark: 'Dark', classic: 'Classic 98', lime: 'Slopographic Lime' }));
  I.set('sv');
  assert.deepEqual(Array.from(T.THEMES, (t) => t.name), names({ light: 'Ljust', dark: 'Mörkt', classic: 'Klassiskt 98', lime: 'Slopographic Lime' }));
});

test('System resolves to a real theme, from prefers-color-scheme', async () => {
  const ids = (await theme()).T.THEMES.map((t) => t.id);
  assert.equal((await theme({ prefersLight: true })).T.resolve('system'), 'light');
  assert.equal((await theme({ prefersLight: false })).T.resolve('system'), 'dark');
  assert.ok(ids.includes((await theme()).T.resolve('system')));
  assert.equal((await theme()).T.SYSTEM, 'system');
  assert.equal((await theme()).T.DEFAULT, FACTS.defaultTheme);
});

test('an unknown choice resolves to Dark, never to nothing', async () => {
  const { T } = await theme();
  assert.equal(T.resolve('mauve'), 'dark');
});

test('set stores the choice in the profile and mirrors it into each app key', async () => {
  const { T, storage } = await theme();
  if (!CLASSIC) {   // a build without Classic 98: Light, which every app has
    assert.deepEqual(plain(T.set('light')), { ok: true, id: 'light' });
    assert.equal(T.get(), 'light');
    assert.deepEqual([storage.m.get('slop-drive.theme'), storage.m.get('slopvector.theme'), storage.m.get('slop-tables.theme')], ['"light"', 'light', '"light"']);
    assert.equal(plain(T.set('classic')).ok, false, 'a hidden theme is refused');
    return;
  }
  assert.deepEqual(plain(T.set('classic')), { ok: true, id: 'classic' });
  assert.equal(profileMode(storage), 'classic');
  assert.equal(T.get(), 'classic');
  assert.equal(storage.m.get('slop-drive.theme'), '"classic"');
  assert.equal(storage.m.get('slopvector.theme'), 'classic');
  assert.equal(storage.m.get('slop-ai.prefs'), JSON.stringify({ theme: 'classic' }));
  // Apps without a Classic 98 look get their Pro (dark) value, so they never read an unknown name.
  assert.equal(storage.m.get('slop-tables.theme'), '"pro"');
});

test('set Dark keeps the apps on the dark value; System writes the marker apps ignore', async () => {
  const { T, storage } = await theme();
  T.set('dark');
  assert.equal(storage.m.get('slop-drive.theme'), '"pro"');
  assert.equal(storage.m.get('slop-contacts.theme'), undefined, 'contacts has no legacy key');
  T.set('system');
  assert.equal(T.get(), 'system');
  assert.equal(storage.m.get('slop-drive.theme'), '"system"');
  assert.equal(storage.m.get('slopvector.theme'), 'system');
});

test('a person with only the old app keys keeps that choice', async () => {
  const old = CLASSIC ? 'classic' : 'light';
  const { T } = await theme({ seed: { 'slop-drive.theme': JSON.stringify(old) } });
  assert.equal(T.get(), old);
});

test('a choice outside the list is refused and nothing is written', async () => {
  const { T, storage } = await theme();
  const r = plain(T.set('mauve'));
  assert.equal(r.ok, false);
  assert.equal(storage.m.has('slop-profile'), false);
  assert.equal(storage.m.has('slop-drive.theme'), false);
});

test('corrupt legacy values are ignored and fall back to the default (System here)', async () => {
  const { T } = await theme({ seed: { 'slop-drive.theme': '{not json', 'slop-ai.prefs': '[1,2]' } });
  assert.equal(T.get(), FACTS.defaultTheme);
});
