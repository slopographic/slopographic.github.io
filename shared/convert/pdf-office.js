/* PDF to Word (DOCX) and PDF to Excel (XLSX). Text-based: the text layer is read in reading order (pdf-layout.js), so text,
 * paragraphs and tables that are aligned in columns survive; images, vector drawings, colours and fonts do not. A page with
 * no text layer is marked, not guessed. pdfToDocx(bytes, { pages, title }) and pdfToXlsx(bytes, { pages }) → Blob.
 * Browser only. Classic ES module. */
import { docxBlob } from '../office/docx.js';
import { rowsToXlsx } from '../../convert/js/core/xlsx.js';
import { readPages, blocksOf, gridOf } from './pdf-layout.js';

export const NO_TEXT = 'This page has no text layer, so it is an image (a scan or a picture). Export it as PNG or JPG, or run OCR first, to keep its content.';
const LETTER = 8.5 / 11, A4 = 210 / 297;

/** Word page size for the page's shape: Letter or A4, whichever is closer. */
export function docxSize(w, h) {
  if (!w || !h) return 'a4';
  const r = Math.min(w, h) / Math.max(w, h);
  return Math.abs(r - LETTER) < Math.abs(r - A4) ? 'letter' : 'a4';
}

/** Blocks for the Word writer (shared/office/docx.js): paragraphs, tables, a page break between pages. */
export function docBlocks(pages) {
  const blocks = [];
  pages.forEach((pg, k) => {
    if (k) blocks.push({ type: 'pagebreak' });
    if (!pg.lines.length) { blocks.push({ type: 'paragraph', runs: [{ text: NO_TEXT, italic: true }] }); return; }
    for (const b of blocksOf(pg.lines)) {
      blocks.push(b.type === 'para' ? { type: 'paragraph', text: b.text } : { type: 'table', rows: b.rows, header: false });
    }
  });
  return blocks;
}

export async function pdfToDocx(bytes, { pages = '', title = '' } = {}) {
  const list = await readPages(bytes, pages);
  const first = list[0] || {};
  return docxBlob(docBlocks(list), { pageSize: docxSize(first.w, first.h), title });
}

/** One sheet: each page starts with a "Page n" row, its lines in columns, a blank row between pages. */
export async function pdfToXlsx(bytes, { pages = '' } = {}) {
  const list = await readPages(bytes, pages), rows = [];
  list.forEach((pg, k) => {
    if (k) rows.push([]);
    rows.push(['Page ' + pg.pageNo]);
    if (!pg.lines.length) rows.push([NO_TEXT]);
    else rows.push(...gridOf(pg.lines));
  });
  return rowsToXlsx(rows);
}
