/* Slop PDF copy / paste and moves between pages: paste in place on the next page lands at the very same coordinates (the
   saved file read back), a paste on its own page moves off a little each time, Paste on all pages puts one copy on each
   (one undo step), a copied block of page text pastes as an editable frame in its font, dragging an annotation onto the
   other page moves it there (Alt copies; a finger works too), and the assistant's commands do the same.
   Covers: pdf/js/editor/clip.js, pdf/js/editor/cross-page.js, pdf/js/editor/multi-sel.js, pdf/js/editor/select-edit.js,
     pdf/js/editor/para-xform.js, pdf/js/editor/pointer.js, pdf/js/ui/commands.js, pdf/js/ui/menus.js, pdf/js/ui/ai-edit.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const pages = () => PT.E.state.pages;
  const two = () => PT.makePdf([{ text: 'one', w: 300, h: 200 }, { text: 'two', w: 300, h: 200 }]);
  const stampOn = (items) => items.find((i) => i.str === 'Stamp');

  describe('Copy and paste', () => {
    it('paste in place on the next page: the same coordinates in the saved file', async () => {
      await SE.open(await two(), 'clip1.pdf');
      SE.Ed().addAnnot(SE.textAnnot('T1', 'Stamp', 100, 60), 'Add text');
      SE.Ed().select('T1');
      expect(await SE.Ed().copy()).toBe(1);
      SE.S().activate(pages()[1].id);
      const made = SE.Ed().paste();
      expect(made.length).toBe(1);
      const b = pages()[1].annots[0];
      expect(b.cx).toBe(100); expect(b.cy).toBe(60);
      expect(PT.E.undoLabel()).toBe('Paste 1 item');
      const s0 = stampOn(await SE.saved(0)), s1 = stampOn(await SE.saved(1));
      expect(Math.abs(s0.x - s1.x) < 0.01 && Math.abs(s0.y - s1.y) < 0.01).toBe(true, s0.x + ',' + s0.y + ' vs ' + s1.x + ',' + s1.y);
    }, { timeout: 60000 });

    it('a paste on its own page moves off each time; Paste on all pages is one undo step', async () => {
      SE.S().activate(pages()[0].id);
      SE.Ed().paste(); SE.Ed().paste();
      const cs = pages()[0].annots.map((a) => a.cx).sort((x, y) => x - y);
      expect(cs).toEqual([100, 112, 124]);
      const n0 = pages()[0].annots.length, n1 = pages()[1].annots.length;
      SE.Ed().pasteOnPages();
      expect(pages()[0].annots.length).toBe(n0 + 1); expect(pages()[1].annots.length).toBe(n1 + 1);
      expect(PT.E.undoLabel()).toBe('Paste on 2 pages');
      expect(pages()[1].annots[n1].cx).toBe(100);
      PT.A.undo();
      expect(pages()[0].annots.length).toBe(n0); expect(pages()[1].annots.length).toBe(n1);
      SE.Ed().pasteOnPages('2');
      expect(pages()[1].annots.length).toBe(n1 + 1);
    }, { timeout: 60000 });

    it('a copied block of page text pastes on another page as an editable frame in its font and size', async () => {
      await SE.open(await SE.paras(2), 'clip2.pdf');
      await SE.tap(SE.at(60, 36)); await SE.frame();
      await SE.Ed().copy();
      expect(pages()[0].annots.length).toBe(0, 'copying changes nothing');
      SE.S().activate(pages()[1].id);
      SE.Ed().paste();
      const a = pages()[1].annots[0];
      expect(a.type).toBe('para');
      expect(Math.round(a.fs)).toBe(12);
      expect(PP.textOf(a).startsWith('The quick brown fox')).toBe(true);
      const items = await SE.saved(1);
      expect(items.some((i) => /quick brown/.test(i.str) && /Helvetica/.test(i.font) && Math.abs(i.y - 280) < 0.5 && Math.abs(i.x - 40) < 0.5)).toBe(true, JSON.stringify(items.slice(0, 2)));
    }, { timeout: 60000 });
  });

  describe('Drag between pages', () => {
    async function setup(name) {
      await SE.open(await two(), name);
      SE.Ed().setLayout('two');
      SE.Ed().setZoom(1.5); // both pages in view, side by side
      await waitFor(() => SE.S().slots.get(pages()[1].id) && SE.S().slots.get(pages()[1].id).el.isConnected, { timeout: 5000 });
      await sleep(300);
      SE.S().activate(pages()[0].id);
      SE.Ed().addAnnot(SE.box('D1', 80, 80), 'Add');
      await waitFor(() => SE.elOf('D1'));
      SE.Ed().select('D1');
    }
    /** Drags D1 from its centre to page 2's point (150, 100). */
    function toPage2(o) {
      const from = SE.centre(SE.elOf('D1')), to = SE.at(150, 100, pages()[1].id);
      return SE.drag(SE.elOf('D1'), to.clientX - from.clientX, to.clientY - from.clientY, o);
    }
    it('a drag past the page edge moves the annotation onto the other page at the drop point; undo puts it back', async () => {
      await setup('cross1.pdf');
      await toPage2();
      expect(pages()[0].annots.length).toBe(0);
      const a = pages()[1].annots[0];
      expect(!!a && Math.abs(a.cx - 150) < 1 && Math.abs(a.cy - 100) < 1).toBe(true, JSON.stringify(a));
      expect(PT.E.undoLabel()).toBe('Move to page');
      expect(SE.Ed().pid).toBe(pages()[1].id);
      PT.A.undo();
      expect(pages()[0].annots.length).toBe(1); expect(pages()[1].annots.length).toBe(0);
    }, { timeout: 60000 });

    it('Alt while dropping copies it instead', async () => {
      SE.S().activate(pages()[0].id); SE.Ed().select('D1');
      await toPage2({ alt: true });
      expect(pages()[0].annots.length).toBe(1); expect(pages()[1].annots.length).toBe(1);
      expect(PT.E.undoLabel()).toBe('Copy to page');
      expect(pages()[1].annots[0].id).not.toBe('D1');
    }, { timeout: 60000 });

    it('a finger drags it across pages too', async () => {
      await setup('cross2.pdf');
      await toPage2({ touch: true });
      expect(pages()[1].annots.length).toBe(1);
      expect(PT.E.undoLabel()).toBe('Move to page');
      SE.Ed().setLayout('continuous');
    }, { timeout: 60000 });
  });

  describe('Assistant commands for editing', () => {
    let C;
    const run = async (id, args) => { const r = await C.exec(id, args); if (!r.ok) throw new Error(id + ': ' + r.error); return r.value; };
    it('list, edit, turn and move a text block; copy and paste on pages; move an annotation to a page', async () => {
      await SE.open(await SE.paras(2), 'ai-se.pdf');
      C = PT.win.SlopCmd; await C.prepare();
      const l = await run('pdf.text.list', { page: 1 });
      expect(l.blocks.length).toBe(2);
      expect(/quick brown/.test(l.blocks[0].text)).toBe(true);
      await run('pdf.text.edit', { page: 1, block: 'block:0', text: 'Hello there' });
      const a = PP.para();
      expect(PP.textOf(a)).toBe('Hello there');
      expect(PT.E.undoLabel()).toBe('Edit paragraph');
      await run('pdf.text.rotate', { page: 1, block: a.id, degrees: 30 });
      expect(Math.round(PP.para().rot)).toBe(-30);
      await run('pdf.text.move', { page: 1, block: a.id, dx: 10 });
      expect(Math.abs(PP.para().cx - a.cx - 10) < 0.01).toBe(true);
      SE.Ed().addAnnot(SE.textAnnot('AI1', 'Logo', 50, 20), 'Add text');
      await run('pdf.clip.copy', { page: 1, annotations: ['AI1'] });
      await run('pdf.clip.paste-pages', { pages: '2' });
      expect(pages()[1].annots.some((x) => x.text === 'Logo' && x.cx === 50 && x.cy === 20)).toBe(true);
      await run('pdf.annot.to-page', { page: 1, annotation: 'AI1', to_page: 2, x: 100, y: 100 });
      expect(pages()[0].annots.some((x) => x.id === 'AI1')).toBe(false);
      expect(pages()[1].annots.some((x) => x.id === 'AI1')).toBe(true);
      await run('pdf.annot.transform', { page: 2, annotation: 'AI1', rotation: 90 });
      expect(pages()[1].annots.find((x) => x.id === 'AI1').rot).toBe(-90);
    }, { timeout: 90000 });
  });
})();
