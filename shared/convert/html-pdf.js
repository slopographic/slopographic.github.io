/* HTML to a picture PDF, the one HTML-to-PDF path of the Convert dialog. The HTML is sanitised first by SlopSanitize
 * (shared/sanitize: no scripts, no event handlers, no remote or relative references: nothing is fetched). Its height is
 * measured in a sandboxed frame, then each A4 page is drawn as an SVG foreignObject (the page's content shifted up),
 * rasterised onto a canvas at 2x, and the pictures go into a PDF with pdf-lib (convert/js/core/pdf-images.js). Text in the
 * result is pictures: not selectable. Classic conventions, ES module. */
import { imagesToPdf } from '../../convert/js/core/pdf-images.js';
import '../sanitize/sanitize.js';

const PURIFY = new URL('../../vendor/dompurify/purify.min.js', import.meta.url).href;

const PAGE_W = 794, PAGE_H = 1123; // A4 at 96 px per inch
const SCALE = 2;                   // canvas pixels per CSS pixel
const MAX_PAGES = 150;

/** The HTML as a document that cannot run or load anything (SlopSanitize, then parsed inertly by DOMParser). */
function sanitise(html) {
  const clean = globalThis.SlopSanitize.html(String(html), { urls: 'local', links: false, whole: true });
  return new DOMParser().parseFromString(clean, 'text/html');
}

/** Measures the content height at the page width, in a sandboxed frame (no scripts; its layout is the page's). */
function measure(headHtml, bodyHtml) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${headHtml}</head><body style="margin:0"><div id="m" style="width:${PAGE_W}px">${bodyHtml}</div></body></html>`;
    const timer = setTimeout(() => { f.remove(); reject(new Error('the page did not lay out')); }, 15000);
    f.onload = () => {
      clearTimeout(timer);
      try { return resolve(f.contentDocument.getElementById('m').scrollHeight); } catch (e) { return reject(e); } finally { f.remove(); }
    };
    document.body.append(f);
  });
}

/** One page's SVG: the content in a PAGE_W × PAGE_H box, moved up by i pages. XML serialisation, as foreignObject needs. */
function pageSvg(headXml, bodyXml, i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}"><foreignObject width="${PAGE_W}" height="${PAGE_H}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;position:relative;background:#fff">` +
    `${headXml}<div style="position:absolute;left:0;top:${-i * PAGE_H}px;width:${PAGE_W}px">${bodyXml}</div></div></foreignObject></svg>`;
}

/** Draws one SVG page onto a canvas: { bytes (JPEG), mime, width, height } in canvas pixels. */
function draw(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('the page could not be drawn'));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = PAGE_W * SCALE; c.height = PAGE_H * SCALE;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(async (blob) => {
        if (!blob) { reject(new Error('the page could not be drawn')); return; }
        try { resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', width: c.width, height: c.height }); } catch (e) { reject(e); }
      }, 'image/jpeg', 0.92);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** An HTML File -> a Blob of the picture PDF (one A4 page per 1123 px of the HTML's height). */
export async function htmlToPdf(file) {
  await globalThis.SlopSanitize.ready(PURIFY);
  const doc = sanitise(await file.text());
  const ser = (n) => new XMLSerializer().serializeToString(n);
  const headStyles = [...doc.head.querySelectorAll('style')];
  const headXml = headStyles.map(ser).join('');
  const bodyXml = [...doc.body.childNodes].map(ser).join('');
  const height = await measure(headStyles.map((s) => s.outerHTML).join(''), doc.body.innerHTML);
  const pages = Math.max(1, Math.ceil(height / PAGE_H));
  if (pages > MAX_PAGES) throw new Error(`is ${pages} pages long: the limit is ${MAX_PAGES} pages`);
  const items = [];
  for (let i = 0; i < pages; i++) items.push(await draw(pageSvg(headXml, bodyXml, i)));
  return new Blob([await imagesToPdf(items, { page: 'a4', margin: 0 })], { type: 'application/pdf' });
}
