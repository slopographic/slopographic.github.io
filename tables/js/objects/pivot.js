/* Slop Tables pivot tables: the summary itself. No DOM, no workbook.
 * A pivot table is { id, source: { sheet, ref }, rows: [field], cols: [field], values: [{ field, fn }], at: { r, c },
 *   extent: { rows, cols } } kept on the sheet that shows it. Fields are the header texts of the source's first row.
 *   fieldNames(headerRow) → unique names ('Amount', 'Amount (2)', 'Column C' for a blank header)
 *   pivotGrid(headers, records, spec) → { cells: rows of { v, b?, nf?: 'value' | field index } , keyCols }
 * Layout: one header row (the row fields, then a column per column key and value, then the totals), a row per row key,
 * and a Grand total row. With no row fields there is one Total row; with no column fields the values are the columns.
 * fn: sum, count (non-blank cells), average, min, max. A cell with no records is blank. */
import { compare } from '../engine/values.js';
import { t } from '../i18n.js';

/** The summaries, by id; their names are tables.pivot.fn_<id>. */
export const FNS = [['sum'], ['count'], ['average'], ['min'], ['max']];
const FN_IDS = FNS.map(([f]) => f);
export const MAX_KEYS = 2000;

export function fieldNames(row) {
  const seen = new Map();
  return row.map((v, j) => {
    let base = v === null || v === undefined || String(v).trim() === '' ? 'Column ' + (j + 1) : String(v).trim(), name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    seen.set(name.toLowerCase(), true);
    return name;
  });
}

/** The labels written into cells read the language at the time the pivot is (re)built, as a spreadsheet's do. */
export const valueLabel = (v) => t('tables.pivot.value_of', { fn: t(`tables.pivot.fn_${FN_IDS.includes(v.fn) ? v.fn : 'sum'}`), field: v.field });
const blank = (v) => v === null || v === undefined || v === '';
const keyOf = (v) => (blank(v) ? '\u0000' : typeof v === 'number' ? 'n' + v : typeof v === 'boolean' ? 'b' + v : 's' + String(v).toLowerCase());
const shown = (v) => (blank(v) ? t('tables.pivot.blank') : v);

function acc() { return { sum: 0, nums: 0, count: 0, min: Infinity, max: -Infinity }; }
function add(a, v) {
  if (blank(v)) return;
  a.count++;
  if (typeof v === 'number' && isFinite(v)) { a.sum += v; a.nums++; if (v < a.min) a.min = v; if (v > a.max) a.max = v; }
}
export function result(a, fn) {
  if (!a) return null;
  if (fn === 'count') return a.count || null;
  if (!a.nums) return null;
  if (fn === 'average') return a.sum / a.nums;
  if (fn === 'min') return a.min;
  if (fn === 'max') return a.max;
  return a.sum;
}
/** Sort order of keys: numbers, then text (A–Z, ignoring case), then booleans, blanks last. */
function cmpVals(a, b) {
  if (blank(a) || blank(b)) return blank(a) - blank(b);
  return compare(a, b);
}
const cmpTuple = (x, y) => { for (let i = 0; i < x.length; i++) { const d = cmpVals(x[i], y[i]); if (d) return d; } return 0; };

/** Unique key tuples of the fields at idx, sorted. Returns { list: [tuple], index: Map(keyString → position) }. */
function keys(records, idx) {
  const map = new Map();
  for (const rec of records) {
    const tup = idx.map((j) => rec[j]), k = tup.map(keyOf).join('\u0001');
    if (!map.has(k)) { if (map.size >= MAX_KEYS) throw new Error(t('tables.err.pivot_keys', { n: MAX_KEYS })); map.set(k, tup); }
  }
  const list = [...map.values()].sort(cmpTuple);
  return { list, index: new Map(list.map((tup, i) => [tup.map(keyOf).join('\u0001'), i])) };
}

export function pivotGrid(headers, records, spec) {
  const pos = (f) => { const j = headers.indexOf(f); if (j < 0) throw new Error(t('tables.err.no_column', { name: f })); return j; };
  const ri = (spec.rows || []).map(pos), ci = (spec.cols || []).map(pos);
  const vals = (spec.values && spec.values.length ? spec.values : [{ field: headers[0], fn: 'count' }]).map((v) => ({ ...v, j: pos(v.field) }));
  const R = keys(records, ri), C = keys(records, ci);
  const nr = R.list.length, nc = C.list.length, nv = vals.length;
  // cells[r][c][v], row totals [r][v], column totals [c][v], grand [v]
  const grid = new Map(), rowT = new Map(), colT = new Map(), grand = vals.map(acc);
  const cell = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, (a = vals.map(acc))); return a; };
  for (const rec of records) {
    const r = R.index.get(ri.map((j) => keyOf(rec[j])).join('\u0001')), c = C.index.get(ci.map((j) => keyOf(rec[j])).join('\u0001'));
    const g = cell(grid, r * (nc + 1) + c), rt = cell(rowT, r), ct = cell(colT, c);
    vals.forEach((v, i) => { const x = rec[v.j]; add(g[i], x); add(rt[i], x); add(ct[i], x); add(grand[i], x); });
  }
  const keyCols = Math.max(1, ri.length), hasCols = ci.length > 0;
  const head = [];
  for (let k = 0; k < keyCols; k++) head.push({ v: ri.length ? spec.rows[k] : '', b: true });
  if (hasCols) {
    for (const tup of C.list) for (const v of vals) head.push({ v: tup.map(shown).join(' / ') + (nv > 1 ? ' · ' + valueLabel(v) : ''), b: true });
    for (const v of vals) head.push({ v: nv > 1 ? t('tables.pivot.total') + ' · ' + valueLabel(v) : t('tables.pivot.total'), b: true });
  } else for (const v of vals) head.push({ v: valueLabel(v), b: true });
  const out = [head];
  const numbers = (accs, i) => ({ v: result(accs && accs[i], vals[i].fn), nf: vals[i].fn === 'count' ? null : vals[i].j, fn: vals[i].fn });
  const rowCells = (r) => {
    const row = [];
    if (hasCols) {
      for (let c = 0; c < nc; c++) for (let i = 0; i < nv; i++) row.push(numbers(grid.get(r * (nc + 1) + c), i));
      for (let i = 0; i < nv; i++) row.push(numbers(rowT.get(r), i));
    } else for (let i = 0; i < nv; i++) row.push(numbers(rowT.get(r), i));
    return row;
  };
  if (!ri.length) { out.push([{ v: t('tables.pivot.total'), b: true }, ...rowCells(0)]); return { cells: out, keyCols, fields: ri }; }
  R.list.forEach((tup, r) => out.push([...tup.map((v, k) => ({ v: shown(v), key: ri[k] })), ...rowCells(r)]));
  const total = [{ v: t('tables.pivot.grand_total'), b: true }];
  for (let k = 1; k < keyCols; k++) total.push({ v: null, b: true });
  if (hasCols) {
    for (let c = 0; c < nc; c++) for (let i = 0; i < nv; i++) total.push({ ...numbers(colT.get(c), i), b: true });
  }
  for (let i = 0; i < nv; i++) total.push({ ...numbers(grand, i), b: true });
  out.push(total);
  return { cells: out, keyCols, fields: ri };
}
