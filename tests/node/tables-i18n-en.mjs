// Slop Tables node tests: the app's English words, as a page has them. The modules without a DOM read their messages
// through SlopI18n (tables/js/i18n.js); here a stand-in reads the English tables (tables/i18n/en/*.js and the shared
// shared/i18n/ui/en/*.js) with {name}
// placeholders and the #one plural. Import it before the modules: import './tables-i18n-en.mjs';
import { readFileSync, readdirSync } from 'node:fs';

const EN = {};
const win = { SlopI18n: { add: (code, dict) => { if (code === 'en') Object.assign(EN, dict); } } };
// the app's tables and the shared components' (the reader's words: shared/i18n/ui/en/sheets.js)
for (const dir of [new URL('../../tables/i18n/en/', import.meta.url), new URL('../../shared/i18n/ui/en/', import.meta.url)]) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) new Function('window', readFileSync(new URL(f, dir), 'utf8'))(win);
}
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
globalThis.SlopI18n ||= {
  t: (key, vars) => {
    const s = (vars && vars.n === 1 && EN[key + '#one']) || EN[key];
    return s === undefined ? key : fill(s, vars);
  },
};
export { EN };
