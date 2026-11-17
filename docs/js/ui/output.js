/* Slop Docs — ui/output: Print, File ▸ Download PDF, and the language fonts the open document needs.
 * - Print sets the paper to the document's page size with no margin and prints the pages at 100%, so the printout is the
 *   page on screen (Ctrl+P too, through beforeprint).
 * - The PDF is written from the same layout the pages show (io/pdf.js): every face loaded first, then laid out again.
 * - Text the document's fonts cannot set (Arabic, Hindi, Chinese…) gets its Noto font through SlopFontJIT: checked when a
 *   document opens and shortly after edits; the person is asked before any download (fonts/lang-doc.js).
 * Classic script; window.SlopDocs. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const E = () => window.SlopDocEngine;
  const toast = (m, ms) => { if (window.SlopUI) SlopUI.toast(m, ms); };

  /* ---------- print ---------- */
  let pageStyle = null, savedZoom = null;
  function beforePrint() {
    if (!S.layout || !S.layout.pages.length) return;
    const pg = S.layout.pages[0];
    if (!pageStyle) { pageStyle = document.createElement('style'); pageStyle.id = 'docsPageSize'; document.head.append(pageStyle); }
    pageStyle.textContent = `@page { size: ${pg.w}pt ${pg.h}pt; margin: 0; }`;
    if (S.zoom !== 1) { savedZoom = S.zoom; S.zoom = 1; S.R.render(); }
  }
  function afterPrint() { if (savedZoom != null) { S.zoom = savedZoom; savedZoom = null; S.R.render(); } }
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  S.print = function () { beforePrint(); window.print(); };

  /* ---------- PDF ---------- */
  /** The open document as a PDF Blob, laid out exactly as the pages show it. */
  S.pdfBlob = async function () {
    toast(S.t('docs.file.pdf_preparing'), 6000);
    await E().ensureDocFonts(S.doc);
    if (E().mayNeedLang(S.doc)) await E().ensureLangFonts(S.doc, { force: true });
    S.relayout();
    const bytes = await E().exportPdf(S.doc, S.layout, { title: S.doc.meta.title || S.displayName(), author: S.doc.meta.author || '' });
    return new Blob([bytes], { type: 'application/pdf' });
  };

  /* ---------- language fonts ---------- */
  let timer = 0;
  function check() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const d = S.doc;
      if (!d || !E() || !E().mayNeedLang(d)) return;
      E().ensureLangFonts(d).catch((e) => console.warn('Slop Docs: language fonts: ' + e.message));
    }, 700);
  }
  S.on('doc', check);
  S.on('change', check);
})();
