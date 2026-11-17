// The SEO copy in every language, for the SEO tools (Node only; a page never loads it). The words are in string tables
// like an app's: shared/seo/i18n/<code>/<part>.js, one SlopI18n.add(code, { key: text }) each, English the source
// (shared/seo/i18n/README.md). The fact files (shared/seo/tasks, roundups, guides, copy.mjs ...) hold what is not
// translated: slugs, app ids, URLs, sources, dates, the marks of a feature table. hydrate() joins the two:
//   hydrate(skel, prefix, code)  the item with every key under prefix put in at its path ('seo.task.pdf.merge.faq.0.1'
//                                -> faq[0][1]), and every '@<key>' string replaced by that key's text
//   text(key, code)              one key's text (English when the language lacks it)
//   table(code)                  Map(key -> text) of one language ({} when it has no folder)
//   tableLangs()                 the languages with a folder here, English first
//   appTable(dir, code)          Map(key -> text) of an app's own tables in one language (<dir>/i18n/<code>/*.js)
//   seg(id)                      an id or slug as a key part (as it is: 'seo.best.free-pdf-editors.h1')
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n');
// An id or slug is a key part as it is ('free-pdf-editors'), so a white-label rename of the id renames the key with it.
export const seg = (s) => String(s);
const cache = new Map();

/** Runs one table file in a sandbox and returns what it adds for its own language. */
export function readTable(file, code) {
  const out = new Map();
  const ctx = { SlopI18n: { add: (c, dict) => { if (c === code) for (const [k, v] of Object.entries(dict)) if (typeof v === 'string') out.set(k, v); } } };
  ctx.window = ctx;
  vm.runInNewContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  return out;
}

export function table(code) {
  if (cache.has(code)) return cache.get(code);
  const dir = path.join(DIR, code), m = new Map();
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) for (const [k, v] of readTable(path.join(dir, f), code)) m.set(k, v);
  cache.set(code, m);
  return m;
}
export const tableLangs = () => (existsSync(DIR) ? readdirSync(DIR).filter((d) => !d.includes('.') && existsSync(path.join(DIR, d))).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a < b ? -1 : 1)) : []);
const apps = new Map();
export function appTable(dir, code) {
  const id = dir + '/' + code;
  if (!apps.has(id)) {
    const d = path.join(DIR, '..', '..', '..', dir, 'i18n', code), m = new Map();
    if (existsSync(d)) for (const f of readdirSync(d).filter((x) => x.endsWith('.js')).sort()) for (const [k, v] of readTable(path.join(d, f), code)) m.set(k, v);
    apps.set(id, m);
  }
  return apps.get(id);
}
/** Forget the read tables (a test or a tool that rewrote one). */
export const reset = () => { cache.clear(); apps.clear(); keyList = null; };

export function text(key, code = 'en') {
  const v = table(code).get(key);
  if (v !== undefined) return v;
  const en = table('en').get(key);
  if (en === undefined) throw new Error(`SEO copy: no English text for ${key}`);
  return en;
}

let keyList = null;
/** The English keys under one prefix, in table order (the order of the paths, so a list is filled in order). */
function keysUnder(prefix) {
  if (!keyList) keyList = [...table('en').keys()];
  const p = prefix + '.';
  return keyList.filter((k) => k.startsWith(p));
}

export function hydrate(skel, prefix, code = 'en') {
  const out = structuredClone(skel);
  for (const k of keysUnder(prefix)) {
    const p = k.slice(prefix.length + 1).split('.');
    let o = out;
    for (let i = 0; i < p.length; i++) {
      const s = p[i], name = /^\d+$/.test(s) ? Number(s) : (Object.keys(o).find((x) => seg(x) === s) ?? s);
      if (i === p.length - 1) { o[name] = text(k, code); break; }
      if (o[name] == null) o[name] = /^\d+$/.test(p[i + 1]) ? [] : {};
      o = o[name];
    }
  }
  const res = (v) => {
    if (typeof v === 'string') return v.startsWith('@seo.') ? text(v.slice(1), code) : v;
    if (v === null) throw new Error(`SEO copy: ${prefix} has a gap (a null the tables do not fill)`);
    if (Array.isArray(v)) return v.map(res);
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, res(b)])) : v;
  };
  return res(out);
}
