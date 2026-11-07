/* Slop Office XML: a tiny string builder plus namespace-aware DOMParser helpers.
 *
 * Building:
 *   x('w:p', { 'w:rsidR': '00' }, [x('w:r', null, [x('w:t', { 'xml:space': 'preserve' }, 'hi')])]) → '<w:p ...>…</w:p>'
 *   Children may be strings (already XML), arrays (flattened), or null/false (skipped).
 *   A text child must be escaped with esc(); x(name, attrs, 'text') escapes a plain string child for you.
 *   doc(rootXml) prefixes the standalone XML declaration.
 * Parsing:
 *   parseXml(str) → Document (throws on parse errors, and on a DOCTYPE whose entities could expand without limit:
 *                   SlopSanitize.xmlText, shared/sanitize/sanitize.js)
 *   NS.w, NS.r, … namespace URIs; kids(el, ns, local), kid(el, ns, local), all(el, ns, local)
 *   attr(el, ns, local) reads a namespaced attribute (ns null = no namespace); textOf(el)
 */
import '../sanitize/sanitize.js';

export const NS = {
  // OOXML
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  ep: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  // ODF
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
};

/** xmlns:* attributes for the given prefixes, e.g. xmlns('w', 'r') → { 'xmlns:w': …, 'xmlns:r': … }. */
export function xmlns(...prefixes) {
  const o = {};
  for (const p of prefixes) { if (!NS[p]) throw new Error('Unknown namespace prefix ' + p); o['xmlns:' + p] = NS[p]; }
  return o;
}

// XML 1.0 forbids most C0 control characters even when escaped.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export function esc(s) {
  return String(s ?? '').replace(BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;').replace(/\r/g, '&#13;');
}

function attrs(a) {
  if (!a) return '';
  let s = '';
  for (const k in a) { const v = a[k]; if (v === undefined || v === null || v === false) continue; s += ` ${k}="${escAttr(v === true ? k : v)}"`; }
  return s;
}
function flat(c, out) {
  if (c === null || c === undefined || c === false) return out;
  if (Array.isArray(c)) { for (const y of c) flat(y, out); return out; }
  out.push(String(c));
  return out;
}

/** Build an element. A plain string as the only child is escaped as text; arrays hold raw XML strings. */
export function x(name, a, children) {
  const body = typeof children === 'string' ? esc(children) : flat(children, []).join('');
  return body ? `<${name}${attrs(a)}>${body}</${name}>` : `<${name}${attrs(a)}/>`;
}
/** Raw XML children (already serialised strings) without escaping, for the 3rd arg of x(). */
export const raw = (s) => [s];

export const doc = (rootXml) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + rootXml;

/** Parse XML text. Throws an Error with the parser message on bad input. */
export function parseXml(str) {
  if (str instanceof Uint8Array) str = new TextDecoder().decode(str);
  const d = new DOMParser().parseFromString(globalThis.SlopSanitize.xmlText(String(str).replace(/^﻿/, '')), 'application/xml');
  const err = d.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('XML parse error: ' + (err.textContent || '').trim().split('\n')[0]);
  return d;
}

const isEl = (n) => n && n.nodeType === 1;
const match = (n, ns, local) => isEl(n) && (local === '*' || n.localName === local) && (ns === '*' || ns == null ? true : n.namespaceURI === ns);

/** Direct element children, optionally filtered by namespace URI and local name ('*' = any). */
export function kids(el, ns = '*', local = '*') {
  const out = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) if (match(n, ns, local)) out.push(n);
  return out;
}
/** First direct child matching, or null. */
export function kid(el, ns, local) {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) if (match(n, ns, local)) return n;
  return null;
}
/** Descendant at a path of local names in one namespace: path(el, NS.w, 'pPr', 'pStyle'). */
export function path(el, ns, ...locals) {
  let cur = el;
  for (const l of locals) { cur = kid(cur, ns, l); if (!cur) return null; }
  return cur;
}
/** All descendants matching (document order). */
export function all(el, ns, local) {
  if (!el) return [];
  return [...el.getElementsByTagNameNS(ns == null ? '*' : ns, local)];
}
/** Namespaced attribute value or null. ns null/'' = attribute without a namespace. */
export function attr(el, ns, local) {
  if (!el) return null;
  if (!ns) return el.getAttribute(local);
  return el.hasAttributeNS(ns, local) ? el.getAttributeNS(ns, local) : null;
}
export const textOf = (el) => (el ? el.textContent : '');
