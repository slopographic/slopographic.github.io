// Node tests of the shared components: the words as a page has them. The components read their text through SlopI18n
// (keys ui.*, shared/i18n/ui/<code>.js and the parts in shared/i18n/ui/<code>/); here a stand-in holds the English and
// Swedish tables, with {name} placeholders, numbers through Intl and the plural forms ('key#one'). English is chosen;
// setLang('sv') switches (and runs the on() listeners, as a language switch on a page does).
// Import it before the modules: import './ui-i18n-en.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ui = new URL('../../shared/i18n/ui/', import.meta.url);
const TABLES = { en: {}, sv: {} };
const win = { SlopI18n: { add: (code, dict) => { if (TABLES[code]) Object.assign(TABLES[code], dict); } } };
const run = (url) => new Function('window', readFileSync(url, 'utf8'))(win);
for (const code of Object.keys(TABLES)) {
  run(new URL(`${code}.js`, ui));
  const dir = new URL(`${code}/`, ui);
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) run(new URL(f, dir));
}

let lang = 'en';
const listeners = new Set();
const find = (code, key, vars) => {
  const T = TABLES[code];
  if (vars && typeof vars.n === 'number') { const p = T[`${key}#${new Intl.PluralRules(code).select(vars.n)}`]; if (p !== undefined) return p; }
  return T[key];
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => {
  const v = Object.assign({ brand: 'Slopographic' }, vars || {})[k];
  return v === undefined ? m : typeof v === 'number' ? new Intl.NumberFormat(lang).format(v) : String(v);
});
globalThis.SlopI18n ||= {
  t: (key, vars) => { const s = find(lang, key, vars) ?? find('en', key, vars); return s === undefined ? key : fill(s, vars); },
  has: (key) => TABLES[lang][key] !== undefined || TABLES.en[key] !== undefined,
  get: () => lang,
  on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Chooses a language ('en' or 'sv') and tells the listeners, as a switch on a page does. */
export function setLang(code) { lang = code; for (const fn of [...listeners]) fn(); }
export { TABLES };
