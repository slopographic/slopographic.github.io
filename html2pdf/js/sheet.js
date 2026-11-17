/* Slop HTML to PDF: the page sheet. One builder makes the preview and the print markup, so the header
 * on screen is the header that prints. Print colours are fixed because the output is paper, not the theme.
 * Classic script. Exposes window.H2P.sheet. */
(function () {
  'use strict';
  const PAPERS = { A4: [210, 297], Letter: [216, 279], A5: [148, 210], Legal: [216, 356] };
  const CSS_PAPER = { A4: 'A4', Letter: 'letter', A5: 'A5', Legal: 'legal' };
  const MARGIN_MM = { normal: 15, narrow: 6, none: 0 };
  const HEADER_MM = 14; // the header block at the top of every page
  const CLEAR_MM = 17; // header (14 mm) plus a 3 mm gap: the body starts this far below the top of the content area, on every page
  const CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' data: blob:; font-src data: blob:\">";

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const marginMm = (o) => (Object.prototype.hasOwnProperty.call(MARGIN_MM, o.margin) ? MARGIN_MM[o.margin] : MARGIN_MM.normal);
  /** Page size in mm for the options: [width, height], swapped for landscape. */
  function sizeMm(o) { const [w, h] = PAPERS[o.paper] || PAPERS.A4; return o.orientation === 'landscape' ? [h, w] : [w, h]; }

  const SHEET_CSS = `html,body{margin:0;background:#fff;color:#111}
.h2p-area{position:relative;transform:translateZ(0);overflow:hidden}
.h2p-hdr{position:fixed;top:0;left:0;right:0;z-index:1;height:${HEADER_MM}mm;box-sizing:border-box;padding:1.5mm 0;display:flex;align-items:center;justify-content:space-between;gap:4mm;background:#fff;color:#111;font:8pt/1.3 Arial,Helvetica,sans-serif}
.h2p-text{min-width:0;flex:1}
.h2p-name,.h2p-meta{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.h2p-name{font-weight:700;font-size:9.5pt}
.h2p-qr{flex:none;box-sizing:border-box;width:11mm;height:11mm;padding:.6mm;background:#fff}
.h2p-qr svg{display:block;width:100%;height:100%}
.h2p-table{width:100%;border-collapse:collapse;border:0}
.h2p-table td{padding:0;border:0;vertical-align:top}
.h2p-has-hdr .h2p-gap{height:${CLEAR_MM}mm}
.h2p-content{overflow-wrap:anywhere}
.h2p-bg-on{print-color-adjust:exact;-webkit-print-color-adjust:exact}
.h2p-bg-off{print-color-adjust:economy;-webkit-print-color-adjust:economy}
.h2p-fit img,.h2p-fit svg,.h2p-fit video,.h2p-fit canvas,.h2p-fit pre{max-width:100%}
.h2p-100 img,.h2p-100 svg,.h2p-100 video,.h2p-100 canvas,.h2p-100 pre{max-width:none!important}`;

  /** The header: the file name and the date, the typed URL when there is one, and the QR code at the right. */
  function headerHtml(o) {
    const meta = [o.date, o.url].filter(Boolean).join(' · ');
    return `<div class="h2p-hdr"><div class="h2p-text"><div class="h2p-name">${esc(o.fileName)}</div><div class="h2p-meta">${esc(meta)}</div></div><div class="h2p-qr" role="img" aria-label="QR code">${o.qrSvg || ''}</div></div>`;
  }

  /** The sheet: the header (when on) and the body in a table whose head repeats on every page. */
  function sheetHtml(o, src) {
    const cls = ['h2p-sheet', o.background ? 'h2p-bg-on' : 'h2p-bg-off', o.scale === '100' ? 'h2p-100' : 'h2p-fit', o.header ? 'h2p-has-hdr' : ''].filter(Boolean).join(' ');
    const hdr = o.header ? headerHtml(o) : '';
    return `<div class="${cls}">${hdr}<table class="h2p-table"><thead><tr><td><div class="h2p-gap"></div></td></tr></thead><tbody><tr><td><div class="h2p-content">${src.body}</div></td></tr></tbody></table></div>`;
  }

  /** The markup for the print dialog: a fragment with its own styles and the page margin (!important beats the dialog's rule). */
  function printHtml(o, src) {
    return `<style>${SHEET_CSS}@page{margin:${marginMm(o)}mm !important}</style>${src.styles}${sheetHtml(o, src)}`;
  }

  /** A full document for the built-in print path: the same markup as the dialog. */
  function printDocument(o, src, title) {
    const size = `@page{size:${CSS_PAPER[o.paper] || 'A4'} ${o.orientation === 'landscape' ? 'landscape' : 'portrait'}}`; // the dialog sets its own size; this is the built-in path's
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">${CSP}<title>${esc(title)}</title><style>${size}</style></head><body>${printHtml(o, src)}</body></html>`;
  }

  /** The preview: one paper-sized page in an isolated frame (no scripts, nothing loaded from the network). */
  function previewDoc(o, src) {
    const [w, h] = sizeMm(o), m = marginMm(o);
    // The header is fixed inside the margin-inset area (.h2p-area), as Chromium lays it out when printing.
    const page = `html,body{overflow:hidden}.h2p-page{box-sizing:border-box;width:${w}mm;height:${h}mm;overflow:hidden;background:#fff}.h2p-area{margin:${m}mm;width:${w - 2 * m}mm;height:${h - 2 * m}mm}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">${CSP}<title>Preview</title><style>${SHEET_CSS}${page}</style></head><body><div class="h2p-page"><div class="h2p-area">${src.styles}${sheetHtml(o, src)}</div></div></body></html>`;
  }

  window.H2P = Object.assign(window.H2P || {}, {
    sheet: { PAPERS, MARGIN_MM, HEADER_MM, CLEAR_MM, sizeMm, marginMm, isoDate, esc, headerHtml, sheetHtml, printHtml, printDocument, previewDoc },
  });
})();
