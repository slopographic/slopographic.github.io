/* Slop PDF Replace in document: the dialog lists every match with a checkbox; an unticked match is left alone; Replace
   checked makes one undo step per replacement; and the saved file has the new text at the original position. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;

  describe('Slop PDF replace in document', () => {
    it('replaces the ticked matches only, one undo step each, and the new text sits where the old text was', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'apple pie apple', w: 300, h: 200 }, { text: 'Apple tart', w: 300, h: 200 }]), 'replace.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      PT.win.SlopPdfFind.openReplace('apple', { caseSensitive: false, wholeWord: false });
      await waitFor(() => doc().querySelectorAll('.find-rlist li').length === 3, { timeout: 5000 });
      const boxes = [...doc().querySelectorAll('.find-rlist input[type="checkbox"]')];
      expect(boxes.every((b) => !b.disabled && b.checked)).toBe(true, 'every match is listed and ticked');
      boxes[1].checked = false; boxes[1].dispatchEvent(new PT.win.Event('change', { bubbles: true }));
      doc().querySelector('.find-modal input[aria-label="Replace with"]').value = 'pear';
      doc().querySelector('.find-go').click();
      const pear = () => PT.E.state.pages.flatMap((p) => p.annots.filter((a) => a.type === 'text' && a.text === 'pear'));
      await waitFor(() => pear().length === 2, { timeout: 8000 }); // the pages' colours are read first
      expect(pear().length).toBe(2);
      expect(PT.E.state.pages[0].annots.filter((a) => a.type === 'whiteout').length).toBe(1);
      PT.A.undo(); await sleep(80);
      expect(pear().length).toBe(1);
      PT.A.redo(); await sleep(80);
      expect(pear().length).toBe(2);
      const r = await PT.read(await PT.E.build());
      const items = (await r.doc.getPage(1).then((pg) => pg.getTextContent())).items.filter((it) => it.str === 'pear');
      expect(items.length).toBe(1);
      expect(Math.abs(items[0].transform[4] - 20) < 1.5 && Math.abs(items[0].transform[5] - 20) < 1.5).toBe(true, 'x ' + items[0].transform[4] + ' y ' + items[0].transform[5]);
    });
  });
})();
