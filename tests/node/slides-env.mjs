// Loads Slop Slides' classic scripts (window.SS) into this Node process, with a small namespace-aware DOMParser (Node has
// none) that covers what shared/office/xml.js and the PPTX reader call. Helper for slides-*.test.mjs; not a test itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---- DOMParser ---- */
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
class XNode {
  constructor(type) { this.nodeType = type; this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() { if (!this.parentNode) return null; const k = this.parentNode.childNodes; return k[k.indexOf(this) + 1] ?? null; }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  getElementsByTagNameNS(ns, local) {
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) if (c.nodeType === 1) { if ((ns === '*' || c.namespaceURI === ns) && (local === '*' || c.localName === local)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  getElementsByTagName(name) { return this.getElementsByTagNameNS('*', name); }
}
class XElem extends XNode {
  constructor(qname, attrs, scope) {
    super(1);
    const i = qname.indexOf(':');
    this.nodeName = this.tagName = qname;
    this.prefix = i < 0 ? null : qname.slice(0, i);
    this.localName = i < 0 ? qname : qname.slice(i + 1);
    this.namespaceURI = scope[this.prefix ?? ''] ?? null;
    this.attributes = attrs.map(([name, value]) => {
      const j = name.indexOf(':'), prefix = j < 0 ? null : name.slice(0, j);
      return { name, value, localName: j < 0 ? name : name.slice(j + 1), namespaceURI: prefix && prefix !== 'xmlns' ? scope[prefix] ?? null : null };
    });
  }
  getAttribute(name) { const a = this.attributes.find((x) => x.name === name); return a ? a.value : null; }
  hasAttribute(name) { return this.attributes.some((x) => x.name === name); }
  getAttributeNS(ns, local) { const a = this.attributes.find((x) => x.namespaceURI === ns && x.localName === local); return a ? a.value : null; }
  hasAttributeNS(ns, local) { return this.attributes.some((x) => x.namespaceURI === ns && x.localName === local); }
}
function parse(src) {
  const doc = new XNode(9), stack = [{ node: doc, scope: { xml: 'http://www.w3.org/XML/1998/namespace' } }];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const text = (top, s) => { const t = new XNode(3); t.data = s; t.parentNode = top.node; top.node.childNodes.push(t); };
  let m;
  while ((m = tag.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { text(top, m[1]); continue; }
    if (m[2] !== undefined) { if (stack.length < 2) throw new Error('unbalanced'); stack.pop(); continue; }
    if (m[3] !== undefined) {
      const attrs = [...m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], unescape(a[2] ?? a[3])]);
      const scope = { ...top.scope };
      for (const [n, v] of attrs) if (n === 'xmlns') scope[''] = v; else if (n.startsWith('xmlns:')) scope[n.slice(6)] = v;
      const el = new XElem(m[3], attrs, scope);
      el.parentNode = top.node; top.node.childNodes.push(el);
      if (!m[5]) stack.push({ node: el, scope });
      continue;
    }
    if (m[6] !== undefined) text(top, unescape(m[6]));
  }
  Object.defineProperty(doc, 'documentElement', { get: () => doc.childNodes.find((c) => c.nodeType === 1) ?? null });
  return doc;
}
globalThis.DOMParser = class { parseFromString(s) { return parse(String(s)); } };

/* ---- the classic scripts ---- */
export const CORE = ['slides/js/core/util.js', 'slides/js/core/themes.js', 'slides/js/core/objects.js', 'slides/js/core/layouts.js', 'slides/js/core/model.js',
  'slides/js/render/ttf.js', 'slides/js/render/fonts.js', 'slides/js/render/text.js', 'slides/js/render/shapes.js'];
export const PPTX = ['slides/js/io/pptx-in-style.js', 'slides/js/io/pptx-in-text.js', 'slides/js/io/pptx-in-shape.js', 'slides/js/io/pptx-in.js', 'slides/js/io/pptx.js'];

/** Runs the given scripts (repo paths) in this process as the browser would, and returns window.SS. */
/** The app's English words (slides/i18n/en/*.js) behind a small SlopI18n: t(key, vars) with the #one plural, has(key). */
function englishWords() {
  if (globalThis.SlopI18n) return;
  const T = {};
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? String(v[n]) : m));
  globalThis.SlopI18n = {
    add: (code, dict) => { if (code === 'en') Object.assign(T, dict); },
    has: (k) => k in T,
    t: (k, v) => { const s = v && v.n === 1 && T[k + '#one'] != null ? T[k + '#one'] : T[k]; return s == null ? k : fill(s, v); },
  };
  const dir = path.join(ROOT, 'slides', 'i18n', 'en');
  for (const f of readdirSync(dir)) vm.runInThisContext(readFileSync(path.join(dir, f), 'utf8'), { filename: path.join(dir, f) });
}
export function loadSlides(files) {
  globalThis.window = globalThis;
  englishWords();
  globalThis.SS = globalThis.SS || {};
  globalThis.location = globalThis.location || { href: pathToFileURL(path.join(ROOT, 'slides', 'index.html')).href };
  for (const f of files) {
    const file = path.join(ROOT, f);
    globalThis.document = { currentScript: { src: pathToFileURL(file).href } };
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  }
  return globalThis.SS;
}
/** The three shared/office modules merged, as SS.pptxIn.fromFiles takes them. */
export async function officeLib() {
  const mods = await Promise.all(['zip.js', 'xml.js', 'units.js'].map((f) => import(pathToFileURL(path.join(ROOT, 'shared', 'office', f)).href)));
  return Object.assign({}, ...mods);
}
