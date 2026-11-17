// Slop Tables node tests: a minimal DOMParser for shared/office/xml.js (the same stand-in as sheets-read.test.mjs), so the
// XLSX and ODS readers run in Node. Import it before the readers: import './tables-dom-shim.mjs';
// ---- minimal DOMParser: elements with namespaces, attributes, text; enough for shared/office/xml.js ----
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
class Node {
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
}
class Elem extends Node {
  constructor(qname, attrs, scope) {
    super(1);
    this.nodeName = qname;
    const i = qname.indexOf(':');
    this.prefix = i < 0 ? null : qname.slice(0, i);
    this.localName = i < 0 ? qname : qname.slice(i + 1);
    this.namespaceURI = scope[this.prefix ?? ''] ?? null;
    this.attributes = attrs.map(([name, value]) => {
      const j = name.indexOf(':');
      const prefix = j < 0 ? null : name.slice(0, j);
      return { name, value, local: j < 0 ? name : name.slice(j + 1), ns: prefix ? scope[prefix] ?? null : null };
    });
  }
  getAttribute(name) { const a = this.attributes.find((x) => x.name === name); return a ? a.value : null; }
  getAttributeNS(ns, local) { const a = this.attributes.find((x) => x.ns === ns && x.local === local); return a ? a.value : null; }
  hasAttributeNS(ns, local) { return this.attributes.some((x) => x.ns === ns && x.local === local); }
}
function parseXmlDoc(src) {
  const doc = new Node(9);
  const stack = [{ node: doc, scope: { xml: 'http://www.w3.org/XML/1998/namespace' } }];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = tag.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { const t = new Node(3); t.data = m[1]; t.parentNode = top.node; top.node.childNodes.push(t); continue; }
    if (m[2] !== undefined) { stack.pop(); continue; }
    if (m[3] !== undefined) {
      const attrs = [...m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], unescape(a[2] ?? a[3])]);
      const scope = { ...top.scope };
      for (const [n, v] of attrs) if (n === 'xmlns') scope[''] = v; else if (n.startsWith('xmlns:')) scope[n.slice(6)] = v;
      const el = new Elem(m[3], attrs, scope);
      el.parentNode = top.node; top.node.childNodes.push(el);
      if (!m[5]) stack.push({ node: el, scope });
      continue;
    }
    if (m[6] !== undefined) {
      const t = new Node(3); t.data = unescape(m[6]); t.parentNode = top.node; top.node.childNodes.push(t);
    }
  }
  const doc2 = { nodeType: 9, get documentElement() { return doc.childNodes.find((c) => c.nodeType === 1) ?? null; }, getElementsByTagName: () => [] };
  doc2.getElementsByTagNameNS = (ns, l) => doc.getElementsByTagNameNS(ns, l);
  return doc2;
}
globalThis.DOMParser = class { parseFromString(s) { return parseXmlDoc(String(s)); } };
