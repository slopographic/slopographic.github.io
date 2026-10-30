// A page in one language (<html data-lang-page>: the static SEO pages and the copies in a language's folder, tools/seo):
// SlopI18n reads that page in it whatever is stored, keeps a page language other than the default as the visitor's
// choice, and set() ends it; the header switcher on such a page goes to the same page in the language picked (its
// hreflang alternate), keeping the query and the hash, and stays put when there is none.
// Covers: shared/i18n/i18n.js, shared/i18n/switcher.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto } from './fx-env.mjs';

const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const LIST = [{ code: 'en', name: 'English', dir: 'ltr', complete: true }, { code: 'sv', name: 'Svenska', dir: 'ltr', complete: true }, { code: 'de', name: 'Deutsch', dir: 'ltr', complete: true }];
const stored = (s) => { const v = s.getItem('slop-profile'); return v ? ((JSON.parse(v).data || {}).lang || {}).mode : undefined; };
/** A document whose <html> says data-lang-page (or nothing), with a few alternates. */
function doc(page, alts = []) {
  const attrs = page ? { 'data-lang-page': page } : {};
  const el = { getAttribute: (k) => (k in attrs ? attrs[k] : null), hasAttribute: (k) => k in attrs, setAttribute() {} };
  const links = alts.map(([lang, href]) => ({ getAttribute: (k) => (k === 'hreflang' ? lang : k === 'href' ? href : null) }));
  return { documentElement: el, querySelectorAll: (sel) => (/alternate/.test(sel) ? links : []), readyState: 'complete', addEventListener() {} };
}
const base = await loadInto(['profile/profile.js', 'i18n/i18n.js', 'i18n/switcher.js'], { localStorage: memStorage(), URL });
const make = (page, storage, alts, defaultLang = 'en') => base.SlopI18n.create({ languages: LIST, storage, document: doc(page, alts), defaultLang });

test('the page\'s language wins over the stored choice, and one other than the default is kept as the choice', () => {
  const s = memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'de' } } }) });
  const I = make('sv', s);
  assert.equal(I.get(), 'sv');
  assert.equal(stored(s), 'sv', 'a visit to /sv/ keeps Swedish for the apps opened from there');
  const s2 = memStorage({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: 'de' } } }) });
  assert.equal(make('en', s2).get(), 'en', 'an English page reads in English');
  assert.equal(stored(s2), 'de', 'the default language\'s pages leave the choice alone');
  const s3 = memStorage();
  assert.equal(make('sv', s3, [], 'sv').get(), 'sv');
  assert.equal(stored(s3), undefined, 'in a build whose default is Swedish, its root pages store nothing');
  assert.equal(make(null, memStorage()).get(), 'en', 'an app page follows the choice');
  assert.equal(make('xx', memStorage()).get(), 'en', 'an unknown page language is ignored');
});

test('set() ends the page language: the choice then applies', () => {
  const s = memStorage(), I = make('sv', s);
  assert.equal(I.set('de').ok, true);
  assert.equal(I.get(), 'de');
  assert.equal(stored(s), 'de');
});

test('the switcher on a page in one language goes to its alternate in the language picked, keeping query and hash', () => {
  const S = base.SlopLangSwitch, alts = [['en', 'https://slopographic.com/compare/'], ['sv', 'https://slopographic.com/sv/compare/'], ['x-default', 'https://slopographic.com/compare/']];
  const went = [], loc = { href: 'https://slopographic.github.io/compare/?q=1#t', search: '?q=1', hash: '#t', assign: (u) => went.push(u) };
  const d = doc('en', alts), I = base.SlopI18n.create({ languages: LIST, storage: memStorage(), document: d });
  const r = S.pick(I, 'sv', d, loc);
  assert.equal(r.ok, true);
  assert.deepEqual(went, ['/sv/compare/?q=1#t'], 'the same origin: the path of the alternate');
  S.pick(I, 'de', d, loc);
  assert.equal(went.length, 1, 'no alternate in German: the page stays, in the chosen language');
  const app = doc(null, alts), J = base.SlopI18n.create({ languages: LIST, storage: memStorage(), document: app });
  S.pick(J, 'sv', app, loc);
  assert.equal(went.length, 1, 'an app page switches in place');
});
