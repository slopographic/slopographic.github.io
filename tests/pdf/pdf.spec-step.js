/* Slop PDF: numbered step markers. A click places the next number for the whole document, the tool stays on, the layers
   list names each step by its number, and the markers are drawn on screen. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('step markers', () => {
    it('clicks place 1, 2, 3 with the tool still on, and numbering runs on to the next page', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      await PT.open(await PT.makePdf([{ text: 'one' }, { text: 'two' }]), 'steps.pdf');
      const Ed = PT.SP.editor, S = Ed._, win = PT.win, E = PT.E;
      const pid = E.state.pages[0].id;
      PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && Ed.pid === pid, { timeout: 8000 });
      Ed.setTool('step');
      const page = S.pageEl;
      const click = (x, y) => {
        const ev = (type) => new win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0 });
        page.dispatchEvent(ev('pointerdown'));
        win.dispatchEvent(ev('pointerup'));
      };
      const r = page.getBoundingClientRect();
      click(r.left + 60, r.top + 60);
      click(r.left + 120, r.top + 60);
      click(r.left + 180, r.top + 60);
      const steps = () => E.state.pages[0].annots.filter((a) => a.type === 'step').map((a) => a.n);
      expect(steps()).toEqual([1, 2, 3]);
      expect(Ed.tool).toBe('step');
      expect(page.querySelectorAll('.an-step').length).toBe(3);
      expect(PT.SP.layers.items(E.state.pages[0]).map((x) => x.name).filter((n) => /^Step/.test(n))).toEqual(['Step 3', 'Step 2', 'Step 1']);

      // The next page continues the count: the number is for the whole document.
      PT.A.openPage(E.state.pages[1].id);
      await waitFor(() => Ed.pid === E.state.pages[1].id, { timeout: 8000 });
      expect(E.nextStepNumber()).toBe(4);
      Ed.setTool('select');
    });
    it('the tool settings set the next steps: circle size and colour come from the defaults', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      await PT.open(await PT.makePdf([{ text: 'settings' }]), 'step-settings.pdf');
      const Ed = PT.SP.editor, S = Ed._, win = PT.win, E = PT.E;
      const pid = E.state.pages[0].id;
      PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && Ed.pid === pid, { timeout: 8000 });
      Ed.setTool('step');
      Ed.setProp('size', 40);
      Ed.setProp('fill', '#1155ff');
      const page = S.pageEl, r = page.getBoundingClientRect();
      const ev = (type, x, y) => new win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0 });
      page.dispatchEvent(ev('pointerdown', r.left + 80, r.top + 80));
      win.dispatchEvent(ev('pointerup', r.left + 80, r.top + 80));
      const made = E.state.pages[0].annots.filter((a) => a.type === 'step').pop();
      expect(made.w).toBe(40);
      expect(made.fill).toBe('#1155ff');
      Ed.setTool('select');
    });
  });
  SlopTest.run ? null : null;
})();
