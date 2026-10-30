/* Slop PDF: the OCR tests' shared helpers (pdf.spec-ocr.js and pdf.spec-ocr-edit.js). Classic script; exposes window.OCRT.
   The OCR engine is stubbed (the model is not in the test sandbox), and the stub is set up by withEngine. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  /** Line specs in points on a 400 x 200 page (top-left origin): [{ text, x, y, w, h }]. */
  const PAGE_ONE = [{ text: 'Invoice 2026-0042', x: 40, y: 30, w: 170, h: 22 }, { text: 'Total 1,250.00', x: 40, y: 100, w: 160, h: 22 }];
  const PAGE_TWO = [{ text: 'Second scan line', x: 40, y: 60, w: 210, h: 22 }];
  /** One word alone on its line, 80 pt wide: its ink sits inside the box [36, 28, 104, 54] (points, top-left origin). */
  const WORD_ON_PAPER = [{ text: 'Invoice', x: 40, y: 30, w: 80, h: 22 }];
  const WORD_BOX = [36, 28, 104, 54];

  /** A picture of the lines, drawn at 2 px per point (what a scanner would give us). */
  function scanCanvas(lines, paper = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 400;
    const g = c.getContext('2d');
    g.fillStyle = paper; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000000'; g.font = '36px sans-serif'; g.textBaseline = 'top';
    lines.forEach((l) => g.fillText(l.text, l.x * 2, l.y * 2));
    return c;
  }
  function pngBytes(c) {
    const bin = atob(c.toDataURL('image/png').split(',')[1]), u = new PT.win.Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  /** An image-only PDF: one picture per page, no text operators at all. */
  async function scanPdf(pages, paper = '#ffffff') {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create();
    for (const lines of pages) {
      const img = await doc.embedPng(pngBytes(scanCanvas(lines, paper)));
      doc.addPage(PT.win.Array.of(400, 200)).drawImage(img, { x: 0, y: 0, width: 400, height: 200 });
    }
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2022, 0, 1) + (++PT._nonce) * 1000));
    return doc.save();
  }
  /** The text the editor sees on a page: pdf.js text items (the same source as the text runs), joined. */
  async function textOf(p) {
    const pg = await PT.E.fileOfPage(p).doc.getPage(p.i + 1), tc = await pg.getTextContent();
    return tc.items.map((it) => it.str).filter((s) => s.trim()).join(' ');
  }
  /** Decoded content stream of page 1 of a file's bytes. */
  async function contentOf(bytes) {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.load(bytes, { updateMetadata: false });
    const c = doc.getPage(0).node.Contents(), refs = c instanceof L.PDFArray ? c.asArray() : [c];
    let out = '';
    for (const r of refs) {
      const s = doc.context.lookup(r);
      const b = s instanceof L.PDFRawStream ? L.decodePDFRawStream(s).decode() : s.getUnencodedContents();
      out += String.fromCharCode(...b);
    }
    return out;
  }
  /** Replaces the engine: ready() passes, read() returns the next picture's lines from the queue (pt, top-left). */
  function stubEngine(queue, onRead) {
    const O = PT.SP.ocr;
    O.ready = async () => {};
    O.read = async (canvas, onProgress) => {
      if (onRead) onRead();
      if (onProgress) onProgress({ stage: 'detect', done: 1, total: 1 });
      const k = canvas.width / 400, lines = queue.shift() || [];
      return lines.map((l) => ({ text: l.text, score: 0.99, box: { x: Math.round(l.x * k), y: Math.round(l.y * k), w: Math.round(l.w * k), h: Math.round(l.h * k) } }));
    };
  }
  /** Runs fn with the engine stubs in place, restoring the real engine afterwards. */
  async function withEngine(fn) {
    const O = PT.SP.ocr, saved = { ready: O.ready, read: O.read };
    try { return await fn(); } finally { Object.assign(O, saved); }
  }

  /** Opens the first line of a page for editing, as a press on its first word does; resolves to the run's input. */
  async function openFirstLine(p) {
    PT.A.openPage(p.id);
    await SlopTest.waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && PT.SP.editor.pid === p.id, { timeout: 8000 });
    PT.SP.editor.setTool('select'); // an earlier test may have left another tool or edit mode on
    if (PT.SP.editor.editText) PT.SP.editor.toggleEditText();
    PT.SP.editor.toggleEditText();
    const el = PT.SP.editor._.slots.get(p.id).el, z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
    // the first word starts 40 pt from the left, on the first line (30 to 52 pt from the top)
    el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: r.left + 60 * z, clientY: r.top + 42 * z, button: 0, bubbles: true, cancelable: true, pointerId: 5, pointerType: 'mouse', isPrimary: true }));
    await SlopTest.waitFor(() => PT.win.document.querySelector('.edit-run'), { timeout: 5000 });
    return PT.win.document.querySelector('.edit-run');
  }
  /** Types value into an open run and presses Enter; resolves when the page has its new file. */
  async function applyLine(p, input, value) {
    const before = PT.E.pageById(p.id).f;
    input.value = value;
    input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await SlopTest.waitFor(() => PT.E.pageById(p.id).f !== before, { timeout: 8000 });
  }
  /** The picture of a page (2 px per point) inside a box in points: mean luma, count of dark pixels (luma under 100)
   * and mean darkness (0 for paper, 1 for black). */
  async function inkIn(p, [x0, y0, x1, y1]) {
    const c = await PT.E.renderToCanvas(PT.E.fileOfPage(p), p.i, 2);
    const d = c.getContext('2d').getImageData(x0 * 2, y0 * 2, (x1 - x0) * 2, (y1 - y0) * 2).data;
    let lum = 0, dark = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      lum += l; ink += (255 - l) / 255; if (l < 100) dark++;
    }
    const n = d.length / 4;
    return { lum: lum / n, dark, darkness: ink / n };
  }

  window.OCRT = { PAGE_ONE, PAGE_TWO, WORD_ON_PAPER, WORD_BOX, scanCanvas, pngBytes, scanPdf, textOf, contentOf, stubEngine, withEngine, openFirstLine, applyLine, inkIn };
})();
