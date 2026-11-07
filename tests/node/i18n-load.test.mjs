// SlopI18n's lazy tables and world-ready helpers (shared/i18n/i18n.js): at parse time it writes English and the chosen
// language's tables into the page (chrome, ui, an app's index.js parts), later it adds them and fires 'slopi18n';
// languages an app does not ship are not fetched; the offline copy fetches nothing; plural forms through
// Intl.PluralRules; num/date/money/list through Intl in the chosen language; the script stylesheet for CJK and friends.
// at(code) and need(code, false, ns): another language's words without switching the page (printed business documents).
// Covers: shared/i18n/i18n.js, shared/i18n/early.js, pdf/i18n/index.js, shell/shell.js, shared/biz/i18n/index.js
// Run: node --test tests/node/i18n-load.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const seedLang = (code) => ({ 'slop-profile': JSON.stringify({ v: 1, data: { lang: { mode: code } } }) });
const SITE = 'https://site.test/';

/** A page in a vm: a fake document that records document.write and appended elements, and runs appended scripts
 * from the repo (by URL) and fires their onload. */
function page({ lang, parsing = true, offline = false, late = false } = {}) {
  const writes = [], added = [], events = [];
  const attrs = {};
  const ctx = { localStorage: memStorage(lang ? seedLang(lang) : {}), CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } } };
  ctx.window = ctx;
  ctx.dispatchEvent = (e) => { events.push(e.type); (ctx._l[e.type] || []).forEach((f) => f(e)); };
  ctx._l = {};
  ctx.addEventListener = (t, f) => { (ctx._l[t] = ctx._l[t] || []).push(f); };
  ctx.removeEventListener = (t, f) => { ctx._l[t] = (ctx._l[t] || []).filter((x) => x !== f); };
  const run = (url) => { const f = url.slice(SITE.length); if (!existsSync(path.join(ROOT, f))) return false; vm.runInContext(read(f), ctx, { filename: url }); return true; };
  const doc = {
    readyState: parsing ? 'loading' : 'complete',
    currentScript: null,
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    head: { appendChild: (el) => { added.push(el); if (el.tag === 'script') { const ok = run(el.src); setTimeout(() => (ok ? el.onload : el.onerror)(), 0); } } },
    write: (html) => { writes.push(html); const m = /<script src="([^"]+)"/.exec(html); if (m) run(m[1]); },
    createElement: (tag) => ({ tag }),
    querySelector: (sel) => (offline && sel === 'meta[content="offline"]' ? {} : null),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  ctx.document = doc;
  vm.createContext(ctx);
  const script = (file, extra = {}) => {
    doc.currentScript = { src: SITE + file, hasAttribute: (a) => a === 'data-late' && late, ...extra };
    vm.runInContext(read(file), ctx, { filename: file });
    doc.currentScript = null;
  };
  vm.runInContext(read('shared/profile/profile.js'), ctx);
  return { ctx, doc, writes, added, events, attrs, script, I: () => ctx.SlopI18n };
}
/** English's app words (shared/i18n/apps/en.js): an English page needs none, unless the build starts in another language
 * (its pages are written in that one, so English words come from the table). */
