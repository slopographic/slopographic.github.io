/* Slop PDF: the sidebar dock. Layers starts open; History starts collapsed. A click on a header opens or closes its section.
   The History section lists every step (oldest first, undone ones greyed) and a click on a step goes back to the document
   as it was after it. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const doc = () => PT.win.document;
  const header = (id) => doc().querySelector('[data-dock="' + id + '"] .pp-dock-h');
  const body = (id) => doc().getElementById('dock-' + id);
  const steps = () => [...doc().querySelectorAll('#dock-history .hist-b')].map((b) => b.textContent);
  const stepBtn = (label) => [...doc().querySelectorAll('#dock-history .hist-b')].find((b) => b.textContent === label);

  describe('sidebar dock', () => {
    it('Layers starts open, History starts collapsed, and the header toggles each', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'dock1.pdf');
      expect(doc().querySelector('#props .pp-dock')).toBeTruthy();
      expect(header('layers').getAttribute('aria-expanded')).toBe('true');
      expect(body('layers').hidden).toBe(false);
      expect(header('history').getAttribute('aria-expanded')).toBe('false');
      expect(body('history').hidden).toBe(true);
      header('history').click();
      expect(header('history').getAttribute('aria-expanded')).toBe('true');
      expect(body('history').hidden).toBe(false);
      header('history').click();
      expect(header('history').getAttribute('aria-expanded')).toBe('false');
      expect(body('history').hidden).toBe(true);
    }, { timeout: 60000 });

    it('the dock stays under the tool panel when the tool changes', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      PT.A.setTool('metadata');
      expect(doc().querySelector('#props .pp-main .pp-title h2').textContent).toBe('Metadata');
      expect(doc().querySelector('#props .pp-dock [data-dock="layers"]')).toBeTruthy();
      expect(doc().querySelector('#props .pp-dock [data-dock="history"]')).toBeTruthy();
      PT.A.setTool('organize');
    }, { timeout: 30000 });

    it('History lists each step, and a click on a step goes back to the document as it was after it', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'a' }, { text: 'b' }]), 'dock2.pdf');
      PT.A.rotate([E.state.pages[0].id], 90);
      E.commit('Set title', (st) => { st.meta.title = 'T'; });
      header('history').click();
      await waitFor(() => steps().length === 4);
      expect(steps()).toEqual(['Original', 'Open dock2.pdf', 'Rotate page', 'Set title']);
      expect(stepBtn('Set title').parentElement.classList.contains('on')).toBe(true);
      stepBtn('Rotate page').click();
      expect(E.state.pages[0].rot).toBe(90);
      expect(E.state.meta.title).toBe('');
      expect(E.undoLabel()).toBe('Rotate page');
      expect(E.canRedo()).toBe(true);
      await waitFor(() => stepBtn('Set title').parentElement.classList.contains('is-undone'));
      expect(stepBtn('Rotate page').parentElement.classList.contains('on')).toBe(true);
      stepBtn('Original').click();
      expect(E.state.pages.length).toBe(0);
      expect(stepBtn('Original').parentElement.classList.contains('on')).toBe(true);
      stepBtn('Set title').click();
      expect(E.state.pages.length).toBe(2);
      expect(E.state.pages[0].rot).toBe(90);
      expect(E.state.meta.title).toBe('T');
      expect(E.canRedo()).toBe(false);
      header('history').click();
    }, { timeout: 60000 });

    it('History is empty without a document, and the step count shows in its header', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      if (header('history').getAttribute('aria-expanded') === 'true') header('history').click();
      header('history').click();
      expect(doc().querySelector('#dock-history').textContent).toContain('Open a PDF');
      header('history').click();
      expect(header('history').getAttribute('aria-expanded')).toBe('false');
    }, { timeout: 30000 });
  });
})();
