/* XLSX export (SpreadsheetML) built with shared/office. Writes values, formulas with their last computed
   value, bold/italic, number formats, column widths, row heights, hidden rows and columns, merges, freeze
   panes, global names and charts (xlsx-charts.js; pivot tables go out as their values). Not yet: conditional formats,
   validation, comments, print setup. */
import { writeZip } from '../../../shared/office/zip.js';
import { esc, escAttr, doc } from '../../../shared/office/xml.js';
import { addr } from '../engine/refs.js';
import { FErr } from '../engine/values.js';
import { chartParts } from './xlsx-charts.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const BUILTIN_NF = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };

/** Workbook → Blob (.xlsx). */
export async function toXlsx(wb) {
  const st = new StyleTable(), charts = chartParts(wb);
  const sheets = wb.sheets.map((sh, i) => sheetXml(sh, i, st, charts.sheets.has(i)));
  const names = [...wb.names.values()].map((d) => {
    const local = d.scope ? wb.sheets.findIndex((s) => s.id === d.scope) : -1;
    return `<definedName name="${escAttr(d.name)}"${local >= 0 ? ` localSheetId="${local}"` : ''}>${esc(d.ref)}</definedName>`;
  });
  const active = Math.min(wb.active || 0, wb.sheets.length - 1);
  const workbook = doc(`<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="${active}"/></bookViews><sheets>` +
    wb.sheets.map((sh, i) => `<sheet name="${escAttr(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets>${names.length ? `<definedNames>${names.join('')}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  const n = wb.sheets.length;
  const rels = doc(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${REL}styles" Target="styles.xml"/></Relationships>`);
  const ct = doc(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${charts.types.join('')}</Types>`);
  const root = doc(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  const entries = [
    { path: '[Content_Types].xml', data: ct },
    { path: '_rels/.rels', data: root },
    { path: 'xl/workbook.xml', data: workbook },
    { path: 'xl/_rels/workbook.xml.rels', data: rels },
    { path: 'xl/styles.xml', data: st.xml() },
    ...sheets.map((x, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: x })),
    ...charts.entries,
  ];
  const zip = await writeZip(entries, { compress: true });
  return new Blob([zip], { type: XLSX_MIME });
}

/** Deduplicated cellXfs (bold, italic, number format) plus custom number formats. */
class StyleTable {
  constructor() { this.xfs = [{ b: false, i: false, nf: 'General' }]; this.index = new Map([['General|0|0', 0]]); this.nfs = []; }
  nfId(code) {
    if (code === undefined || code === null || code === '') code = 'General';
    if (code in BUILTIN_NF) return BUILTIN_NF[code];
    let i = this.nfs.indexOf(code);
    if (i < 0) i = this.nfs.push(code) - 1;
    return 164 + i;
  }
  /** Index of the xf for { b, i, nf }. */
  xf(b, i, nf) {
    const key = `${!!b}|${!!i}|${nf || 'General'}`;
    let id = this.index.get(key);
    if (id === undefined) { this.nfId(nf); id = this.xfs.length; this.xfs.push({ b: !!b, i: !!i, nf: nf || 'General' }); this.index.set(key, id); }
    return id;
  }
  fontId(b, i) { return (b ? 1 : 0) + (i ? 2 : 0); }
  xml() {
    const nfs = this.nfs.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escAttr(c)}"/>`);
    const font = (b, i) => `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="11"/><name val="Calibri"/><family val="2"/></font>`;
    const fonts = [font(0, 0), font(1, 0), font(0, 1), font(1, 1)];
    const xfs = this.xfs.map((x) => `<xf numFmtId="${this.nfId(x.nf)}" fontId="${this.fontId(x.b, x.i)}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`);
    return doc(`<styleSheet xmlns="${NS_MAIN}">` +
      (nfs.length ? `<numFmts count="${nfs.length}">${nfs.join('')}</numFmts>` : '') +
      `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  }
}

function cellXml(sh, r, c, cell, st) {
  const sty = sh.wb.style(cell.s), ref = addr(r, c);
  const nf = sty.nf || cell.fh || '';
  const s = (sty.b || sty.i || nf) ? st.xf(sty.b, sty.i, nf || 'General') : 0;
  const sa = s ? ` s="${s}"` : '';
  const v = cell.v;
  const f = cell.f !== undefined ? `<f>${esc(cell.f)}</f>` : '';
  if (v === null || v === undefined) return f ? `<c r="${ref}"${sa}>${f}</c>` : `<c r="${ref}"${sa}/>`;
  if (v instanceof FErr) return `<c r="${ref}"${sa} t="e">${f}<v>${esc(v.code)}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${sa} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}"${sa}>${f}<v>${isFinite(v) ? v : 0}</v></c>`;
  if (f) return `<c r="${ref}"${sa} t="str">${f}<v>${esc(String(v))}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml(sh, idx, st, drawing) {
  const rows = new Map();
  const put = (r, c, cell) => { if (!rows.has(r)) rows.set(r, []); rows.get(r).push([c, cell]); };
  for (const [k, cell] of sh.cells) put(Math.floor(k / 16384), k % 16384, cell);
  for (const [k] of sh.spillOwner) {
    const r = Math.floor(k / 16384), c = k % 16384;
    if (!sh.cells.has(k)) put(r, c, { v: sh.value(r, c) });
  }
  const rowIdx = [...rows.keys()].sort((a, b) => a - b);
  let sd = '';
  for (const r of rowIdx) {
    const cells = rows.get(r).sort((a, b) => a[0] - b[0]);
    const rp = sh.rows.get(r);
    const attrs = [`r="${r + 1}"`];
    if (rp && rp.h) attrs.push(`ht="${rp.h * 0.75}"`, 'customHeight="1"');
    if (rp && (rp.hidden || rp.filtered)) attrs.push('hidden="1"');
    sd += `<row ${attrs.join(' ')}>` + cells.map(([c, cell]) => cellXml(sh, r, c, cell, st)).join('') + '</row>';
  }
  const cols = [...sh.cols].filter(([, p]) => p && (p.w || p.hidden)).sort((a, b) => a[0] - b[0]).map(([c, p]) =>
    `<col min="${c + 1}" max="${c + 1}" width="${((p.w || sh.defW) / 7).toFixed(2)}" customWidth="1"${p.hidden ? ' hidden="1"' : ''}/>`).join('');
  const f = sh.freeze || { r: 0, c: 0 };
  const pane = f.r || f.c
    ? `<pane${f.c ? ` xSplit="${f.c}"` : ''}${f.r ? ` ySplit="${f.r}"` : ''} topLeftCell="${addr(f.r, f.c)}" activePane="${f.r && f.c ? 'bottomRight' : f.r ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
    : '';
  const merges = sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${addr(m.r1, m.c1)}:${addr(m.r2, m.c2)}"/>`).join('')}</mergeCells>` : '';
  return doc(`<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0"${idx === (sh.wb.active || 0) ? ' tabSelected="1"' : ''}${sh.showGrid === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="${(sh.defH * 0.75).toFixed(2)}" defaultColWidth="${(sh.defW / 7).toFixed(2)}"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${sd}</sheetData>${merges}${drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`);
}
