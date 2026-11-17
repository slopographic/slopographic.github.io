/* Slop OCR: the outputs. Each takes pages: [{ text, lines, w, h, image? }] where text is what the person sees in the
 * panel (edits included), lines are the OCR lines with boxes, and image is a JPEG of the page (searchable PDF only).
 *   plainText(pages) → string          pages joined by a blank line
 *   markdownText(pages) → string       paragraphs, a hard break inside a paragraph, a rule between pages
 *   docxFile(pages, { title }) → Blob  Word: one paragraph per block, lines in it, a page break between pages
 *   searchablePdf(pages, { title, onProgress }) → Blob   the picture of each page with an invisible text layer
 *   jpegBytes(canvas) → Promise<Uint8Array>
 *   saveBlob(name, blob), copyText(text) → Promise<boolean> */
import { docxBlob } from '../../shared/office/docx.js';
import { paragraphsOf, pairBoxes } from './layout.js';
import { drawTextLayer } from '../../shared/ocr/text-layer.js';

const DPI = 200;
const PDF_LIB = new URL('../../vendor/pdf-lib/pdf-lib.min.js', import.meta.url).href;

export function plainText(pages) {
  return pages.map((p) => paragraphsOf(p.text).join('\n\n')).join('\n\n') + '\n';
}

/** Escapes what Markdown would read as formatting, and a leading list, heading or quote marker. */
export function mdLine(line) {
  const s = line.replace(/[\\`*_[\]<>|]/g, '\\$&');
  return s
    .replace(/^(\s*)(#{1,6}|[+\-*>])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3');
}

export function markdownText(pages) {
  const body = pages.map((p) => paragraphsOf(p.text).map((par) => par.split('\n').map(mdLine).join('  \n')).join('\n\n'));
  return body.join('\n\n---\n\n') + '\n';
}

export function docxFile(pages, { title = '' } = {}) {
  const blocks = [];
  pages.forEach((p, i) => {
    if (i) blocks.push({ type: 'pagebreak' });
    const paras = paragraphsOf(p.text);
    if (!paras.length) blocks.push({ type: 'paragraph', text: '' });
    for (const par of paras) blocks.push({ type: 'paragraph', text: par });
  });
  return docxBlob(blocks, { title, pageSize: 'a4' });
}

let pdfLibP = null;
/** pdf-lib is a classic script (window.PDFLib). It loads only when a searchable PDF is made. */
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!pdfLibP) {
    pdfLibP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib did not start')));
      s.onerror = () => { pdfLibP = null; reject(new Error('pdf-lib could not be loaded')); };
      document.head.append(s);
    });
  }
  return pdfLibP;
}

export async function searchablePdf(pages, { title = '', onProgress } = {}) {
  const L = await loadPdfLib();
  const pdf = await L.PDFDocument.create();
  pdf.setTitle(title || 'Slop OCR');
  pdf.setProducer('Slop OCR');
  const font = await pdf.embedFont(L.StandardFonts.Helvetica);
  const k = 72 / DPI;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (onProgress) onProgress(i, pages.length);
    const W = p.w * k, H = p.h * k;
    const page = pdf.addPage([W, H]);
    page.drawImage(await pdf.embedJpg(p.image), { x: 0, y: 0, width: W, height: H });
    drawTextLayer(page, font, pairBoxes(p.text, p.lines || []), { k, x: 0, top: H });
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

/** A JPEG of a canvas, for the searchable PDF's picture layer. */
export function jpegBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))) : reject(new Error('The page could not be encoded'))), 'image/jpeg', 0.92);
  });
}

export function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}
