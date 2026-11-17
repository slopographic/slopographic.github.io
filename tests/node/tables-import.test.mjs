// Slop Tables: XLSX and ODS import through the shared reader, and charts in the XLSX export (no browser). A workbook made
// here is written with the app's own XLSX writer and read back; hand-made packages cover shared formulas, ODS files and
// the parts that are not imported.
// Run: node --test tests/node/tables-import.test.mjs
// Covers: tables/js/io/import.js, tables/js/io/import-charts.js, tables/js/io/xlsx-charts.js, tables/js/io/xlsx.js,
// shared/sheets/read.js, shared/sheets/xlsx.js, shared/sheets/xlsx-charts.js, shared/sheets/ods.js
import './tables-dom-shim.mjs';
import './tables-i18n-en.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workbook } from '../../tables/js/engine/index.js';
import { toXlsx } from '../../tables/js/io/xlsx.js';
import { importSheets, readWorkbook } from '../../tables/js/io/import.js';
import { blockOf } from '../../tables/js/io/import-charts.js';
import { read } from '../../shared/sheets/read.js';
import { odfFormula } from '../../shared/sheets/ods.js';
import { writeZip, readZip, readText } from '../../shared/office/zip.js';

const named = (blob, name) => Object.assign(blob, { name });
function sample() {
  const wb = new Workbook(), sh = wb.sheets[0];
  wb.renameSheet(sh, 'Sales');
  [['Month', 'North', 'South'], ['Jan', '100', '80'], ['Feb', '120', '95'], ['Mar', '90', '130']].forEach((row, r) => row.forEach((v, c) => wb.input(sh, r, c, v)));
  wb.input(sh, 4, 0, 'Total'); wb.input(sh, 4, 1, '=SUM(B2:B4)'); wb.input(sh, 4, 2, '=SUM(C2:C4)');
  wb.input(sh, 6, 0, '2026-10-11'); wb.input(sh, 6, 1, '$1,234.50');
  sh.get(0, 0).s = wb.styleId({ b: true }); sh.get(4, 0).s = wb.styleId({ i: true });
  sh.colProp(0).w = 140; sh.rowProp(2).h = 30;
  sh.merges.push({ r1: 8, c1: 0, r2: 8, c2: 2 }); wb.input(sh, 8, 0, 'Merged');
  sh.freeze = { r: 1, c: 0 };
  sh.charts.push({ id: 'c1', type: 'column', range: 'A1:C4', by: 'cols', title: 'By month', legend: true, x: 400, y: 44, w: 480, h: 300 });
  sh.charts.push({ id: 'c2', type: 'line', range: 'A1:C4', by: 'rows', title: '', legend: false, x: 400, y: 400, w: 300, h: 200 });
  const other = wb.addSheet('Summary');
  other.charts.push({ id: 'c3', type: 'pie', range: 'Sales!A1:B4', by: 'cols', title: 'North', legend: true, x: 10, y: 10, w: 300, h: 220 });
  return wb;
}

test('XLSX export holds a drawing and a chart part per chart, with series references and cached values', async () => {
  const files = await readZip(await toXlsx(sample()));
  assert.ok(files.has('xl/charts/chart1.xml') && files.has('xl/charts/chart3.xml'));
  assert.match(readText(files, 'xl/worksheets/sheet1.xml'), /<drawing r:id="rId1"\/><\/worksheet>$/);
  assert.match(readText(files, 'xl/worksheets/_rels/sheet1.xml.rels'), /drawings\/drawing1\.xml/);
  const c1 = readText(files, 'xl/charts/chart1.xml');
  assert.match(c1, /<c:barDir val="col"\/>/);
  assert.match(c1, /<c:f>Sales!\$B\$2:\$B\$4<\/c:f>/);
  assert.match(c1, /<c:f>Sales!\$A\$2:\$A\$4<\/c:f>/);
  assert.match(c1, /<c:pt idx="2"><c:v>90<\/c:v><\/c:pt>/);
  assert.match(c1, /By month/);
  assert.match(readText(files, 'xl/charts/chart2.xml'), /<c:lineChart>/);
  assert.match(readText(files, 'xl/charts/chart3.xml'), /<c:pieChart>/);
  assert.match(readText(files, '[Content_Types].xml'), /drawingml\.chart\+xml/);
});

