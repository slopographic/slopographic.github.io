/* The watermark on a PDF, as real text and images in the file (vector: the text stays selectable and sharp). The spec is
 * mapped onto Slop PDF's watermark layers for each page size (SlopWatermarkSpec.toPdfLayers: sizes from the page's
 * shorter side, like a picture) and written by Slop PDF's own page writer (pdf/js/macro/ops-draw.js addWatermark, pdf-lib),
 * without the Slop PDF page open. A layer's page range picks its pages. Text uses the standard PDF fonts (Helvetica,
 * Times, Courier); a character they cannot draw becomes "?", and notice(text) says so. A logo is embedded as PNG or JPEG.
 * Classic script, loaded by apply.js: SlopWatermark.applyPdf(file, spec, opts) → Blob.
 *   SlopWatermark.pdfLayers(spec, frames, measure, asset) → layers for every page (pure; frames: [{ VW, VH }] per page) */
(function () {
  'use strict';
  const WM = window.SlopWatermark, S = window.SlopWatermarkSpec;
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  const SCRIPTS = ['pdf/js/core/watermark.js', 'pdf/js/macro/pattern.js', 'pdf/js/macro/model.js', 'pdf/js/macro/frame.js', 'pdf/js/macro/ops-draw.js'];
  const MAX_RANGE = 120;   // a Slop PDF layer's page range is at most this long (pdf/js/core/watermark.js)

  /** Page numbers (0-based) as short range text: [0,1,2,4] → '1-3,5'; split so no piece is longer than MAX_RANGE. */
  function ranges(idx) {
    const parts = [];
    for (let i = 0; i < idx.length; i++) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      parts.push(i === j ? String(idx[i] + 1) : idx[i] + 1 + '-' + (idx[j] + 1));
      i = j;
    }
    const out = [];
    let cur = '';
    for (const p of parts) {
      if (cur && cur.length + p.length + 1 > MAX_RANGE) { out.push(cur); cur = ''; }
      cur = cur ? cur + ',' + p : p;
    }
    if (cur) out.push(cur);
    return out;
  }

  function pdfLayers(spec, frames, measure, asset) {
    const n = frames.length, groups = new Map(), out = [];
    frames.forEach((f, i) => { const k = f.VW + 'x' + f.VH; if (!groups.has(k)) groups.set(k, { VW: f.VW, VH: f.VH, pages: [] }); groups.get(k).pages.push(i); });
    for (const g of groups.values()) {
      const layers = S.toPdfLayers(spec, g.VW, g.VH, { measure, asset });
      for (const P of layers) {
        const own = P.pages ? S.parsePages(P.pages, n) : null;
        const idx = own ? g.pages.filter((i) => own.includes(i)) : g.pages;
        if (!idx.length) continue;
        if (!own && idx.length === n) { out.push(Object.assign({}, P, { pages: '' })); continue; }
        ranges(idx).forEach((r, k) => out.push(Object.assign({}, P, { id: P.id + '-' + g.VW + 'x' + g.VH + '-' + k, pages: r })));
      }
    }
    return out;
  }

  /** A logo as a PNG or JPEG data URL (what a PDF can embed). */
  function embeddable(L) {
    if (/^data:image\/(png|jpeg);base64,/i.test(L.logo)) return L.logo;
    const e = WM.logo(L.logo);
    return e.ok ? e.img.toDataURL('image/png') : '';
  }

  async function applyPdf(file, spec, opts = {}) {
    await (await import(new URL('convert/js/core/lib.js', WM.ROOT).href)).loadPdfLib();   // the site's one pdf-lib loader
    await WM.load(SCRIPTS);
    const M = window.SlopPdfMacro, P = M.pdf;
    await P.initMetrics();
    await WM.ready(spec);
    const sized = S.normalize(Object.assign({}, spec, { layers: spec.layers.map((L) => {
      if (L.kind !== 'logo' || (L.logoW > 0 && L.logoH > 0)) return L;
      const e = WM.logo(L.logo);
      return Object.assign({}, L, { logoW: e.w, logoH: e.h });
    }) }));
    const bytes = new Uint8Array(await file.arrayBuffer());
    let doc;
    try { doc = await P.load(bytes); } catch (e) {
      throw new Error(tr(/encrypt/i.test(String(e && e.message)) ? 'ui.ops.pdf.has_password' : 'ui.ops.pdf.not_pdf'));
    }
    const frames = doc.getPages().map((page) => P.frame(page));
    if (opts.signal && opts.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const layers = pdfLayers(sized, frames, (font, t, px) => P.measure(font, t, px), embeddable);
    if (!layers.length) return new Blob([bytes], { type: 'application/pdf' });
    const r = await M.ops.addWatermark(bytes, { type: 'addWatermark', layers }, { filename: file.name || 'document.pdf', date: M.isoDate() });
    if (r.warn && opts.notice) opts.notice(tr('ui.wm.pdf_chars', { name: file.name || 'PDF' }));
    if (opts.progress) opts.progress(1);
    return new Blob([r.bytes], { type: 'application/pdf' });
  }

  Object.assign(WM, { applyPdf, pdfLayers, pdfRanges: ranges });
})();
