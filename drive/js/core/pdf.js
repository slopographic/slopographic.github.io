/* Slop Drive — core/pdf: the vendored PDF.js build (vendor/pdfjs), loaded on first use. Used for PDF thumbnails
 * (core/thumb-make.js) and the PDF pages in the viewer (ui/viewer.js). Nothing comes from a CDN. */
'use strict';
(function (DR) {
  let pdfjsP = null;
  DR.pdfjs = function () {
    if (!pdfjsP) pdfjsP = (async () => {
      const base = new URL('../vendor/pdfjs/', document.baseURI).href;
      const lib = await import(new URL('../../shared/compat/pdfjs.js', base).href).then((m) => m.loadPdfjs(base));
      return { lib, base };
    })().catch((e) => { pdfjsP = null; throw e; });
    return pdfjsP;
  };
  DR.openPdf = async function (blob) {
    const { lib, base } = await DR.pdfjs();
    return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', isEvalSupported: false }).promise;
  };
  /** The PDF inside an Illustrator file: most .ai files carry a PDF after their PostScript header. Resolves with a Blob
   * that starts at the %PDF- marker, or null when there is none (the file then gets a card instead of a preview). */
  DR.aiPdfBlob = async function (blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
    for (let i = 0; i + marker.length <= bytes.length; i++) {
      if (marker.every((b, k) => bytes[i + k] === b)) return new Blob([bytes.subarray(i)], { type: 'application/pdf' });
    }
    return null;
  };
  /** Page n as a canvas, scaled to width px wide. */
  DR.renderPdfPage = async function (doc, n, width) {
    const page = await doc.getPage(n), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / v1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  };
})(window.DR);
