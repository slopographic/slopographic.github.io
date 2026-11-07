/* QR SLOP: exports. The SVG for a text and render options, the PNG (drawn on a canvas, so a transparent code stays
 * transparent), and a print page: a US Letter PDF with the code at 5 inches and a caption, built with vendor/pdf-lib,
 * which loads the first time it is needed. Classic script; exposes window.QRExport. */
(function (g) {
  'use strict';
  if (g.QRExport) return;
  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (node tests, other pages). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };

  /** The SVG for a text at the given render options (see QRState.renderOpts). Throws when the text does not fit. */
  function svgFor(text, ro) {
    return g.QRRender.qrSvg(g.QRMatrix.encode(text, ro.ec), ro);
  }

  /** A PNG blob drawn from SVG text at px pixels. The canvas starts clear, so a transparent code gives a transparent PNG. */
  function toPng(svgText, px) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const n = g.QRRender.clampSize(px);
        const cv = document.createElement('canvas');
        cv.width = n; cv.height = n;
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, n, n);
        cx.drawImage(img, 0, 0, n, n);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('qr.err.png', 'The PNG could not be made.')))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('qr.err.draw', 'The picture could not be drawn.'))); };
      img.src = url;
    });
  }

  let libP = null;
  /** pdf-lib (vendor/pdf-lib/pdf-lib.min.js) as window.PDFLib, loaded once. */
  function pdfLib() {
    if (g.PDFLib) return Promise.resolve(g.PDFLib);
    if (!libP) libP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '../vendor/pdf-lib/pdf-lib.min.js';
      s.onload = () => (g.PDFLib ? resolve(g.PDFLib) : reject(new Error(tr('qr.err.pdf_start', 'The PDF library did not start.'))));
      s.onerror = () => { libP = null; reject(new Error(tr('qr.err.pdf_load', 'The PDF library could not load.'))); };
      document.head.append(s);
    });
    return libP;
  }
  /** Standard fonts only cover WinAnsi; anything else becomes "?" so the caption always draws. */
  const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?');

  /** A US Letter page: the code at 5 inches, centred, with a title and a line of the encoded text under it. */
  async function toPdf(pngBlob, caption) {
    const { PDFDocument, StandardFonts, rgb } = await pdfLib();
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const img = await doc.embedPng(bytes);
    const side = 360, x = (612 - side) / 2, y = 792 - 96 - side;
    const bold = await doc.embedFont(StandardFonts.HelveticaBold), sans = await doc.embedFont(StandardFonts.Helvetica);
    page.drawImage(img, { x, y, width: side, height: side });
    const title = ascii(caption.title || 'QR code');
    const line = ascii(caption.line || '').slice(0, 96);
    page.drawText(title, { x: 72, y: y - 34, size: 16, font: bold, color: rgb(0.04, 0.04, 0.04) });
    if (line) page.drawText(line, { x: 72, y: y - 54, size: 10, font: sans, color: rgb(0.32, 0.32, 0.32) });
    page.drawText('Made with QR SLOP', { x: 72, y: 56, size: 8, font: sans, color: rgb(0.5, 0.5, 0.5) });
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  g.QRExport = Object.freeze({ svgFor, toPng, toPdf, pdfLib });
})(typeof window !== 'undefined' ? window : globalThis);
