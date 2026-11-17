/* PDF to HTML: one self-contained HTML file. Each page is a box of its size (1 point = 1 px). Its text is absolutely
 * positioned where pdf.js reports it, in reading order (the order the PDF draws it), and its images are embedded as JPEG
 * data URLs placed by their matrix. No network, no external fonts, no script. A close copy: vector drawing, colours and the
 * shapes of the fonts are not carried over. Browser only. pdfToHtml(bytes, { pages, title }) → string. */
import { openPdf, pdfjs } from './pdf-raster.js';
import { parseRange } from './range.js';
import { pageDrawing, mul } from './pdf-html-ops.js';

const BASE = 0.845;   // the baseline sits at 84.5% of a line box one em tall (true for Helvetica/Arial and Times metrics)
const SANS = 'Helvetica, Arial, sans-serif', SERIF = '"Times New Roman", Times, serif';
const SERIF_RE = /times|georgia|garamond|roman|serif|minion|cambria|palatino|bodoni|caslon|book/i;
const SANS_RE = /sans|arial|helvetica|verdana|calibri|gothic/i;
const BOLD_RE = /bold|black|heavy|semibold|demi/i;
const ITALIC_RE = /italic|oblique/i;
let measurer = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f = (v) => (Math.round(v * 100) / 100).toString();

/** The nearest standard face for a PDF font: serif or sans, bold and italic when its name says so. */
function faceOf(style, name) {
  const s = `${(style && style.fontFamily) || ''} ${name || ''}`;
  const serif = SERIF_RE.test(s) && !SANS_RE.test(s);
  const bold = BOLD_RE.test(s), italic = ITALIC_RE.test(s);
  return { cls: serif ? 'r' : 's', family: serif ? SERIF : SANS, weight: bold ? 700 : 400, style: italic ? 'italic' : 'normal', bold, italic };
}

/** The horizontal squeeze that makes the face's text as wide as the PDF says it is (pdf.js gives the width). */
function squeezeFor(str, width, fs, face) {
  if (!(width > 0)) return 1;
  measurer = measurer || document.createElement('canvas').getContext('2d');
  measurer.font = `${face.style} ${face.weight} ${fs}px ${face.family}`;
  const w = measurer.measureText(str).width;
  return w > 0 ? Math.min(3, Math.max(0.3, width / w)) : 1;
}

/** One text run as an absolutely positioned span. Its baseline origin, size and angle come from the text matrix. */
function textSpan(item, styles, vp, hidden) {
  if (!item.str || !item.str.trim()) return '';
  const M = mul(item.transform, vp.transform);
  const fs = Math.hypot(M[2], M[3]);
  if (!(fs > 0)) return '';
  const face = faceOf(styles && styles[item.fontName], item.fontName);
  const k = squeezeFor(item.str, item.width, fs, face);
  const angle = Math.atan2(M[1], M[0]) * 180 / Math.PI;
  const cls = ['t', face.cls, face.bold && 'b', face.italic && 'i', hidden && 'hid'].filter(Boolean).join(' ');
  return `<span class="${cls}" style="left:${f(M[4])}px;top:${f(M[5] - BASE * fs)}px;font-size:${f(fs)}px;transform:rotate(${f(angle)}deg) scaleX(${f(k)})">${esc(item.str)}</span>`;
}

async function pageSection(page, n, lib) {
  const vp = page.getViewport({ scale: 1 });
  const [drawing, tc] = await Promise.all([pageDrawing(page, lib, vp), page.getTextContent()]);
  const images = drawing.images.map((im) => `<img class="im" alt="" src="${im.src}" style="transform:matrix(${im.m.join(',')})">`).join('');
  const text = tc.items.map((item) => textSpan(item, tc.styles, vp, drawing.hiddenText)).join('');
  page.cleanup();
  return `<section class="pg" aria-label="Page ${n}" style="width:${f(vp.width)}px;height:${f(vp.height)}px">\n${images}${text}\n</section>`; // i18n-ignore: written into the HTML file
}

const STYLE = `html,body{margin:0;background:#8a8a8a}
body{padding:16px 0}
.pg{position:relative;overflow:hidden;background:#fff;margin:0 auto 16px;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.im{position:absolute;left:0;top:0;width:1px;height:1px;transform-origin:0 0}
.t{position:absolute;white-space:pre;line-height:1;color:#000;transform-origin:0 84.5%}
.s{font-family:${SANS}}.r{font-family:${SERIF}}.b{font-weight:700}.i{font-style:italic}.hid{color:transparent}`;

/** The whole PDF (or the pages asked for) as one HTML document. */
export async function pdfToHtml(bytes, { pages = '', title = 'Document' } = {}) { // i18n-ignore: written into the HTML file
  const lib = await pdfjs();
  const doc = await openPdf(bytes);
  try {
    const sections = [];
    for (const n of parseRange(pages, doc.numPages)) sections.push(await pageSection(await doc.getPage(n), n, lib));
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="File convert">\n<title>${esc(title)}</title>\n<style>\n${STYLE}\n</style>\n</head>\n<body>\n<main>\n${sections.join('\n')}\n</main>\n</body>\n</html>\n`;
  } finally {
    await doc.destroy();
  }
}
