/* Slop Tables for the assistant: the operations behind the AI commands (ai-commands.js), on the engine model.
   The table is the used range of the active sheet; its first row is the header row. Columns are named by letter
   (B) or by header text (Price). Sort moves whole rows (formulas shifted like Excel, filtered rows keep their flag),
   filter marks rows `filtered` (the grid gives them no height), insert column moves cells and fixes references in
   every sheet, chart and pivot (through the native JSON, like undo does). Loaded on demand. */
import { compare, isErr, parseNumber } from '../engine/values.js';
import { colName, colIndex, parseCell, MAX_COLS } from '../engine/refs.js';
import { parse } from '../engine/parser.js';
import { print, adjustForStructure } from '../engine/printer.js';
import { toNative, fromNative } from '../io/native.js';

const txt = (v) => (v === null || v === undefined ? '' : isErr(v) ? v.code : String(v));

/** The table on the sheet: { r1, c1, r2, c2 } of the cells with content, or null when the sheet is empty. */
export const table = (sh) => sh.usedRange(false);

/** Header text of each column of the table: [{ col: 'A', c: 0, name: 'Item' }]. */
export function headers(sh, t = table(sh)) {
  const out = [];
  if (!t) return out;
  for (let c = t.c1; c <= t.c2; c++) out.push({ col: colName(c), c, name: txt(sh.value(t.r1, c)) });
  return out;
}

/** A column by header text (first) or by letter. Throws a plain message listing the columns. */
export function findColumn(sh, name, t = table(sh)) {
  const s = String(name == null ? '' : name).trim();
  if (!s) throw new Error('Give a column (a letter such as B, or a header name)');
  const hs = headers(sh, t), l = s.toLowerCase();
  const hit = hs.find((h) => h.name.trim().toLowerCase() === l) || hs.find((h) => h.name && h.name.trim().toLowerCase().startsWith(l) && l.length > 1);
  if (hit) return hit.c;
  if (/^[A-Za-z]{1,3}$/.test(s)) { const c = colIndex(s); if (c < MAX_COLS) return c; }
  const list = hs.map((h) => h.col + (h.name ? ' (' + h.name + ')' : '')).join(', ');
  throw new Error(`No column "${s}"` + (list ? '. Columns: ' + list : ': the sheet is empty'));
}

/** A cell reference such as B7 → { r, c }. */
export function cellAt(ref) {
  const p = parseCell(String(ref || '').replace(/\$/g, ''));
  if (!p) throw new Error(`"${ref}" is not a cell reference (use one like B7)`);
  return p;
}

/** Order the data rows (below the header) by column c. Blanks and errors go last either way. */
export function sortRows(wb, sh, t, c, desc) {
  const rows = [];
  for (let r = t.r1 + 1; r <= t.r2; r++) {
    const cells = [];
    for (let k = t.c1; k <= t.c2; k++) { const cl = sh.get(r, k); cells.push(cl ? { f: cl.f, v: cl.v, s: cl.s } : null); }
    const p = sh.rows.get(r);
    rows.push({ r, key: sh.value(r, c), cells, filtered: !!(p && p.filtered) });
  }
  const rank = (v) => (v === null || v === undefined || v === '' ? 2 : isErr(v) ? 1 : 0);
  rows.sort((a, b) => rank(a.key) - rank(b.key) || (rank(a.key) ? 0 : (desc ? -1 : 1) * compare(a.key, b.key)) || a.r - b.r);
  if (rows.every((x, i) => x.r === t.r1 + 1 + i)) return 0;
  wb.batch(() => {
    wb.clear(sh, t.r1 + 1, t.c1, t.r2, t.c2, 'all');
    rows.forEach((row, i) => {
      const r = t.r1 + 1 + i, dr = r - row.r;
      setFiltered(sh, r, row.filtered);
      row.cells.forEach((cl, j) => {
        if (!cl) return;
        const cc = t.c1 + j;
        if (cl.f) wb.setFormula(sh, r, cc, dr ? wb.shiftFormula(cl.f, dr, 0) : cl.f, { lenient: true });
        else if (cl.v !== null && cl.v !== undefined) wb.setValue(sh, r, cc, cl.v);
        if (cl.s) sh.ensure(r, cc).s = cl.s;
      });
    });
  });
  return rows.length;
}

function setFiltered(sh, r, on) {
  if (on) { sh.rowProp(r).filtered = true; return; }
  const p = sh.rows.get(r);
  if (!p) return;
  delete p.filtered;
  if (!Object.keys(p).length) sh.rows.delete(r);
}

