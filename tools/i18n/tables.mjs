// The string tables and the apps, as the translation tools see them (tools/i18n/i18n.mjs).
//   apps()            every registry app with a folder: { id, name, dir, files: [its .js and index.html, relative to the repo] }
//   appTables(app)    { parts, langs, index, tables: { code: Map(key → text) }, byPart: { code: { part: Map } } } from <dir>i18n/
//   sharedTables(ns)  'chrome' (shared/i18n/strings.js + <code>.js) or 'ui' (shared/i18n/ui/<code>.js), same shape
//   sharedAreas()     the shared tables kept like an app's: the ui parts (shared/i18n/ui/<code>/<part>.js, keys ui.*,
//                     listed in UI_PARTS of shared/i18n/i18n.js) and every shared/<area>/i18n/index.js (shared/biz: biz.*)
//   pageAreas()       site pages that are not registry apps but keep tables like an app's (settings/: keys settings.*)
//   langs()           the LANGS list of shared/i18n/i18n.js
// A table file is run in a small sandbox whose SlopI18n.add(code, dict) records what it adds, so a file is read exactly
// as a page reads it.
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => existsSync(path.join(ROOT, f));

/** Runs one table file; returns { adds: [[code, dict], ...], sources: [spec, ...] } (index.js files call source()). */
export function runTable(file) {
  const adds = [], sources = [];
  const ctx = { SlopI18n: { add: (code, dict) => adds.push([code, dict]), source: (spec) => sources.push(spec) }, document: { currentScript: { src: 'https://x/' + file } } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return { adds, sources };
}
const asMap = (dict) => new Map(Object.entries(dict || {}).filter(([, v]) => typeof v === 'string'));

let LANGS_CACHE = null;
export function langs() {
  if (LANGS_CACHE) return LANGS_CACHE;
  const ctx = { document: undefined };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('shared/i18n/i18n.js'), ctx);
  return (LANGS_CACHE = JSON.parse(JSON.stringify(ctx.SlopI18n.LANGS)));
}

/** The shared tables: ns 'chrome' or 'ui'. */
export function sharedTables(ns) {
  const tables = {}, files = {};
  for (const l of langs()) {
    const list = ns === 'ui' ? [`shared/i18n/ui/${l.code}.js`] : [l.code === 'en' ? 'shared/i18n/strings.js' : `shared/i18n/${l.code}.js`];
    files[l.code] = list.filter(exists);
    if (!files[l.code].length) continue;
    const m = new Map();
    for (const f of files[l.code]) for (const [code, dict] of runTable(f).adds) if (code === l.code) for (const [k, v] of asMap(dict)) m.set(k, v);
    tables[l.code] = m;
  }
  return { ns, langs: Object.keys(tables), tables, files };
}

