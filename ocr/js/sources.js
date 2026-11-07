/* Slop OCR: opens files as pages and renders a page to a canvas at 200 dpi.
 * An image is one page. A PDF gives one page per PDF page, drawn with the vendored pdf.js (vendor/pdfjs), the same
 * build Slop PDF uses. A page longer than 8000 px is drawn at a smaller scale so the canvas stays within memory.
 * Nothing is uploaded: the file is read here. Exposes isSupported, openFile(file) → pages, renderPage(page) → canvas. */

export const DPI = 200;
const SCALE = DPI / 72;
const MAX_SIDE = 8000;
const PDFJS = new URL('../../vendor/pdfjs/', import.meta.url).href;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i;

let pdfjsP = null;
const docs = new Map();

export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isSupported = (f) => isPdf(f) || /^image\//.test(f.type) || (!f.type && IMAGE_EXT.test(f.name));

function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = import(new URL('../../shared/compat/pdfjs.js', PDFJS).href).then((m) => m.loadPdfjs(PDFJS)).catch((e) => { pdfjsP = null; throw e; });
  }
  return pdfjsP;
}

/** Opens a PDF once per file. The bytes go to pdf.js; CJK and standard fonts come from vendor/pdfjs. */
function pdfOf(file) {
  if (!docs.has(file)) {
    docs.set(file, (async () => {
      const lib = await pdfjs();
      const data = new Uint8Array(await file.arrayBuffer());
      return lib.getDocument({
        data, verbosity: 0, isEvalSupported: false, useSystemFonts: true,
        cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/',
      }).promise;
    })().catch((e) => { docs.delete(file); throw e; }));
  }
  return docs.get(file);
}

/** The scale for a PDF page: 200 dpi, or less for a very large page. vp1 is the page at scale 1. */
function scaleFor(vp1) {
  return Math.min(SCALE, MAX_SIDE / Math.max(vp1.width, vp1.height));
}
const dimsOf = (vp) => ({ w: Math.max(1, Math.round(vp.width)), h: Math.max(1, Math.round(vp.height)) });

function friendly(e, name) {
  if (e && e.name === 'PasswordException') return `${name} is locked with a password, so it cannot be read.`;
  if (e && e.name === 'InvalidPDFException') return `${name} is not a valid PDF.`;
  return `${name} could not be opened${e && e.message ? ': ' + e.message : '.'}`;
}

/** The pages of one file: [{ label, kind, file, n, w, h }]. Throws with a plain reason. */
export async function openFile(file) {
  try {
    if (isPdf(file)) {
      const doc = await pdfOf(file);
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const vp1 = (await doc.getPage(n)).getViewport({ scale: 1 }), s = scaleFor(vp1);
        const { w, h } = dimsOf({ width: vp1.width * s, height: vp1.height * s });
        const label = doc.numPages > 1 ? `${file.name}, page ${n} of ${doc.numPages}` : file.name;
        pages.push({ label, kind: 'pdf', file, n, w, h });
      }
      return pages;
    }
    const bitmap = await createImageBitmap(file);
    const page = { label: file.name, kind: 'image', file, n: 1, w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return [page];
  } catch (e) {
    throw new Error(friendly(e, file.name));
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Draws one page to a white canvas of the page's size (a scan may have transparency; OCR and the PDF want white). */
export async function renderPage(p) {
  if (p.kind === 'image') {
    const bitmap = await createImageBitmap(p.file);
    const c = canvas(p.w, p.h), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    return c;
  }
  const doc = await pdfOf(p.file);
  const page = await doc.getPage(p.n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: scaleFor(vp1) });
  const c = canvas(Math.max(1, Math.round(vp.width)), Math.max(1, Math.round(vp.height))), g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return c;
}