test('XLSX round trip: values, formulas, formats, sizes, merges, freeze and charts come back', async () => {
  const blob = named(await toXlsx(sample()), 'Sample.xlsx');
  const { wb, notes } = await readWorkbook(blob, 'Sample.xlsx');
  assert.deepEqual(notes, []);
  const sh = wb.sheetByName('Sales');
  assert.equal(sh.value(1, 1), 100);
  assert.equal(sh.get(4, 1).f, 'SUM(B2:B4)');
  assert.equal(sh.value(4, 1), 310);
  wb.input(sh, 1, 1, '200');
  assert.equal(sh.value(4, 1), 410, 'formulas recalculate after the import');
  assert.equal(wb.style(sh.get(0, 0).s).b, true);
  assert.equal(wb.style(sh.get(4, 0).s).i, true);
  assert.equal(typeof sh.value(6, 0), 'number');
  assert.match(wb.style(sh.get(6, 0).s).nf, /y/);
  assert.match(wb.style(sh.get(6, 1).s).nf, /\$/);
  assert.equal(sh.colW(0), 140);
  assert.equal(sh.rowH(2), 30);
  assert.deepEqual(sh.merges, [{ r1: 8, c1: 0, r2: 8, c2: 2 }]);
  assert.deepEqual(sh.freeze, { r: 1, c: 0 });
  assert.equal(sh.charts.length, 2);
  const [a, b] = sh.charts;
  assert.equal(a.type, 'column'); assert.equal(a.range, 'A1:C4'); assert.equal(a.by, 'cols'); assert.equal(a.title, 'By month');
  assert.ok(Math.abs(a.x - 400) <= 1 && Math.abs(a.w - 480) <= 2, `place ${a.x} ${a.w}`);
  assert.equal(b.type, 'line'); assert.equal(b.by, 'rows'); assert.equal(b.range, 'A1:C4'); assert.equal(b.legend, false);
  const pie = wb.sheetByName('Summary').charts[0];
  assert.equal(pie.type, 'pie'); assert.equal(pie.range, 'Sales!A1:B4');
});

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
async function rawXlsx(sheetData, extra = []) {
  const parts = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${NS}"><sheetData>${sheetData}</sheetData><conditionalFormatting sqref="A1"/></worksheet>`],
    ...extra,
  ];
  return named(await writeZip(parts.map(([path, data]) => ({ path, data }))), 'raw.xlsx');
}

test('shared formulas are filled in from their first cell; unknown functions and left-out parts are named', async () => {
  const xml = '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" ref="B1:B3" si="0">A1*2</f><v>2</v></c></row>' +
    '<row r="2"><c r="A2"><v>5</v></c><c r="B2"><f t="shared" si="0"/><v>10</v></c></row>' +
    '<row r="3"><c r="A3"><v>7</v></c><c r="B3"><f t="shared" si="0"/><v>14</v></c><c r="C3"><f>_xlfn.NOSUCHFN(A3)</f><v>1</v></c></row>';
  const doc = await read(await rawXlsx(xml, [['xl/media/image1.png', 'x'], ['xl/vbaProject.bin', 'x']]));
  assert.deepEqual(doc.skipped, ['pictures', 'macros', 'conditional formatting']);
  const { wb, notes } = importSheets(doc);
  const sh = wb.sheets[0];
  assert.equal(sh.get(2, 1).f, 'A3*2');
  assert.equal(sh.value(2, 1), 14);
  assert.equal(sh.get(2, 2).f, 'NOSUCHFN(A3)');
  assert.match(notes[0], /1 formula uses a function/);
  assert.match(notes[1], /Not imported: pictures, macros, conditional formatting\./);
});

test('chart series that are not one block are refused; a block is found from column series', () => {
  const s = (val, name, cat) => ({ val, name, cat });
  assert.deepEqual(blockOf([s('S!$B$2:$B$4', 'S!$B$1', 'S!$A$2:$A$4'), s('S!$C$2:$C$4', 'S!$C$1', 'S!$A$2:$A$4')], 'S'), { range: 'A1:C4', by: 'cols', header: true, catCol: true });
  assert.equal(blockOf([s('S!$B$2:$B$4'), s('S!$D$2:$D$4')], 'S'), null);
  assert.equal(blockOf([s('S!$B$2:$B$4', null, 'S!$F$2:$F$4')], 'S'), null);
  assert.equal(blockOf([s('T!$B$2:$B$4')], 'S').range, 'T!B2:B4');
});

