/* CSV rows → a minimal XLSX workbook (one sheet). Uses the shared OOXML XML and ZIP helpers.
 * Numbers that round-trip exactly are stored as numbers; everything else is an inline string. */
import { x, doc, NS, raw } from '../../../shared/office/xml.js';
import { writeZip } from '../io/zip.js';

const NUM = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const colName = (i) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function cellXml(v, ref) {
  if (v === '') return '';
  if (NUM.test(v) && String(Number(v)) === v) return x('c', { r: ref }, [x('v', null, v)]);
  return x('c', { r: ref, t: 'inlineStr' }, [x('is', null, [x('t', { 'xml:space': 'preserve' }, v)])]);
}

export function sheetXml(rows) {
  const body = rows.map((r, ri) => x('row', { r: ri + 1 }, raw(r.map((v, ci) => cellXml(String(v ?? ''), colName(ci) + (ri + 1))).join('')))).join('');
  return doc(x('worksheet', { xmlns: NS.s }, [x('sheetData', null, raw(body))]));
}

export async function rowsToXlsx(rows) {
  const parts = [
    { path: '[Content_Types].xml', data: doc(x('Types', { xmlns: NS.ct }, [ // i18n-ignore: XLSX package XML and names
      x('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }), // i18n-ignore: XLSX package XML and names
      x('Default', { Extension: 'xml', ContentType: 'application/xml' }), // i18n-ignore: XLSX package XML and names
      x('Override', { PartName: '/xl/workbook.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' }), // i18n-ignore: XLSX package XML and names
      x('Override', { PartName: '/xl/worksheets/sheet1.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }), // i18n-ignore: XLSX package XML and names
      x('Override', { PartName: '/xl/styles.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml' }), // i18n-ignore: XLSX package XML and names
    ])) },
    { path: '_rels/.rels', data: doc(x('Relationships', { xmlns: NS.rel }, [ // i18n-ignore: XLSX package XML and names
      x('Relationship', { Id: 'rId1', Type: `${NS.r}/officeDocument`, Target: 'xl/workbook.xml' }), // i18n-ignore: XLSX package XML and names
    ])) },
    { path: 'xl/workbook.xml', data: doc(x('workbook', { xmlns: NS.s, 'xmlns:r': NS.r }, [
      x('sheets', null, [x('sheet', { name: 'Sheet1', sheetId: 1, 'r:id': 'rId1' })]), // i18n-ignore: XLSX package XML and names
    ])) },
    { path: 'xl/_rels/workbook.xml.rels', data: doc(x('Relationships', { xmlns: NS.rel }, [ // i18n-ignore: XLSX package XML and names
      x('Relationship', { Id: 'rId1', Type: `${NS.r}/worksheet`, Target: 'worksheets/sheet1.xml' }), // i18n-ignore: XLSX package XML and names
      x('Relationship', { Id: 'rId2', Type: `${NS.r}/styles`, Target: 'styles.xml' }), // i18n-ignore: XLSX package XML and names
    ])) },
    { path: 'xl/styles.xml', data: doc(x('styleSheet', { xmlns: NS.s }, [
      x('fonts', { count: 1 }, [x('font', null, [x('sz', { val: 11 }), x('name', { val: 'Calibri' })])]), // i18n-ignore: XLSX package XML and names
      x('fills', { count: 2 }, [x('fill', null, [x('patternFill', { patternType: 'none' })]), x('fill', null, [x('patternFill', { patternType: 'gray125' })])]),
      x('borders', { count: 1 }, [x('border', null, [x('left'), x('right'), x('top'), x('bottom'), x('diagonal')])]),
      x('cellStyleXfs', { count: 1 }, [x('xf', { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 })]),
      x('cellXfs', { count: 1 }, [x('xf', { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 })]),
    ])) },
    { path: 'xl/worksheets/sheet1.xml', data: sheetXml(rows) },
  ];
  return writeZip(parts);
}
