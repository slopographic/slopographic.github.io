// The app words a page reads at run time, one small table per language: shared/i18n/apps/<code>.js. Written from the
// SEO tables (shared/seo/i18n/<code>/: the registry's titles and taglines, the round-ups' and guides' names) and the
// convert tables, so the words are translated once, there; edit those (or shared/apps.js for English), never these.
//   seo.reg.<id>.title, seo.reg.<id>.tagline   the app's descriptive title and one line (not in English: the registry
//                                              has them; shared/apps.js slopAppTitle / slopAppTagline read them)
//   seo.mq.<id>                                its label in the homepage's capability strip (marquee.mjs)
//   seo.foot.*                                 the footer's round-up, guide and converter links (footnav.mjs footWords)
// A language gets only the keys it has translated (a page reads English for the rest); English holds the strip and
// footer words alone, which only a page switched from another language needs (shared/i18n/i18n.js fetches it then).
// The languages are listed in shared/i18n/i18n.js (APP_LANGS, rewritten here). tools/seo/write.mjs writes the files and
// --check fails when one is out of date.
//   runtimeWords(code) -> [[key, text]]
//   runtimeParts() -> [{ file, text }]   every language's table, and i18n.js with its APP_LANGS
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, registryWindow } from './site.mjs';
import { table, tableLangs } from '../../shared/seo/i18n.mjs';
import { context } from './lang.mjs';
import { footNav, footWords } from './footnav.mjs';
import { label, shown, localTitles } from './marquee.mjs';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';

export const DIR = 'shared/i18n/apps/';
export const I18N = 'shared/i18n/i18n.js';
export const LANGS_RE = /\/\*app-langs\*\/\[[^\]\n]*\]/;
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

export function runtimeWords(code) {
  const win = registryWindow(), en = code === 'en', t = en ? new Map() : table(code), out = [];
  const local = localTitles(win.SLOP_APPS, code);
  for (const a of local) {
    const title = t.get(`seo.reg.${a.id}.title`), tagline = t.get(`seo.reg.${a.id}.tagline`);
    if (title) out.push([`seo.reg.${a.id}.title`, title]);
    if (tagline) out.push([`seo.reg.${a.id}.tagline`, tagline]);
    // every app's label (the strip leaves out a repeated one; another language may not repeat it)
    if (shown(a) && (en || title)) out.push([`seo.mq.${a.id}`, label(a, en ? CONVERTERS.length : 0)]);
  }
  const english = en ? null : new Map(footWords(footNav(context('en'))));
  for (const [k, v] of footWords(footNav(context(code)))) if (en || english.get(k) !== v) out.push([k, v]);
  return out;
}

/** One app per line (its title, tagline and label), then the footer's words. */
function file(code, words) {
  const lines = [], byApp = new Map();
  for (const [k, v] of words) {
    const id = /^seo\.(?:reg\.(.+)\.(?:title|tagline)|mq\.(.+))$/.exec(k), key = id ? id[1] || id[2] : k;
    if (!byApp.has(key)) { byApp.set(key, []); lines.push(byApp.get(key)); }
    byApp.get(key).push(`${q(k)}: ${q(v)},`);
  }
  return `/* The app words at run time, ${code}: titles, taglines, the homepage strip and footer links. Written by tools/seo/apptables.mjs\n` +
    ` * from the SEO tables (shared/seo/i18n/${code}/) and shared/apps.js: edit those, not this file. Loaded by shared/i18n/i18n.js. */\n` +
    `window.SlopI18n && window.SlopI18n.add('${code}', {\n` + lines.map((l) => '  ' + l.join(' ')).join('\n') + '\n});\n';
}

export function runtimeParts() {
  const codes = tableLangs(), files = [];
  for (const code of codes) files.push({ file: `${DIR}${code}.js`, text: file(code, runtimeWords(code)) });
  const src = readFileSync(path.join(ROOT, I18N), 'utf8');
  if (!LANGS_RE.test(src)) throw new Error(`${I18N}: no /*app-langs*/[...] list`);
  files.push({ file: I18N, text: src.replace(LANGS_RE, `/*app-langs*/[${codes.map(q).join(', ')}]`) });
  return files;
}
