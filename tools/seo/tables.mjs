// The English SEO table parts that are written from another source, not by hand (shared/seo/i18n/README.md):
//   reg.js    from the app registry (shared/apps.js, every app, hidden ones too): each app's title, tagline and features,
//             keys seo.reg.<id>.title / .tagline / .features.<n>
//   cv-*.js   from the converter page lists (convert/js/core/*pages*.js): each page's title, description, h1, lead,
//             how and faq, keys seo.cv.<slug>.<field>
// The registry and the page lists stay the one source of these words (the apps read them in English); a language
// translates these parts like any other. tools/seo/write.mjs writes them and --check fails when one is out of date.
//   generatedParts() -> [{ file, text }]   the files and their text (relative to the repo)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './site.mjs';
import { seg } from '../../shared/seo/i18n.mjs';
import { PAGES as CONVERTERS } from '../../convert/js/core/pages.js';

export const PART_LINES = 280;   // a part stays under the 300-line rule with its head and foot
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
export const head = (part, from) => `/* SEO copy, English (the source): ${part}. Written by tools/seo/tables.mjs from ${from}: edit that, not this file.\n` +
  ` * Read by tools/seo (shared/seo/i18n.mjs), never by a page. Rules: shared/seo/i18n/README.md. */\nwindow.SlopI18n && window.SlopI18n.add('en', {\n`;
export const body = (rows) => rows.map(([k, v]) => `  ${q(k)}: ${q(v)},`).join('\n') + '\n});\n';

/** Every app of the registry, the ones a profile hides included, so every build has the same keys. */
export function fullRegistry() {
  const win = {};
  const src = readFileSync(path.join(ROOT, 'shared', 'apps.js'), 'utf8').replace(/\/\*profile:hideApps\*\/\[[^\]]*\]/, '[]');
  vm.runInNewContext(src, { window: win });
  return win.SLOP_APPS;
}

/** [key, text] of a list of items, a flat walk: arrays get their index as a key part. */
function rows(prefix, obj) {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') out.push([p, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}.${i}`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
  };
  walk(obj, prefix);
  return out;
}

/** Splits rows into parts of at most PART_LINES, evenly: name, name-b, ... when it needs more than one. */
function split(name, all) {
  const n = Math.max(1, Math.ceil(all.length / PART_LINES)), size = Math.ceil(all.length / n), out = [];
  for (let i = 0; i < n; i++) out.push([n > 1 ? `${name}-${'abcdefghijklmnop'[i]}` : name, all.slice(i * size, (i + 1) * size)]);
  return out;
}

export function generatedParts() {
  const reg = [];
  for (const a of fullRegistry()) {
    const pick = { title: a.title, tagline: a.tagline, features: a.features && a.features.length ? a.features : undefined };
    for (const [k, v] of Object.entries(pick)) if (v !== undefined && v !== '') reg.push(...rows(`seo.reg.${seg(a.id)}.${k}`, v));
  }
  const cv = [];
  for (const p of CONVERTERS) {
    const pick = { title: p.title, description: p.description, h1: p.h1, lead: p.lead, how: p.how, faq: p.faq };
    for (const [k, v] of Object.entries(pick)) if (v) cv.push(...rows(`seo.cv.${seg(p.slug)}.${k}`, v));
  }
  const files = [];
  for (const [name, list] of split('reg', reg)) files.push({ file: `shared/seo/i18n/en/${name}.js`, text: head(name, 'shared/apps.js') + body(list) });
  for (const [name, list] of split('cv', cv)) files.push({ file: `shared/seo/i18n/en/${name}.js`, text: head(name, 'convert/js/core/*pages*.js') + body(list) });
  return files;
}
