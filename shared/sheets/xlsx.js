/* Slop Sheets: reads .xlsx (and .xlsm) workbooks. Uses the office layer: readZip and readText from shared/office/zip.js,
 * and parseXml, kids, kid, all, attr, textOf and NS from shared/office/xml.js.
 * Reads xl/workbook.xml with its relationships, xl/sharedStrings.xml, xl/styles.xml (number formats and bold) and each
 * worksheet. Cell types: shared and inline strings, rich text runs, numbers, booleans, errors, formula text (the
 * saved result is used, formulas are not evaluated) and ISO dates. Date formats turn numbers into Date values.
 * Also kept for apps that edit (Slop Tables): formula text, italic, column widths, row heights, merged cells and frozen
 * panes (sheet.formulas, italic, cols, heights, merges, freeze: see buildSheet), and the charts (xlsx-charts.js).
 * Not read: pictures, comments, hidden rows and columns (they show), filters, macros; readXlsx lists what a file has of
 * these in `skipped`. Exports readXlsx(bytes or a readZip Map) → { sheets, skipped }. */
import { readZip, readText } from '../office/zip.js';
import { parseXml, kids, kid, all, attr, textOf, NS } from '../office/xml.js';
import { BUILTIN_FORMATS, excelDate, isDateCode, formatNumber } from './numfmt.js';
import { KEY } from './csv.js';
import { readCharts, skippedParts } from './xlsx-charts.js';
/** A word from the shared tables (shared/i18n/ui/<code>/sheets.js), the key without SlopI18n (node tests). */
const tr = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);

