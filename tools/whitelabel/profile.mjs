// Brand profiles (brand/profiles/<id>.json): loading, checking and the facts the build derives from one.
// The schema is documented in brand/README.md ("Profiles"); validate() is its executable form.
// Node only. Tests: tests/node/whitelabel-profile.test.mjs, tests/node/whitelabel-readme-fork.test.mjs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { mascotProblems } from './mascot.mjs';
import { fontProblems, fontManifest } from './font.mjs';
import { backupExt } from './emit.mjs';
import { LANGS as SITE_LANGS } from '../seo/lang.mjs';
import { registryWindow } from '../seo/site.mjs';
import { aiProblems, ocrProblems } from './ai.mjs';

const HEX = /^#[0-9a-f]{3,8}$/i;
const TOKENS = ['background', 'surface', 'text', 'accent', 'border'];
const THEME_IDS = ['light', 'dark', 'classic', 'lime'];   // shared/theme/theme.js
const LANGS = ['en', 'es', 'fr', 'de', 'pt-BR', 'it', 'ar', 'sv'];

/** Every problem with a profile, as readable lines (empty when it is valid). */
export function validate(p) {
  const errs = [];
  const need = (k, ok, what) => { if (!ok(p[k])) errs.push(`${k}: ${what}`); };
  const isStr = (v) => typeof v === 'string' && v.trim() !== '';
  need('id', (v) => /^[a-z][a-z0-9-]*$/.test(v || ''), 'lower-case id, the file name');
  need('name', isStr, 'the product name');
  need('origin', (v) => /^https:\/\/[a-z0-9.-]+$/.test(v || ''), 'https origin without a trailing slash');
  need('cname', (v) => /^[a-z0-9.-]+$/.test(v || ''), 'the custom domain');
  need('defaultLang', (v) => LANGS.includes(v), `one of ${LANGS.join(', ')}`);
  need('naming', (v) => v === 'brand' || v === 'plain', "'brand' or 'plain'");
  need('tone', (v) => v === 'playful' || v === 'plain', "'playful' or 'plain'");
  errs.push(...mascotProblems(p.mascot), ...fontProblems(p.font), ...aiProblems(p.ai));
  if (!aiProblems(p.ai).length) errs.push(...ocrProblems(p));

  if (p.backupExt !== undefined && !/^\.[a-z0-9][a-z0-9-]{1,15}$/.test(p.backupExt)) errs.push("backupExt: the backup file's extension, like '.backup'");
  need('github', (v) => /^[A-Za-z0-9-]+$/.test(v || ''), 'GitHub account of the site');
  need('brandTerms', (v) => Array.isArray(v) && v.length > 0 && v.every(isStr), 'words that only this brand uses');
  need('colors', (v) => v && ['ink', 'paper', 'accent'].every((k) => HEX.test(v[k])), 'ink, paper and accent as #hex');
  need('media', (v) => typeof v === 'boolean', 'true (ship shots, clips and videos) or false');
  need('analytics', (v) => typeof v === 'boolean', 'true or false');
  if (p.savings !== undefined && typeof p.savings !== 'boolean') errs.push('savings: true (show the yearly savings line and its list on the homepage, the default) or false');
  need('footer', (v) => typeof v === 'string', 'the footer line');
  need('legal', (v) => v && isStr(v.holder) && /^\d{4}$/.test(v.year || ''), '{ holder, year }');
  if (p.legal && p.legal.trademarks !== undefined && !(Array.isArray(p.legal.trademarks) && p.legal.trademarks.every(isStr))) errs.push('legal.trademarks: the names the holder claims');
  for (const [id, t] of Object.entries(p.themes || {})) {
    if (id === 'hide') { if (!Array.isArray(t) || !t.every((x) => THEME_IDS.includes(x))) errs.push(`themes.hide: a list of theme ids (${THEME_IDS.join(', ')})`); continue; }
    if (id === 'names') { if (!(t === 'name' || (t === 'brandWord' && isStr(p.brandWord)))) errs.push("themes.names: 'name' or 'brandWord' (with a brandWord)"); continue; }
    if (!THEME_IDS.includes(id)) { errs.push(`themes.${id}: not a theme (${THEME_IDS.join(', ')}, hide, names)`); continue; }
    for (const k of TOKENS) if (!HEX.test((t || {})[k] || '')) errs.push(`themes.${id}.${k}: #hex`);
  }
  const nt = p.palette && p.palette.neutral;
  if (nt !== undefined && !(nt && typeof nt.hue === 'number' && (nt.from === undefined || (Array.isArray(nt.from) && nt.from.every((r) => Array.isArray(r) && r.length === 2))))) errs.push('palette.neutral: { hue, saturation?, from?: [[lo, hi], ...], maxSaturation? }');
  // defaultTheme: the theme of a visitor who never chose one; System or a theme the profile keeps
  const kept = THEME_IDS.filter((id) => !((p.themes || {}).hide || []).includes(id));
  if (p.defaultTheme !== undefined && !['system', ...kept].includes(p.defaultTheme)) errs.push(`defaultTheme: 'system' or a kept theme (${kept.join(', ')})`);
  if (p.logo && typeof p.logo === 'object' && !isStr(p.logo.text)) errs.push('logo.text: the wordmark text');
  if (p.publish) for (const k of ['repo', 'branch', 'secret', 'author', 'email']) if (!isStr(p.publish[k])) errs.push(`publish.${k}: required`);
  if (p.publish && !/^[\w.-]+\/[\w.-]+$/.test(p.publish.repo || '')) errs.push('publish.repo: owner/name');
  // seo.langs: the languages of the static SEO pages besides the root one (defaultLang): 'all' (default), a list of the
  // site's language codes (shared/i18n/i18n.js), or 'none' (or []): the root language only, no language folders
  const sl = p.seo && p.seo.langs, codes = SITE_LANGS.map((l) => l.code);
  if (sl !== undefined && sl !== 'all' && sl !== 'none' && !(Array.isArray(sl) && sl.every((c) => codes.includes(c)) && new Set(sl).size === sl.length)) {
    errs.push(`seo.langs: 'all', 'none' or a list of language codes without repeats (${codes.join(', ')})`);
  }
  errs.push(...searchProblems(p.seo || {}), ...singleAppProblems(p), ...promoProblems(p.promo));
  return errs;
}

