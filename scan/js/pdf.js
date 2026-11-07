/* Slop Scan: the PDF. ES module, imported on first use (js/io.js). pdf-lib (vendor/pdf-lib, the library Slop PDF ships)
 * is loaded then too. Each page: its flat picture at full size, JPEG at the chosen quality (PNG for black and white, so
 * the letters stay sharp), placed on its page by core/page.js (Auto, A4 or Letter, the margins). With OCR on, the words
 * read on each page are laid over it as invisible text (shared/ocr/text-layer.js, the same as Slop OCR's searchable PDF).
 *   build(pages, doc, { render(page) → canvas, ocr: { read(canvas) → lines } | null, onProgress(i, n, step) }) → Blob */
import { drawTextLayer } from '../../shared/ocr/text-layer.js';

const PDF_LIB = 'vendor/pdf-lib/pdf-lib.min.js';
const encode = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('The page could not be encoded'))), type, q));

async function lib() {
  if (!globalThis.PDFLib) await globalThis.SlopLoad.script(PDF_LIB);
  return globalThis.PDFLib;
}

export async function build(pages, doc, o = {}) {
  const L = await lib(), P = globalThis.SlopScan.page, step = o.onProgress || (() => {});
  const pdf = await L.PDFDocument.create();
  pdf.setTitle(P.fileName(doc.name).replace(/\.pdf$/, ''));
  pdf.setProducer('Slop Scan'); pdf.setCreator('Slop Scan');   // i18n-ignore: the app's name in the file's properties
  const font = o.ocr ? await pdf.embedFont(L.StandardFonts.Helvetica) : null;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    step(i, pages.length, 'page');
    const c = o.render(p), bw = p.style === 'bw';
    const img = bw ? await pdf.embedPng(await encode(c, 'image/png')) : await pdf.embedJpg(await encode(c, 'image/jpeg', doc.quality));
    const box = P.layout(c.width, c.height, { size: doc.size, margin: doc.margin });
    const page = pdf.addPage([box.pageW, box.pageH]);
    page.drawImage(img, { x: box.x, y: box.y, width: box.width, height: box.height });
    if (o.ocr) {
      step(i, pages.length, 'ocr');
      const lines = await o.ocr.read(c);
      drawTextLayer(page, font, lines, { k: box.width / c.width, x: box.x, top: box.y + box.height });
    }
  }
  step(pages.length, pages.length, 'save');
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
