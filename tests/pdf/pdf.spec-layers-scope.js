/* Slop PDF: the Layers section shows this page, or all pages grouped by page. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('layers: this page or all pages', () => {
    it('All pages lists every page with layers, one group each; This page lists only the page in view', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      await PT.open(await PT.makePdf([{ text: 'one' }, { text: 'two' }, { text: 'three' }]), 'layers-scope.pdf');
      const E = PT.E, doc = PT.win.document;
      const [p1, p2] = E.state.pages;
      p1.annots = [{ id: 'la1', type: 'rect', cx: 50, cy: 50, w: 20, h: 20, rot: 0 }];
      p2.annots = [{ id: 'la2', type: 'rect', cx: 60, cy: 60, w: 20, h: 20, rot: 0 }, { id: 'la3', type: 'rect', cx: 70, cy: 70, w: 20, h: 20, rot: 0 }];
      PT.D = PT.SP.dock;
      PT.SP.dock.refresh();
      const tab = (label) => [...doc.querySelectorAll('.lyr-scope-b')].find((b) => b.textContent === label);
      tab('All pages').click();
      const groups = [...doc.querySelectorAll('.lyr-group')];
      expect(groups.length).toBe(2);
      expect(groups[0].querySelectorAll('.lyr').length).toBe(1);
      expect(groups[1].querySelectorAll('.lyr').length).toBe(2);
      tab('This page').click();
      expect(doc.querySelectorAll('.lyr-group').length).toBe(0);
      expect(tab('This page').getAttribute('aria-selected')).toBe('true');
      p1.annots = []; p2.annots = [];
    });
  });
})();
