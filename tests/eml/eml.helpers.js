/* Slop EML test helpers (classic script, after ../harness.js). Exposes window.EH:
 *   EH.readPdf(bytes) → { n, pages: [text per page], outline: [titles] }   read back with pdf.js (vendor/pdfjs)
 *   EH.stubFonts(win)   SlopFontJIT in the app hands over the real Noto Arabic file (tests/pdf/fixtures, SIL OFL) and the
 *                       small Chinese subset (tests/docs/fixtures) without asking or downloading (SlopFontJIT itself is
 *                       tested in tests/fonts/jit.test.html)
 *   EH.batch(win)       the ten fixture messages (tests/eml/fixtures/batch: Swedish, Arabic, Chinese, attachments) as Files
 *   EH.mbox(win)        the fixture mailbox as a File
 *   EH.capture(win)     downloads are kept in the returned array instead of saved: [{ blob, name }] */
(function () {
  'use strict';
  const EH = (window.EH = {});
  const HERE = new URL('./', document.currentScript.src).href;
  let lib = null;
  async function pdfjs() {
    if (!lib) {
      lib = await import(new URL('../../vendor/pdfjs/pdf.min.js', HERE).href);
      lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.js', HERE).href;
    }
    return lib;
  }
  EH.readPdf = async function (bytes) {
    const L = await pdfjs();
    const doc = await L.getDocument({ data: new Uint8Array(bytes), cMapUrl: new URL('../../vendor/pdfjs/cmaps/', HERE).href, cMapPacked: true,
      standardFontDataUrl: new URL('../../vendor/pdfjs/standard_fonts/', HERE).href }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((t) => t.str).join(' ').replace(/\u034f/g, ''));
    const outline = ((await doc.getOutline()) || []).map((o) => o.title);
    const n = doc.numPages;
    await doc.destroy();
    return { n, pages, outline };
  };
  const FONTS = { 'noto-arabic': '../pdf/fixtures/NotoSansArabic-Regular.ttf', 'noto-sc': '../docs/fixtures/noto-sc-test.otf' };
  EH.stubFonts = async function (win) {
    await (await win.eval('import(' + JSON.stringify(new URL('js/pdf-out.js', win.location.href).href) + ')')).engine();
    const J = win.SlopFontJIT;
    await J.deps();
    J.ready = async () => true;
    J.bytes = async (pack) => (FONTS[pack] ? (await fetch(new URL(FONTS[pack], HERE))).arrayBuffer() : null);
    J.family = async () => '';
    J.face = async () => null;
  };
  EH.batch = async function (win) {
    const out = [];
    for (let i = 1; i <= 10; i++) {
      const n = String(i).padStart(2, '0') + '.eml';
      out.push(new win.File([await (await fetch(new URL('fixtures/batch/' + n, HERE))).arrayBuffer()], n, { type: 'message/rfc822' }));
    }
    return out;
  };
  EH.mbox = async (win) => new win.File([await (await fetch(new URL('fixtures/batch/batch.mbox', HERE))).arrayBuffer()], 'Inbox.mbox', { type: '' });
  EH.capture = function (win) {
    const saved = [];
    win.SlopUI.download = (blob, name) => saved.push({ blob, name });
    return saved;
  };
})();