test('OpenFormula becomes Excel syntax', () => {
  assert.equal(odfFormula('of:=SUM([.A1:.A3];[.B2])'), 'SUM(A1:A3,B2)');
  assert.equal(odfFormula("of:=[$'My data'.$B$2]*2"), "'My data'!$B$2*2");
  assert.equal(odfFormula('of:=IF([.A1]>0;"a;b";"")'), 'IF(A1>0,"a;b","")');
  assert.equal(odfFormula('of:=[$Data.A1:.C9]'), 'Data!A1:C9');
});

const ODS_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"';
const ODS_CONTENT = `<office:document-content ${ODS_NS}><office:automatic-styles>` +
  '<number:percentage-style style:name="N1"><number:number number:decimal-places="1" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>' +
  '<number:date-style style:name="N2"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:day number:style="long"/></number:date-style>' +
  '<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="1in"/></style:style>' +
  '<style:style style:name="ce1" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style>' +
  '<style:style style:name="ce2" style:family="table-cell" style:data-style-name="N1"/><style:style style:name="ce3" style:family="table-cell" style:data-style-name="N2"/>' +
  '</office:automatic-styles><office:body><office:spreadsheet><table:table table:name="Budget">' +
  '<table:table-column table:style-name="co1"/><table:table-column table:number-columns-repeated="1023"/>' +
  '<table:table-row><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>Item</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Cost</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1022"/></table:table-row>' +
  '<table:table-row><table:table-cell office:value-type="string"><text:p>Rent</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="900"><text:p>900</text:p></table:table-cell></table:table-row>' +
  '<table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="string"><text:p>Food</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="50"/></table:table-row>' +
  '<table:table-row><table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>Sum</text:p></table:table-cell><table:covered-table-cell/><table:table-cell table:formula="of:=SUM([.B2:.B4])" office:value-type="float" office:value="1000"/></table:table-row>' +
  '<table:table-row><table:table-cell table:style-name="ce2" office:value-type="percentage" office:value="0.125"/><table:table-cell table:style-name="ce3" office:value-type="date" office:date-value="2026-10-11"/><table:table-cell office:value-type="boolean" office:boolean-value="true"/></table:table-row>' +
  '<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>' +
  '</table:table><table:table table:name="Two"><table:table-row><table:table-cell office:value-type="float" office:value="3"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';

test('ODS: values, repeated rows, formulas, formats, bold, widths, merges, several sheets, and what is left out', async () => {
  const blob = named(await writeZip([
    { path: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
    { path: 'content.xml', data: ODS_CONTENT },
    { path: 'Object 1/content.xml', data: '<x/>' },
  ]), 'Budget.ods');
  const doc = await read(blob);
  assert.equal(doc.format, 'ods');
  assert.deepEqual(doc.sheets.map((s) => s.name), ['Budget', 'Two']);
  const s = doc.sheets[0];
  assert.equal(s.height, 6); assert.equal(s.width, 3);
  assert.deepEqual(s.text[5], ['12.5%', '2026-10-11', 'TRUE']);
  const { wb, notes } = importSheets(doc);
  const sh = wb.sheets[0];
  assert.equal(sh.value(3, 0), 'Food', 'a repeated row is written twice');
  assert.equal(sh.get(4, 2).f, 'SUM(B2:B4)');
  assert.equal(sh.value(4, 2), 1000);
  assert.equal(wb.style(sh.get(0, 0).s).b, true);
  assert.equal(wb.style(sh.get(5, 0).s).nf, '0.0%');
  assert.equal(wb.style(sh.get(5, 1).s).nf, 'yyyy-mm-dd');
  assert.equal(sh.value(5, 2), true);
  assert.equal(sh.colW(0), 96);
  assert.deepEqual(sh.merges, [{ r1: 4, c1: 0, r2: 4, c2: 1 }]);
  assert.equal(wb.sheets[1].value(0, 0), 3);
  assert.deepEqual(notes, ['Not imported: charts.']);
});

test('the old .xls format is still refused with the reason', async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(read(named(new Blob([ole]), 'old.xls')), /\.xls files are not supported/);
  await assert.rejects(read(named(new Blob(['nope']), 'bad.ods')), /not a valid spreadsheet/);
});
