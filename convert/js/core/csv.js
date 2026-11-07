/* CSV (RFC 4180 with lenient line endings) and JSON ↔ CSV. Pure. */
import { tr } from './i18n.js';

/** The delimiter that appears most often on the first line, counted outside quotes. */
export function detectDelimiter(text) {
  const first = text.split(/\r\n|\r|\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let q = false;
  for (const c of first) {
    if (c === '"') q = !q;
    else if (!q && c in counts) counts[c]++;
  }
  let best = ',', n = 0;
  for (const d of [',', ';', '\t', '|']) if (counts[d] > n) { best = d; n = counts[d]; }
  return best;
}

/** Parse CSV text into rows of strings. A BOM is dropped; quoted fields may hold delimiters and line breaks. */
export function parseCsv(text, { delimiter } = {}) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      q = true;
    } else if (c === d) {
      row.push(field); field = '';
    } else if (c === '\r' || c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      if (c === '\r' && src[i + 1] === '\n') i++;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const NUMBER_TEXT = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** CSV text → JSON text. header: first row gives the keys. numbers: turn plain numbers into JSON numbers
 * only when that round-trips exactly (so "007" and long IDs stay text). */
export function csvToJson(text, { header = true, numbers = false, delimiter } = {}) {
  const rows = parseCsv(text, { delimiter });
  if (!rows.length) return { json: '[]', count: 0 };
  const val = (v) => (numbers && NUMBER_TEXT.test(v) && String(Number(v)) === v ? Number(v) : v);
  if (!header) return { json: JSON.stringify(rows.map((r) => r.map(val)), null, 2), count: rows.length };
  const keys = [], seen = new Map();
  rows[0].forEach((h, i) => {
    let k = h.trim() || `column_${i + 1}`;
    if (seen.has(k)) { const n = seen.get(k) + 1; seen.set(k, n); k = `${k}_${n}`; } else seen.set(k, 1);
    keys.push(k);
  });
  const data = rows.slice(1).map((r) => {
    const o = {};
    const width = Math.max(keys.length, r.length);
    for (let i = 0; i < width; i++) o[keys[i] ?? `column_${i + 1}`] = i < r.length ? val(r[i]) : '';
    return o;
  });
  return { json: JSON.stringify(data, null, 2), count: data.length };
}

const cell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
const quote = (s, d) => (s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s);

/** A nested record as one level: { a: { b: 1 }, tags: ['x', 'y'] } → { 'a.b': 1, 'tags.0': 'x', 'tags.1': 'y' }. An empty object
 *  or array stays as its JSON text. */
export function flattenRecord(v, prefix = '', out = {}) {
  const isObj = v && typeof v === 'object';
  if (!isObj || !Object.keys(v).length) { if (prefix) out[prefix] = isObj ? JSON.stringify(v) : v; return out; }
  for (const [k, x] of Object.entries(v)) flattenRecord(x, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/**
 * JSON text → CSV text. Accepts an array of objects (columns are the union of keys, first-seen order),
 * an array of arrays, a single object, or an array of plain values (one column named "value").
 * flatten: nested objects and arrays become their own columns (a.b, tags.0) instead of JSON text in one cell.
 */
export function jsonToCsv(text, { delimiter = ',', eol = '\n', flatten = false } = {}) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(tr('convert.csv.bad_json')); }
  if (!Array.isArray(data)) data = [data];
  if (flatten && data.every((r) => r && typeof r === 'object' && !Array.isArray(r))) data = data.map((r) => flattenRecord(r));
  let rows;
  if (data.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    const keys = [];
    const have = new Set();
    for (const r of data) for (const k of Object.keys(r)) if (!have.has(k)) { have.add(k); keys.push(k); }
    rows = [keys, ...data.map((r) => keys.map((k) => r[k]))];
  } else if (data.every((r) => Array.isArray(r))) {
    rows = data;
  } else {
    rows = [['value'], ...data.map((v) => [v])];
  }
  return rows.map((r) => r.map((v) => quote(cell(v), delimiter)).join(delimiter)).join(eol) + (rows.length ? eol : '');
}

/** Rows (array of arrays) → CSV text, quoting as needed. */
export function rowsToCsv(rows, { delimiter = ',', eol = '\n' } = {}) {
  return rows.map((r) => r.map((v) => quote(cell(v), delimiter)).join(delimiter)).join(eol) + (rows.length ? eol : '');
}
