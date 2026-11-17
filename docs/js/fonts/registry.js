/* Slop Docs — fonts/registry: the document font families. Each has four static TrueType faces in
 * shared/fonts/<dir>/ttf/ (no kerning or ligature tables). The SAME bytes are used three ways:
 * registered as a FontFace for the on-screen SVG pages, parsed for text measurement (advance widths),
 * and subset into the PDF. That is what makes screen and PDF line breaks identical.
 * Word and Google font names map to metric-compatible families (Calibri → Carlito, Arial → Arimo …). */
import { parseTTF } from './ttf.js';
import { langFace, hasLangFaces, langVersion, shapedWidth } from './lang.js';

export const FAMILIES = [
  { name: 'Carlito', dir: 'carlito', stem: 'Carlito', cat: 'sans-serif', aliases: ['calibri', 'aptos', 'calibri light', 'segoe ui', 'candara', 'corbel'] }, // i18n-ignore: font family names
  { name: 'Arimo', dir: 'arimo', stem: 'Arimo', cat: 'sans-serif', aliases: ['arial', 'helvetica', 'helvetica neue', 'liberation sans', 'verdana', 'tahoma', 'open sans', 'roboto', 'noto sans', 'sans-serif', 'trebuchet ms', 'lato', 'source sans pro'] }, // i18n-ignore: font family names
  { name: 'Tinos', dir: 'tinos', stem: 'Tinos', cat: 'serif', aliases: ['times new roman', 'times', 'liberation serif', 'georgia', 'garamond', 'book antiqua', 'palatino', 'palatino linotype', 'serif', 'merriweather', 'noto serif', 'pt serif', 'lora'] }, // i18n-ignore: font family names
  { name: 'Caladea', dir: 'caladea', stem: 'Caladea', cat: 'serif', aliases: ['cambria', 'constantia'] }, // i18n-ignore: font family names
  { name: 'Cousine', dir: 'cousine', stem: 'Cousine', cat: 'monospace', aliases: ['courier new', 'courier', 'liberation mono', 'consolas', 'monospace', 'lucida console', 'menlo', 'monaco', 'roboto mono', 'source code pro'] }, // i18n-ignore: font family names
  { name: 'Inter Tight', dir: 'inter-tight', stem: 'InterTight', cat: 'sans-serif', aliases: ['inter'] }, // i18n-ignore: font family names
  { name: 'Archivo', dir: 'archivo', stem: 'Archivo', cat: 'sans-serif', aliases: [] }, // i18n-ignore: font family names
  { name: 'JetBrains Mono', dir: 'jetbrains-mono', stem: 'JetBrainsMono', cat: 'monospace', aliases: [] }, // i18n-ignore: font family names
];
export const DEFAULT_FAMILY = 'Carlito';
const STYLE = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
let BASE = new URL('../../../shared/fonts/', import.meta.url).href;
/** Where the shared/fonts folder lives (the offline build points this at embedded data). */
export function setFontBase(url) { BASE = url; }
/** Optional override: (dir, file) → Promise<ArrayBuffer>, used by the offline single-file build. */
let fetcher = null;
export function setFontFetcher(fn) { fetcher = fn; }

