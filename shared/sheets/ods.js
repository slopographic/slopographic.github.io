/* Slop Sheets: reads OpenDocument spreadsheets (.ods, LibreOffice Calc). Uses the office layer like xlsx.js, and gives the
 * same sheet objects (buildSheet in xlsx.js): typed values and their text, number formats (number, percent, currency,
 * date and time styles turned into Excel codes), bold and italic, formulas (OpenFormula turned into Excel A1 syntax:
 * [.A1:.B2] → A1:B2, [$Data.A1] → Data!A1, ; → ,), column widths, row heights, hidden columns and merged cells.
 * Not read: charts (embedded objects), pictures, comments, conditional formats, validation, macros; readOds lists the
 * ones a file has in `skipped`. Exports readOds(files) (the readZip Map) → { sheets, skipped }, and odfFormula(text). */
import { readText } from '../office/zip.js';
import { parseXml, kids, kid, all, attr, textOf, NS } from '../office/xml.js';
import { formatNumber } from './numfmt.js';
import { buildSheet } from './xlsx.js';
import { KEY } from './csv.js';
/** A word from the shared tables (shared/i18n/ui/<code>/sheets.js), the key without SlopI18n (node tests). */
const tr = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);

const T = NS.table, O = NS.office, ST = NS.style, N = NS.number, FO = NS.fo, TX = NS.text;
const MAX_COLS = 16384, MAX_REPEAT = 1000;

/** A length ("2.258cm", "0.9in", "64pt") in CSS pixels. */
export function px(len) {
  const m = /^([\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(len || '').trim());
  if (!m) return null;
  const k = { cm: 96 / 2.54, mm: 96 / 25.4, in: 96, pt: 96 / 72, pc: 16, px: 1 }[m[2] || 'px'];
  return Math.round(Number(m[1]) * k);
}

const quoteSheet = (name) => (/^[A-Za-z_][\w.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);
/** One reference inside [ ]: "$'My sheet'.$A$1" → { sheet: 'My sheet', cell: '$A$1' }. */
function refPart(p) {
  const m = /^\$?(?:'((?:[^']|'')*)'|([^.']*))\.(\$?[A-Z]{1,3}\$?\d*|\$?\d+)$/i.exec(p.trim());
  if (!m) return null;
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
  return { sheet: sheet || null, cell: m[3] };
}
/** OpenFormula ("of:=SUM([.A1:.A3]; [$Data.B2])") → Excel syntax ("SUM(A1:A3,Data!B2)"), without the "=". */
export function odfFormula(f) {
  let s = String(f || '').replace(/^(of|oooc|msoxl):/, '');
  if (s[0] === '=') s = s.slice(1);
  let out = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      let k = i + 1;
      while (k < s.length && !(s[k] === '"' && s[k + 1] !== '"')) k += s[k] === '"' ? 2 : 1;
      out += s.slice(i, k + 1); i = k + 1; continue;
    }
    if (ch === '[') {
      const j = s.indexOf(']', i);
      const inner = s.slice(i + 1, j < 0 ? s.length : j);
      const parts = inner.split(':').map(refPart);
      if (parts.some((p) => !p)) out += '#REF!';
      else out += (parts[0].sheet ? quoteSheet(parts[0].sheet) + '!' : '') + parts.map((p) => p.cell).join(':');
      i = j < 0 ? s.length : j + 1; continue;
    }
    out += ch === ';' ? ',' : ch;
    i++;
  }
  return out;
}

/** Data styles (number:*-style) → Excel format codes, by style name. */
function dataStyles(roots) {
  const codes = new Map();
  for (const root of roots) for (const el of kids(root, N)) {
    const name = attr(el, ST, 'name'), kind = el.localName;
    if (!name) continue;
    let code = '';
    for (const p of kids(el)) {
      const ln = p.localName;
      if (ln === 'number') {
        const dp = Number(attr(p, N, 'decimal-places') || 0), grp = attr(p, N, 'grouping') === 'true';
        code += (grp ? '#,##0' : '0') + (dp ? '.' + '0'.repeat(dp) : '');
      } else if (ln === 'scientific-number') code += '0.' + '0'.repeat(Number(attr(p, N, 'decimal-places') || 2)) + 'E+00';
      else if (ln === 'text') { const t = textOf(p); code += /^[%\s\-/:.,()]*$/.test(t) ? t : `"${t.replace(/"/g, '')}"`; }
      else if (ln === 'currency-symbol') code += `"${textOf(p) || '$'}"`;
      else if (ln === 'year') code += attr(p, N, 'style') === 'long' ? 'yyyy' : 'yy';
      else if (ln === 'month') code += attr(p, N, 'textual') === 'true' ? (attr(p, N, 'style') === 'long' ? 'mmmm' : 'mmm') : (attr(p, N, 'style') === 'long' ? 'mm' : 'm');
      else if (ln === 'day') code += attr(p, N, 'style') === 'long' ? 'dd' : 'd';
      else if (ln === 'day-of-week') code += attr(p, N, 'style') === 'long' ? 'dddd' : 'ddd';
      else if (ln === 'hours') code += attr(p, N, 'style') === 'long' ? 'hh' : 'h';
      else if (ln === 'minutes') code += attr(p, N, 'style') === 'long' ? 'mm' : 'm';
      else if (ln === 'seconds') code += attr(p, N, 'style') === 'long' ? 'ss' : 's';
      else if (ln === 'am-pm') code += 'AM/PM';
    }
    if (kind === 'boolean-style') code = 'General';
    if (kind === 'text-style') code = '@';
    if (kind === 'date-style' && !/[ymd]/.test(code)) code = 'yyyy-mm-dd';
    if (kind === 'percentage-style' && !code.includes('%')) code += '%';
    codes.set(name, code.replace(/""/g, '') || 'General');
  }
  return codes;
}

