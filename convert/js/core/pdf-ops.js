/* PDF merge, page extraction and split, with pdf-lib. Pure bytes in, bytes out. */
import { loadPdfLib } from './lib.js';
import { parseRange } from './range.js';
import { tr } from './i18n.js';

const SAVE = { useObjectStreams: false };

async function open(bytes) {
  const { PDFDocument } = await loadPdfLib();
  try {
    return { PDFDocument, src: await PDFDocument.load(bytes, { updateMetadata: false }) };
  } catch (e) {
    if (/encrypt/i.test(String(e && e.name)) || /encrypt/i.test(String(e && e.message))) throw new Error(tr('convert.pdf.encrypted'));
    throw new Error(tr('convert.pdf.not_valid'));
  }
}

/** Concatenate PDFs in the order given. */
export async function mergePdfs(list) {
  if (!list.length) throw new Error(tr('convert.pdf.add_one'));
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const { src } = await open(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save(SAVE);
}

/** One PDF holding the pages in spec (1-based ranges, e.g. "2-4, 9"). */
export async function extractPages(bytes, spec) {
  const { PDFDocument, src } = await open(bytes);
  const idx = parseRange(spec, src.getPageCount()).map((p) => p - 1);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, idx);
  for (const p of pages) out.addPage(p);
  return out.save(SAVE);
}

/** Splits into one PDF per page of spec (every page when spec is blank). Returns [{ pageNo, bytes }]. */
export async function splitPages(bytes, spec = '') {
  const { PDFDocument, src } = await open(bytes);
  const list = parseRange(spec, src.getPageCount());
  const parts = [];
  for (const n of list) {
    const out = await PDFDocument.create();
    const [p] = await out.copyPages(src, [n - 1]);
    out.addPage(p);
    parts.push({ pageNo: n, bytes: await out.save(SAVE) });
  }
  return parts;
}
