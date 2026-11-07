/* Shared test helper for the Office conversion pages: the Arabic language font served from memory (a small subset of
 * Noto Sans Arabic, tests/slides/fixtures, SIL OFL 1.1) so SlopFontJIT downloads it without the network, and pdf.js to
 * read a PDF back (pages, size, text) and draw a page. Not a test itself. */
const CDN = 'https://raw.githubusercontent.com/slopographic/cdn/test/packs/';
const FILE = 'NotoSansArabic-test.ttf';
const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** window.fetch answers the font manifest and the Arabic font from memory; returns the names fetched. */
export async function serveArabic(w = window) {
  const buf = await (await fetch(new URL('../slides/fixtures/' + FILE, import.meta.url))).arrayBuffer();
  const manifest = { note: 'test', hosts: ['raw.githubusercontent.com'], packs: [{ id: 'noto-arabic', name: 'Arabic (Noto Sans Arabic)', licence: 'OFL-1.1', description: 'test', size: buf.byteLength,
    files: [{ name: FILE, url: CDN + FILE, size: buf.byteLength, sha256: await hex(buf), family: 'Noto Sans Arabic', weight: '400', style: 'normal' }] }] };
  const real = w.fetch.bind(w), fetched = [];
  w.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (/\/shared\/library\/packs\.json$/.test(url)) return new w.Response(JSON.stringify(manifest), { status: 200 });
    if (url === CDN + FILE) { fetched.push(FILE); return new w.Response(buf.slice(0), { status: 200 }); }
    return real(input, init);
  };
  try { w.localStorage.setItem('slop-fonts.auto', '1'); } catch (e) { /* the question is answered in the test instead */ }
  return fetched;
}

let PDFJS = null;
/** The PDF read by pdf.js (vendor/pdfjs). */
export async function readPdf(blob) {
  const base = new URL('../../vendor/pdfjs/', import.meta.url).href;
  PDFJS = PDFJS || await import(base + 'pdf.min.js');
  PDFJS.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return PDFJS.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/' }).promise;
}
export const pageText = async (page) => (await page.getTextContent()).items.map((i) => i.str).join(' ');
export async function pageSize(page) { const v = page.getViewport({ scale: 1 }); return [Math.round(v.width), Math.round(v.height)]; }
/** A page drawn at 72 dpi; returns its 2D context (to read pixels at point positions). */
export async function drawPage(page) {
  const vp = page.getViewport({ scale: 1 }), cv = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  return cv.getContext('2d');
}
export const ARABIC = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
