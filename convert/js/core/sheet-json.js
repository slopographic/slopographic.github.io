/* Spreadsheets and JSON, both ways. Pure (no DOM): the sheets are the shared reader's (shared/sheets/read.js: rows of typed
 * values, text of what each cell shows), the workbooks go to the shared writer (shared/sheets/write.js toXlsxBlob).
 *   sheetRecords(sheet, { header }) -> array    header: the first row names the keys (an array of objects), else an array
 *                                               of arrays. Numbers and booleans stay typed, dates become ISO text
 *                                               ('2026-10-24', or with the time when it has one), blanks null. Empty
 *                                               rows at the end are left out; a blank or repeated column name is
 *                                               made unique ('Column 3', 'Price 2').
 *   tablesFromJson(value) -> [{ name, rows }]   JSON as tables: an array of objects (the union of keys, in the order they
 *                                               first appear), an array of arrays, an array of plain values (one
 *                                               column), one object (Key / Value rows), or an object whose every value is
 *                                               such an array (one sheet per key). Nested values are JSON text.
 *   workbookOf(tables) -> sheets for toXlsxBlob: the first row bold when it holds the column names */
import { KEY } from '../../../shared/sheets/csv.js';

const iso = (d) => (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() ? d.toISOString().replace('.000Z', 'Z') : d.toISOString().slice(0, 10));
const cellJson = (v) => (v === null || v === undefined || v === '' ? null : v instanceof Date ? iso(v) : v);
const blank = (row) => !row || row.every((v) => v === null || v === undefined || v === '');

/** Column names from the header row: blanks get "Column N", repeats a number. */
export function headerNames(row, width) {
  const used = new Map(), out = [];
  for (let c = 0; c < width; c++) {
    const v = cellJson(row && row[c]);
    let n = v !== null && String(v).trim() !== '' ? String(v).trim() : `Column ${c + 1}`; // i18n-ignore: names in the file the user gets
    const seen = used.get(n) || 0;
    used.set(n, seen + 1);
    if (seen) n = `${n} ${seen + 1}`;
    out.push(n);
  }
  return out;
}

export function sheetRecords(sheet, { header = true } = {}) {
  const rows = sheet.rows.slice();
  while (rows.length && blank(rows[rows.length - 1])) rows.pop();
  const width = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
  if (!header) return rows.map((r) => Array.from({ length: width }, (_, c) => cellJson(r && r[c])));
  if (!rows.length) return [];
  const keys = headerNames(rows[0], width);
  return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, c) => [k, cellJson(r && r[c])])));
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cellOf = (v) => (v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : v);

/** One table from an array, or null when it is not an array. */
function tableOf(arr) {
  if (!Array.isArray(arr)) return null;
  if (arr.length && arr.every(isPlain)) {
    const keys = [];
    for (const o of arr) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
    return { rows: [keys, ...arr.map((o) => keys.map((k) => cellOf(o[k])))], header: true };
  }
  if (arr.length && arr.every(Array.isArray)) return { rows: arr.map((r) => r.map(cellOf)), header: false };
  return { rows: [['Value'], ...arr.map((v) => [cellOf(v)])], header: true };
}

export function tablesFromJson(value) {
  if (Array.isArray(value)) return [{ name: 'Sheet1', ...tableOf(value) }]; // i18n-ignore: names in the file the user gets
  if (isPlain(value)) {
    const keys = Object.keys(value);
    if (keys.length && keys.every((k) => Array.isArray(value[k]))) return keys.map((k) => ({ name: k, ...tableOf(value[k]) }));
    return [{ name: 'Sheet1', rows: [['Key', 'Value'], ...keys.map((k) => [k, cellOf(value[k])])], header: true }]; // i18n-ignore: names in the file the user gets
  }
  return [{ name: 'Sheet1', rows: [['Value'], [cellOf(value)]], header: true }]; // i18n-ignore: names in the file the user gets
}

export function workbookOf(tables) {
  return tables.map((t) => {
    const bold = new Set();
    if (t.header && t.rows.length) t.rows[0].forEach((_, c) => bold.add(KEY(0, c)));
    return { name: t.name, rows: t.rows, fmt: new Map(), bold };
  });
}
