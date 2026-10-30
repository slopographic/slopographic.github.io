/* Slop Compare: reading two PDFs with pdf.js (convert/js/core/pdf-raster.js openPdf, the vendored build). Browser only.
 *   pdfText(doc) → { lines: [text], pages: [page of each line], count }   every page's text as lines, in reading order
 *   renderPage(doc, n, width) → a canvas of page n (1-based) drawn `width` px wide on white, or null past the last page */
import { openPdf } from '../../../convert/js/core/pdf-raster.js';
import { linesOf } from '../core/pdftext.js';

export { openPdf };

export async function pdfText(doc) {
  const lines = [], pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    for (const l of linesOf(tc.items)) { lines.push(l); pages.push(n); }
    page.cleanup();
  }
  return { lines, pages, count: doc.numPages };
}

export async function renderPage(doc, n, width = 900) {
  if (n < 1 || n > doc.numPages) return null;
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const c = document.createElement('canvas');
  c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport }).promise;
  page.cleanup();
  return c;
}
