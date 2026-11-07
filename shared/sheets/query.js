/* Slop Sheets: sort and filter, pure functions over a sheet (no DOM).
 *   sort:    { col, dir } with dir 1 (ascending) or -1 (descending), or null for the sheet's own order.
 *   filter:  { values: Set<text> | null, contains: string, op: '' | '>' | '<', num: number }   (one per column)
 *   headerRows(sheet) → 0 or 1: is the first row a header (see below)
 *   visibleOrder(sheet, { sort, filters: Map<col, filter>, head }) → row indexes after filter and sort; the first head
 *                                rows (the header) stay on top, in place, whatever the sort and filters
 *   distinctValues(sheet, col, head) → [{ text, count }] for the filter list (header rows left out), blanks last
 *   isActiveFilter(f), emptyFilter(), describeSort(sort, colName)
 * Sort order: numbers and dates (by date), then text (natural, case-insensitive), then TRUE/FALSE. Blanks always sit last,
 * in either direction, as they do in Excel. Ties keep the sheet's own order. */

import { KEY } from './csv.js';

export const emptyFilter = () => ({ values: null, contains: '', op: '', num: NaN });
export const isActiveFilter = (f) => !!f && (f.values !== null || f.contains !== '' || f.op !== '');

/** 0 numbers and dates, 1 text, 2 booleans, 3 blank. */
export function rankOf(v) {
  if (v === null || v === undefined || v === '') return 3;
  if (typeof v === 'number' || v instanceof Date) return 0;
  if (typeof v === 'string') return 1;
  return 2;
}
const numOf = (v) => (v instanceof Date ? v.getTime() : v);

/** Comparator for two typed values in direction dir (1 or -1). Blanks go last whatever the direction. */
export function compareValues(a, b, dir = 1) {
  const ra = rankOf(a), rb = rankOf(b);
  if (ra === 3 || rb === 3) return ra === rb ? 0 : ra === 3 ? 1 : -1;
  if (ra !== rb) return (ra - rb) * dir;
  let c;
  if (ra === 0) c = numOf(a) - numOf(b);
  else if (ra === 1) c = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  else c = Number(a) - Number(b);
  return c * dir;
}

/** Does row r pass every active filter? */
export function rowPasses(sheet, r, filters) {
  for (const [col, f] of filters) {
    const text = sheet.text[r][col] ?? '';
    if (f.values && !f.values.has(text)) return false;
    if (f.contains && !text.toLowerCase().includes(f.contains.toLowerCase())) return false;
    if (f.op) {
      const v = sheet.rows[r][col];
      const n = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : NaN;
      if (!Number.isFinite(n) || !Number.isFinite(f.num)) return false;
      if (f.op === '>' && !(n > f.num)) return false;
      if (f.op === '<' && !(n < f.num)) return false;
    }
  }
  return true;
}

const blank = (v) => v === null || v === undefined || v === '';
/** 1 when the first row is a header, else 0. A header row holds text only (at least one cell), has rows under it, and
 * either is bold in the file (every filled cell) or heads a column whose cells below are all numbers or dates. */
export function headerRows(sheet) {
  if (!sheet || sheet.height < 2) return 0;
  const first = sheet.rows[0], texts = [];
  for (let c = 0; c < sheet.width; c++) {
    if (blank(first[c])) continue;
    if (typeof first[c] !== 'string') return 0;
    texts.push(c);
  }
  if (!texts.length) return 0;
  if (sheet.bold && texts.every((c) => sheet.bold.has(KEY(0, c)))) return 1;
  const last = Math.min(sheet.height, 201);
  return texts.some((c) => {
    let seen = 0;
    for (let r = 1; r < last; r++) {
      const v = sheet.rows[r][c];
      if (blank(v)) continue;
      if (rankOf(v) !== 0) return false;
      seen++;
    }
    return seen > 0;
  }) ? 1 : 0;
}

/** Row indexes to show, in order: the head (header) rows, then the other rows filtered and sorted. */
export function visibleOrder(sheet, { sort = null, filters = new Map(), head = 0 } = {}) {
  const active = new Map([...filters].filter(([, f]) => isActiveFilter(f)));
  const top = Math.min(head, sheet.height), order = [];
  for (let r = top; r < sheet.height; r++) if (!active.size || rowPasses(sheet, r, active)) order.push(r);
  if (sort && sort.col >= 0 && sort.col < sheet.width) {
    const col = sort.col, dir = sort.dir < 0 ? -1 : 1;
    order.sort((a, b) => compareValues(sheet.rows[a][col], sheet.rows[b][col], dir));
  }
  return [...Array.from({ length: top }, (_, i) => i), ...order];
}

/** Each distinct text in a column (below the head rows) with how many rows show it. The blank text is '' and comes last. */
export function distinctValues(sheet, col, head = 0) {
  const counts = new Map();
  for (let r = Math.min(head, sheet.height); r < sheet.height; r++) {
    const t = sheet.text[r][col] ?? '';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => (a.text === '' ? 1 : b.text === '' ? -1 : a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' })));
}

/** "Sorted by column B, largest first" style text for the status line. */
export function describeSort(sort, colName) {
  if (!sort) return '';
  return `Sorted by column ${colName(sort.col)} (${sort.dir < 0 ? 'Z to A' : 'A to Z'})`;
}