/** The UI_PARTS literal of shared/i18n/i18n.js (the ui parts a page loads): { parts, langs }. */
export const UI_PARTS_RE = /\/\*ui-parts\*\/(\{[^\n]*?\});/;
export function uiPartsIndex() {
  const m = read('shared/i18n/i18n.js').match(UI_PARTS_RE);
  return m ? Object.assign({ ns: 'ui' }, JSON.parse(m[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'))) : null;
}

/** An app's tables, from <dir>i18n/index.js (its parts and languages) and <dir>i18n/<code>/<part>.js. A shared area
 * (sharedAreas()) has its folder in app.base, and the ui parts their index in i18n.js (app.ns 'ui'). */
export function appTables(app) {
  const base = app.base || `${app.dir}i18n/`;
  const out = { ns: app.ns || app.id, base, index: null, parts: [], langs: [], tables: {}, byPart: {}, dirs: [] };
  if (!exists(base)) return out;
  out.dirs = readdirSync(path.join(ROOT, base)).filter((d) => statSync(path.join(ROOT, base, d)).isDirectory()).sort();
  if (app.id === 'ui-parts') {
    out.index = uiPartsIndex();
    if (out.index) { out.parts = out.index.parts || []; out.langs = out.index.langs || []; }
  } else if (exists(base + 'index.js')) {
    const spec = runTable(base + 'index.js').sources[0] || null;
    out.index = spec;
    if (spec) { out.parts = spec.parts || []; out.langs = spec.langs || []; }
  }
  for (const code of out.dirs) {
    out.byPart[code] = {};
    const m = new Map();
    for (const f of readdirSync(path.join(ROOT, base, code)).filter((x) => x.endsWith('.js')).sort()) {
      const part = f.slice(0, -3), pm = new Map();
      for (const [c, dict] of runTable(`${base}${code}/${f}`).adds) if (c === code) for (const [k, v] of asMap(dict)) { pm.set(k, v); m.set(k, v); }
      out.byPart[code][part] = pm;
    }
    out.tables[code] = m;
  }
  return out;
}

/** Every file under a folder (relative to the repo), skipping subfolders that are pages of their own (an index.html:
 * landing pages and other apps), the app's i18n folder, and tests. */
function walk(dir, top) {
  const out = [];
  for (const f of readdirSync(path.join(ROOT, dir))) {
    const rel = dir + f;
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) {
      if (f === 'i18n' || f === 'tests' || f === 'node_modules' || exists(rel + '/index.html')) continue;
      out.push(...walk(rel + '/', top));
    } else if (/\.js$/.test(f) && !/\.min\.js$/.test(f)) out.push(rel);
  }
  return out;
}

let APPS_CACHE = null;
/** The registry's apps that have a folder here, with their source files (index.html first). */
export function apps() {
  if (APPS_CACHE) return APPS_CACHE;
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('shared/apps.js'), ctx);
  const reg = JSON.parse(JSON.stringify(ctx.SLOP_APPS));
  const out = [];
  for (const a of reg) {
    if (!a.path || a.path.startsWith('#') || !exists(a.path + 'index.html')) continue;
    const others = reg.filter((b) => b !== a && b.path && b.path.startsWith(a.path) && b.path !== a.path).map((b) => b.path);
    const files = [a.path + 'index.html', ...walk(a.path, a.path).filter((f) => !others.some((o) => f.startsWith(o)))];
    out.push({ id: a.id, name: a.name, dir: a.path, files });
  }
  return (APPS_CACHE = out);
}

/** The shared components (shared/ and shell/, without the string tables and vendored code), as one pseudo-app. */
export function sharedApp() {
  const files = [...walk('shell/', 'shell/'), ...walk('shared/', 'shared/')].filter((f) => !f.startsWith('shared/i18n/') && !/\/vendor\//.test(f));
  return { id: 'shared', name: 'Shared components', dir: 'shared/', files };
}

let AREAS_CACHE = null;
/** The shared tables kept as an app's are (one folder per language, parts of at most 300 lines), as pseudo-apps
 * { id, ns, name, base, files }: 'ui-parts' (shared/i18n/ui/<code>/<part>.js, keys ui.*) and each shared/<area>/i18n
 * with an index.js (its ns, e.g. biz). Their keys may be asked for anywhere: files are the shared code and every app's. */
export function sharedAreas() {
  if (AREAS_CACHE) return AREAS_CACHE;
  const files = [...new Set([...sharedApp().files, ...apps().flatMap((a) => a.files)])];
  const out = [{ id: 'ui-parts', ns: 'ui', name: 'Shared components, more (shared/i18n/ui/<code>/)', base: 'shared/i18n/ui/', dir: 'shared/i18n/ui/', files }];
  for (const d of readdirSync(path.join(ROOT, 'shared')).sort()) {
    const base = `shared/${d}/i18n/`;
    if (d === 'i18n' || !exists(base + 'index.js')) continue;
    const spec = runTable(base + 'index.js').sources[0] || {};
    out.push({ id: spec.ns || d, ns: spec.ns || d, name: `Shared ${d} (${base})`, base, dir: `shared/${d}/`, files });
  }
  return (AREAS_CACHE = out);
}

let PAGES_CACHE = null;
/** The site's pages that are not registry apps but keep tables like an app's: a top-level folder with an index.html and
 * an i18n/en/ folder (settings/: keys settings.*). { id, ns, name, dir, files }; the id and ns are the folder name. */
export function pageAreas() {
  if (PAGES_CACHE) return PAGES_CACHE;
  const taken = new Set(apps().map((a) => a.dir));
  const out = [];
  for (const d of readdirSync(ROOT).sort()) {
    const dir = d + '/';
    if (taken.has(dir) || ['shared', 'shell', 'tests', 'tools', 'node_modules'].includes(d) || !exists(dir + 'index.html') || !exists(dir + 'i18n/en')) continue;
    out.push({ id: d, ns: d, name: `${d[0].toUpperCase() + d.slice(1)} page`, dir, files: [dir + 'index.html', ...walk(dir, dir)] });
  }
  return (PAGES_CACHE = out);
}

/** Every string-table file in the repo (shared and apps, with each app's index.js), sorted: the list a test names. */
export function tableFiles() {
  const out = [];
  for (const f of readdirSync(path.join(ROOT, 'shared/i18n'))) if (f.endsWith('.js') && f !== 'i18n.js') out.push('shared/i18n/' + f);
  if (exists('shared/i18n/ui')) for (const f of readdirSync(path.join(ROOT, 'shared/i18n/ui'))) if (f.endsWith('.js')) out.push('shared/i18n/ui/' + f);
  for (const app of [...apps(), ...pageAreas(), ...sharedAreas()]) {
    const t = appTables(app);
    if (t.index && app.id !== 'ui-parts') out.push(t.base + 'index.js');
    for (const code of t.dirs) for (const part of Object.keys(t.byPart[code])) out.push(`${t.base}${code}/${part}.js`);
  }
  return out.sort();
}
export const COVERS = 'tests/i18n/tables.covers.txt';
/** The text of COVERS: a "Covers:" line per table file, so the repo rule (every script named by a test) holds for data. */
export function coversText() {
  return '# Every string table, checked by tests/node/i18n-tables.test.mjs (it runs each one).\n' +
    '# Generated by node tools/i18n/i18n.mjs index <app> (or coverage); do not edit by hand.\n' + tableFiles().map((f) => 'Covers: ' + f).join('\n') + '\n';
}

export { read, exists };
