/* Slop PDF: editing a recognised word (the OCR text layer). The helpers are in pdf.spec-ocr-shared.js. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const H = window.OCRT;
  const { PAGE_ONE, PAGE_TWO, WORD_ON_PAPER, WORD_BOX, scanCanvas, pngBytes, scanPdf, textOf, contentOf, stubEngine, withEngine, openFirstLine, applyLine, inkIn } = H;
  describe('OCR text layer: editing a recognised word', () => {
    it('an edit replaces the word in the page content: the old word is gone from the text, the new one is there', async () => {
      PT.reset();
      await withEngine(async () => {
        const file = await PT.open(await scanPdf([PAGE_ONE]), 'scan-edit.pdf');
        const first = PT.E.state.pages.filter((p) => p.f === file.id)[0];
        stubEngine([PAGE_ONE]);
        expect(await PT.A.recognise([first.id])).toBe(1);
        const input = await openFirstLine(first);
        expect(input.value).toBe('Invoice 2026-0042');
        await applyLine(first, input, input.value.replace('Invoice', 'Receipt')); // the run is the line's text
        const words = await textOf(PT.E.pageById(first.id));
        expect(words).not.toContain('Invoice');
        expect(words).toContain('Receipt');
        expect(words).toContain('2026-0042'); // the other words are kept
        expect(PT.E.pageById(first.id).annots.length).toBe(0); // replaced, not covered
        const content = await contentOf(PT.E.fileOfPage(PT.E.pageById(first.id)).bytes);
        expect(/\b3 Tr\b/.test(content)).toBe(true); // the layer is still invisible
        expect(/496E766F696365/i.test(content)).toBe(false); // no hex of "Invoice" left in the content
        PT.A.undo();
        await SlopTest.sleep(150);
        expect(await textOf(PT.E.pageById(first.id))).toContain('Invoice');
        PT.SP.editor.toggleEditText();
      });
    });

    it('paints the old word out with the paper colour round it, so no dark glyph pixels are left in its box', async () => {
      PT.reset();
      await withEngine(async () => {
        const grey = '#d8d8d8', file = await PT.open(await scanPdf([WORD_ON_PAPER], grey), 'scan-paint.pdf');
        const p = PT.E.state.pages.filter((q) => q.f === file.id)[0];
        stubEngine([WORD_ON_PAPER]);
        expect(await PT.A.recognise([p.id])).toBe(1);
        const before = await inkIn(p, WORD_BOX);
        expect(before.dark).toBeGreaterThan(200); // the scanned word: black glyph pixels
        const input = await openFirstLine(p);
        await applyLine(p, input, ''); // the word is deleted
        const after = await inkIn(PT.E.pageById(p.id), WORD_BOX);
        expect(after.dark).toBe(0);
        expect(before.darkness - after.darkness).toBeGreaterThan(0.05); // the mean darkness of the box falls
        expect(Math.abs(after.lum - 216)).toBeLessThan(6); // painted with the grey sampled round the word, not white
        expect(PT.E.undoLabel()).toBe('Edit text');
        PT.A.undo();
        await SlopTest.sleep(150);
        expect((await inkIn(PT.E.pageById(p.id), WORD_BOX)).dark).toBeGreaterThan(200); // one undo step brings the ink back
        PT.SP.editor.toggleEditText();
      });
    });

    it('draws the new text in Helvetica at the old word\'s place, as visible text that is still recognised', async () => {
      PT.reset();
      await withEngine(async () => {
        const file = await PT.open(await scanPdf([WORD_ON_PAPER]), 'scan-draw.pdf');
        const p = PT.E.state.pages.filter((q) => q.f === file.id)[0];
        stubEngine([WORD_ON_PAPER]);
        expect(await PT.A.recognise([p.id])).toBe(1);
        const before = await inkIn(p, WORD_BOX);
        const input = await openFirstLine(p);
        await applyLine(p, input, 'Paid');
        expect(await textOf(PT.E.pageById(p.id))).toBe('Paid');
        const after = await inkIn(PT.E.pageById(p.id), WORD_BOX);
        expect(after.dark).toBeGreaterThan(20); // the new word is dark on the page
        expect(after.dark).toBeLessThan(before.dark); // and it is less ink than the old word (four letters, not seven)
        const words = await PT.SP.ocrLayer.wordsAll(PT.E.fileOfPage(PT.E.pageById(p.id)).bytes);
        expect(words[0].map((w) => w.str).filter((t) => t)).toEqual(['Paid']); // a later edit finds it
        PT.SP.editor.toggleEditText();
      });
    });
  });

})();
