// The app words at run time (shared/i18n/apps/<code>.js, written by tools/seo/apptables.mjs from the SEO tables): the
// registry's titles and taglines in the chosen language through one helper (shared/apps.js slopAppTitle / slopAppTagline,
// shared/app-labels.js slopAppLabel), English where a language has none, brand names kept; the homepage strip and
// footer words; the generated files up to date. The owner's case: the homepage in German showed "HTML to PDF converter".
// Run: node --test tests/node/app-words.test.mjs
// Covers: shared/apps.js, shared/app-labels.js, shared/i18n/i18n.js, tools/seo/apptables.mjs, tools/seo/marquee.mjs, tools/seo/footnav.mjs, tools/seo/write.mjs
// Covers: shared/i18n/apps/en.js, shared/i18n/apps/ar.js, shared/i18n/apps/de.js, shared/i18n/apps/es.js, shared/i18n/apps/fr.js, shared/i18n/apps/it.js
// Covers: shared/i18n/apps/ja.js, shared/i18n/apps/ko.js, shared/i18n/apps/nl.js, shared/i18n/apps/pl.js, shared/i18n/apps/pt-BR.js, shared/i18n/apps/ru.js
// Covers: shared/i18n/apps/sv.js, shared/i18n/apps/tr.js, shared/i18n/apps/uk.js, shared/i18n/apps/zh-CN.js, shared/i18n/apps/zh-TW.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeParts, runtimeWords, DIR } from '../../tools/seo/apptables.mjs';
import { marquee } from '../../tools/seo/marquee.mjs';
import { footNav } from '../../tools/seo/footnav.mjs';
import { context } from '../../tools/seo/lang.mjs';
import { table } from '../../shared/seo/i18n.mjs';
import { registryWindow } from '../../tools/seo/site.mjs';
import { FACTS } from '../brand-facts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const de = table('de');