export const OPS = ['equals', 'not_equals', 'contains', 'not_contains', 'begins_with', 'ends_with', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal', 'is_blank', 'not_blank'];
const NUM_OPS = { greater_than: (d) => d > 0, greater_or_equal: (d) => d >= 0, less_than: (d) => d < 0, less_or_equal: (d) => d <= 0 };

/** Does value v pass "op value"? Numbers compare as numbers when both sides are numbers; text ignores case. */
export function passes(v, op, want, locale) {
  const s = txt(v).toLowerCase(), w = String(want == null ? '' : want).trim().toLowerCase();
  const n = typeof v === 'number' ? v : null, wn = parseNumber(String(want == null ? '' : want).trim(), locale);
  switch (op) {
    case 'is_blank': return s === '';
    case 'not_blank': return s !== '';
    case 'equals': return n !== null && wn !== null ? n === wn : s === w;
    case 'not_equals': return !(n !== null && wn !== null ? n === wn : s === w);
    case 'contains': return s.includes(w);
    case 'not_contains': return !s.includes(w);
    case 'begins_with': return s.startsWith(w);
    case 'ends_with': return s.endsWith(w);
    default: {
      if (s === '') return false;
      const d = n !== null && wn !== null ? n - wn : compare(typeof v === 'string' ? v : txt(v), String(want));
      return NUM_OPS[op](d);
    }
  }
}

/** Hide the data rows that fail the condition (on top of any filter already there). Returns { shown, total }. */
export function filterRows(wb, sh, t, c, op, value) {
  if (!NUM_OPS[op] && !OPS.includes(op)) throw new Error('Unknown condition ' + op);
  if (!['is_blank', 'not_blank'].includes(op) && (value === undefined || value === null || String(value) === '')) throw new Error('Give a value to compare with');
  let shown = 0, total = 0;
  for (let r = t.r1 + 1; r <= t.r2; r++) {
    total++;
    const p = sh.rows.get(r);
    if (p && p.filtered) continue;
    if (passes(sh.value(r, c), op, value, wb.locale)) shown++; else setFiltered(sh, r, true);
  }
  return { shown, total };
}

/** Show every row a filter hid. Returns how many came back. */
export function clearFilter(sh) {
  let n = 0;
  for (const [r, p] of [...sh.rows]) if (p && p.filtered) { setFiltered(sh, r, false); n++; }
  return n;
}
export const filteredCount = (sh) => { let n = 0; for (const p of sh.rows.values()) if (p && p.filtered) n++; return n; };

/** A new workbook with an empty column inserted at index `at` of sheet si: cells, widths, merges, frozen panes,
    formulas in every sheet, defined names, chart ranges and pivot sources and places moved. */
export function insertColumn(wb, si, at) {
  const obj = toNative(wb), target = obj.sheets[si], name = target.name;
  const fix = (f, cur) => { try { return print(adjustForStructure(parse(String(f).replace(/^=/, '')), name, cur, 'c', at, 1)); } catch (e) { return f; } };
  for (const e of target.cells) if (e[1] >= at) e[1]++;
  target.cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  target.cols = target.cols.map(([c, p]) => [c >= at ? c + 1 : c, p]);
  for (const m of target.merges) { if (m.c1 >= at) m.c1++; if (m.c2 >= at) m.c2++; }
  if (target.freeze.c > at) target.freeze.c++;
  for (const so of obj.sheets) {
    for (const e of so.cells) if (e[2].f !== undefined) e[2].f = fix(e[2].f, so.name);
    for (const ch of so.charts || []) ch.range = fix(ch.range, so.name);
    for (const p of so.pivots || []) {
      p.source.ref = fix(p.source.ref, p.source.sheet || so.name);
      if (so === target && p.at.c >= at) p.at.c++;
    }
  }
  for (const d of obj.names || []) d.ref = fix(d.ref, d.scope != null && obj.sheets[d.scope] ? obj.sheets[d.scope].name : '');
  const out = fromNative(obj);
  out.active = wb.active;
  return out;
}

/** Fill rows r1..r2 of column c with a formula written for row r1 (relative references move down). */
export function fillColumn(wb, sh, c, r1, r2, formula) {
  const text = String(formula).trim();
  const f = text.replace(/^=/, '');
  if (!text.startsWith('=')) { wb.batch(() => { for (let r = r1; r <= r2; r++) wb.input(sh, r, c, text); }); return r2 - r1 + 1; }
  parse(f); // a syntax error stops here, before anything changes
  wb.batch(() => { for (let r = r1; r <= r2; r++) wb.setFormula(sh, r, c, r === r1 ? f : wb.shiftFormula(f, r - r1, 0)); });
  return r2 - r1 + 1;
}

