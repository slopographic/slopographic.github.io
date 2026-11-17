// Slop Sheets test fixtures: a small XLSX (two sheets, bold header, a date, a percent) and a CSV, built in the browser.
import { writeZip } from '../../shared/office/zip.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const S = (ref, text, s = 0) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t>${esc(text)}</t></is></c>`;
const N = (ref, v, s = 0) => `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`;
const sheet = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetData>${rows.map((cells, i) => `<row r="${i + 1}">${cells.join('')}</row>`).join('')}</sheetData></worksheet>`;
// Excel serial for 2026-01-05 is 46027.
const DATE = 46027;

const STYLES = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>` +
  `<cellXfs count="3"><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1"/><xf numFmtId="164" fontId="0"/></cellXfs></styleSheet>`;

export async function xlsxFixture(name = 'sales.xlsx') {
  const header = [S('A1', 'Region', 1), S('B1', 'Units', 1), S('C1', 'Price', 1), S('D1', 'Date', 1)];
  const data = [
    ['North', 12, 3.5], ['South', 7, 2.25], ['North', 30, 1], ['East', 3, 10], ['West', 18, 4.5],
  ].map(([a, b, c], i) => [S(`A${i + 2}`, a), N(`B${i + 2}`, b), N(`C${i + 2}`, c), N(`D${i + 2}`, DATE + i, 2)]);
  const parts = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheet([header, ...data])],
    ['xl/worksheets/sheet2.xml', sheet([[S('A1', 'Hello from the second sheet')]])],
  ];
  const blob = await writeZip(parts.map(([path, data]) => ({ path, data })));
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function csvFixture(name = 'people.csv') {
  const text = 'name,qty\r\n"Smith, J",3\r\nAnn,10\r\nBob,1\r\n';
  return new File([text], name, { type: 'text/csv' });
}
