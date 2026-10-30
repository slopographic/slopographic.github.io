/* Slop PDF: Recognise text (OCR). Scanned pages (pictures only) get an invisible text layer (text render mode 3) at the
   recognised lines, so the editor's text runs, find and copy see the words. The helpers are in pdf.spec-ocr-shared.js.
   The real stub-free path is the Get more prompt, which must open and change nothing.
   Covers: pdf/js/ocr/recognise.js, pdf/js/tools/doc-panels.js */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const H = window.OCRT;
  const { PAGE_ONE, PAGE_TWO, WORD_ON_PAPER, WORD_BOX, scanCanvas, pngBytes, scanPdf, textOf, contentOf, stubEngine, withEngine, openFirstLine, applyLine, inkIn } = H;
  describe('OCR text layer: geometry', () => {
    it('places each word inside the line box, left to right, and stretches the line to the box width', async () => {
      if (!PT.SP) await PT.boot();
      const L = PT.win.PDFLib, doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica);
      const g = { W: 400, H: 200, x0: 0, y0: 0 };
      const words = PT.SP.ocrLayer.placements([{ text: 'Hello big world', box: { x: 80, y: 20, w: 200, h: 24 } }], g, { w: 800, h: 400 }, font);
      expect(words.map((w) => w.str)).toEqual(['Hello', 'big', 'world']);
      expect(words[0].x).toBeCloseTo(40, 6);
      expect(words[1].x).toBeGreaterThan(words[0].x);
      expect(words[2].x).toBeGreaterThan(words[1].x);
      const last = words[2], end = last.x + font.widthOfTextAtSize(last.str, last.size) * last.sx;
      expect(end).toBeCloseTo(140, 3); // the box is 100 pt wide, from x 40
      expect(words[0].y).toBeGreaterThan(160); // 12 pt high box near the top of a 200 pt page
      expect(PT.SP.ocrLayer.placements([{ text: '  ', box: { x: 0, y: 0, w: 10, h: 10 } }], g, { w: 800, h: 400 }, font)).toEqual([]);
    });
  });

  describe('OCR text layer: recognise a page', () => {
    it('adds the words of a picture-only page as invisible text, and one undo step undoes it', async () => {
      PT.reset();
      await withEngine(async () => {
        const file = await PT.open(await scanPdf([PAGE_ONE, PAGE_TWO]), 'scan.pdf');
        const [first, second] = PT.E.state.pages.filter((p) => p.f === file.id);
        expect(await textOf(first)).toBe('');
        stubEngine([PAGE_ONE]);
        expect(await PT.A.recognise([first.id])).toBe(1);
        const words = await textOf(PT.E.pageById(first.id));
        expect(words).toContain('Invoice');
        expect(words).toContain('2026-0042');
        expect(words).toContain('1,250.00');
        expect(PT.E.undoLabel()).toBe('Recognise text on page 1');
        const content = await contentOf(PT.E.fileOfPage(PT.E.pageById(first.id)).bytes);
        expect(/\b3 Tr\b/.test(content)).toBe(true);
        expect(PT.E.pageById(first.id).f).not.toBe(file.id);
        // the other page is untouched and still picture-only
        expect(second.f).toBe(file.id);
        expect(await textOf(second)).toBe('');
        PT.E.undo();
        expect(PT.E.pageById(first.id).f).toBe(file.id);
        expect(await textOf(PT.E.pageById(first.id))).toBe('');
        PT.E.redo();
        expect(await textOf(PT.E.pageById(first.id))).toContain('Invoice');
      });
    });

    it('on all pages skips pages that already have text and makes one undo step per page', async () => {
      PT.reset();
      await withEngine(async () => {
        const file = await PT.open(await scanPdf([PAGE_ONE, PAGE_TWO]), 'scan2.pdf');
        const [one, two] = PT.E.state.pages.filter((p) => p.f === file.id);
        const queue = [PAGE_ONE, PAGE_TWO];
        stubEngine(queue);
        await PT.A.recognise([one.id]);
        expect(queue.length).toBe(1);
        expect(await PT.A.recogniseAll()).toBe(1); // page 1 has text now: only page 2 is read
        expect(queue.length).toBe(0);
        expect(await textOf(PT.E.pageById(two.id))).toContain('Second');
        expect(PT.E.undoLabel()).toBe('Recognise text on page 2');
        PT.E.undo();
        expect(await textOf(PT.E.pageById(two.id))).toBe('');
        expect(await textOf(PT.E.pageById(one.id))).toContain('Invoice');
      });
    });

    it('cancel keeps the pages already read and stops before the next one', async () => {
      PT.reset();
      await withEngine(async () => {
        const file = await PT.open(await scanPdf([PAGE_ONE, PAGE_TWO]), 'scan3.pdf');
        const [one, two] = PT.E.state.pages.filter((p) => p.f === file.id);
        // the first read cancels from the progress dialog, as the Cancel button does
        stubEngine([PAGE_ONE, PAGE_TWO], () => {
          const btn = PT.win.document.querySelector('.ocr-progress .sui-btn');
          if (btn) btn.click();
        });
        expect(await PT.A.recogniseAll()).toBe(1);
        expect(await textOf(PT.E.pageById(one.id))).toContain('Invoice');
        expect(await textOf(PT.E.pageById(two.id))).toBe('');
        expect(PT.E.pageById(two.id).f).toBe(file.id);
        await SlopTest.waitFor(() => !PT.win.document.querySelector('.ocr-progress'), { timeout: 3000 });
      });
    });

    it('without the model it opens Get more and changes nothing', async () => {
      PT.reset();
      const SAI = PT.win.SlopAISupport, savedCheck = SAI.check;
      try {
        SAI.check = () => ({ ok: true, reason: '' }); // the sandbox may report a device limit; the model is what is tested
        const file = await PT.open(await scanPdf([PAGE_ONE]), 'scan4.pdf');
        const p = PT.E.state.pages.filter((q) => q.f === file.id)[0];
        const undoBefore = PT.E.undoLabel();
        expect(await PT.A.recognise([p.id])).toBe(0);
        expect(PT.E.pageById(p.id).f).toBe(file.id);
        expect(PT.E.undoLabel()).toBe(undoBefore);
        const prompt = await SlopTest.waitFor(() => PT.win.document.querySelector('.ai-ov'), { timeout: 5000 });
        expect(!!prompt).toBe(true);
        prompt.remove();
      } finally { SAI.check = savedCheck; }
    });
  });

  describe('OCR model installed: ask to run', () => {
    it('after the model is stored, the install callback asks with three buttons, and Run on document runs recognition', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      const O = PT.SP.ocr, A = PT.A, G = PT.win.SlopAIGetMore, savedAll = A.recogniseAll;
      let installed = null, runs = 0;
      try {
        // the Get more dialog is stubbed: it "stores" the model and calls back, as it does after a download
        PT.win.SlopAIGetMore = { open: (id, opts) => { installed = opts.onInstalled; } };
        O.getModel();
        expect(typeof installed).toBe('function');
        A.recogniseAll = async () => { runs++; };
        installed();
        const dlg = await SlopTest.waitFor(() => PT.win.document.querySelector('.ocr-ask'), { timeout: 3000 });
        expect(dlg.querySelector('.sui-title').textContent).toBe('Run text recognition now?');
        const labels = [...dlg.querySelectorAll('.sui-foot .sui-btn')].map((b) => b.textContent);
        expect(labels).toEqual(['Not now', 'Run on document', 'Run on this page']);
        [...dlg.querySelectorAll('.sui-foot .sui-btn')].find((b) => b.textContent === 'Run on document').click();
        await SlopTest.waitFor(() => runs === 1, { timeout: 3000 });
        expect(runs).toBe(1);
        await SlopTest.waitFor(() => !PT.win.document.querySelector('.ocr-ask'), { timeout: 3000 }); // removed after its fade
      } finally {
        A.recogniseAll = savedAll;
        if (G) PT.win.SlopAIGetMore = G; else delete PT.win.SlopAIGetMore;
      }
    });
  });

  describe('OCR text layer: commands', () => {
    it('File menu and command palette list the two recognise commands', async () => {
      if (!PT.SP) await PT.boot();
      const labels = PT.A._.fileMenu().map((i) => i && i.label);
      expect(labels).toContain('Recognise text on this page');
      expect(labels).toContain('Recognise text on all pages');
    });
    it('the OCR panel has Language and model, which opens the shared dialog with the OCR languages (pdf/js/tools/doc-panels.js)', async () => {
      if (!PT.SP) await PT.boot();
      const body = PT.win.document.createElement('div');
      PT.SP.panels.PANELS.ocr.build(body);
      const b = [...body.querySelectorAll('button')].find((x) => x.textContent.includes('Language and model'));
      expect(!!b).toBe(true);
      b.click();
      const box = await SlopTest.waitFor(() => PT.win.document.querySelector('.spm-dlg'), { timeout: 10000 });
      const names = [...box.querySelectorAll('.spm-lang')].map((l) => l.textContent);
      for (const n of ['Detect automatically', 'Swedish', 'Russian', 'Arabic', 'Hindi', 'Korean', 'Japanese']) expect(names).toContain(n);
      [...box.querySelectorAll('.spm-lang')].find((l) => l.textContent === 'Russian').click();
      const first = await SlopTest.waitFor(() => { const r = box.querySelector('.spm-model'); return r && r.dataset.id !== 'ppocr-v4' && r; }, { timeout: 3000 });
      expect(first.dataset.id).toBe('ppocr-v5-cyrillic');
      expect(PT.win.SlopAIModels.byId('ppocr-v5-cyrillic').tool).toBe('ocr');   // added to the index when loaded on demand
      box.querySelector('.sui-x').click();
      await SlopTest.waitFor(() => !PT.win.document.querySelector('.spm-dlg'), { timeout: 3000 });
    });
  });
})();