/** A profile marker's literal set to a value (the marker written in parts: a build rewrites every whole one, this file's too). */
const set = (src, key, v) => { const m = '/*' + 'profile:' + key + '*/', i = src.indexOf(m); assert.ok(i >= 0, key); return src.slice(0, i + m.length) + src.slice(i + m.length).replace(/^('[^']*'|"[^"]*")/, JSON.stringify(v)); };
/** A page's scripts in a vm: profile, i18n (starting in lang), the app words a page in lang loads, the registry with the
 * naming given ('brand' or 'plain', whatever the build's profile says), the homepage's label helper. */
function boot(lang, naming = 'brand') {
  const store = new Map();
  const ctx = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  const i18n = set(read('shared/i18n/i18n.js'), 'defaultLang', lang), apps = set(read('shared/apps.js'), 'naming', naming);
  vm.runInContext(read('shared/profile/profile.js'), ctx);
  vm.runInContext(i18n, ctx);
  for (const c of ['en', lang]) if (existsSync(path.join(ROOT, DIR, c + '.js'))) vm.runInContext(read(DIR + c + '.js'), ctx);
  vm.runInContext(apps, ctx);
  vm.runInContext(read('shared/app-labels.js'), ctx);
  return ctx;
}
// the owner's app (HTML to PDF), or in a build that hides it the first app with a German title
const ID = (() => { const w = boot('en'); return [w.SLOP_APPS.find((a) => a.id === 'html2pdf'), ...w.SLOP_APPS].find((a) => a && de.get(`seo.reg.${a.id}.title`)).id; })();
const app = (w, id = ID) => w.SLOP_APPS.find((a) => a.id === id);

test('German: an app\'s title and tagline come from the SEO tables (the owner\'s case: "HTML to PDF converter")', () => {
  const w = boot('de'), a = app(w), en = app(boot('en'));
  assert.equal(w.SlopI18n.get(), 'de');
  assert.equal(a.title, en.title, 'the registry stays English');
  assert.equal(w.slopAppTitle(a), de.get(`seo.reg.${ID}.title`));
  assert.notEqual(w.slopAppTitle(ID), en.title);
  assert.equal(w.slopAppTagline(a), de.get(`seo.reg.${ID}.tagline`));
  assert.equal(w.slopAppLabel(a, false), de.get(`seo.reg.${ID}.title`), 'the homepage card');
});

test('brand names stay as they are in every language; only the descriptive words translate', () => {
  const w = boot('de');
  for (const a of w.SLOP_APPS) {
    assert.equal(w.slopAppName(a.id), a.name, a.id);
    assert.equal(w.slopAppLabel(a, true), a.name, a.id);
  }
});

test('a language without app words (Swahili) reads the registry\'s English; so does English itself', () => {
  for (const code of ['sw', 'en']) {
    const w = boot(code), a = app(w);
    assert.equal(w.SlopI18n.get(), code);
    assert.ok(!w.SlopI18n.APP_LANGS.includes('sw'));
    assert.equal(w.slopAppTitle(a), a.title, code);
    assert.equal(w.slopAppTagline(a), a.tagline, code);
    assert.equal(w.slopAppLabel(a, false), a.title, code);
  }
});

test('plain names: the title is the plain name; a plain description of its own stays, the brand one translates', () => {
  const w = boot('de', 'plain');
  assert.equal(w.slopAppTitle(ID), app(w).plain);
  assert.equal(w.slopAppLabel(app(w), false), app(w).plain);
  const own = w.SLOP_APPS.find((a) => a.ownTagline), borrowed = w.SLOP_APPS.find((a) => !a.ownTagline && de.get(`seo.reg.${a.id}.tagline`));
  if (own) assert.equal(w.slopAppTagline(own), own.plainTagline, 'its own plain description (PLAIN)');
  assert.equal(w.slopAppTagline(borrowed), de.get(`seo.reg.${borrowed.id}.tagline`), 'the brand tagline, translated');
});

test('the runtime words: titles, taglines and the strip in German, English only the strip and the footer', () => {
  const dw = new Map(runtimeWords('de')), ew = new Map(runtimeWords('en'));
  assert.equal(dw.get(`seo.reg.${ID}.title`), de.get(`seo.reg.${ID}.title`));
  assert.ok(dw.has(`seo.mq.${ID}`));
  assert.ok(![...ew.keys()].some((k) => k.startsWith('seo.reg.')), 'English titles come from the registry');
  if (ew.has('seo.mq.convert')) assert.match(ew.get('seo.mq.convert'), /^\d+ conversions$/);
  const best = [...ew.keys()].filter((k) => k.startsWith('seo.foot.best.'));
  assert.equal(best.length > 0, FACTS.seoIndex, 'the round-ups in the footer (an indexed site)');
  for (const k of best) assert.ok(dw.has(k) && dw.get(k) !== ew.get(k), `${k} in German`);
});

test('the generated files are up to date, one per SEO language, and this test names each (rule 2)', () => {
  const me = read('tests/node/app-words.test.mjs');
  for (const p of runtimeParts()) {
    assert.equal(read(p.file), p.text, `${p.file} is stale: run node tools/seo/write.mjs`);
    if (p.file.startsWith(DIR)) assert.ok(me.includes(p.file), `add "Covers: ${p.file}" to this test`);
  }
  const files = readdirSync(path.join(ROOT, DIR)).sort();
  assert.deepEqual(files, runtimeParts().filter((p) => p.file.startsWith(DIR)).map((p) => p.file.slice(DIR.length)).sort());
  assert.ok(files.length >= 17);
});

test('the strip in a language copy is in that language, each label keyed so the root page follows a switch', () => {
  const keyed = registryWindow().SLOP_NAMING !== 'plain', root = marquee(), dm = marquee(context('de'));
  assert.equal(root.includes('data-i18n="seo.mq.'), keyed, 'keys with brand names only (a plain build shows slopAppName)');
  assert.ok(dm.includes(`>${new Map(runtimeWords('de')).get(`seo.mq.${ID}`)}<`), 'the German label');
  assert.ok(!/>\d+ conversions</.test(dm), 'the English count stays out of German');
  const foot = footNav(context('de')), en = new Map(runtimeWords('en'));
  for (const [k, v] of en) if (k.startsWith('seo.foot.best.')) { assert.ok(foot.includes(`data-i18n="${k}">`), k); assert.ok(!foot.includes(`>${v}<`), `${k} in English`); }
});
