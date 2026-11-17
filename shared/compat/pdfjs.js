/* The one way to load the vendored pdf.js (vendor/pdfjs, an ES module): the stream fill first (shared/compat/stream.js,
 * which pdf.js's getTextContent needs on Safari), then the library, with its worker beside it.
 *   import(new URL('../../shared/compat/pdfjs.js', base).href).then((m) => m.loadPdfjs(base))
 * base: the vendor/pdfjs/ folder URL (each caller knows it relative to itself); default: the one next to this file. */
import './stream.js';

export const PDFJS_BASE = new URL('../../vendor/pdfjs/', import.meta.url).href;

/** Resolves the pdf.js module, its workerSrc set (unless a caller set one already). */
export async function loadPdfjs(base = PDFJS_BASE) {
  const lib = await import(base + 'pdf.min.js');
  if (!lib.GlobalWorkerOptions.workerSrc && !lib.GlobalWorkerOptions.workerPort) lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return lib;
}
