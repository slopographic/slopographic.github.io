// The table checker (node tools/i18n/i18n.mjs --check; tests/node/i18n-tables.test.mjs runs it):
//  - the shared tables (chrome: shared/i18n/strings.js + <code>.js; ui: shared/i18n/ui/<code>.js) exist for every language
//    in LANGS and hold every English key;
//  - an app's tables: <dir>i18n/index.js names the parts of en/ and the languages that have a folder; every language it
//    ships holds every English key; keys start with the app id ('pdf.'); the keys its code asks for (t('pdf.x')) exist;
//  - the site pages kept like an app (tables.mjs pageAreas(): settings/, keys settings.*), whose code may also ask for the
//    chrome's own keys (settings.language in shared/i18n/strings.js);
//  - the shared areas (tables.mjs sharedAreas(): the ui parts and shared/<area>/i18n) as an app's, with their ns as the
//    key prefix; the ui parts' index is UI_PARTS in shared/i18n/i18n.js; keys asked for anywhere must exist;
//  - in every table: no key English lacks (a plural form 'key#few' needs 'key' in English and a CLDR category), no empty
//    text, and the same {placeholders} as English (a plural form may leave one out, e.g. the count for n = 1);
//  - every plural family English has ('key' with 'key#one') carries each form the language needs by CLDR
//    (Intl.PluralRules: ar zero one two few many, ru one few many, ja none), 'key' itself being 'other';
//  - no value writes "slop" (the products' word and the mascot's name) in another script: a transliteration (سلوبو,
//    スロップ) would carry it past a white-label build's rename map and its leak scan, which both read Latin words.
//    Keep it in Latin letters or leave it out;
//  - no value holds a white-label rename target (brand/profiles/*.map.json compounds): a build
//    renames an app id to it, and its reverse would turn the translated word back into that id.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { apps, appTables, sharedTables, sharedAreas, pageAreas, langs, ROOT } from './tables.mjs';

const CATS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
/** "slop" written in the scripts of LANGS: Arabic, Hebrew, Cyrillic, Greek, Devanagari, Ethiopic, kana, Hangul, Han. */
export const TRANSLIT = /(?<![\u0600-\u06FF])سل[وا]ب|סלופ|сл[оа]п|σλοπ|स्ल[ॉो]प|ስሎፕ|スロッ?プ|スロッポ|すろっぷ|슬롭|슬로포|斯洛普|斯洛波|斯罗普/i;
/** The rename targets of the sample white-label maps, lower case (one source: the maps themselves). */
export function renameTargets(root = ROOT) {
  const dir = path.join(root, 'brand', 'profiles'), out = new Set();
  if (!existsSync(dir)) return [];   // a white-label build ships no profiles (and holds its own targets by design)
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.map.json'))) {
    const m = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    for (const c of m.compounds || []) if (c.to) out.add(c.to.toLowerCase());
  }
  return [...out];
}
let TARGETS = null;
const baseOf = (k) => (k.includes('#') ? k.slice(0, k.indexOf('#')) : k);
/** The plural forms a language needs besides 'other' for the counts a UI shows (CLDR, through Intl): the categories
 * some whole number 0..200 falls in. fr, es, it and pt 'many' (only for a million and up) is left to 'other'. */
export function pluralForms(code) {
  try {
    const pr = new Intl.PluralRules(code), seen = new Set();
    for (let n = 0; n <= 200; n++) seen.add(pr.select(n));
    return pr.resolvedOptions().pluralCategories.filter((c) => c !== 'other' && seen.has(c));
  } catch (e) { return []; }
}

/** Problems of one language table against English: [message]. */
export function compare(label, en, tr, { requireAll = true, code = label.split('/').pop() } = {}) {
  const out = [];
  const forms = pluralForms(code);
  for (const k of en.keys()) {
    if (!k.endsWith('#one') || !tr.has(baseOf(k))) continue;
    const b = baseOf(k);
    for (const f of forms) if (!tr.has(`${b}#${f}`)) out.push(`${label}: missing the plural form ${b}#${f}`);
  }
  for (const [k, v] of en) {
    if (k.includes('#')) continue;
    if (!tr.has(k)) { if (requireAll) out.push(`${label}: missing ${k}`); continue; }
    if (!tr.get(k).trim()) out.push(`${label}: ${k} is empty`);
    if (placeholders(tr.get(k)) !== placeholders(v)) out.push(`${label}: ${k} has {${placeholders(tr.get(k))}}, English has {${placeholders(v)}}`);
    const low = tr.get(k).toLowerCase(), hit = (TARGETS ||= renameTargets()).find((w) => low.includes(w));
    if (hit && !v.toLowerCase().includes(hit)) out.push(`${label}: ${k} holds "${hit}", a white-label rename target: reword it`);
    const tl = TRANSLIT.exec(tr.get(k));
    if (tl) out.push(`${label}: ${k} writes "${tl[0]}": keep Slop names in Latin letters or leave them out`);
  }
  for (const [k, v] of tr) {
    const b = baseOf(k);
    if (!en.has(b)) { out.push(`${label}: ${k} is not an English key`); continue; }
    if (k !== b) {
      if (!CATS.has(k.slice(b.length + 1))) out.push(`${label}: ${k}: not a plural category (zero one two few many other)`);
      else {   // a plural form may leave out a placeholder ('Rotate page' for n = 1), never add one
        const allowed = new Set(placeholders(en.get(b)).split(','));
        const extra = placeholders(v).split(',').filter((x) => x && !allowed.has(x));
        if (extra.length) out.push(`${label}: ${k} has {${extra}}, which English ${b} lacks`);
      }
    }
  }
  return out;
}