const byLower = new Map();
for (const f of FAMILIES) { byLower.set(f.name.toLowerCase(), f); for (const a of f.aliases) byLower.set(a, f); }
/** The family that renders a font name (unknown names fall back by a serif/mono guess). */
export function familyOf(name) {
  const k = String(name || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (byLower.has(k)) return byLower.get(k);
  if (/mono|code|courier|consol/.test(k)) return byLower.get('cousine');
  if (/serif|times|roman|garamond|georgia|book|minion|baskerville/.test(k) && !/sans/.test(k)) return byLower.get('tinos');
  return byLower.get(DEFAULT_FAMILY.toLowerCase());
}
export const cssFamily = (fam) => `SD ${fam.user ? fam.dir : fam.name}`; // a font the person owns has a plain CSS name
export const faceKey = (fam, b, i) => fam.user ? `${fam.dir}-0` : `${fam.dir}-${(b ? 1 : 0) + (i ? 2 : 0)}`;

const faces = new Map(); // key → face | Promise
const listeners = new Set();
export function onFontLoad(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** A loaded face { key, fam, b, i, ttf, bytes, css } or null when it is still loading. */
export function face(name, b = false, i = false) {
  const fam = typeof name === 'object' ? name : familyOf(name);
  const k = faceKey(fam, b, i), f = faces.get(k);
  if (f && !(f instanceof Promise)) return f;
  if (!f) loadFace(fam, b, i).catch(() => {});
  return null;
}
/** Load (once) one face; resolves to the face. */
export function loadFace(fam, b = false, i = false) {
  if (typeof fam !== 'object') fam = familyOf(fam);
  if (fam.user) { b = false; i = false; } // a font the person owns is one face: bold and italic are synthesised by the browser
  const k = faceKey(fam, b, i);
  if (faces.has(k)) return Promise.resolve(faces.get(k));
  const file = `${fam.stem}-${STYLE[(b ? 1 : 0) + (i ? 2 : 0)]}.ttf`;
  const p = (async () => {
    const buf = fam.user ? fam.bytes : fetcher ? await fetcher(fam.dir, file) : await fetch(`${BASE}${fam.dir}/ttf/${file}`).then((r) => { if (!r.ok) throw new Error('Font ' + file + ' ' + r.status); return r.arrayBuffer(); });
    const bytes = new Uint8Array(buf), ttf = parseTTF(bytes);
    const css = cssFamily(fam);
    if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
      const ff = new FontFace(css, bytes.slice().buffer, { weight: b ? '700' : '400', style: i ? 'italic' : 'normal' });
      await ff.load(); document.fonts.add(ff);
    }
    const out = { key: k, fam, b, i, ttf, bytes, css, cache: new Map() };
    faces.set(k, out);
    for (const fn of listeners) try { fn(out); } catch (e) { console.error(e); }
    return out;
  })();
  faces.set(k, p);
  p.catch(() => faces.delete(k));
  return p;
}
let userN = 0;
/** Adds a font the person owns as a family (TrueType bytes, one face) and returns it. A name a built-in family or alias uses is
 * refused. Adding a name again replaces the earlier file. The bytes are parsed now, so a file the engine cannot read throws here. */
export function addUserFamily(name, bytes) {
  const label = String(name || '').trim(), key = label.toLowerCase();
  if (!label) throw new Error('That font has no family name.');
  let fam = byLower.get(key);
  if (fam && !fam.user) throw new Error(`${label} is a built-in family`);
  parseTTF(bytes);
  if (!fam) {
    fam = { name: label, dir: 'own' + (++userN), stem: label.replace(/\W+/g, ''), cat: 'sans-serif', aliases: [], user: true };
    FAMILIES.push(fam); byLower.set(key, fam);
  }
  fam.bytes = new Uint8Array(bytes);
  for (const k of [...faces.keys()]) if (k.startsWith(fam.dir + '-')) faces.delete(k);
  loadFace(fam).catch((e) => console.warn(e.message));
  return fam;
}
/** Load every face a list of { font, b, i } needs (plus the default regular). */
export async function ensureFaces(list) {
  const want = new Map([[faceKey(familyOf(DEFAULT_FAMILY), false, false), [familyOf(DEFAULT_FAMILY), false, false]]]);
  for (const s of list) { const fam = familyOf(s.font); want.set(faceKey(fam, s.b, s.i), [fam, !!s.b, !!s.i]); }
  await Promise.all([...want.values()].map(([f, b, i]) => loadFace(f, b, i).catch((e) => console.warn(e.message))));
}
/** The face to use for text: the wanted face, or the closest loaded one while it loads. */
export function bestFace(name, b, i) {
  const fam = familyOf(name);
  return face(fam, b, i) || face(fam, b, false) || face(fam, false, false) || face(DEFAULT_FAMILY, false, false) || null;
}
export const loadedFaces = () => [...faces.values()].filter((f) => !(f instanceof Promise));

let canvas = null;
function fallbackWidth(ch, size) {
  if (typeof document === 'undefined') return size * 0.6;
  canvas = canvas || document.createElement('canvas').getContext('2d');
  canvas.font = `${size}px sans-serif`;
  return canvas.measureText(ch).width;
}
/** The Chinese-character variant used when a paragraph does not say (from the browser language, as SlopFontJIT does). */
export function defaultHan() {
  const S = globalThis.SlopScripts, lang = (globalThis.navigator && navigator.language) || 'en';
  return S ? S.hanFor('', lang) : 'sc';
}
const hanProxies = new WeakMap();
/** The face for a paragraph whose Chinese characters take another variant (Japanese kanji beside kana, say): the same face
 * object underneath, so it shares its bytes and caches, with its own han. */
export function withHan(f, han) {
  if (!f || !han || han === defaultHan()) return f;
  let m = hanProxies.get(f);
  if (!m) hanProxies.set(f, (m = {}));
  return m[han] || (m[han] = Object.create(f, { han: { value: han } }));
}
const MARK = /^[\p{M}\u200c\u200d\ufe00-\ufe0f]$/u;
const runCache = new WeakMap();
/** A text cut into font runs, in logical order: [{ f, text }]. A character the face cannot set goes to the language face of
 * its script when one is loaded; marks and joiners stay with the character before them. Screen, layout and PDF use this. */
export function fontRuns(f, text) {
  if (!hasLangFaces() || !text) return [{ f, text }];
  let m = null;
  if (f) {
    m = runCache.get(f);
    if (!m || m.v !== langVersion()) runCache.set(f, (m = { v: langVersion(), map: new Map() }));
    const hit = m.map.get(text);
    if (hit) return hit;
  }
  const out = [], han = (f && f.han) || defaultHan();
  let cur = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    let g;
    if (cur && MARK.test(ch)) g = cur.f;
    else if (cp < 0x80 || (f && f.ttf && f.ttf.has(cp))) g = f;
    else g = langFace(cp, f ? f.b : false, han) || f;
    if (cur && cur.f === g) cur.text += ch; else out.push((cur = { f: g, text: ch }));
  }
  if (m) { if (m.map.size > 5000) m.map.clear(); m.map.set(text, out); }
  return out;
}
/** Advance width of one code point in points. */
export function charWidth(f, cp, size) {
  if (f && f.lang) return shapedWidth(f, String.fromCodePoint(cp), size);
  if (!f) { const lf = langFace(cp, false, defaultHan()); return lf ? shapedWidth(lf, String.fromCodePoint(cp), size) : size * 0.5; }
  let w = f.cache.get(cp);
  if (w === undefined) {
    const g = f.ttf.has(cp) ? f.ttf.gid(cp) : -1;
    w = g >= 0 ? f.ttf.adv(g) / f.ttf.upm : (cp === 9 || cp === 10 ? 0 : -1);
    f.cache.set(cp, w);
  }
  if (w >= 0) return w * size;
  const lf = langFace(cp, f.b, f.han || defaultHan());
  return lf ? shapedWidth(lf, String.fromCodePoint(cp), size) : fallbackWidth(String.fromCodePoint(cp), size);
}
function plainWidth(f, text, size) {
  let w = 0;
  for (const ch of text) w += charWidth(f, ch.codePointAt(0), size);
  return w;
}
/** Width of one font run: shaped for a language face, the sum of advances for the document's own faces (they have no
 * kerning or ligature tables, so that is exactly what the PDF draws). */