export const PROMO_PLACES = ['home', 'settings'];   // shared/promo/promo.js: where a page has a slot
/** promo: { text, url, where? }: the owner's own line and link (brand/README.md "A promo line"). text is one string or
 * { "<language code>": string }; where a list of PROMO_PLACES (default all). */
export function promoProblems(pr) {
  if (pr === undefined) return [];
  const errs = [], codes = SITE_LANGS.map((l) => l.code), line = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 120;
  if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return ['promo: { text, url, where? }'];
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s"'<>]*)?$/i.test(pr.url || '')) errs.push('promo.url: an https address');
  const t = pr.text;
  if (!(line(t) || (t && typeof t === 'object' && !Array.isArray(t) && Object.keys(t).length && Object.entries(t).every(([k, v]) => codes.includes(k) && line(v))))) {
    errs.push('promo.text: one line (at most 120 characters), or { "<language code>": line }');
  }
  const w = pr.where;
  if (w !== undefined && !(Array.isArray(w) && w.length && w.every((x) => PROMO_PLACES.includes(x)) && new Set(w).size === w.length)) errs.push(`promo.where: a list of ${PROMO_PLACES.join(', ')} without repeats`);
  return errs;
}

const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/;
/** seo.index (true: search engines may index the site; default false), seo.canonicalTo (an origin every canonical points
 * to), seo.canonicalOverride ({ "/pdf/": "https://pdf.example/pdf/", "=/pdf/": "https://pdf.example/" }): brand/README.md
 * "Search engines". */
function searchProblems(seo) {
  const errs = [];
  if (seo.index !== undefined && typeof seo.index !== 'boolean') errs.push('seo.index: true (search engines may index the site) or false (the default)');
  if (seo.canonicalTo !== undefined && !ORIGIN.test(seo.canonicalTo)) errs.push('seo.canonicalTo: an https origin without a trailing slash');
  const o = seo.canonicalOverride;
  if (o !== undefined && !(o && typeof o === 'object' && !Array.isArray(o))) errs.push('seo.canonicalOverride: { "<path prefix>": "<https URL>" }');
  else for (const [k, v] of Object.entries(o || {})) {
    if (!/^=?\/([\w.-]+\/)*$/.test(k)) errs.push(`seo.canonicalOverride: ${k}: a path from the site root ending in / ("/pdf/"), or "=" and one page ("=/pdf/")`);
    if (typeof v !== 'string' || !/^https:\/\/[a-z0-9.-]+(:\d+)?\/([\w.-]+\/)*$/.test(v)) errs.push(`seo.canonicalOverride: ${k}: an https URL ending in /`);
  }
  return errs;
}
/** mainApp (the app the site's root opens) and parent ({ name, url }: the suite a single-app site links back to). */
function singleAppProblems(p) {
  const errs = [], all = registryWindow().SLOP_ALL_APPS, hide = (p.apps && p.apps.hide) || [];
  if (p.mainApp !== undefined) {
    const a = all.find((x) => x.id === p.mainApp);
    if (!a || !a.path || a.path.startsWith('#') || a.kind !== 'app') errs.push('mainApp: the id of an app with a page (shared/apps.js)');
    else if (hide.includes(a.id)) errs.push('mainApp: an app the profile hides (apps.hide)');
  }
  const par = p.parent;
  if (par !== undefined && !(par && typeof par.name === 'string' && par.name.trim() && /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/.test(par.url || ''))) errs.push('parent: { name, url }: the site\'s name and https address');
  return errs;
}

/** The profiles folder in this repo (another one can be passed to the build), every profile in a folder, and one by id
 * (throws with the problems when it is invalid). */
