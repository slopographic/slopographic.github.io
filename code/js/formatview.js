/* Slop Code: the Formatted view. A read-only pane shows a pretty-printed copy of what is in the editor. This module only
 * turns text into text: it never touches the document, the editor or the file, and it is pure and deterministic.
 *   canFormat(langId, name)          the kind of formatting a document gets (or null when it gets none)
 *   formatForView(text, langId, name) the formatted text, or an error with the line and column of the problem
 * The text has no final newline (it is shown, not saved). An error has `error` (short English text) and `key` (the i18n
 * key, code.fv.err.*, with `args`) for the pane to translate. The helpers are in fv-*.js. */
import { formatJson, formatJsonl } from './fv-json.js';
import { formatMarkup } from './fv-markup.js';
import { formatCss } from './fv-css.js';
import { formatJs } from './fv-js.js';
import { formatSql } from './fv-sql.js';
import { formatCsv } from './fv-csv.js';
import { message } from './fv-messages.js';

export const MAX_CHARS = 2000000;

const BY_LANG = Object.assign(Object.create(null), { json: 'json', html: 'html', css: 'css', javascript: 'js', typescript: 'js' });
const EXTENSIONS = {
  json: ['json', 'geojson', 'webmanifest', 'har'],
  jsonl: ['jsonl', 'ndjson'],
  html: ['html', 'htm'],
  xml: ['xml', 'svg', 'xsd', 'xsl', 'xslt', 'rss', 'atom', 'plist', 'kml', 'gpx', 'xhtml', 'csproj', 'resx', 'config', 'wsdl', 'fo'],
  css: ['css', 'scss', 'less'],
  js: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts'],
  sql: ['sql'], csv: ['csv'], tsv: ['tsv'],
};
const BY_EXT = Object.create(null);
for (const kind in EXTENSIONS) for (const x of EXTENSIONS[kind]) BY_EXT[x] = kind;

/** The lower-case extension of a file name ('' for none). */
const extOf = (name) => { const s = String(name || ''), i = s.lastIndexOf('.'); return i > 0 && i < s.length - 1 ? s.slice(i + 1).toLowerCase() : ''; };

/** The kind of formatting for a document: 'json', 'jsonl', 'xml', 'html', 'css', 'js', 'sql', 'csv' or 'tsv'; null for any
 * other. The language id decides first, then the file extension. */
export function canFormat(langId, name) {
  return BY_LANG[langId] || BY_EXT[extOf(name)] || null;
}

/** Format `text` for the view: { ok: true, text, kind } or { ok: false, error, line?, col?, kind? }. Never throws. */
export function formatForView(text, langId, name) {
  const kind = canFormat(langId, name);
  const src = String(text == null ? '' : text);
  if (src.length > MAX_CHARS) return { ok: false, ...message('too_large') };
  if (!kind) return { ok: false, ...message('unsupported') };
  const s = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');   // line numbers match the editor's, which breaks lines the same way
  try {
    const r = run(kind, s, extOf(name));
    return { ...r, kind };
  } catch (e) {
    return { ok: false, ...message('failed'), kind };
  }
}

function run(kind, s, ext) {
  switch (kind) {
    case 'json': return formatJson(s);
    case 'jsonl': return formatJsonl(s);
    case 'xml': return formatMarkup(s, true);
    case 'html': return formatMarkup(s, false);
    case 'css': return formatCss(s, ext === 'scss' || ext === 'less');
    case 'js': return formatJs(s);
    case 'sql': return formatSql(s);
    default: return formatCsv(s, kind === 'tsv' ? '\t' : ',');
  }
}
