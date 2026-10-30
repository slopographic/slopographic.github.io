/* Shared test helper (browser and Node): a small Word file written part by part, the way Word writes one: two headings,
 * Swedish text with bold, italic and a hyperlink, an Arabic paragraph, a bullet list with a nested item, a numbered list
 * and a table with a header row, on A4. sampleDocx() → Blob (shared/office/zip.js). Not a test itself. */
import { writeZip } from '../../shared/office/zip.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const r = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const p = (body, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${body}</w:p>`;
const style = (s) => `<w:pStyle w:val="${s}"/>`;
const item = (t, num, lvl = 0) => p(r(t), `${style('ListParagraph')}<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${num}"/></w:numPr>`);
const cell = (t, w = 4500) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${p(r(t))}</w:tc>`;
const row = (cells, header) => `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c) => cell(c)).join('')}</w:tr>`;

export const DOCX_TEXT = { title: 'Rapport om året', swedish: 'Hej världen, åäö ÅÄÖ', arabic: 'مرحبا بالعالم', link: 'https://example.com/' };

export function documentXml() {
  const body = [
    p(r(DOCX_TEXT.title), style('Heading1')),
    p(r(DOCX_TEXT.swedish + ', ') + r('fet', '<w:b/>') + r(' och ') + r('kursiv', '<w:i/>') + r(' text med en ') +
      `<w:hyperlink r:id="rIdLink">${r('länk', '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>` + r('.')),
    p(r(DOCX_TEXT.arabic), '<w:bidi/><w:jc w:val="right"/>'),
    p(r('Lista'), style('Heading2')),
    item('Ett', 1), item('Två', 1), item('Under', 1, 1),
    item('Första', 2), item('Andra', 2),
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>` +
      row(['Namn', 'Stad'], true) + row(['Åsa', 'Malmö']) + row(['Omar', 'حلب']) + '</w:tbl>',
    p(r('Slut.')),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>',
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body}</w:body></w:document>`;
}

const lvl = (i, fmt, text) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${W}>` +
  `<w:abstractNum w:abstractNumId="0">${lvl(0, 'bullet', '•')}${lvl(1, 'bullet', '◦')}</w:abstractNum>` +
  `<w:abstractNum w:abstractNumId="1">${lvl(0, 'decimal', '%1.')}${lvl(1, 'lowerLetter', '%2.')}</w:abstractNum>` +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
const TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
  `<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${DOCX_TEXT.link}" TargetMode="External"/></Relationships>`;

/** The Word file: word/document.xml first (so its name is in the first bytes, as detect.js officeOfZip reads it). */
export function sampleDocx() {
  return writeZip([{ path: 'word/document.xml', data: documentXml() }, { path: '[Content_Types].xml', data: TYPES }, { path: '_rels/.rels', data: RELS },
    { path: 'word/_rels/document.xml.rels', data: DOC_RELS }, { path: 'word/numbering.xml', data: NUMBERING }]);
}
