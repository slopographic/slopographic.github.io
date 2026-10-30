/* Structured text: JSON to and from YAML and TOML, JSON to XML, and JSON pretty-printed or minified. Pure (no DOM), so Node
 * tests run it as the browser does. YAML is js-yaml 4.1.1 (vendor/js-yaml, MIT) and TOML smol-toml 1.9.0
 * (vendor/smol-toml, BSD-3-Clause), both loaded on first use.
 *   parseJson(text) -> value                      a clear error with the line and column of a mistake (jsonErrorAt)
 *   formatJson(text, { indent }) -> text          indent: 0 minifies (one line), 2 or 4 spaces, 'tab'
 *   jsonToYaml(text) / yamlToJson(text, { indent })   a YAML file with several documents (---) gives a JSON array
 *   jsonToToml(text) -> { text, dropped }         TOML has no null: null values are left out and counted in dropped;
 *                                                 the top level must be an object (a TOML file is a table)
 *   tomlToJson(text, { indent })                  dates and times become ISO text
 *   jsonToXml(text, { root }) -> text             objects become elements, arrays repeat their element, keys that
 *                                                 are not XML names are made into names; the {name, attributes,
 *                                                 children, text} shape that XML to JSON writes goes back as it was */
import { tr } from './i18n.js';
const yaml = () => import('../../../vendor/js-yaml/js-yaml.mjs');
const toml = () => import('../../../vendor/smol-toml/index.js');

/** Line and column of a character offset. */
function where(text, at) {
  const before = text.slice(0, at), line = before.split('\n').length;
  return tr('convert.struct.line_column', { line: String(line), col: String(at - before.lastIndexOf('\n')) });
}
/** The offset of the first mistake in JSON text, found by a small scanner (engines word their messages differently and some
 *  give no position), or -1 when the scanner finds none. */
export function jsonErrorAt(t) {
  let i = 0;
  const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (t.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < t.length && t[i] !== '"') { if (t[i] < ' ') fail(); if (t[i] === '\\') { i++; if (t[i] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(t.slice(i + 1, i + 5))) fail(); i += 4; } else if (!'"\\/bfnrt'.includes(t[i])) fail(); } i++; }
    if (t[i] !== '"') fail();
    i++;
  };
  const val = () => {
    ws();
    const c = t[i];
    if (c === '{') { i++; ws(); if (t[i] === '}') { i++; return; } for (;;) { ws(); if (t[i] !== '"') fail(); str(); ws(); if (t[i] !== ':') fail(); i++; val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === '}') { i++; return; } fail(); } }
    if (c === '[') { i++; ws(); if (t[i] === ']') { i++; return; } for (;;) { val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === ']') { i++; return; } fail(); } }
    if (c === '"') return str();
    if (c === 't') return lit('true');
    if (c === 'f') return lit('false');
    if (c === 'n') return lit('null');
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m) fail();
    i += m[0].length;
  };
  try { val(); ws(); if (i < t.length) fail(); return -1; } catch (at) { if (typeof at === 'number') return at; throw at; }
}
export function parseJson(text) {
  const t = String(text).replace(/^\uFEFF/, '');
  if (!t.trim()) throw new Error(tr('convert.struct.empty'));
  try { return JSON.parse(t); } catch (e) {
    const at = jsonErrorAt(t);
    const near = at >= 0 ? (at >= t.length ? tr('convert.struct.end_of_file') : tr('convert.struct.quoted', { text: t.slice(at, at + 12).split('\n')[0] })) : '';
    throw new Error(at >= 0 ? tr('convert.struct.bad_json_at', { where: where(t, at), near })
      : tr('convert.struct.bad_json'));
  }
}
const indentOf = (i) => (i === 'tab' || i === '\t' ? '\t' : Math.max(0, Math.min(8, Number(i ?? 2) || 0)));
const json = (v, indent = 2) => { const i = indentOf(indent); return i === 0 ? JSON.stringify(v) : JSON.stringify(v, null, i) + '\n'; };

export function formatJson(text, { indent = 2 } = {}) { return json(parseJson(text), indent); }