export const runWidth = (f, text, size) => (f && f.lang ? shapedWidth(f, text, size) : plainWidth(f, text, size));
/** Width of a string in points: the sum of its font runs. */
export function textWidth(f, text, size) {
  if (!hasLangFaces() || !text) return plainWidth(f, text || '', size);
  let w = 0;
  for (const r of fontRuns(f, text)) w += runWidth(r.f, r.text, size);
  return w;
}
/** Vertical metrics in points for a size: { asc, desc, gap, line }. */
export function vmetrics(f, size) {
  if (!f) return { asc: size * 0.9, desc: size * 0.25, gap: 0, line: size * 1.15 };
  const t = f.lang ? f : f.ttf, k = size / t.upm;
  return { asc: t.asc * k, desc: t.desc * k, gap: t.gap * k, line: (t.asc + t.desc + t.gap) * k };
}
/** The tallest metrics of the faces a text is set in (a line with Devanagari in it is as tall as Devanagari needs). */
export function textVm(f, text, size) {
  const v = vmetrics(f, size);
  if (!hasLangFaces() || !text) return v;
  for (const r of fontRuns(f, text)) {
    if (r.f === f || !r.f) continue;
    const w = vmetrics(r.f, size);
    v.asc = Math.max(v.asc, w.asc); v.desc = Math.max(v.desc, w.desc); v.gap = Math.max(v.gap, w.gap);
  }
  v.line = v.asc + v.desc + v.gap;
  return v;
}
