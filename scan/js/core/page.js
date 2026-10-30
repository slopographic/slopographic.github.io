/* Slop Scan: the PDF's pages: their size, the margins and where each scan sits, and the file size to expect. Pure (no
 * DOM); a page gets window.SlopScan.page, Node tests load it. Points are PDF points (1/72 inch).
 *   SIZES                         { a4: [595.28, 841.89], letter: [612, 792] } portrait, in points
 *   MARGINS                       { none: 0, small: 6, medium: 12, large: 20 } in millimetres
 *   mm(v) → points
 *   layout(w, h, { size, margin }) → { pageW, pageH, x, y, width, height }   a w × h scan on its page: A4 or Letter turned
 *       to the scan's shape (landscape for a wide scan), or 'auto': the page has the scan's shape, A4's width for an
 *       upright scan and A4's height across for a wide one; the scan fits inside the margins, centred
 *   dpiOf(w, h, box) → number     the scan's resolution on the page (pixels per inch along its width)
 *   estimate(samples, quality) → bytes   the file to expect: for each page { px (the full size's pixel count), bytes
 *       and px of a smaller JPEG made at the same quality } scaled by pixels, plus the PDF's own share
 *   fileName(name, date) → 'Scan 2026-10-28 14.05.pdf' for no name, else the name with .pdf */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).page = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
  const MARGINS = { none: 0, small: 6, medium: 12, large: 20 };
  const mm = (v) => (v * 72) / 25.4;
  const PER_PAGE = 600, PER_DOC = 1200;   // the PDF's own bytes: each page's objects, and the document's (catalog, xref, info)

  function layout(w, h, o = {}) {
    const wide = w > h, m = mm(MARGINS[o.margin] != null ? MARGINS[o.margin] : Number(o.margin) || 0);
    let pageW, pageH;
    if (SIZES[o.size]) {
      const [a, b] = SIZES[o.size];
      [pageW, pageH] = wide ? [b, a] : [a, b];
    } else if (wide) {
      pageW = SIZES.a4[1]; pageH = (pageW - 2 * m) * (h / w) + 2 * m;
    } else {
      pageW = SIZES.a4[0]; pageH = (pageW - 2 * m) * (h / w) + 2 * m;
    }
    const k = Math.min((pageW - 2 * m) / w, (pageH - 2 * m) / h), width = w * k, height = h * k;
    const r = (v) => Math.round(v * 100) / 100;
    return { pageW: r(pageW), pageH: r(pageH), x: r((pageW - width) / 2), y: r((pageH - height) / 2), width: r(width), height: r(height) };
  }
  const dpiOf = (w, h, box) => Math.round((w / box.width) * 72);
  function estimate(samples, quality) {
    let n = PER_DOC;
    for (const s of samples) n += PER_PAGE + (s.sampleBytes && s.samplePx ? (s.sampleBytes * s.px) / s.samplePx : s.px * (0.1 + quality * 0.5));
    return Math.round(n);
  }
  const pad = (v) => String(v).padStart(2, '0');
  function fileName(name, d = new Date()) {
    const base = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '');
    return (base || `Scan ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`) + '.pdf';
  }
  return { SIZES, MARGINS, mm, layout, dpiOf, estimate, fileName };
});