export async function jsonToYaml(text) {
  const Y = await yaml();
  return Y.dump(parseJson(text), { lineWidth: -1, noRefs: true, quotingType: '"' });
}
export async function yamlToJson(text, { indent = 2 } = {}) {
  const Y = await yaml();
  let docs;
  try { docs = Y.loadAll(String(text).replace(/^﻿/, '')); } catch (e) { throw new Error(e.mark ? tr('convert.struct.bad_yaml_at', { error: e.reason || e.message, where: tr('convert.struct.line_column', { line: String(e.mark.line + 1), col: String(e.mark.column + 1) }) })
    : tr('convert.struct.bad_yaml', { error: e.reason || e.message })); }
  return json(docs.length === 1 ? docs[0] : docs.length ? docs : null, indent);
}

/** A copy with null values left out (TOML has none), and how many there were. */
function dropNulls(v, count) {
  if (Array.isArray(v)) return v.filter((x) => (x === null ? (count.n++, false) : true)).map((x) => dropNulls(x, count));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (x === null) { count.n++; continue; } o[k] = dropNulls(x, count); }
    return o;
  }
  return v;
}
export async function jsonToToml(text) {
  const v = parseJson(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(tr('convert.struct.toml_object'));
  const count = { n: 0 };
  const T = await toml();
  return { text: T.stringify(dropNulls(v, count)) + '\n', dropped: count.n };
}
export async function tomlToJson(text, { indent = 2 } = {}) {
  const T = await toml();
  let v;
  try { v = T.parse(String(text).replace(/^﻿/, '')); } catch (e) { throw new Error(tr('convert.struct.bad_toml', { error: String(e.message).split('\n')[0] })); }
  const i = indentOf(indent);
  const out = JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? (Number.isSafeInteger(Number(x)) ? Number(x) : String(x)) : x), i === 0 ? undefined : i);
  return i === 0 ? out : out + '\n';
}

/* ---------- JSON to XML ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A key as an XML element name: letters, digits, - _ and . kept, anything else _, and a name that cannot start a name gets _ in front. */
export function xmlName(key) {
  let n = String(key).replace(/[^A-Za-z0-9_.\-À-￯]/g, '_');
  if (!/^[A-Za-z_À-￯]/.test(n) || /^xml/i.test(n)) n = '_' + n;
  return n;
}
const isNode = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.name === 'string' && Object.keys(v).every((k) => ['name', 'attributes', 'children', 'text'].includes(k));

function nodeXml(n, pad) {
  const attrs = Object.entries(n.attributes || {}).map(([k, v]) => ` ${xmlName(k)}="${esc(v)}"`).join('');
  const kids = n.children || [];
  if (!kids.length) return `${pad}<${xmlName(n.name)}${attrs}${n.text ? `>${esc(n.text)}</${xmlName(n.name)}>` : '/>'}\n`;
  return `${pad}<${xmlName(n.name)}${attrs}>${n.text ? esc(n.text) : ''}\n${kids.map((k) => nodeXml(k, pad + '  ')).join('')}${pad}</${xmlName(n.name)}>\n`;
}
function valueXml(name, v, pad) {
  const tag = xmlName(name);
  if (Array.isArray(v)) return v.map((x) => valueXml(name, x, pad)).join('');
  if (v === null || v === undefined) return `${pad}<${tag}/>\n`;
  if (typeof v === 'object') {
    const inner = Object.entries(v).map(([k, x]) => valueXml(k, x, pad + '  ')).join('');
    return inner ? `${pad}<${tag}>\n${inner}${pad}</${tag}>\n` : `${pad}<${tag}/>\n`;
  }
  return `${pad}<${tag}>${esc(v)}</${tag}>\n`;
}
export function jsonToXml(text, { root = 'root' } = {}) {
  const v = parseJson(text);
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  if (isNode(v)) return head + nodeXml(v, '');
  const r = xmlName(String(root || 'root').trim() || 'root');
  if (Array.isArray(v)) return head + `<${r}>\n${v.map((x) => valueXml('item', x, '  ')).join('')}</${r}>\n`;
  if (v && typeof v === 'object') return head + valueXml(r, v, '');
  return head + `<${r}>${v === null ? '' : esc(v)}</${r}>\n`;
}
