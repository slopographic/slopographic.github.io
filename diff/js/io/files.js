/* Slop Compare: the one comparison of two sides, for the page, its commands and the Workflows step (shared/ops/diff.js).
 * A side is { name, type, file?, text? }: a file from the intake, or text typed or pasted in the box. Browser only (pictures
 * and PDFs are drawn on canvases).
 *   sideKind(side) → kind.js kindOf for a file; a typed text that parses as a JSON object or list is 'json', else 'text'
 *   compareSides(a, b, rawOptions) → result: { kind, opts, nameA, nameB, view?, text?, json?, csv?, image?, pdf? }
 *     image: { w, h, count, ratio, boxes, note, canvas: { a, b, diff } }
 *     pdf: { pagesA, pagesB, pages: { a, b } (page of each line), visual: [{ page, count, ratio, boxes, canvas, missing }] }
 *   withUrls(result) → the result with image.urls and each visual page's url (PNG data: URLs), for the report
 *   MAX_VISUAL_PAGES: pages compared as pictures (the text is compared on every page) */
import { kindOf, modeOf } from '../core/kind.js';
import { compareTexts, options } from '../core/compare.js';
import { diffLines } from '../core/text.js';
import { pixelDiff, paint, fit } from '../core/image.js';
import { tr } from '../ui/i18n.js';

export const MAX_VISUAL_PAGES = 40;
const NOUN = { pdf: 'a PDF', image: 'a picture', text: 'a text', json: 'a JSON file', csv: 'a CSV file' };
const noun = (k) => tr(`diff.noun.${k}`, NOUN[k]);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function sideKind(s) {
  if (s.file) return kindOf(s.name || s.file.name, s.type || s.file.type);
  const t = String(s.text || '').trim();
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (e) { /* plain text */ } }
  return s.name ? kindOf(s.name, '') || 'text' : 'text';
}
const textOf = async (s) => (s.text != null ? String(s.text) : s.file ? s.file.text() : '');

export async function compareSides(a, b, raw = {}) {
  const opts = options(raw), kA = sideKind(a), kB = sideKind(b);
  const mode = modeOf(kA, kB, opts.mode);
  const names = { nameA: a.name || 'A', nameB: b.name || 'B' };
  if (!mode) throw new Error(!kA || !kB ? tr('diff.err.unreadable', `${!kA ? names.nameA : names.nameB} is not a text, PDF or picture Slop Compare can read.`, { name: !kA ? names.nameA : names.nameB })
    : cap(tr('diff.err.mismatch', `${cap(NOUN[kA])} and ${NOUN[kB]} cannot be compared. Compare two texts, two PDFs or two pictures.`, { a: noun(kA), b: noun(kB) })));
  if (mode === 'image') return { kind: 'image', opts, ...names, image: await images(a.file, b.file, opts) };
  if (mode === 'pdf') { const pdf = await pdfs(a.file, b.file, opts); return { kind: 'pdf', opts, ...names, view: opts.pdfView, pdf, text: pdf.text }; }
  return { ...compareTexts(await textOf(a), await textOf(b), mode, opts), ...names };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function bitmap(file) {
  try { return await createImageBitmap(file); } catch (e) { throw new Error(tr('diff.err.picture', `${file.name} could not be read as a picture.`, { name: file.name })); }
}

/** Two drawings of the same size → the mask, the boxes and the difference picture. */
function pair(ca, cb, w, h, opts) {
  const ga = ca.getContext('2d', { willReadFrequently: true }), gb = cb.getContext('2d', { willReadFrequently: true });
  const da = ga.getImageData(0, 0, w, h).data, db = gb.getImageData(0, 0, w, h).data;
  const r = pixelDiff(da, db, w, h, { threshold: opts.threshold / 100 });
  const cd = canvas(w, h), gd = cd.getContext('2d'), img = gd.createImageData(w, h);
  paint(img.data, da, r.mask, w, h);
  gd.putImageData(img, 0, 0);
  return { count: r.count, ratio: r.ratio, boxes: r.boxes, canvas: { a: ca, b: cb, diff: cd } };
}

async function images(fa, fb, opts) {
  const [ba, bb] = await Promise.all([bitmap(fa), bitmap(fb)]);
  const f = fit(ba.width, ba.height, bb.width, bb.height);
  const ca = canvas(f.w, f.h), cb = canvas(f.w, f.h);
  ca.getContext('2d').drawImage(ba, 0, 0, f.w, f.h);
  cb.getContext('2d').drawImage(bb, 0, 0, f.w, f.h);
  const size = [ba.width, ba.height, bb.width, bb.height];
  ba.close(); bb.close();
  return { w: f.w, h: f.h, note: f.note, size, ...pair(ca, cb, f.w, f.h, opts) };
}

async function pdfs(fa, fb, opts) {
  const P = await import('./pdf.js');
  const [da, db] = await Promise.all([fa, fb].map(async (f) => P.openPdf(new Uint8Array(await f.arrayBuffer()))));
  try {
    const [ta, tb] = await Promise.all([P.pdfText(da), P.pdfText(db)]);
    const text = diffLines(ta.lines.join('\n'), tb.lines.join('\n'), { ignoreWs: opts.ignoreWs, ignoreCase: opts.ignoreCase });
    const out = { pagesA: ta.count, pagesB: tb.count, pages: { a: ta.pages, b: tb.pages }, text, visual: [] };
    if (opts.pdfView === 'visual') {
      const n = Math.min(MAX_VISUAL_PAGES, Math.max(ta.count, tb.count));
      for (let p = 1; p <= n; p++) {
        const ca = await P.renderPage(da, p, 900), cb = await P.renderPage(db, p, 900);
        if (!ca || !cb) { const only = ca || cb; out.visual.push({ page: p, count: 1, ratio: 1, boxes: [{ x: 0, y: 0, w: only.width, h: only.height, pixels: 1 }], canvas: { a: ca, b: cb, diff: only }, missing: ca ? 'A' : 'B' }); continue; }
        const h = ca.height, cbb = canvas(ca.width, h);
        cbb.getContext('2d').drawImage(cb, 0, 0, ca.width, h);
        out.visual.push({ page: p, ...pair(ca, cbb, ca.width, h, opts) });
      }
      out.more = Math.max(ta.count, tb.count) > n;
    }
    return out;
  } finally { da.destroy(); db.destroy(); }
}

const url = (c) => (c ? c.toDataURL('image/png') : '');
export function withUrls(r) {
  if (r.kind === 'image') return { ...r, image: { ...r.image, urls: { a: url(r.image.canvas.a), b: url(r.image.canvas.b), diff: url(r.image.canvas.diff) } } };
  if (r.kind === 'pdf' && r.pdf.visual.length) return { ...r, pdf: { ...r.pdf, visual: r.pdf.visual.map((p) => ({ ...p, url: p.count ? url(p.canvas.diff) : '' })) } };
  return r;
}