export const profilesDir = (root) => path.join(root, 'brand', 'profiles');
export function allProfiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .filter((f) => !f.endsWith('.map.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}
export function loadProfile(dir, id) {
  const file = path.join(dir, `${id}.json`);
  if (!existsSync(file)) throw new Error(`no profile ${id} (${file})`);
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const errs = validate(p);
  if (p.id !== id) errs.push(`id: '${p.id}' does not match the file name`);
  if (errs.length) throw new Error(`profile ${id}:\n  ${errs.join('\n  ')}`);
  Object.defineProperty(p, 'fontManifest', { value: fontManifest(dir, p), enumerable: false });   // its type family (font.mjs)
  return p;
}

/** The registry as the source tree has it: { id: { name, plain } } and the [brand name, plain name] pairs. */
export function registryNames(root) {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(root, 'shared', 'apps.js'), 'utf8'), { window: win });
  return win.SLOP_APPS.map((a) => [a.brandName, a.plain]).filter(([a, b]) => a && b && a !== b);
}

/** The visible-name pairs for a profile: registry names (when naming is plain), the tone's copy layer, the profile's own
 * copy, and the source brand name -> the profile's name. Later sources override earlier ones. */
export function phrasePairs(root, p) {
  const map = new Map();
  if (p.naming === 'plain') for (const [a, b] of registryNames(root)) map.set(a, b);
  if (p.tone === 'plain') {
    const tone = JSON.parse(readFileSync(path.join(root, 'brand', 'copy', 'plain.json'), 'utf8'));
    for (const [a, b] of Object.entries(tone)) if (a !== '_') map.set(a, b);
  }
  // The backup file's extension where the text names it (docs, guides, the homepage); the code reads the markers.
  const ext = backupExt(p);
  if (ext) {
    map.set('.slop-backup.json', ext + '.json');
    for (const w of ['file', 'files', 'ZIP']) map.set(`.slop ${w}`, `${ext} ${w}`);
    map.set('.slop backups', `${ext} files`);
    map.set('.slop backup', `${ext} file`);
    map.set('-YYYY-MM-DD.slop', `-YYYY-MM-DD${ext}`);
    map.set('`.slop` ZIP', `\`${ext}\` ZIP`);
  }
  for (const [a, b] of Object.entries(p.copy || {})) map.set(a, b);
  if (p.seo && p.seo.titleSuffix) map.set(' | Slopographic', p.seo.titleSuffix);   // page titles have a length limit
  // The homepage title and description, wherever they are written in English (the SEO table, a test that checks the head).
  const copy = readFileSync(path.join(root, 'shared', 'seo', 'i18n', 'en', 'copy.js'), 'utf8');
  for (const [key, field] of [['seo.home.title', 'homeTitle'], ['seo.home.description', 'homeDescription']]) {
    const m = copy.match(new RegExp(`'${key.replace(/\./g, '\\.')}': '((?:[^'\\\\]|\\\\.)*)'`));
    if (m && p.seo && p.seo[field]) map.set(m[1].replace(/\\'/g, "'"), p.seo[field]);
  }
  map.set('Slopographic', p.name);
  map.set('>slopographic<', `>${p.name}<`);
  map.set('slopographic repository', `${p.name} repository`);                       // the home link under each app's name
  return [...map.entries()];
}

/** The rename map of a profile: <profiles dir>/<id>.map.json, { stem: [source, target], compounds: [{ from, to, fromCamel?,
 * toCamel?, path? }] }. One file holds every token and folder rename, so the reverse (import.mjs) reads the same map. */
export function loadMap(dir, id) {
  const file = path.join(dir, `${id}.map.json`);
  if (!existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const errs = [];
  if (!Array.isArray(m.stem) || m.stem.length !== 2 || !/^[a-z]+$/.test(m.stem[1] || '')) errs.push('stem: [source, lower-case target]');
  for (const c of m.compounds || []) {
    if (!/^[a-z0-9-]+$/.test(c.from || '') || !/^[a-z0-9]+$/.test(c.to || '')) errs.push(`compound ${c.from}: from and to in lower case (to without dashes)`);
    if (c.path && !/^[a-z0-9-]+$/.test(c.path)) errs.push(`compound ${c.from}: path is a folder name`);
  }
  if (errs.length) throw new Error(`map ${id}:\n  ${errs.join('\n  ')}`);
  return { stem: m.stem, compounds: m.compounds || [] };
}

/** The words a build of profile p must not contain: the source brand's and every other profile's brand terms, and the
 * profile's own extra `forbid` list. */
export function forbiddenTerms(dir, p) {
  // the source brand: its stem (slopographic, sloppo and the domains contain it), its GitHub user id (in noreply mails)
  const terms = new Set(['slop', 'slurp', '340656300', ...(p.forbid || [])]);
  for (const o of allProfiles(dir)) if (o.id !== p.id) for (const t of o.brandTerms) terms.add(t.toLowerCase());
  return [...terms].map((t) => t.toLowerCase());
}
