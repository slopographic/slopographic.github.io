/* Loaders for the vendored libraries. pdf-lib is a UMD build (global PDFLib); pdf.js is an ES module.
 * Paths are resolved from this file, so the same code works from the hub and from every converter page. */
import { tr } from './i18n.js';

const VENDOR = new URL('../../../vendor/', import.meta.url);
export const PDFJS_BASE = new URL('pdfjs/', VENDOR).href;   // loaded through shared/compat/pdfjs.js (convert/js/core/pdf-raster.js)
export const PDFJS_CMAP_URL = new URL('pdfjs/cmaps/', VENDOR).href;
const PDF_LIB_URL = new URL('pdf-lib/pdf-lib.min.js', VENDOR).href;

let pdfLibPending = null;
/** Resolves the pdf-lib namespace, injecting its script tag once. */
export function loadPdfLib() {
  if (globalThis.PDFLib) return Promise.resolve(globalThis.PDFLib);
  if (!pdfLibPending) {
    pdfLibPending = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDF_LIB_URL;
      s.onload = () => (globalThis.PDFLib ? resolve(globalThis.PDFLib) : reject(new Error('pdf-lib did not load')));
      s.onerror = () => { pdfLibPending = null; reject(new Error(tr('convert.chain.pdf_lib'))); };
      document.head.append(s);
    });
  }
  return pdfLibPending;
}
