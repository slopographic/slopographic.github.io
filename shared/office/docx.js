/* Slop Office DOCX writer: a Word document from a short list of blocks. No dependencies.
 *
 *   docxBlob(blocks, { pageSize = 'a4' | 'letter', title = '', creator = 'Slopographic' }) → Promise<Blob>
 *   docxEntries(blocks, opts) → [{ path, data }]   the parts before zipping (for tests and other writers)
 *
 * Blocks (a plain string is a run; a run is { text, bold, italic, underline }; "\n" inside text is a line break):
 *   { type: 'heading', level: 1 | 2 | 3, text | runs }     Heading 1 to 3 (outline levels 0 to 2)
 *   { type: 'paragraph', text | runs, align }              align: 'left' (default), 'center', 'right', 'both'
 *   { type: 'item', text | runs, marker = '•' }            a list line: hanging indent with the marker in front.
 *                                                          No numbering part is written, so the marker is text.
 *   { type: 'table', rows: [[cell, …], …], header = true } cell: a string or runs. Columns share the text width.
 *   { type: 'pagebreak' }
 * Parts: [Content_Types].xml, _rels/.rels, word/document.xml, word/_rels/document.xml.rels, word/styles.xml,
 * docProps/core.xml and docProps/app.xml. Read it back with shared/office/zip.js (readZip, readText). */
import { writeZip } from './zip.js';
import { x, doc, xmlns, NS } from './xml.js';

const PAGE = {
  a4: { w: 11906, h: 16838 },
  letter: { w: 12240, h: 15840 },
};
const MARGIN = 1440; // 1 inch in twips
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Runs as an array of { text, bold, italic, underline }. */
function runsOf(b) {
  const src = b.runs ?? b.text ?? '';
  const list = typeof src === 'string' ? [{ text: src }] : src;
  return list.map((r) => (typeof r === 'string' ? { text: r } : r));
}
/** One run: "\n" becomes a line break and "\t" a tab, as Word stores them (not as raw characters in w:t). */
function runXml(r) {
  const props = [r.bold && '<w:b/>', r.italic && '<w:i/>', r.underline && '<w:u w:val="single"/>'].filter(Boolean);
  const pieces = String(r.text ?? '').split('\n').map((line, i) => (i ? '<w:br/>' : '') + line.split('\t').map((t, j) =>
    (j ? '<w:tab/>' : '') + (t ? x('w:t', { 'xml:space': 'preserve' }, t) : '')).join(''));
  return x('w:r', null, [props.length ? x('w:rPr', null, props) : '', pieces]);
}
/** A paragraph from runs. ppr is a list of pPr children (raw XML). */
function para(runs, ppr = []) {
  return x('w:p', null, [ppr.length ? x('w:pPr', null, ppr) : '', runs.map(runXml)]);
}

function blockXml(b, textWidth) {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, b.level | 0 || 1));
      return para(runsOf(b), [`<w:pStyle w:val="Heading${level}"/>`]);
    }
    case 'paragraph':
      return para(runsOf(b), b.align && b.align !== 'left' ? [x('w:jc', { 'w:val': b.align })] : []);
    case 'item': {
      const marker = b.marker ?? '•';
      const ppr = [x('w:ind', { 'w:left': 360, 'w:hanging': 360 })];
      return para([{ text: marker + '\t' }, ...runsOf(b)], ppr);
    }
    case 'pagebreak':
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    case 'table':
      return tableXml(b, textWidth);
    default:
      throw new Error('docx: unknown block type ' + b.type);
  }
}

function tableXml(b, textWidth) {
  const rows = (b.rows || []).map((r) => (Array.isArray(r) ? r : [r]));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const cw = Math.floor(textWidth / cols);
  const border = (side) => x('w:' + side, { 'w:val': 'single', 'w:sz': 4, 'w:space': 0, 'w:color': '808080' });
  const borders = x('w:tblBorders', null, ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border));
  const grid = x('w:tblGrid', null, Array.from({ length: cols }, () => x('w:gridCol', { 'w:w': cw })));
  const trs = rows.map((cells, ri) => {
    const head = ri === 0 && b.header !== false;
    const tcs = Array.from({ length: cols }, (_, ci) => {
      const c = cells[ci] ?? '';
      const runs = runsOf({ text: c }).map((r) => (head ? { ...r, bold: true } : r));
      return x('w:tc', null, [x('w:tcPr', null, [x('w:tcW', { 'w:w': cw, 'w:type': 'dxa' })]), para(runs)]);
    });
    return x('w:tr', null, [head ? x('w:trPr', null, [x('w:tblHeader')]) : '', tcs]);
  });
  const tblPr = x('w:tblPr', null, [
    x('w:tblW', { 'w:w': cols * cw, 'w:type': 'dxa' }), borders, x('w:tblLayout', { 'w:type': 'fixed' }),
    x('w:tblCellMar', null, [x('w:left', { 'w:w': 80, 'w:type': 'dxa' }), x('w:right', { 'w:w': 80, 'w:type': 'dxa' })]),
  ]);
  return x('w:tbl', null, [tblPr, grid, trs]);
}

