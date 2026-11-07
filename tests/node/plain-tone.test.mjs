// Covers: tools/seo/footnav.mjs, shell/header.js, shared/tour/mount.js, shared/theme/theme.js, home/sections.js, home/catalog.js, home/browse.js, home/globe/globe.js, tools/seo/landing.mjs, shared/finder/finder.js
// The plain tone (a brand profile's "tone": "plain", brand/README.md): the choices it drives, each read from the profile
// markers the build rewrites. theme.js marks <html> before the first paint and loads style/tone.css; the homepage has no
// Experiments shelf, neutral status words (none for a ready app, "Preview" for one in development) and its own wording
// (i18n keys plain.*); the globe turns slower; the app landing pages say the same words. This site (playful) keeps its
// own. The look itself: tests/home/plain-tone.test.html, run on the sample build in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
// The profile values as the build writes them after each marker (tools/whitelabel/emit.mjs). Done here with a regular
// expression, not with the build's tools: a white-label build runs this test without them, on files already rewritten.
const SAMPLE = { tone: 'plain', naming: 'plain', media: false };
const SITE = { tone: 'playful', naming: 'brand', media: true };
const LIT = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|true|false|null|-?\d+`;
const applyMarkers = (text, values) => text.replace(new RegExp(String.raw`(\/\*profile:(\w+)\*\/)(${LIT})`, 'g'), (m, head, key) => (key in values ? head + JSON.stringify(values[key]) : m));
const as = (values, f) => applyMarkers(read(f), values);

/** theme.js run against a small fake document while the head is still loading. */
function theme(values) {
  const attrs = {}, written = [], appended = [];
  const root = { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k], style: { setProperty() {} } };
  const document = {
    readyState: 'loading', documentElement: root, head: { appendChild: (n) => appended.push(n) }, getElementById: () => null,
    currentScript: { src: 'https://tools.example/shared/theme/theme.js', getAttribute: () => 'home', async: false, defer: false },
    createElement: (t) => ({ tagName: t, setAttribute() {} }), write: (s) => written.push(s), addEventListener() {},
  };
  const g = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, location: { search: '' }, URL, URLSearchParams };
  vm.runInNewContext(as(values, 'shared/theme/theme.js'), { window: g, document, URL, URLSearchParams });
  return { attrs, written, appended, T: g.SlopTheme };
}

test('theme.js: a plain build marks <html> and loads style/tone.css with the parser; this site stays playful', () => {
  const plain = theme(SAMPLE);
  assert.deepEqual([plain.attrs['data-tone'], plain.attrs['data-naming'], plain.attrs['data-media']], ['plain', 'plain', 'off']);
  assert.equal(plain.T.tone, 'plain');
  assert.equal(plain.written.length, 1);
  assert.match(plain.written[0], /^<link id="slop-tone-css" rel="stylesheet" href="https:\/\/tools\.example\/style\/tone\.css">$/);
  const site = theme(SITE);
  assert.deepEqual([site.attrs['data-tone'], site.attrs['data-naming'], site.attrs['data-media']], ['playful', 'brand', 'on']);
  assert.equal(site.written.length, 0);
  assert.equal(site.appended.filter((n) => n.rel === 'stylesheet').length, 0);
  // copy written for one tone only hides in the other, before the first paint
  assert.match(read('shared/theme/theme.js'), /html:root:not\(\[data-tone=plain\]\) \.tone-plain,html:root\[data-tone=plain\] \.tone-playful\{display:none!important\}/);
});

test('style/tone.css: every rule but the trust row is scoped to the plain tone, and nothing uppercases or letter-spaces', () => {
  const css = read('style/tone.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.split('}').map((r) => r.trim()).filter((r) => r && !r.startsWith('@media') && r.includes('{'))) {
    const sel = rule.slice(0, rule.indexOf('{')).trim();
    if (/^\.hx-trust/.test(sel)) continue;                   // only in the plain-only trust row (class tone-plain)
    for (const s of sel.split(',')) assert.match(s.trim(), /^:root\[data-tone="plain"\]/, `unscoped selector: ${s.trim()}`);
  }
  assert.doesNotMatch(css, /text-transform:\s*uppercase/);
  assert.doesNotMatch(css, /letter-spacing:\s*\.?[1-9]/);
});

/** home/sections.js with a given tone, in a window that has the English and Swedish strings. */
function sections(tone, lang = 'en') {
  const win = { SlopTheme: { tone } };
  const ctx = vm.createContext({ window: win });
  vm.runInContext(read('shared/i18n/i18n.js').replace(/(\/\*profile:defaultLang\*\/)(['"])[\w-]+\2/, `$1'${lang}'`), ctx);
  for (const f of ['shared/i18n/strings.js', 'shared/i18n/sv.js', 'home/sections.js']) vm.runInContext(read(f), ctx);
  return win.SlopHomeSections;
}

test('the homepage sections: no Experiments shelf in plain; an experiment joins its section; status words are neutral', () => {
  const plain = sections('plain'), site = sections('playful');
  assert.equal(plain.PLAIN, true);
  assert.ok(!plain.SHELVES.some((d) => d.id === 'experiments'));
  assert.ok(site.SHELVES.some((d) => d.id === 'experiments'));
  const paint = { id: 'paint-classic', kind: 'experiment' };
  assert.deepEqual(plain.placements(paint).map((p) => p.section).join(), 'creative');
  assert.deepEqual(site.placements(paint).map((p) => p.section).join(), 'experiments');
  // badges: a ready app carries none in plain; in development reads Preview; beta stays Beta
  assert.equal(['live', 'beta', 'building'].map((s) => plain.badgeLabel(s, true)).join('|'), '|Beta|Preview');
  assert.equal(['live', 'beta', 'building'].map((s) => site.badgeLabel(s, true)).join('|'), 'Live|Beta|In development');
  assert.equal(plain.statusLabel('live'), 'Available');
  // the plain wording, then the key, then English
  assert.doesNotMatch(plain.SECTION_DEFS.find((d) => d.id === 'business').desc, /Slop 365/);
  assert.match(site.SECTION_DEFS.find((d) => d.id === 'business').desc, /^Slop 365:/);
  assert.equal(plain.tr('home.status_sum', 'x', { n: 3, live: 1, beta: 1, building: 1 }), '3 apps: 1 available, 1 in beta and 1 in preview.');
  assert.equal(plain.tr('no.such.key', 'Fallback {n}', { n: 2 }), 'Fallback 2');
});

test('a Swedish plain build reads Swedish on the homepage: sections, statuses, file types', () => {
  const sv = sections('plain', 'sv');
  assert.equal(sv.SECTION_DEFS[0].title, 'Dokument och PDF');
  assert.equal(sv.badgeLabel('building', true), 'Förhandsversion');
  assert.ok(sv.typeKinds(['image/png']).every((k) => k !== 'Images'));
});

test('the globe turns slower in a plain build; the landing pages use the same status words', async () => {
  assert.match(read('home/globe/globe.js'), /IDLE = G\.TAU \/ \(CALM \? 150000 : 75000\)/);
  const mod = async (values) => {
    const f = path.join(ROOT, 'tools/seo', `.frame-${values.tone}.test-tmp.mjs`);
    const { writeFileSync, rmSync } = await import('node:fs');
    writeFileSync(f, as(values, 'tools/seo/frame.mjs'));   // the status words of the SEO pages (tools/seo/frame.mjs)
    try { return await import(pathToFileURL(f).href); } finally { rmSync(f); }
  };
  const { context } = await import(pathToFileURL(path.join(ROOT, 'tools/seo/lang.mjs')).href), en = context('en');   // in English: the root language may be another
  assert.deepEqual((await mod(SAMPLE)).statusWords(en), { live: 'Available', beta: 'Beta', building: 'Preview' });
  assert.deepEqual((await mod(SITE)).statusWords(en), { live: 'Live', beta: 'Beta', building: 'In development' });
});

test('the cards, list, table and finder take their words from sections.js and the i18n keys, not their own copies', () => {
  const cat = read('home/catalog.js'), browse = read('home/browse.js'), finder = read('shared/finder/finder.js');
  assert.match(cat, /H\.badgeLabel/);
  assert.doesNotMatch(cat, /'Preview →'/);
  assert.match(browse, /H\.SHELVES/);
  assert.match(browse, /H\.statusLabel\('building'\)/);
  for (const k of ['finder.cards', 'finder.filter_by', 'finder.count_of']) assert.match(finder, new RegExp(k.replace('.', '\\.')));
});

test('the footer: with plain names the group headings are translated; brand names stay as they are', async () => {
  const { buildFootNav } = await import('../../tools/seo/footnav.mjs');
  const apps = [{ id: 'invoices', name: 'Invoices', path: 'invoices/', group: 'business' }];
  assert.match(buildFootNav({ apps, groups: { business: 'Business' }, plainNames: true }), /<span data-i18n="footer.group_business">Business<\/span>/);
  assert.match(buildFootNav({ apps, groups: { business: 'Slop 365' } }), /<summary><span>Slop 365<\/span>/);
  for (const f of ['shell/header.js', 'shared/tour/mount.js']) assert.match(read(f), /(shell|settings)\.theme|(shell|tour)\.tours/);
});