/** "AB12" → { r: 11, c: 27 } (zero-based). Missing references return null. */
export function parseRef(ref) {
  const m = /^([A-Z]{1,3})(\d+)$/i.exec(ref || '');
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

/** Plain text of a shared string item: its <t> children and the <t> inside each run, in order (phonetic runs skipped). */
function itemText(si) {
  return kids(si).map((n) => {
    if (n.localName === 't') return textOf(n);
    if (n.localName === 'r') return kids(n, NS.s, 't').map(textOf).join('');
    return '';
  }).join('');
}

function readStyles(root) {
  const fmts = new Map();
  for (const nf of all(root, NS.s, 'numFmt')) fmts.set(Number(attr(nf, null, 'numFmtId')), attr(nf, null, 'formatCode') || 'General');
  const fonts = kids(kid(root, NS.s, 'fonts'), NS.s, 'font').map((f) => ({ b: !!kid(f, NS.s, 'b'), i: !!kid(f, NS.s, 'i') }));
  const xfs = kids(kid(root, NS.s, 'cellXfs'), NS.s, 'xf').map((xf) => {
    const id = Number(attr(xf, null, 'numFmtId') || 0);
    const code = fmts.get(id) ?? BUILTIN_FORMATS[id] ?? 'General';
    const font = fonts[Number(attr(xf, null, 'fontId') || 0)] || {};
    return { code, bold: !!font.b, italic: !!font.i };
  });
  return xfs;
}

/** Typed value and cell text for one <c> element. */
function cellValue(c, shared, xf) {
  const t = attr(c, null, 't') || 'n';
  const vEl = kid(c, NS.s, 'v');
  const v = vEl ? textOf(vEl) : null;
  let typed = null;
  if (t === 's') typed = v === null ? null : (shared[Number(v)] ?? null);
  else if (t === 'inlineStr') { const is = kid(c, NS.s, 'is'); const s = is ? all(is, NS.s, 't').map(textOf).join('') : ''; typed = s === '' ? null : s; }
  else if (t === 'str' || t === 'e') typed = v === '' ? null : v;
  else if (t === 'b') typed = v === null ? null : v === '1';
  else if (t === 'd') { const d = v ? new Date(v) : null; typed = d && !isNaN(d) ? d : null; }
  else if (v !== null && v !== '' && isFinite(Number(v))) {
    const n = Number(v);
    typed = isDateCode(xf.code) && n >= 0 ? excelDate(n) : n;
  }
  if (typed === null) return { typed: null, text: '', code: null };
  const numeric = typeof typed === 'number' || typed instanceof Date;
  return { typed, text: formatNumber(typed, xf.code), code: numeric ? xf.code : null };
}

/** One worksheet part → a sheet object. Gaps between rows and columns are blank; blank rows share one frozen array. */
function readSheet(name, xml, shared, styles) {
  const root = parseXml(xml).documentElement;
  const cells = new Map(), extra = { formulas: new Map(), cols: [], heights: new Map(), merges: [], freeze: null };
  const sheetData = kid(root, NS.s, 'sheetData');
  let rowNo = 0;
  for (const rowEl of kids(sheetData, NS.s, 'row')) {
    const rIdx = attr(rowEl, null, 'r') ? Number(attr(rowEl, null, 'r')) - 1 : rowNo;
    rowNo = rIdx + 1;
    if (attr(rowEl, null, 'customHeight') === '1' && attr(rowEl, null, 'ht')) extra.heights.set(rIdx, Math.round(Number(attr(rowEl, null, 'ht')) / 0.75));
    let colNo = 0;
    for (const c of kids(rowEl, NS.s, 'c')) {
      const ref = parseRef(attr(c, null, 'r'));
      const r = ref ? ref.r : rIdx, col = ref ? ref.c : colNo;
      colNo = col + 1;
      const s = Number(attr(c, null, 's') || 0);
      const xf = styles[s] || { code: 'General', bold: false, italic: false };
      const val = cellValue(c, shared, xf), fEl = kid(c, NS.s, 'f');
      if (fEl) {
        const si = attr(fEl, null, 'si');
        extra.formulas.set(KEY(r, col), { f: textOf(fEl), shared: attr(fEl, null, 't') === 'shared' ? Number(si) : null });
      }
      if (val.typed === null && !xf.bold && !xf.italic && !fEl) continue;
      cells.set(KEY(r, col), { ...val, bold: xf.bold, italic: xf.italic });
    }
  }
  for (const col of kids(kid(root, NS.s, 'cols'), NS.s, 'col')) {
    const w = Number(attr(col, null, 'width'));
    extra.cols.push({ c1: Number(attr(col, null, 'min')) - 1, c2: Number(attr(col, null, 'max')) - 1, w: w > 0 ? Math.round(w * 7) : null, hidden: attr(col, null, 'hidden') === '1' });
  }
  for (const m of all(root, NS.s, 'mergeCell')) {
    const [a, b] = (attr(m, null, 'ref') || '').split(':').map(parseRef);
    if (a && b) extra.merges.push({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
  }
  const pane = all(root, NS.s, 'pane').find((p) => /frozen/.test(attr(p, null, 'state') || ''));
  if (pane) extra.freeze = { r: Number(attr(pane, null, 'ySplit') || 0), c: Number(attr(pane, null, 'xSplit') || 0) };
  return buildSheet(name, cells, extra);
}

/** A sheet object from its cells: Map(key → { typed, text, code, bold, italic }) and the extras an editor keeps.
 * Returns { name, rows, text, width, height, fmt, bold, italic, formulas, cols, heights, merges, freeze }:
 *   formulas: Map(key → { f: formula text without "=" ('' for a shared-formula child), shared: group id or null })
 *   cols: [{ c1, c2, w (pixels or null), hidden }], heights: Map(row → pixels), merges: [{ r1, c1, r2, c2 }],
 *   freeze: { r, c } or null. Used by the ODS reader too. */
export function buildSheet(name, cells, extra = {}) {
  let width = 0, height = 0;
  for (const k of cells.keys()) { width = Math.max(width, k % 16384 + 1); height = Math.max(height, Math.floor(k / 16384) + 1); }
  const rows = new Array(height), text = new Array(height);
  const blankT = Object.freeze(new Array(width).fill(null)), blankS = Object.freeze(new Array(width).fill(''));
  const fmt = new Map(), bold = new Set(), italic = new Set();
  const byRow = new Array(height).fill(false);
  for (const k of cells.keys()) byRow[Math.floor(k / 16384)] = true;
  for (let r = 0; r < height; r++) {
    if (!byRow[r]) { rows[r] = blankT; text[r] = blankS; continue; }
    rows[r] = new Array(width).fill(null); text[r] = new Array(width).fill('');
  }
  for (const [k, cell] of cells) {
    const r = Math.floor(k / 16384), c = k % 16384;
    rows[r][c] = cell.typed; text[r][c] = cell.text;
    if (cell.code && cell.code !== 'General') fmt.set(k, cell.code);
    if (cell.bold) bold.add(k);
    if (cell.italic) italic.add(k);
  }
  return { name, rows, text, width, height, fmt, bold, italic, formulas: extra.formulas || new Map(), cols: extra.cols || [],
    heights: extra.heights || new Map(), merges: extra.merges || [], freeze: extra.freeze || null };
}

/** Bytes of an .xlsx file (or its readZip Map) → { sheets: [sheet (see buildSheet), with charts: [...] (xlsx-charts.js)],
 * skipped: ['pictures', 'macros', …] }. Throws on a broken package. */
export async function readXlsx(bytes) {
  const files = bytes instanceof Map ? bytes : await readZip(bytes);
  const wbXml = readText(files, 'xl/workbook.xml');
  if (!wbXml) throw new Error(tr('ui.sheets.xlsx_no_workbook'));
  const rels = new Map();
  const relRoot = readText(files, 'xl/_rels/workbook.xml.rels');
  if (relRoot) for (const rel of all(parseXml(relRoot).documentElement, '*', 'Relationship')) {
    const target = attr(rel, null, 'Target') || '';
    rels.set(attr(rel, null, 'Id'), target.startsWith('/') ? target.slice(1) : 'xl/' + target);
  }
  const shared = [];
  const ssXml = readText(files, 'xl/sharedStrings.xml');
  if (ssXml) for (const si of kids(parseXml(ssXml).documentElement, NS.s, 'si')) shared.push(itemText(si));
  const stXml = readText(files, 'xl/styles.xml');
  const styles = stXml ? readStyles(parseXml(stXml).documentElement) : [];

  const sheetEls = kids(kid(parseXml(wbXml).documentElement, NS.s, 'sheets'), NS.s, 'sheet');
  const sheets = [];
  sheetEls.forEach((el, i) => {
    const target = rels.get(attr(el, NS.r, 'id')) || `xl/worksheets/sheet${i + 1}.xml`;
    if (!/worksheets\//.test(target)) return; // chart sheets have no cells
    const xml = readText(files, target);
    if (xml === null) throw new Error(tr('ui.sheets.xlsx_missing', { part: target }));
    const sheet = readSheet(attr(el, null, 'name') || `Sheet${i + 1}`, xml, shared, styles);
    sheet.charts = readCharts(files, target);
    sheets.push(sheet);
  });
  if (!sheets.length) throw new Error(tr('ui.sheets.no_sheets'));
  return { sheets, skipped: skippedParts(files, sheetEls.length > sheets.length) };
}