/** Cell, column and row styles (style:style) → { code, bold, italic } | { w } | { h }, following parent styles. */
function styleTable(roots, codes) {
  const raw = new Map();
  for (const root of roots) for (const el of kids(root, ST, 'style')) raw.set(attr(el, ST, 'name'), el);
  const memo = new Map();
  const get = (name, depth = 0) => {
    if (!name || depth > 8) return {};
    if (memo.has(name)) return memo.get(name);
    const el = raw.get(name);
    if (!el) return {};
    const base = { ...get(attr(el, ST, 'parent-style-name'), depth + 1) };
    const tp = kid(el, ST, 'text-properties'), cp = kid(el, ST, 'table-column-properties'), rp = kid(el, ST, 'table-row-properties');
    const ds = attr(el, ST, 'data-style-name');
    if (ds && codes.has(ds)) base.code = codes.get(ds);
    if (tp && attr(tp, FO, 'font-weight')) base.bold = /bold|[6-9]00/.test(attr(tp, FO, 'font-weight'));
    if (tp && attr(tp, FO, 'font-style')) base.italic = attr(tp, FO, 'font-style') === 'italic';
    if (cp && attr(cp, ST, 'column-width')) base.w = px(attr(cp, ST, 'column-width'));
    if (rp && attr(rp, ST, 'row-height') && attr(rp, ST, 'use-optimal-row-height') !== 'true') base.h = px(attr(rp, ST, 'row-height'));
    memo.set(name, base);
    return base;
  };
  return get;
}

/** "PT12H30M15S" → a fraction of a day. */
const duration = (v) => { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(v || ''); return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) / 86400 : null; };
const cellText = (c) => kids(c, TX, 'p').map(textOf).join('\n');

/** Typed value, number format code and text of one table:table-cell. */
function cellValue(c, st) {
  const type = attr(c, O, 'value-type'), code = st.code || null;
  let typed = null, fmt = code;
  if (type === 'float' || type === 'percentage' || type === 'currency') {
    typed = Number(attr(c, O, 'value'));
    if (!isFinite(typed)) typed = null;
    if (!fmt || fmt === 'General') fmt = type === 'percentage' ? '0.00%' : type === 'currency' ? '#,##0.00' : null;
  } else if (type === 'date') {
    const v = attr(c, O, 'date-value') || '';
    const d = new Date(/T/.test(v) && !/[Z+]|-\d\d:\d\d$/.test(v.slice(10)) ? v + 'Z' : v);
    typed = isNaN(d) ? null : d;
    if (!fmt || fmt === 'General') fmt = /T/.test(v) ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd';
  } else if (type === 'time') { typed = duration(attr(c, O, 'time-value')); if (!fmt || fmt === 'General') fmt = 'hh:mm:ss'; }
  else if (type === 'boolean') typed = attr(c, O, 'boolean-value') === 'true';
  else if (type === 'string') typed = attr(c, O, 'string-value') ?? cellText(c);
  else if (kid(c, TX, 'p')) typed = cellText(c) || null;
  if (typed === '') typed = null;
  if (typed === null) return { typed: null, text: '', code: null };
  const numeric = typeof typed === 'number' || typed instanceof Date;
  return { typed, text: formatNumber(typed, numeric ? fmt || 'General' : 'General'), code: numeric ? fmt : null };
}

/** Rows of a table, through header rows and row groups, in order. */
function rowsOf(el, out = []) {
  for (const k of kids(el, T)) {
    if (k.localName === 'table-row') out.push(k);
    else if (/^table-(header-rows|row-group|rows)$/.test(k.localName)) rowsOf(k, out);
  }
  return out;
}
function colsOf(el, out = []) {
  for (const k of kids(el, T)) {
    if (k.localName === 'table-column') out.push(k);
    else if (/^table-(header-columns|column-group|columns)$/.test(k.localName)) colsOf(k, out);
  }
  return out;
}