/** The keys of one namespace a set of source files asks for: t('pdf.menu.file'), data-i18n="pdf.x",
 * data-i18n-attr="title:pdf.x". Returns Map(key → first file). */
export function usedKeys(files, ns) {
  const k = `(${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[A-Za-z0-9_.]*[A-Za-z0-9])`;   // a prefix ('biz.doc.new_' + kind) is not a key
  const res = [new RegExp(`\\bt\\(\\s*['"\`]${k}['"\`]`, 'g'), new RegExp(`data-i18n=["']${k}["']`, 'g'), new RegExp(`data-i18n-attr=["'][^"']*?:${k}`, 'g')];
  const out = new Map();
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    for (const re of res) for (const m of src.matchAll(re)) if (!out.has(m[1])) out.set(m[1], f);
  }
  return out;
}

/** Every problem in the shared and app tables: [message]. Empty means the tables are sound. */
export function check() {
  const out = [];
  const codes = langs().map((l) => l.code);
  for (const ns of ['chrome', 'ui']) {
    const s = sharedTables(ns);
    const en = s.tables.en;
    if (!en) { out.push(`${ns}: no English table`); continue; }
    for (const c of codes) {
      if (c === 'en') continue;
      if (!s.tables[c]) { out.push(`${ns}: no table for ${c} (${ns === 'ui' ? `shared/i18n/ui/${c}.js` : `shared/i18n/${c}.js`})`); continue; }
      out.push(...compare(`${ns}/${c}`, en, s.tables[c]));
    }
    if (ns === 'ui') for (const k of en.keys()) if (!k.startsWith('ui.')) out.push(`ui/en: ${k} does not start with ui.`);
  }
  const uiBase = sharedTables('ui').tables.en || new Map();
  const chrome = sharedTables('chrome').tables.en || new Map();
  for (const app of [...apps(), ...pageAreas(), ...sharedAreas()]) {
    const t = appTables(app);
    if (!t.dirs.length && !t.index) continue;
    const label = app.id, ns = app.ns || app.id;
    if (!t.index) { out.push(`${label}: ${t.base}index.js is missing (node tools/i18n/i18n.mjs index ${ns})`); continue; }
    if (t.index.ns !== ns) out.push(`${label}: index.js registers ns '${t.index.ns}', the app id is '${ns}'`);
    const en = t.tables.en || (ns === 'ui' && !t.dirs.length ? new Map() : null);
    if (!en) { out.push(`${label}: no English tables in ${t.base}en/`); continue; }
    const enParts = Object.keys(t.byPart.en || {}).sort();
    if ([...t.parts].sort().join() !== enParts.join()) out.push(`${label}: index.js parts [${t.parts}] differ from en/ [${enParts}]`);
    if ([...t.langs].sort().join() !== t.dirs.join()) out.push(`${label}: index.js langs [${t.langs}] differ from the folders [${t.dirs}]`);
    for (const k of en.keys()) if (!k.startsWith(ns + '.')) out.push(`${label}/en: ${k} does not start with ${ns}.`);
    if (ns === 'ui') for (const k of en.keys()) if (uiBase.has(k)) out.push(`${label}/en: ${k} is also in shared/i18n/ui/en.js`);
    for (const c of t.dirs) {
      if (!codes.includes(c)) { out.push(`${label}: ${c} is not a language in LANGS`); continue; }
      if (c === 'en') continue;
      const parts = Object.keys(t.byPart[c]).sort();
      if (parts.join() !== enParts.join()) out.push(`${label}/${c}: parts [${parts}] differ from en/ [${enParts}]`);
      out.push(...compare(`${label}/${c}`, en, t.tables[c]));
    }
    for (const [k, f] of usedKeys(app.files, ns)) if (!en.has(k) && !chrome.has(k) && !(ns === 'ui' && uiBase.has(k))) out.push(`${label}: ${f} asks for ${k}, which en/ does not have`);
  }
  return out;
}
