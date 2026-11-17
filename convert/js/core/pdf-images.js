/* Images into one PDF with pdf-lib. Page size A4, Letter or fit-to-image; the image is centred and
 * scaled to the printable area. Object streams are off so the file is readable by old PDF tools. */
import { loadPdfLib } from './lib.js';
import { tr } from './i18n.js';

export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const PX_TO_PT = 0.75; // 96 px per inch, 72 pt per inch

/**
 * items: [{ bytes: Uint8Array, mime: 'image/jpeg' | 'image/png', width, height }] (pixels).
 * opts: { page: 'a4' | 'letter' | 'fit', margin: points }.
 * Returns Uint8Array of the PDF.
 */
export async function imagesToPdf(items, { page = 'a4', margin = 36 } = {}) {
  if (!items.length) throw new Error(tr('convert.pdf.add_image'));
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.setProducer('File convert'); // i18n-ignore: PDF metadata
  doc.setCreator('File convert'); // i18n-ignore: PDF metadata
  for (const it of items) {
    const img = it.mime === 'image/png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
    const m = Math.max(0, Number(margin) || 0);
    const natW = it.width * PX_TO_PT, natH = it.height * PX_TO_PT;
    let pw, ph;
    if (page === 'fit') { pw = natW + 2 * m; ph = natH + 2 * m; }
    else [pw, ph] = PAGE_SIZES[page] || PAGE_SIZES.a4;
    const pg = doc.addPage([pw, ph]);
    const k = Math.min((pw - 2 * m) / natW, (ph - 2 * m) / natH);
    const dw = natW * k, dh = natH * k;
    pg.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
  }
  return doc.save({ useObjectStreams: false });
}