function readTable(tbl, style) {
  const cells = new Map(), extra = { formulas: new Map(), cols: [], heights: new Map(), merges: [], freeze: null };
  let c0 = 0;
  for (const col of colsOf(tbl)) {
    const n = Math.min(Number(attr(col, T, 'number-columns-repeated') || 1), MAX_COLS - c0);
    const s = style(attr(col, T, 'style-name')), hidden = attr(col, T, 'visibility') === 'collapse';
    if ((s.w || hidden) && n < MAX_COLS) extra.cols.push({ c1: c0, c2: c0 + n - 1, w: s.w || null, hidden });
    c0 += n;
  }
  let r = 0;
  for (const row of rowsOf(tbl)) {
    const rep = Number(attr(row, T, 'number-rows-repeated') || 1);
    const cellEls = kids(row, T).filter((k) => k.localName === 'table-cell' || k.localName === 'covered-table-cell');
    const filled = cellEls.some((k) => attr(k, O, 'value-type') || attr(k, T, 'formula') || kid(k, TX, 'p'));
    const h = style(attr(row, T, 'style-name')).h;
    if (!filled) { if (h && rep < MAX_REPEAT) for (let i = 0; i < rep; i++) extra.heights.set(r + i, h); r += rep; continue; }
    for (let i = 0; i < Math.min(rep, MAX_REPEAT); i++, r++) {
      if (h) extra.heights.set(r, h);
      let c = 0;
      for (const cel of cellEls) {
        const n = Number(attr(cel, T, 'number-columns-repeated') || 1);
        if (cel.localName === 'covered-table-cell') { c += n; continue; }
        const st = style(attr(cel, T, 'style-name')), val = cellValue(cel, st), f = attr(cel, T, 'formula');
        const sc = Number(attr(cel, T, 'number-columns-spanned') || 1), sr = Number(attr(cel, T, 'number-rows-spanned') || 1);
        if (i === 0 && (sc > 1 || sr > 1)) extra.merges.push({ r1: r, c1: c, r2: r + sr - 1, c2: c + sc - 1 });
        if (val.typed === null && !f) { c += n; continue; }
        for (let j = 0; j < Math.min(n, MAX_REPEAT) && c < MAX_COLS; j++, c++) {
          cells.set(KEY(r, c), { ...val, bold: !!st.bold, italic: !!st.italic });
          if (f) extra.formulas.set(KEY(r, c), { f: odfFormula(f), shared: null });
        }
        if (n > MAX_REPEAT) c += n - MAX_REPEAT;
      }
    }
    if (rep > MAX_REPEAT) r += rep - MAX_REPEAT;
  }
  return buildSheet(attr(tbl, T, 'name') || 'Sheet', cells, extra);
}

/** The readZip Map of an .ods package → { sheets, skipped }. Throws when it is not a spreadsheet. */
export function readOds(files) {
  const content = readText(files, 'content.xml');
  if (!content) throw new Error(tr('ui.sheets.ods_no_content'));
  const doc = parseXml(content).documentElement;
  const stylesXml = readText(files, 'styles.xml');
  const sdoc = stylesXml ? parseXml(stylesXml).documentElement : null;
  const roots = [kid(sdoc, O, 'styles'), kid(sdoc, O, 'automatic-styles'), kid(doc, O, 'automatic-styles')].filter(Boolean);
  const style = styleTable(roots, dataStyles(roots));
  const ss = kid(kid(doc, O, 'body'), O, 'spreadsheet');
  if (!ss) throw new Error(tr('ui.sheets.ods_not_sheet'));
  const sheets = kids(ss, T, 'table').map((tbl) => readTable(tbl, style));
  if (!sheets.length) throw new Error(tr('ui.sheets.no_sheets'));
  sheets.forEach((s) => { s.charts = []; });
  const names = [...files.keys()], skipped = [];
  if (names.some((n) => /^Object [^/]+\/content\.xml$/.test(n)) || all(doc, NS.draw, 'object').length) skipped.push(tr('ui.sheets.part_charts'));
  if (names.some((n) => /^Pictures\//.test(n))) skipped.push(tr('ui.sheets.part_pictures'));
  if (content.includes('table:data-pilot-table')) skipped.push(tr('ui.sheets.part_pivots'));
  if (content.includes('office:annotation')) skipped.push(tr('ui.sheets.part_comments'));
  if (content.includes('conditional-format')) skipped.push(tr('ui.sheets.part_cond'));
  if (content.includes('table:content-validation')) skipped.push(tr('ui.sheets.part_validation'));
  if (names.some((n) => /^(Basic|Scripts)\//.test(n))) skipped.push(tr('ui.sheets.part_macros'));
  return { sheets, skipped };
}
