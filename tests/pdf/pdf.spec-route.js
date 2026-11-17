/* Slop PDF: the URL sections (shared/router) and the view modes (shared/viewmode). A ?panel= link opens that dock
   section and shows the sidebar; Ctrl+Shift+F cycles the view mode.
   Covers: pdf/js/ui/route.js, pdf/js/ui/doc-tabs.js (a ?tool= link survives restored and new documents)
   Covers: pdf/js/ui/view-state.js (the saved view goes through A.applyView, so a link's tool goes over it) */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const header = (id) => doc().querySelector('[data-dock="' + id + '"] .pp-dock-h');
  const pressCtrlShiftF = () => doc().dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));

  describe('URL sections and view modes', () => {
    it('?panel=history opens that dock section and shows the sidebar', async () => {
      await PT.boot('?panel=history');
      await waitFor(() => header('history').getAttribute('aria-expanded') === 'true', { timeout: 15000 });
      expect(doc().getElementById('app').classList.contains('no-panel')).toBe(false);
      expect(header('layers').getAttribute('aria-expanded')).toBe('true');
    }, { timeout: 60000 });

    // An unknown tool is ignored as if the link had none: the page opens on the tool it opens on with no link (the view
    // of a restored tab, or Organize), not forced to Organize over the person's own view.
    it('?tool=compress (a task page link) opens that rail tool; an unknown tool is ignored', async () => {
      await PT.boot('?tool=compress');
      expect(PT.SP.app.tool).toBe('compress');   // on screen by the time the page is ready, over any restored view
      await PT.boot('');
      await sleep(200);
      const plain = PT.SP.app.tool;
      await PT.boot('?tool=nonsense');
      await sleep(200);   // the router applies a link up to 40 ms after ready: give it time to (wrongly) act
      expect(PT.SP.app.tool).toBe(plain);
    }, { timeout: 90000 });

    it('a ?tool= link outlives the documents it opens: each new document keeps that tool until the person picks another', async () => {
      await PT.boot('?tool=compress');
      await waitFor(() => PT.SP.app.tool === 'compress', { timeout: 15000 });
      await PT.open(await PT.makePdf([{ w: 200, h: 200, text: 'one' }]), 'one.pdf');
      expect(PT.SP.app.tool).toBe('compress');
      PT.A.setTool('sign');
      await PT.open(await PT.makePdf([{ w: 200, h: 200, text: 'two' }]), 'two.pdf');
      expect(PT.SP.app.tool === 'compress').toBe(false);
    }, { timeout: 90000 });

    it('Ctrl+Shift+F cycles Full, Focus, Content only and back', async () => {
      if (!PT.SP) await PT.boot();
      const V = PT.win.SlopViewMode;
      V.set('full');
      const rail = doc().getElementById('rail');
      pressCtrlShiftF();
      expect(V.mode()).toBe('focus');
      expect(doc().documentElement.dataset.slopvm).toBe('focus');
      expect(rail.classList.contains('slopvm-off')).toBe(true);
      pressCtrlShiftF();
      expect(V.mode()).toBe('content');
      expect(doc().getElementById('props').classList.contains('slopvm-off')).toBe(true);
      pressCtrlShiftF();
      expect(V.mode()).toBe('full');
      expect(rail.classList.contains('slopvm-off')).toBe(false);
    }, { timeout: 60000 });
  });
})();