const STYLES = doc(x('w:styles', xmlns('w'), [
  x('w:docDefaults', null, [
    x('w:rPrDefault', null, [x('w:rPr', null, [x('w:rFonts', { 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'Microsoft YaHei', 'w:cs': 'Calibri' }), x('w:sz', { 'w:val': 22 }), x('w:szCs', { 'w:val': 22 }), x('w:lang', { 'w:val': 'en-US', 'w:eastAsia': 'zh-CN' })])]),
    x('w:pPrDefault', null, [x('w:pPr', null, [x('w:spacing', { 'w:after': 120, 'w:line': 276, 'w:lineRule': 'auto' })])]),
  ]),
  x('w:style', { 'w:type': 'paragraph', 'w:default': 1, 'w:styleId': 'Normal' }, [x('w:name', { 'w:val': 'Normal' }), x('w:qFormat')]),
  ...[[1, 32, 360, 0], [2, 28, 240, 1], [3, 24, 200, 2]].map(([n, sz, before, lvl]) =>
    x('w:style', { 'w:type': 'paragraph', 'w:styleId': `Heading${n}` }, [
      x('w:name', { 'w:val': `heading ${n}` }), x('w:basedOn', { 'w:val': 'Normal' }), x('w:next', { 'w:val': 'Normal' }), x('w:uiPriority', { 'w:val': 9 }), x('w:qFormat'),
      x('w:pPr', null, [x('w:keepNext'), x('w:keepLines'), x('w:spacing', { 'w:before': before, 'w:after': 120 }), x('w:outlineLvl', { 'w:val': lvl })]),
      x('w:rPr', null, [x('w:b'), x('w:color', { 'w:val': '1F2A44' }), x('w:sz', { 'w:val': sz }), x('w:szCs', { 'w:val': sz })]),
    ])),
]));

const CONTENT_TYPES = doc(x('Types', { xmlns: NS.ct }, [
  x('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
  x('Default', { Extension: 'xml', ContentType: 'application/xml' }),
  x('Override', { PartName: '/word/document.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' }),
  x('Override', { PartName: '/word/styles.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' }),
  x('Override', { PartName: '/docProps/core.xml', ContentType: 'application/vnd.openxmlformats-package.core-properties+xml' }),
  x('Override', { PartName: '/docProps/app.xml', ContentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml' }),
]));
const ROOT_RELS = doc(x('Relationships', { xmlns: NS.rel }, [
  x('Relationship', { Id: 'rId1', Type: REL + '/officeDocument', Target: 'word/document.xml' }),
  x('Relationship', { Id: 'rId2', Type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', Target: 'docProps/core.xml' }),
  x('Relationship', { Id: 'rId3', Type: REL + '/extended-properties', Target: 'docProps/app.xml' }),
]));
const DOC_RELS = doc(x('Relationships', { xmlns: NS.rel }, [
  x('Relationship', { Id: 'rId1', Type: REL + '/styles', Target: 'styles.xml' }),
]));

/** The parts of a .docx for the blocks. Returns [{ path, data }] with string data, ready for writeZip. */
export function docxEntries(blocks, { pageSize = 'a4', title = '', creator = 'Slopographic' } = {}) {
  const page = PAGE[pageSize];
  if (!page) throw new Error('docx: unknown page size ' + pageSize);
  const textWidth = page.w - 2 * MARGIN;
  const sect = x('w:sectPr', null, [
    x('w:pgSz', { 'w:w': page.w, 'w:h': page.h }),
    x('w:pgMar', { 'w:top': MARGIN, 'w:right': MARGIN, 'w:bottom': MARGIN, 'w:left': MARGIN, 'w:header': 708, 'w:footer': 708, 'w:gutter': 0 }),
  ]);
  const body = (blocks || []).map((b) => blockXml(b, textWidth));
  const documentXml = doc(x('w:document', xmlns('w', 'r'), [x('w:body', null, [body, sect])]));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core = doc(x('cp:coreProperties', xmlns('cp', 'dc', 'dcterms', 'xsi'), [
    x('dc:title', null, title), x('dc:creator', null, creator),
    x('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }, now), x('dcterms:modified', { 'xsi:type': 'dcterms:W3CDTF' }, now),
  ]));
  const app = doc(x('Properties', { xmlns: NS.ep }, [x('Application', null, 'Slop Office')]));
  return [
    { path: '[Content_Types].xml', data: CONTENT_TYPES },
    { path: '_rels/.rels', data: ROOT_RELS },
    { path: 'word/document.xml', data: documentXml },
    { path: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { path: 'word/styles.xml', data: STYLES },
    { path: 'docProps/core.xml', data: core },
    { path: 'docProps/app.xml', data: app },
  ];
}

/** A .docx Blob for the blocks (see the header for the block shapes). */
export async function docxBlob(blocks, opts = {}) {
  return writeZip(docxEntries(blocks, opts));
}
