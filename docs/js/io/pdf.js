/* Slop Docs — io/pdf: the PDF of a document, drawn from its layout (layout/index.js layoutDoc): the same pages, line
 * breaks, page breaks, margins, headers, footers, lists, tables, shading, rules and images the screen shows, because they
 * are the same items. Text is real text (pdf-text.js): subsets of the exact faces used are embedded (the document's
 * TrueType faces, a font the person added, and the Noto language faces for other writing systems), so it can be
 * selected and searched. Headings become bookmarks and links stay links (pdf-nav.js). Uses the vendored pdf-lib and
 * fontkit (io/vendor.js).
 *   exportPdf(doc, layout, { title, author }) → Promise<Uint8Array> */
import { pdfLib, fontkit } from './vendor.js';
import { fragRuns } from '../layout/runs.js';
import { drawLine, rgbOf } from './pdf-text.js';
import { addLinks, addOutline } from './pdf-nav.js';

/** Every face a run of the layout is set in. */
function facesOf(layout) {
  const out = new Map();
  for (const pg of layout.pages) for (const it of pg.items) {
    if (it.kind !== 'line') continue;
    for (const f of it.line.frags) for (const r of fragRuns(f)) if (r.face && !out.has(r.face.key)) out.set(r.face.key, r.face);
  }
  return out;
}

/** An image source as bytes pdf-lib can embed: PNG and JPEG as they are, anything else through a canvas as PNG. */
async function imageOf(pdf, src) {
  const m = /^data:image\/([a-z+]+);base64,/i.exec(src || '');
  if (!m) return null;
  const bin = atob(src.slice(m[0].length)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const t = m[1].toLowerCase();
  if (t === 'png') return pdf.embedPng(u8);
  if (t === 'jpeg' || t === 'jpg') return pdf.embedJpg(u8);
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const png = await new Promise((res) => c.toBlob(res, 'image/png'));
  return pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
}

export async function exportPdf(doc, layout, { title = '', author = '' } = {}) {
  const [PL, fk] = await Promise.all([pdfLib(), fontkit()]);
  const pdf = await PL.PDFDocument.create();
  pdf.registerFontkit(fk);
  pdf.setTitle(title || 'Untitled document', { showInWindowTitleBar: true });
  if (author) pdf.setAuthor(author);
  pdf.setCreator('Slop Docs');
  pdf.setProducer('Slop Docs');
  pdf.setLanguage((globalThis.navigator && navigator.language) || 'en');
  const now = new Date();
  pdf.setCreationDate(doc.meta && doc.meta.created ? new Date(doc.meta.created) : now);
  pdf.setModificationDate(now);

  const pfonts = new Map();
  for (const [key, face] of facesOf(layout)) pfonts.set(key, await globalThis.SlopPdfRuns.embed(pdf, face.bytes)); // a CFF-safe subset (shared/fonts/pdf-runs.js)
  const ctx = { PL, links: [], font: (face) => pfonts.get(face.key) };
  const images = new Map();
  const pages = [], pageLinks = [];
  for (const pg of layout.pages) {
    const page = pdf.addPage([pg.w, pg.h]), H = pg.h;
    pages.push(page);
    ctx.links = [];
    for (const it of pg.items) {
      if (it.kind === 'line') drawLine(ctx, page, it, H);
      else if (it.kind === 'rect') page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, color: rgbOf(it.fill, PL) });
      else if (it.kind === 'rule') {
        const x = Math.min(it.x1, it.x2), y = Math.min(it.y1, it.y2), w = Math.max(Math.abs(it.x2 - it.x1), it.w), h = Math.max(Math.abs(it.y2 - it.y1), it.w);
        page.drawRectangle({ x, y: H - y - h, width: w, height: h, color: rgbOf(it.color || '#000000', PL) });
      } else if (it.kind === 'img') {
        if (!images.has(it.src)) images.set(it.src, await imageOf(pdf, it.src).catch(() => null));
        const img = images.get(it.src);
        if (img) page.drawImage(img, { x: it.x, y: H - it.y - it.h, width: it.w, height: it.h });
      }
    }
    pageLinks.push(ctx.links);
  }
  // a heading's place, for internal links and bookmarks
  const where = new Map(layout.headings.map((h) => [h.pid, h]));
  const destOf = (pid) => { const h = where.get(pid); return h && pages[h.page] ? [pages[h.page].ref, layout.pages[h.page].h - h.y] : null; };
  pages.forEach((p, i) => addLinks(PL, pdf, p, pageLinks[i], destOf));
  addOutline(PL, pdf, layout.headings, destOf);
  return pdf.save({ useObjectStreams: true });
}