const enWords = (p) => (p.I().DEFAULT_CHOICE !== 'en' ? ['shared/i18n/apps/en.js'] : []);
/** The shared components' parts of a language after ui/<code>.js (UI_PARTS in i18n.js; none for a language without them). */
function uiParts(code) {
  const P = JSON.parse(/var UI_PARTS = \/\*ui-parts\*\/(\{.*\});/.exec(read('shared/i18n/i18n.js'))[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  return P.langs.includes(code) ? P.parts.map((p) => `shared/i18n/ui/${code}/${p}.js`) : [];
}
const urls = (writes) => writes.map((h) => (/(?:src|href)="([^"]+)"/.exec(h) || [])[1].slice(SITE.length));

test('at parse time an English page writes only the English chrome and ui tables', () => {
  const p = page({ lang: 'en' });   // stored, so a build that starts in another language reads the same
  p.script('shared/i18n/i18n.js');
  assert.deepEqual(urls(p.writes), ['shared/i18n/strings.js', 'shared/i18n/ui/en.js', ...uiParts('en'), ...enWords(p)]);
  assert.equal(p.I().t('nav.apps'), 'Apps');
});

test('a Swedish page writes English and Swedish (and the Swedish app names), and t() reads Swedish at once', () => {
  const p = page({ lang: 'sv' });
  p.script('shared/i18n/i18n.js');
  assert.deepEqual(urls(p.writes), ['shared/i18n/strings.js', 'shared/i18n/sv.js', 'shared/i18n/sv-apps.js', 'shared/i18n/ui/en.js', ...uiParts('en'), 'shared/i18n/ui/sv.js', ...uiParts('sv'),
    'shared/i18n/apps/en.js', 'shared/i18n/apps/sv.js']);   // the app words (titles, taglines, strip, footer): English too, only once another language is in use
  assert.equal(p.I().t('nav.apps'), 'Appar');
});

test('a page parsed in another language first writes early.js, which fills each marked element as the parser adds it', () => {
  const mos = [];
  const watch = (p) => { p.ctx.MutationObserver = class { constructor(cb) { this.cb = cb; mos.push(this); } observe(t, o) { this.opts = o; } takeRecords() { return []; } disconnect() {} }; return p; };
  const en = watch(page({ lang: 'en' }));
  en.script('shared/i18n/i18n.js');
  assert.ok(!urls(en.writes).includes('shared/i18n/early.js'), 'English needs no early fill');
  const sv = watch(page({ lang: 'sv' }));
  sv.script('shared/i18n/i18n.js');
  assert.equal(urls(sv.writes)[0], 'shared/i18n/early.js', 'written before the tables');
  assert.equal(sv.attrs.lang, 'sv', '<html lang> at once');
  assert.equal(mos.length, 1);
  assert.deepEqual({ ...mos[0].opts }, { childList: true, subtree: true, characterData: true });
  const el = { nodeType: 1, attrs: { 'data-i18n': 'nav.apps' }, textContent: 'Apps', firstElementChild: null };
  el.getAttribute = (n) => el.attrs[n] ?? null; el.hasAttribute = (n) => n in el.attrs; el.matches = () => true; el.closest = () => null;
  mos[0].cb([{ target: { nodeType: 1, closest: () => null }, addedNodes: [el] }]);
  assert.equal(el.textContent, 'Appar');
  el.textContent = 'AppparApps';   // the parser added more text to it
  mos[0].cb([{ target: { nodeType: 3, parentElement: null }, addedNodes: [] }]);
  assert.equal(el.textContent, 'Appar', 'the last ones are filled again');
});

test("an app's index.js adds its parts for English and the chosen language, only for languages it ships", () => {
  const sv = page({ lang: 'sv' });
  sv.script('shared/i18n/i18n.js');
  sv.script('pdf/i18n/index.js');
  const pdf = urls(sv.writes).filter((u) => u.startsWith('pdf/'));
  const spec = /parts: \[([^\]]*)\]/.exec(read('pdf/i18n/index.js'))[1].split(',').map((s) => s.trim().slice(1, -1));
  assert.deepEqual(pdf, [...spec.map((p) => `pdf/i18n/en/${p}.js`), ...spec.map((p) => `pdf/i18n/sv/${p}.js`)]);
  assert.notEqual(sv.I().t('pdf.app.drop_title'), 'pdf.app.drop_title');
  assert.notEqual(sv.I().t('pdf.app.drop_title'), 'Drop PDFs here', 'Swedish, not English');
  const ha = page({ lang: 'ha' });
  ha.script('shared/i18n/i18n.js');
  const before = ha.writes.length;
  ha.doc.currentScript = { src: SITE + 'x.js', hasAttribute: () => false };
  ha.I().source({ ns: 'demo', base: SITE + 'pdf/i18n/', parts: ['app'], langs: ['en', 'sv'] });
  assert.deepEqual(urls(ha.writes.slice(before)), ['pdf/i18n/en/app.js'], 'Hausa is not shipped by this source: English only');
});

test('later (not parsing), set() applies at once, fetches the new tables and then fires slopi18n', async () => {
  const p = page({ lang: 'en', parsing: false, late: true });
  p.script('shared/i18n/i18n.js');
  await p.I().ready();
  assert.deepEqual(p.added.map((e) => e.src.slice(SITE.length)), ['shared/i18n/strings.js', 'shared/i18n/ui/en.js', ...uiParts('en'), ...enWords(p)]);
  let heard = 0;
  const stop = p.I().on((code) => { heard++; assert.equal(code, 'de'); });
  assert.equal(p.I().set('de').ok, true);
  assert.equal(p.events[p.events.length - 1], 'slop-lang', 'slop-lang at once, slopi18n once the tables are in');
  await p.I().ready();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(p.added.some((e) => e.src.endsWith('shared/i18n/de.js')));
  assert.equal(p.I().t('nav.settings'), 'Einstellungen', 'German is in');
  assert.equal(heard, 1, 'once, when every table of the new language is in');
  assert.equal(p.events[p.events.length - 1], 'slopi18n');
  stop();
  assert.equal(p.attrs.lang, 'de');
});

test('at(code) reads another language without switching the page; need(code, false, ns) fetches only that source', async () => {
  const p = page({ lang: 'en', parsing: false, late: true });
  p.script('shared/i18n/i18n.js');
  p.script('shared/biz/i18n/index.js');
  await p.I().ready();
  const I = p.I();
  const folders = readdirSync(path.join(ROOT, 'shared/biz/i18n'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual([...I.shipped('biz')].sort(), folders, 'the languages the business tables ship: one per folder');
  assert.ok(folders.includes('en') && folders.includes('sv'));
  assert.equal(I.shipped('nope').length, 0);
  const before = p.added.length;
  await I.need('sv', false, 'biz');
  const got = p.added.slice(before).map((e) => e.src.slice(SITE.length));
  assert.ok(got.length > 0 && got.every((u) => /^shared\/biz\/i18n\/sv\/\w+\.js$/.test(u)), `only the Swedish business tables: ${got}`);
  const sv = I.at('sv', 'sv-SE');
  assert.equal(I.get(), 'en', 'the page stays English');
  assert.equal(I.t('biz.pr.t_invoice'), 'Invoice');
  assert.equal(sv.code, 'sv');
  assert.equal(sv.t('biz.pr.t_invoice'), 'Faktura');
  assert.equal(sv.t('biz.pr.terms_days', { n: 1 }), '1 dag netto', 'plural forms of the language');
  assert.equal(sv.t('biz.pr.terms_days', { n: 30 }), '30 dagar netto');
  assert.equal(sv.t('nav.apps'), 'Apps', 'a key the language has no table for reads English');
  assert.equal(sv.t('no.such.key'), 'no.such.key');
  assert.equal(sv.money(1234.5, 'SEK'), new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(1234.5));
  assert.equal(sv.t('biz.pr.d_lines', { n: 1234 }), `${new Intl.NumberFormat('sv-SE').format(1234)} rader`, 'numbers in vars in its locale');
  assert.equal(sv.date('2026-10-26T12:00:00', { year: 'numeric', month: '2-digit', day: '2-digit' }), '2026-10-26');
  assert.equal(I.at('sv').locale, 'sv', 'the locale defaults to the code');
  assert.equal(I.at('xx').code, 'en', 'a code not in the list reads English');
  assert.equal(I.num(1234.5), new Intl.NumberFormat('en').format(1234.5), 'the page formats stay English');
});

test('an offline single-file copy fetches nothing', () => {
  const p = page({ lang: 'sv', offline: true });
  p.script('shared/i18n/i18n.js');
  assert.deepEqual(p.writes, []);
});

test('a language with a script stylesheet gets it (local font fallbacks, CJK line breaking); Latin languages do not', () => {
  for (const [code, css] of [['ja', 'jpan'], ['zh-CN', 'han-sc'], ['zh-TW', 'han-tc'], ['ko', 'kore'], ['hi', 'deva'], ['am', 'ethi'], ['he', 'hebr'], ['ru', 'cyrl'], ['vi', 'viet'], ['yo', 'viet']]) {
    const p = page({ lang: code });
    p.script('shared/i18n/i18n.js');
    const links = p.writes.filter((h) => h.startsWith('<link'));
    assert.deepEqual(urls(links), [`shared/i18n/script/${css}.css`], code);
    const src = read(`shared/i18n/script/${css}.css`);
    assert.match(src, /font-family: 'Inter Tight'; src: local\(/, `${css}.css aliases the brand family to local fonts`);
    assert.doesNotMatch(src, /url\(/, `${css}.css downloads nothing`);
  }
  const fr = page({ lang: 'fr' });
  fr.script('shared/i18n/i18n.js');
  assert.equal(fr.writes.filter((h) => h.startsWith('<link')).length, 0);
});

test('plural forms follow Intl.PluralRules of the language, then the plain key, then English', () => {
  const p = page({ parsing: false });
  p.script('shared/i18n/i18n.js');
  const I = p.I().create({ storage: memStorage(seedLang('pl')) });
  I.add('en', { 'x.pages': '{n} pages', 'x.pages#one': '{n} page' });
  I.add('pl', { 'x.pages': '{n} strony', 'x.pages#one': '{n} strona', 'x.pages#many': '{n} stron' });
  assert.equal(I.t('x.pages', { n: 1 }), '1 strona');
  assert.equal(I.t('x.pages', { n: 3 }), '3 strony', 'few: no #few form, so the plain key');
  assert.equal(I.t('x.pages', { n: 5 }), '5 stron');
  const en = p.I().create({ storage: memStorage(seedLang('en')) });
  en.add('en', { 'x.pages': '{n} pages', 'x.pages#one': '{n} page' });
  assert.equal(en.t('x.pages', { n: 1 }), '1 page');
  assert.equal(en.t('x.pages', { n: 1200 }), '1,200 pages', 'a number var is formatted with Intl');
  assert.equal(en.t('x.pages', { n: '2026' }), '2026 pages', 'a string var stays as it is');
});

test('num, date, money and list use the chosen language', () => {
  const p = page({ parsing: false });
  p.script('shared/i18n/i18n.js');
  const de = p.I().create({ storage: memStorage(seedLang('de')) });
  assert.equal(de.num(1234.5), '1.234,5');
  assert.match(de.money(3, 'EUR'), /3,00\s€/);
  assert.equal(de.list(['a', 'b', 'c']), 'a, b und c');
  assert.match(de.date(new Date(Date.UTC(2026, 9, 25, 12)), { dateStyle: 'long', timeZone: 'UTC' }), /25\. Oktober 2026/);
  const ja = p.I().create({ storage: memStorage(seedLang('ja')) });
  assert.match(ja.date(new Date(Date.UTC(2026, 9, 25, 12)), { dateStyle: 'long', timeZone: 'UTC' }), /2026年10月25日/);
  assert.equal(ja.plural(1), 'other', 'Japanese has one form');
  assert.equal(de.has('nav.apps'), false, 'this instance has no tables');
});
